import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingCancellationReason,
  BookingStatus,
  PaymentStatus,
  Prisma,
  ReservationStatus,
  TicketStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { RefundService } from '../../refunds/refund.service.js';
import type {
  BookingCancellationResultDto,
  CancellationPreviewResponseDto,
} from '../dto/booking-cancellation.dto.js';
import { calculateBookingRefund } from './cancellation-policy.engine.js';
import {
  CancellationPolicyError,
  type BookingRefundResult,
} from './cancellation-policy.types.js';

type LockedRow = { id: string };
type DbNowRow = { now: Date };

const cancellationSelect = {
  id: true,
  bookingId: true,
  idempotencyKey: true,
  requestedByUserId: true,
  reasonNote: true,
  requestedAt: true,
  originalAmount: true,
  refundAmount: true,
  cancellationFeeAmount: true,
  currency: true,
  policyVersion: true,
  policyResultSnapshot: true,
  refund: {
    select: {
      id: true,
      status: true,
      kind: true,
      amount: true,
      currency: true,
    },
  },
  booking: { select: { status: true, cancelledAt: true } },
} as const satisfies Prisma.BookingCancellationSelect;

type CancellationRecord = Prisma.BookingCancellationGetPayload<{
  select: typeof cancellationSelect;
}>;

const bookingAggregateSelect = {
  id: true,
  customerId: true,
  status: true,
  currency: true,
  totalAmount: true,
  cancellationPolicySnapshot: true,
  payment: {
    select: { id: true, status: true, amount: true, currency: true },
  },
  items: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      subtotalAmount: true,
      slotStartAtSnapshot: true,
      reservation: { select: { id: true, status: true } },
      tickets: {
        orderBy: { id: 'asc' },
        select: { id: true, status: true },
      },
    },
  },
} as const satisfies Prisma.BookingSelect;

type BookingAggregate = Prisma.BookingGetPayload<{
  select: typeof bookingAggregateSelect;
}>;

@Injectable()
export class BookingCancellationService {
  private readonly logger = new Logger(BookingCancellationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundService,
  ) {}

  async preview(
    actorUserId: string,
    bookingId: string,
  ): Promise<CancellationPreviewResponseDto> {
    return this.prisma.$transaction(async (transaction) => {
      const booking = await transaction.booking.findUnique({
        where: { id: bookingId },
        select: bookingAggregateSelect,
      });
      this.assertOwnedBooking(booking, actorUserId);
      this.assertConfirmedAndFinanciallyConsistent(booking);
      this.assertReservationsConsistent(booking);
      this.assertTicketsUnused(booking);
      const requestedAt = await this.databaseNow(transaction);
      return this.previewResponse(
        booking.id,
        booking.currency,
        this.calculate(booking, requestedAt),
      );
    });
  }

  async cancel(input: {
    actorUserId: string;
    bookingId: string;
    idempotencyKey: string;
    reasonNote?: string;
  }): Promise<{
    statusCode: 200 | 201;
    body: BookingCancellationResultDto;
  }> {
    const reasonNote = input.reasonNote?.trim() || null;
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        await this.lockBooking(transaction, input.bookingId);

        const identity = await transaction.booking.findUnique({
          where: { id: input.bookingId },
          select: { customerId: true },
        });
        if (!identity) throw new NotFoundException('Booking not found');
        if (identity.customerId !== input.actorUserId) {
          throw new ForbiddenException('Booking belongs to another customer');
        }

        const reusedKey = await transaction.bookingCancellation.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: cancellationSelect,
        });
        if (reusedKey) {
          if (
            reusedKey.bookingId !== input.bookingId ||
            reusedKey.reasonNote !== reasonNote
          ) {
            throw this.idempotencyConflict();
          }
          return { cancellation: reusedKey, created: false };
        }

        const existing = await transaction.bookingCancellation.findUnique({
          where: { bookingId: input.bookingId },
          select: cancellationSelect,
        });
        if (existing) return { cancellation: existing, created: false };

        const lockContext = await transaction.booking.findUnique({
          where: { id: input.bookingId },
          select: { payment: { select: { id: true } } },
        });
        if (!lockContext) throw new NotFoundException('Booking not found');
        if (lockContext.payment) {
          await this.lockPayment(transaction, lockContext.payment.id);
        }
        await this.lockReservations(transaction, input.bookingId);
        await this.lockTickets(transaction, input.bookingId);

        const requestedAt = await this.databaseNow(transaction);
        const booking = await transaction.booking.findUnique({
          where: { id: input.bookingId },
          select: bookingAggregateSelect,
        });
        this.assertOwnedBooking(booking, input.actorUserId);
        this.assertConfirmedAndFinanciallyConsistent(booking);
        this.assertReservationsConsistent(booking);
        this.assertTicketsUnused(booking);

        const policyResult = this.calculate(booking, requestedAt);
        this.assertWholeBookingCancellationAllowed(policyResult);

        const bookingTransition = await transaction.booking.updateMany({
          where: { id: booking.id, status: BookingStatus.CONFIRMED },
          data: { status: BookingStatus.CANCELLED, cancelledAt: requestedAt },
        });
        if (bookingTransition.count !== 1) {
          throw this.inconsistent('INCONSISTENT_BOOKING_STATE');
        }

        const reservationIds = booking.items.map(
          (item) => item.reservation!.id,
        );
        const reservationTransition = await transaction.reservation.updateMany({
          where: {
            id: { in: reservationIds },
            status: ReservationStatus.CONFIRMED,
          },
          data: {
            status: ReservationStatus.RELEASED,
            releasedAt: requestedAt,
          },
        });
        if (reservationTransition.count !== reservationIds.length) {
          throw this.inconsistent('INCONSISTENT_RESERVATION_STATE');
        }

        await transaction.ticket.updateMany({
          where: {
            bookingItem: { bookingId: booking.id },
            status: TicketStatus.ISSUED,
          },
          data: { status: TicketStatus.VOIDED, voidedAt: requestedAt },
        });

        const cancellationId = randomUUID();
        await transaction.bookingCancellation.create({
          data: {
            id: cancellationId,
            bookingId: booking.id,
            idempotencyKey: input.idempotencyKey,
            requestedByUserId: input.actorUserId,
            requestedAt,
            reasonCode: BookingCancellationReason.CUSTOMER_REQUEST,
            reasonNote,
            originalAmount: policyResult.originalAmount,
            refundAmount: policyResult.refundAmount,
            cancellationFeeAmount: policyResult.cancellationFeeAmount,
            currency: booking.currency,
            policyVersion: policyResult.policyVersion,
            policyResultSnapshot: this.policySnapshot(policyResult),
          },
        });

        const refundResult = await this.refunds.createRefundFromCancellation(
          {
            paymentId: booking.payment!.id,
            cancellationResult: policyResult,
            idempotencyKey: `booking-cancel:${cancellationId}`,
          },
          transaction,
        );
        if (refundResult.outcome === 'REFUND_CREATED') {
          await transaction.bookingCancellation.update({
            where: { id: cancellationId },
            data: { refundId: refundResult.refund.id },
          });
        }

        const cancellation = await transaction.bookingCancellation.findUnique({
          where: { id: cancellationId },
          select: cancellationSelect,
        });
        if (!cancellation) throw new Error('Cancellation record disappeared');
        return { cancellation, created: true };
      });

      if (result.created) this.logCancellation(result.cancellation);
      return {
        statusCode: result.created ? 201 : 200,
        body: this.cancellationResponse(result.cancellation),
      };
    } catch (error: unknown) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const existing = await this.prisma.bookingCancellation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: cancellationSelect,
      });
      if (!existing || existing.bookingId !== input.bookingId) {
        throw this.idempotencyConflict();
      }
      return { statusCode: 200, body: this.cancellationResponse(existing) };
    }
  }

  private calculate(
    booking: BookingAggregate,
    requestedAt: Date,
  ): BookingRefundResult {
    try {
      return calculateBookingRefund({
        policySnapshot: booking.cancellationPolicySnapshot,
        bookingTotalAmount: booking.totalAmount,
        items: booking.items.map((item) => ({
          bookingItemId: item.id,
          subtotalAmount: item.subtotalAmount,
          slotStartAtSnapshot: item.slotStartAtSnapshot,
        })),
        requestedAt,
      });
    } catch (error: unknown) {
      if (!(error instanceof CancellationPolicyError)) throw error;
      throw new ConflictException({ code: error.code, message: error.message });
    }
  }

  private assertOwnedBooking(
    booking: BookingAggregate | null,
    actorUserId: string,
  ): asserts booking is BookingAggregate {
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.customerId !== actorUserId) {
      throw new ForbiddenException('Booking belongs to another customer');
    }
  }

  private assertConfirmedAndFinanciallyConsistent(
    booking: BookingAggregate,
  ): void {
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException({
        code: 'BOOKING_NOT_CONFIRMED',
        message: 'Only a confirmed Booking can be cancelled.',
      });
    }
    if (
      !booking.payment ||
      booking.payment.status !== PaymentStatus.SUCCEEDED ||
      booking.payment.amount !== booking.totalAmount ||
      booking.payment.currency !== booking.currency
    ) {
      throw this.inconsistent('INCONSISTENT_PAYMENT_STATE');
    }
  }

  private assertReservationsConsistent(booking: BookingAggregate): void {
    if (
      booking.items.some(
        (item) => item.reservation?.status !== ReservationStatus.CONFIRMED,
      )
    ) {
      throw this.inconsistent('INCONSISTENT_RESERVATION_STATE');
    }
  }

  private assertTicketsUnused(booking: BookingAggregate): void {
    if (
      booking.items.some((item) =>
        item.tickets.some(
          (ticket) => ticket.status === TicketStatus.CHECKED_IN,
        ),
      )
    ) {
      throw new ConflictException({
        code: 'TICKET_ALREADY_USED',
        message: 'A checked-in Ticket prevents whole-Booking cancellation.',
      });
    }
  }

  private assertWholeBookingCancellationAllowed(
    result: BookingRefundResult,
  ): void {
    if (result.reason === 'PARTIAL_CANCELLATION_REQUIRED') {
      throw new ConflictException({
        code: result.reason,
        message: 'Some Booking items cannot be cancelled as a whole.',
      });
    }
    if (!result.cancellationAllowed) {
      throw new ConflictException({
        code: 'CANCELLATION_NOT_ALLOWED',
        message: 'Cancellation policy does not allow this cancellation.',
      });
    }
  }

  private previewResponse(
    bookingId: string,
    currency: string,
    result: BookingRefundResult,
  ): CancellationPreviewResponseDto {
    return {
      bookingId,
      currency,
      cancellationAllowed: result.cancellationAllowed,
      reason: result.reason,
      originalAmount: result.originalAmount.toString(),
      refundAmount: result.refundAmount.toString(),
      cancellationFeeAmount: result.cancellationFeeAmount.toString(),
      policyVersion: result.policyVersion,
      items: result.items.map((item) => ({
        bookingItemId: item.bookingItemId,
        originalAmount: item.originalAmount.toString(),
        refundBps: item.refundBps,
        refundAmount: item.refundAmount.toString(),
        cancellationFeeAmount: item.cancellationFeeAmount.toString(),
        cancellationAllowed: item.cancellationAllowed,
        reason: item.reason,
      })),
    };
  }

  private cancellationResponse(
    record: CancellationRecord,
  ): BookingCancellationResultDto {
    const snapshot = record.policyResultSnapshot as { reason?: unknown };
    const cancelledAt = record.booking.cancelledAt ?? record.requestedAt;
    return {
      cancellationId: record.id,
      bookingId: record.bookingId,
      bookingStatus: record.booking.status,
      requestedAt: record.requestedAt.toISOString(),
      cancelledAt: cancelledAt.toISOString(),
      originalAmount: record.originalAmount.toString(),
      refundAmount: record.refundAmount.toString(),
      cancellationFeeAmount: record.cancellationFeeAmount.toString(),
      currency: record.currency,
      policyVersion: record.policyVersion,
      reason:
        typeof snapshot.reason === 'string' ? snapshot.reason : 'NO_REFUND',
      refund: record.refund
        ? {
            id: record.refund.id,
            status: record.refund.status,
            kind: record.refund.kind,
            amount: record.refund.amount.toString(),
            currency: record.refund.currency,
          }
        : null,
    };
  }

  private policySnapshot(result: BookingRefundResult): Prisma.InputJsonValue {
    return {
      policyVersion: result.policyVersion,
      originalAmount: result.originalAmount.toString(),
      refundAmount: result.refundAmount.toString(),
      cancellationFeeAmount: result.cancellationFeeAmount.toString(),
      cancellationAllowed: result.cancellationAllowed,
      reason: result.reason,
      items: result.items.map((item) => ({
        bookingItemId: item.bookingItemId,
        slotStartAt: item.slotStartAt.toISOString(),
        originalAmount: item.originalAmount.toString(),
        refundBps: item.refundBps,
        refundAmount: item.refundAmount.toString(),
        cancellationFeeAmount: item.cancellationFeeAmount.toString(),
        cancellationAllowed: item.cancellationAllowed,
        reason: item.reason,
      })),
    };
  }

  private async lockBooking(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
    bookingId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id" FROM "bookings"
      WHERE "id" = ${bookingId}::uuid
      FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('Booking not found');
  }

  private async lockPayment(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
    paymentId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id" FROM "payments"
      WHERE "id" = ${paymentId}::uuid
      FOR UPDATE
    `);
    if (!rows[0]) throw this.inconsistent('INCONSISTENT_PAYMENT_STATE');
  }

  private async lockReservations(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
    bookingId: string,
  ): Promise<void> {
    await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT r."id"
      FROM "reservations" r
      INNER JOIN "booking_items" bi ON bi."id" = r."booking_item_id"
      WHERE bi."booking_id" = ${bookingId}::uuid
      ORDER BY r."id"
      FOR UPDATE OF r
    `);
  }

  private async lockTickets(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
    bookingId: string,
  ): Promise<void> {
    await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT t."id"
      FROM "tickets" t
      INNER JOIN "booking_items" bi ON bi."id" = t."booking_item_id"
      WHERE bi."booking_id" = ${bookingId}::uuid
      ORDER BY t."id"
      FOR UPDATE OF t
    `);
  }

  private async databaseNow(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ): Promise<Date> {
    const [row] = await transaction.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Failed to read database time');
    return row.now;
  }

  private inconsistent(code: string): ConflictException {
    return new ConflictException({ code, message: code.replaceAll('_', ' ') });
  }

  private idempotencyConflict(): ConflictException {
    return new ConflictException({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      message: 'Idempotency key was used for a different cancellation.',
    });
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private logCancellation(record: CancellationRecord): void {
    const snapshot = record.policyResultSnapshot as { reason?: unknown };
    this.logger.log({
      event: 'booking_cancelled',
      bookingId: record.bookingId,
      cancellationId: record.id,
      refundId: record.refund?.id ?? null,
      refundAmount: record.refundAmount.toString(),
      feeAmount: record.cancellationFeeAmount.toString(),
      policyVersion: record.policyVersion,
      resultReason: snapshot.reason,
      actorUserId: record.requestedByUserId,
    });
  }
}
