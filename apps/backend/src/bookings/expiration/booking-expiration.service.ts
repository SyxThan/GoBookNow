import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  Prisma,
  ReservationStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import {
  BOOKING_EXPIRATION_BATCH_SIZE_ENV,
  DEFAULT_BOOKING_EXPIRATION_BATCH_SIZE,
  MAX_BOOKING_EXPIRATION_BATCH_SIZE,
} from './booking-expiration.constants.js';

type ExpirationTransactionClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'booking' | 'reservation'
>;

type DbNowRow = { now: Date };
type BookingCandidateRow = { id: string };

type ExpireLockedBookingResult = Readonly<{
  expired: boolean;
  expiredReservations: number;
}>;

export type BookingExpirationSweepResult = Readonly<{
  candidateCount: number;
  expiredBookings: number;
  expiredReservations: number;
  skippedBookings: number;
  batchSize: number;
  databaseNow: Date;
  durationMs: number;
}>;

export type BookingExpirationSweepOptions = Readonly<{
  batchSize?: number;
}>;

@Injectable()
export class BookingExpirationService {
  private readonly logger = new Logger(BookingExpirationService.name);
  private readonly configuredBatchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.configuredBatchSize = this.parsePositiveIntegerConfig(
      BOOKING_EXPIRATION_BATCH_SIZE_ENV,
      config.get<string>(BOOKING_EXPIRATION_BATCH_SIZE_ENV),
      DEFAULT_BOOKING_EXPIRATION_BATCH_SIZE,
      MAX_BOOKING_EXPIRATION_BATCH_SIZE,
    );
  }

  async sweepExpiredBookings(
    options: BookingExpirationSweepOptions = {},
  ): Promise<BookingExpirationSweepResult> {
    const batchSize = this.resolveBatchSize(options.batchSize);
    const startedAt = Date.now();

    this.logger.log(`Booking expiration sweep started batchSize=${batchSize}`);

    try {
      const result = await this.prisma.$transaction((transaction) =>
        this.expireBatchInTransaction(transaction, batchSize),
      );
      const completed = {
        ...result,
        durationMs: Date.now() - startedAt,
      };
      this.logger.log(
        `Booking expiration sweep completed candidates=${completed.candidateCount} expiredBookings=${completed.expiredBookings} expiredReservations=${completed.expiredReservations} skippedBookings=${completed.skippedBookings} durationMs=${completed.durationMs}`,
      );
      return completed;
    } catch (error: unknown) {
      this.logger.error(
        'Booking expiration sweep failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async expireBatchInTransaction(
    transaction: ExpirationTransactionClient,
    batchSize: number,
  ): Promise<Omit<BookingExpirationSweepResult, 'durationMs'>> {
    const now = await this.getDatabaseNow(transaction);
    const candidates = await this.findExpiredCandidates(
      transaction,
      now,
      batchSize,
    );

    let expiredBookings = 0;
    let expiredReservations = 0;
    let skippedBookings = 0;

    for (const candidate of candidates) {
      const result = await this.expireLockedBooking(
        transaction,
        candidate.id,
        now,
      );
      if (result.expired) {
        expiredBookings += 1;
        expiredReservations += result.expiredReservations;
      } else {
        skippedBookings += 1;
      }
    }

    return {
      candidateCount: candidates.length,
      expiredBookings,
      expiredReservations,
      skippedBookings,
      batchSize,
      databaseNow: now,
    };
  }

  private async getDatabaseNow(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ): Promise<Date> {
    const [row] = await transaction.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Failed to read database time');
    return row.now;
  }

  private async findExpiredCandidates(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
    now: Date,
    batchSize: number,
  ): Promise<BookingCandidateRow[]> {
    return transaction.$queryRaw<BookingCandidateRow[]>(Prisma.sql`
      SELECT "id"
      FROM "bookings"
      WHERE "status" = 'PENDING_PAYMENT'::"BookingStatus"
        AND "expires_at" IS NOT NULL
        AND "expires_at" <= ${now}
      ORDER BY "expires_at" ASC, "id" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `);
  }

  private async expireLockedBooking(
    transaction: ExpirationTransactionClient,
    bookingId: string,
    now: Date,
  ): Promise<ExpireLockedBookingResult> {
    const booking = await transaction.booking.findFirst({
      where: {
        id: bookingId,
        status: BookingStatus.PENDING_PAYMENT,
        expiresAt: { not: null, lte: now },
      },
      select: { id: true },
    });
    if (!booking) {
      return { expired: false, expiredReservations: 0 };
    }

    const reservations = await transaction.reservation.updateMany({
      where: {
        status: ReservationStatus.HELD,
        expiresAt: { not: null, lte: now },
        bookingItem: { bookingId },
      },
      data: { status: ReservationStatus.EXPIRED },
    });
    const updatedBooking = await transaction.booking.updateMany({
      where: {
        id: bookingId,
        status: BookingStatus.PENDING_PAYMENT,
        expiresAt: { not: null, lte: now },
      },
      data: {
        status: BookingStatus.EXPIRED,
        expiredAt: now,
      },
    });

    if (updatedBooking.count !== 1) {
      throw new Error(
        `Booking expiration state changed unexpectedly for booking ${bookingId}`,
      );
    }

    return {
      expired: true,
      expiredReservations: reservations.count,
    };
  }

  private resolveBatchSize(batchSize: number | undefined): number {
    if (batchSize === undefined) return this.configuredBatchSize;
    return this.parsePositiveIntegerConfig(
      'batchSize',
      String(batchSize),
      DEFAULT_BOOKING_EXPIRATION_BATCH_SIZE,
      MAX_BOOKING_EXPIRATION_BATCH_SIZE,
    );
  }

  private parsePositiveIntegerConfig(
    name: string,
    rawValue: string | undefined,
    defaultValue: number,
    maxValue: number,
  ): number {
    const value = rawValue === undefined ? defaultValue : Number(rawValue);
    if (!Number.isInteger(value) || value <= 0 || value > maxValue) {
      throw new Error(`${name} must be an integer from 1 to ${maxValue}`);
    }
    return value;
  }
}
