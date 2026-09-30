import { Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  ReservationStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';

type SettlementTransactionClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'paymentAttempt' | 'payment' | 'booking' | 'reservation'
>;

type LockedRow = { id: string };
type DbNowRow = { now: Date };

export interface PaymentSettlementInput {
  attemptId: string;
  paymentId: string;
  bookingId: string;
  provider: PaymentProvider;
  providerTransactionId: string;
  amount: bigint;
  currency: string;
}

export type PaymentSettlementReconciliationReason =
  | 'PAYMENT_NOT_PROCESSABLE'
  | 'PAYMENT_BOOKING_MISMATCH'
  | 'FINANCIAL_SNAPSHOT_MISMATCH'
  | 'TRANSACTION_ID_CONFLICT'
  | 'PAYMENT_ATTEMPT_EXPIRED'
  | 'BOOKING_EXPIRED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_EXPIRY_INVALID'
  | 'BOOKING_INVALID_STATE'
  | 'RESERVATION_MISSING'
  | 'RESERVATION_EXPIRED'
  | 'RESERVATION_RELEASED'
  | 'INCONSISTENT_RESERVATION_STATE';

type SettlementResultBase = Readonly<{
  attemptId: string;
  paymentId: string;
  bookingId: string;
  reservationCount: number;
}>;

export type PaymentSettlementResult =
  | (SettlementResultBase &
      Readonly<{
        outcome: 'CONFIRMED';
        confirmedAt: Date;
      }>)
  | (SettlementResultBase &
      Readonly<{
        outcome: 'ALREADY_CONFIRMED';
        confirmedAt: Date;
      }>)
  | (SettlementResultBase &
      Readonly<{
        outcome: 'RECONCILIATION_REQUIRED';
        reason: PaymentSettlementReconciliationReason;
      }>);

const attemptSelect = {
  id: true,
  paymentId: true,
  provider: true,
  status: true,
  amount: true,
  currency: true,
  providerTransactionId: true,
  expiresAt: true,
} as const satisfies Prisma.PaymentAttemptSelect;

const paymentSelect = {
  id: true,
  bookingId: true,
  status: true,
  amount: true,
  currency: true,
  succeededAt: true,
  booking: {
    select: {
      id: true,
      status: true,
      totalAmount: true,
      currency: true,
      expiresAt: true,
      confirmedAt: true,
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          reservation: {
            select: {
              id: true,
              status: true,
              expiresAt: true,
              confirmedAt: true,
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.PaymentSelect;

type SettlementPayment = Prisma.PaymentGetPayload<{
  select: typeof paymentSelect;
}>;
type SettlementReservation = NonNullable<
  SettlementPayment['booking']['items'][number]['reservation']
>;

@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  async settle(
    input: PaymentSettlementInput,
  ): Promise<PaymentSettlementResult> {
    const result = await this.prisma.$transaction((transaction) =>
      this.settleInTransaction(transaction, input),
    );

    if (result.outcome === 'CONFIRMED') {
      this.logger.log({
        event: 'payment_booking_settled',
        bookingId: result.bookingId,
        paymentId: result.paymentId,
        reservationCount: result.reservationCount,
      });
    } else if (result.outcome === 'RECONCILIATION_REQUIRED') {
      this.logger.warn({
        event: 'payment_settlement_reconciliation',
        bookingId: result.bookingId,
        paymentId: result.paymentId,
        reason: result.reason,
      });
    }

    return result;
  }

  private async settleInTransaction(
    transaction: SettlementTransactionClient,
    input: PaymentSettlementInput,
  ): Promise<PaymentSettlementResult> {
    const lockedReservationIds = await this.lockAggregate(transaction, input);
    const now = await this.getDatabaseNow(transaction);
    const attempt = await transaction.paymentAttempt.findUnique({
      where: { id: input.attemptId },
      select: attemptSelect,
    });
    const payment = await transaction.payment.findUnique({
      where: { id: input.paymentId },
      select: paymentSelect,
    });
    if (!attempt || !payment) {
      throw new Error('Locked payment settlement aggregate disappeared');
    }

    const reservations = payment.booking.items.flatMap(({ reservation }) =>
      reservation ? [reservation] : [],
    );
    const base = this.resultBase(input, reservations.length);

    if (
      attempt.paymentId !== payment.id ||
      payment.bookingId !== payment.booking.id ||
      payment.bookingId !== input.bookingId
    ) {
      return this.reconciliation(base, 'PAYMENT_BOOKING_MISMATCH');
    }
    if (
      attempt.provider !== input.provider ||
      attempt.amount !== input.amount ||
      payment.amount !== input.amount ||
      payment.booking.totalAmount !== input.amount ||
      attempt.currency !== input.currency ||
      payment.currency !== input.currency ||
      payment.booking.currency !== input.currency
    ) {
      return this.reconciliation(base, 'FINANCIAL_SNAPSHOT_MISMATCH');
    }
    if (
      attempt.providerTransactionId !== null &&
      attempt.providerTransactionId !== input.providerTransactionId
    ) {
      return this.reconciliation(base, 'TRANSACTION_ID_CONFLICT');
    }

    const transactionCollision = await transaction.paymentAttempt.findFirst({
      where: {
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        id: { not: attempt.id },
      },
      select: { id: true },
    });
    if (transactionCollision) {
      return this.reconciliation(base, 'TRANSACTION_ID_CONFLICT');
    }

    const attemptNeedsSuccess = attempt.status === PaymentAttemptStatus.PENDING;
    const attemptAlreadySucceeded =
      attempt.status === PaymentAttemptStatus.SUCCEEDED &&
      attempt.providerTransactionId === input.providerTransactionId;
    const paymentNeedsSuccess = payment.status === PaymentStatus.PENDING;
    const paymentAlreadySucceeded = payment.status === PaymentStatus.SUCCEEDED;

    if (
      (!attemptNeedsSuccess && !attemptAlreadySucceeded) ||
      (!paymentNeedsSuccess && !paymentAlreadySucceeded)
    ) {
      return this.reconciliation(base, 'PAYMENT_NOT_PROCESSABLE');
    }

    const reservationStructureValid =
      payment.booking.items.length > 0 &&
      reservations.length === payment.booking.items.length;
    const lockedReservationsValid = this.sameIds(
      lockedReservationIds,
      reservations.map(({ id }) => id),
    );

    if (!reservationStructureValid) {
      await this.recordPaymentSuccess(
        transaction,
        input,
        now,
        attemptNeedsSuccess,
        paymentNeedsSuccess,
      );
      return this.reconciliation(base, 'RESERVATION_MISSING');
    }
    if (!lockedReservationsValid) {
      throw new Error('Locked Reservation set changed during settlement');
    }

    if (payment.booking.status === BookingStatus.CONFIRMED) {
      if (
        !reservations.every(
          (reservation) =>
            reservation.status === ReservationStatus.CONFIRMED &&
            reservation.confirmedAt !== null,
        ) ||
        payment.booking.confirmedAt === null
      ) {
        await this.recordPaymentSuccess(
          transaction,
          input,
          now,
          attemptNeedsSuccess,
          paymentNeedsSuccess,
        );
        return this.reconciliation(base, 'INCONSISTENT_RESERVATION_STATE');
      }

      await this.recordPaymentSuccess(
        transaction,
        input,
        now,
        attemptNeedsSuccess,
        paymentNeedsSuccess,
      );
      return {
        ...base,
        outcome: 'ALREADY_CONFIRMED',
        confirmedAt: payment.booking.confirmedAt,
      };
    }

    if (payment.booking.status === BookingStatus.EXPIRED) {
      await this.recordPaymentSuccess(
        transaction,
        input,
        now,
        attemptNeedsSuccess,
        paymentNeedsSuccess,
      );
      return this.reconciliation(base, 'BOOKING_EXPIRED');
    }
    if (payment.booking.status === BookingStatus.CANCELLED) {
      await this.recordPaymentSuccess(
        transaction,
        input,
        now,
        attemptNeedsSuccess,
        paymentNeedsSuccess,
      );
      return this.reconciliation(base, 'BOOKING_CANCELLED');
    }
    if (payment.booking.status !== BookingStatus.PENDING_PAYMENT) {
      await this.recordPaymentSuccess(
        transaction,
        input,
        now,
        attemptNeedsSuccess,
        paymentNeedsSuccess,
      );
      return this.reconciliation(base, 'BOOKING_INVALID_STATE');
    }

    if (payment.booking.expiresAt === null) {
      await this.recordPaymentSuccess(
        transaction,
        input,
        now,
        attemptNeedsSuccess,
        paymentNeedsSuccess,
      );
      return this.reconciliation(base, 'BOOKING_EXPIRY_INVALID');
    }

    if (payment.booking.expiresAt <= now) {
      await this.recordPaymentSuccess(
        transaction,
        input,
        now,
        attemptNeedsSuccess,
        paymentNeedsSuccess,
      );
      if (
        reservations.every(
          ({ status }) =>
            status === ReservationStatus.HELD ||
            status === ReservationStatus.EXPIRED,
        )
      ) {
        await this.expireLateBooking(transaction, input.bookingId, now);
      }
      return this.reconciliation(base, 'BOOKING_EXPIRED');
    }

    if (attempt.expiresAt === null || attempt.expiresAt <= now) {
      await this.recordPaymentSuccess(
        transaction,
        input,
        now,
        attemptNeedsSuccess,
        paymentNeedsSuccess,
      );
      return this.reconciliation(base, 'PAYMENT_ATTEMPT_EXPIRED');
    }

    const reservationFailure = this.reservationFailure(reservations, now);
    if (reservationFailure !== null) {
      await this.recordPaymentSuccess(
        transaction,
        input,
        now,
        attemptNeedsSuccess,
        paymentNeedsSuccess,
      );
      return this.reconciliation(base, reservationFailure);
    }

    await this.recordPaymentSuccess(
      transaction,
      input,
      now,
      attemptNeedsSuccess,
      paymentNeedsSuccess,
    );

    const bookingUpdate = await transaction.booking.updateMany({
      where: {
        id: input.bookingId,
        status: BookingStatus.PENDING_PAYMENT,
        expiresAt: { not: null, gt: now },
      },
      data: {
        status: BookingStatus.CONFIRMED,
        confirmedAt: now,
      },
    });
    if (bookingUpdate.count !== 1) {
      throw new Error('Booking changed during payment settlement');
    }

    const reservationUpdate = await transaction.reservation.updateMany({
      where: {
        id: { in: reservations.map(({ id }) => id) },
        status: ReservationStatus.HELD,
        expiresAt: { not: null, gt: now },
        bookingItem: { bookingId: input.bookingId },
      },
      data: {
        status: ReservationStatus.CONFIRMED,
        confirmedAt: now,
      },
    });
    if (reservationUpdate.count !== reservations.length) {
      throw new Error('Reservation set changed during payment settlement');
    }

    return {
      ...base,
      outcome: 'CONFIRMED',
      confirmedAt: now,
    };
  }

  private async lockAggregate(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
    input: PaymentSettlementInput,
  ): Promise<string[]> {
    const bookingRows = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id" FROM "bookings"
      WHERE "id" = ${input.bookingId}::uuid
      FOR UPDATE
    `);
    const paymentRows = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id" FROM "payments"
      WHERE "id" = ${input.paymentId}::uuid
      FOR UPDATE
    `);
    const attemptRows = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id" FROM "payment_attempts"
      WHERE "id" = ${input.attemptId}::uuid
      FOR UPDATE
    `);
    const reservationRows = await transaction.$queryRaw<LockedRow[]>(
      Prisma.sql`
        SELECT r."id"
        FROM "reservations" r
        INNER JOIN "booking_items" bi ON bi."id" = r."booking_item_id"
        WHERE bi."booking_id" = ${input.bookingId}::uuid
        ORDER BY r."id" ASC
        FOR UPDATE
      `,
    );

    if (!bookingRows[0] || !paymentRows[0] || !attemptRows[0]) {
      throw new Error('Failed to lock payment settlement aggregate');
    }
    return reservationRows.map(({ id }) => id);
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

  private async recordPaymentSuccess(
    transaction: Pick<Prisma.TransactionClient, 'paymentAttempt' | 'payment'>,
    input: PaymentSettlementInput,
    now: Date,
    attemptNeedsSuccess: boolean,
    paymentNeedsSuccess: boolean,
  ): Promise<void> {
    if (attemptNeedsSuccess) {
      const attemptUpdate = await transaction.paymentAttempt.updateMany({
        where: {
          id: input.attemptId,
          paymentId: input.paymentId,
          provider: input.provider,
          status: PaymentAttemptStatus.PENDING,
          OR: [
            { providerTransactionId: null },
            { providerTransactionId: input.providerTransactionId },
          ],
        },
        data: {
          status: PaymentAttemptStatus.SUCCEEDED,
          providerTransactionId: input.providerTransactionId,
          succeededAt: now,
        },
      });
      if (attemptUpdate.count !== 1) {
        throw new Error('PaymentAttempt changed during payment settlement');
      }
    }

    if (paymentNeedsSuccess) {
      const paymentUpdate = await transaction.payment.updateMany({
        where: {
          id: input.paymentId,
          bookingId: input.bookingId,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.SUCCEEDED,
          succeededAt: now,
        },
      });
      if (paymentUpdate.count !== 1) {
        throw new Error('Payment changed during payment settlement');
      }
    }
  }

  private async expireLateBooking(
    transaction: Pick<Prisma.TransactionClient, 'booking' | 'reservation'>,
    bookingId: string,
    now: Date,
  ): Promise<void> {
    await transaction.reservation.updateMany({
      where: {
        status: ReservationStatus.HELD,
        bookingItem: { bookingId },
      },
      data: { status: ReservationStatus.EXPIRED },
    });
    const bookingUpdate = await transaction.booking.updateMany({
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
    if (bookingUpdate.count !== 1) {
      throw new Error('Late Booking expiration changed during settlement');
    }
  }

  private reservationFailure(
    reservations: readonly SettlementReservation[],
    now: Date,
  ): PaymentSettlementReconciliationReason | null {
    if (
      reservations.some(({ status }) => status === ReservationStatus.RELEASED)
    ) {
      return 'RESERVATION_RELEASED';
    }
    if (
      reservations.some(
        ({ status, expiresAt }) =>
          status === ReservationStatus.EXPIRED ||
          expiresAt === null ||
          expiresAt <= now,
      )
    ) {
      return 'RESERVATION_EXPIRED';
    }
    if (reservations.some(({ status }) => status !== ReservationStatus.HELD)) {
      return 'INCONSISTENT_RESERVATION_STATE';
    }
    return null;
  }

  private sameIds(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) return false;
    const sortedLeft = [...left].sort();
    const sortedRight = [...right].sort();
    return sortedLeft.every((id, index) => id === sortedRight[index]);
  }

  private resultBase(
    input: PaymentSettlementInput,
    reservationCount: number,
  ): SettlementResultBase {
    return {
      attemptId: input.attemptId,
      paymentId: input.paymentId,
      bookingId: input.bookingId,
      reservationCount,
    };
  }

  private reconciliation(
    base: SettlementResultBase,
    reason: PaymentSettlementReconciliationReason,
  ): PaymentSettlementResult {
    return {
      ...base,
      outcome: 'RECONCILIATION_REQUIRED',
      reason,
    };
  }
}
