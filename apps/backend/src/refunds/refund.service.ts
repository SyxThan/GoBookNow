import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  RefundKind,
  RefundReason,
  RefundStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { BookingRefundResult } from '../bookings/cancellation/cancellation-policy.types.js';

const refundSelect = {
  id: true,
  paymentId: true,
  idempotencyKey: true,
  status: true,
  kind: true,
  reason: true,
  reasonNote: true,
  amount: true,
  currency: true,
  requestedAt: true,
  succeededAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.RefundSelect;

export type RefundRecord = Prisma.RefundGetPayload<{
  select: typeof refundSelect;
}>;

export type RefundTransactionClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'payment' | 'refund'
>;

export type CreateRefundObligationInput = Readonly<{
  paymentId: string;
  amount: bigint;
  reason: RefundReason;
  reasonNote?: string | null;
  idempotencyKey: string;
}>;

export enum PaymentRefundState {
  NONE = 'NONE',
  PARTIAL = 'PARTIAL',
  FULL = 'FULL',
}

export type RefundSummary = Readonly<{
  paymentAmount: bigint;
  currency: string;
  pendingRefundAmount: bigint;
  succeededRefundAmount: bigint;
  reservedRefundAmount: bigint;
  remainingRefundableAmount: bigint;
  refundState: PaymentRefundState;
}>;

export type CreateRefundFromCancellationInput = Readonly<{
  paymentId: string;
  cancellationResult: BookingRefundResult;
  idempotencyKey: string;
}>;

export type CreateRefundFromCancellationResult =
  | Readonly<{ outcome: 'NO_REFUND_REQUIRED' }>
  | Readonly<{ outcome: 'REFUND_CREATED'; refund: RefundRecord }>;

type LockedRow = { id: string };
type DbNowRow = { now: Date };
type CreateResult = Readonly<{ refund: RefundRecord; created: boolean }>;
type TransitionResult = Readonly<{ refund: RefundRecord; changed: boolean }>;

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createRefundObligation(
    input: CreateRefundObligationInput,
    transaction?: RefundTransactionClient,
  ): Promise<RefundRecord> {
    const normalized = this.normalizeCreateInput(input);
    if (transaction) {
      return (
        await this.createRefundObligationInTransaction(transaction, normalized)
      ).refund;
    }

    try {
      const result = await this.prisma.$transaction((tx) =>
        this.createRefundObligationInTransaction(tx, normalized),
      );
      if (result.created)
        this.logRefund('refund_obligation_created', result.refund);
      return result.refund;
    } catch (error: unknown) {
      if (!this.isUniqueConstraintError(error)) throw error;

      const existing = await this.prisma.refund.findUnique({
        where: { idempotencyKey: normalized.idempotencyKey },
        select: refundSelect,
      });
      if (!existing) throw error;
      return this.resolveIdempotentRefund(existing, normalized);
    }
  }

  async createRefundFromCancellation(
    input: CreateRefundFromCancellationInput,
    transaction?: RefundTransactionClient,
  ): Promise<CreateRefundFromCancellationResult> {
    const { cancellationResult } = input;
    if (cancellationResult.reason === 'PARTIAL_CANCELLATION_REQUIRED') {
      throw new ConflictException({
        code: 'PARTIAL_CANCELLATION_REQUIRED',
        message:
          'Whole-booking cancellation cannot create a partial-item refund.',
      });
    }
    if (!cancellationResult.cancellationAllowed) {
      throw new ConflictException({
        code: 'CANCELLATION_NOT_ALLOWED',
        message: 'Cancellation policy does not allow this cancellation.',
      });
    }
    if (cancellationResult.refundAmount === 0n) {
      return { outcome: 'NO_REFUND_REQUIRED' };
    }

    const refund = await this.createRefundObligation(
      {
        paymentId: input.paymentId,
        amount: cancellationResult.refundAmount,
        reason: RefundReason.BOOKING_CANCELLATION,
        reasonNote: `Cancellation policy result ${cancellationResult.reason}`,
        idempotencyKey: input.idempotencyKey,
      },
      transaction,
    );
    return { outcome: 'REFUND_CREATED', refund };
  }

  async getRefundSummary(
    paymentId: string,
    transaction?: RefundTransactionClient,
  ): Promise<RefundSummary> {
    if (transaction)
      return this.getRefundSummaryInTransaction(transaction, paymentId);
    return this.prisma.$transaction((tx) =>
      this.getRefundSummaryInTransaction(tx, paymentId),
    );
  }

  async markRefundSucceeded(
    refundId: string,
    transaction?: RefundTransactionClient,
  ): Promise<RefundRecord> {
    if (transaction) {
      return (
        await this.markRefundSucceededInTransaction(transaction, refundId)
      ).refund;
    }
    const result = await this.prisma.$transaction((tx) =>
      this.markRefundSucceededInTransaction(tx, refundId),
    );
    if (result.changed) this.logRefund('refund_succeeded', result.refund);
    return result.refund;
  }

  async cancelPendingRefund(
    refundId: string,
    transaction?: RefundTransactionClient,
  ): Promise<RefundRecord> {
    if (transaction) {
      return (
        await this.cancelPendingRefundInTransaction(transaction, refundId)
      ).refund;
    }
    const result = await this.prisma.$transaction((tx) =>
      this.cancelPendingRefundInTransaction(tx, refundId),
    );
    if (result.changed) this.logRefund('refund_cancelled', result.refund);
    return result.refund;
  }

  private async createRefundObligationInTransaction(
    transaction: RefundTransactionClient,
    input: CreateRefundObligationInput,
  ): Promise<CreateResult> {
    const beforeLock = await this.findByIdempotencyKey(
      transaction,
      input.idempotencyKey,
    );
    if (beforeLock) {
      return {
        refund: this.resolveIdempotentRefund(beforeLock, input),
        created: false,
      };
    }

    await this.lockPayment(transaction, input.paymentId);

    const afterLock = await this.findByIdempotencyKey(
      transaction,
      input.idempotencyKey,
    );
    if (afterLock) {
      return {
        refund: this.resolveIdempotentRefund(afterLock, input),
        created: false,
      };
    }

    const payment = await transaction.payment.findUnique({
      where: { id: input.paymentId },
      select: { id: true, status: true, amount: true, currency: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_REFUNDABLE',
        message: `Payment in ${payment.status} status cannot be refunded.`,
      });
    }

    const reserved = await transaction.refund.aggregate({
      where: {
        paymentId: payment.id,
        status: { in: [RefundStatus.PENDING, RefundStatus.SUCCEEDED] },
      },
      _sum: { amount: true },
    });
    const reservedAmount = reserved._sum.amount ?? 0n;
    const remainingAmount = payment.amount - reservedAmount;
    this.assertFinancialInvariant(payment.amount, reservedAmount);
    if (input.amount > remainingAmount) {
      throw new ConflictException({
        code: 'REFUND_AMOUNT_EXCEEDS_REMAINING',
        message: 'Refund amount exceeds the remaining refundable balance.',
      });
    }

    const refund = await transaction.refund.create({
      data: {
        paymentId: payment.id,
        idempotencyKey: input.idempotencyKey,
        status: RefundStatus.PENDING,
        kind:
          input.amount === remainingAmount
            ? RefundKind.FULL
            : RefundKind.PARTIAL,
        reason: input.reason,
        reasonNote: input.reasonNote,
        amount: input.amount,
        currency: payment.currency,
      },
      select: refundSelect,
    });
    return { refund, created: true };
  }

  private async getRefundSummaryInTransaction(
    transaction: RefundTransactionClient,
    paymentId: string,
  ): Promise<RefundSummary> {
    await this.lockPayment(transaction, paymentId);
    const payment = await transaction.payment.findUnique({
      where: { id: paymentId },
      select: { amount: true, currency: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const grouped = await transaction.refund.groupBy({
      by: ['status'],
      where: { paymentId },
      _sum: { amount: true },
    });
    let pendingRefundAmount = 0n;
    let succeededRefundAmount = 0n;
    for (const row of grouped) {
      if (row.status === RefundStatus.PENDING) {
        pendingRefundAmount = row._sum.amount ?? 0n;
      } else if (row.status === RefundStatus.SUCCEEDED) {
        succeededRefundAmount = row._sum.amount ?? 0n;
      }
    }
    const reservedRefundAmount = pendingRefundAmount + succeededRefundAmount;
    this.assertFinancialInvariant(payment.amount, reservedRefundAmount);

    return {
      paymentAmount: payment.amount,
      currency: payment.currency,
      pendingRefundAmount,
      succeededRefundAmount,
      reservedRefundAmount,
      remainingRefundableAmount: payment.amount - reservedRefundAmount,
      refundState: this.deriveRefundState(
        payment.amount,
        succeededRefundAmount,
      ),
    };
  }

  private async markRefundSucceededInTransaction(
    transaction: RefundTransactionClient,
    refundId: string,
  ): Promise<TransitionResult> {
    const refund = await this.lockAndLoadRefund(transaction, refundId);
    if (refund.status === RefundStatus.SUCCEEDED) {
      return { refund, changed: false };
    }
    if (refund.status === RefundStatus.CANCELLED) {
      throw this.invalidTransition(
        RefundStatus.CANCELLED,
        RefundStatus.SUCCEEDED,
      );
    }

    const now = await this.getDatabaseNow(transaction);
    const updated = await transaction.refund.update({
      where: { id: refund.id },
      data: { status: RefundStatus.SUCCEEDED, succeededAt: now },
      select: refundSelect,
    });
    return { refund: updated, changed: true };
  }

  private async cancelPendingRefundInTransaction(
    transaction: RefundTransactionClient,
    refundId: string,
  ): Promise<TransitionResult> {
    const refund = await this.lockAndLoadRefund(transaction, refundId);
    if (refund.status === RefundStatus.CANCELLED) {
      return { refund, changed: false };
    }
    if (refund.status === RefundStatus.SUCCEEDED) {
      throw this.invalidTransition(
        RefundStatus.SUCCEEDED,
        RefundStatus.CANCELLED,
      );
    }

    const now = await this.getDatabaseNow(transaction);
    const updated = await transaction.refund.update({
      where: { id: refund.id },
      data: { status: RefundStatus.CANCELLED, cancelledAt: now },
      select: refundSelect,
    });
    return { refund: updated, changed: true };
  }

  private async lockAndLoadRefund(
    transaction: RefundTransactionClient,
    refundId: string,
  ): Promise<RefundRecord> {
    const initial = await transaction.refund.findUnique({
      where: { id: refundId },
      select: { paymentId: true },
    });
    if (!initial) throw new NotFoundException('Refund not found');

    await this.lockPayment(transaction, initial.paymentId);
    const locked = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id"
      FROM "refunds"
      WHERE "id" = ${refundId}::uuid
      FOR UPDATE
    `);
    if (!locked[0]) throw new NotFoundException('Refund not found');

    const refund = await transaction.refund.findUnique({
      where: { id: refundId },
      select: refundSelect,
    });
    if (!refund) throw new Error('Locked Refund disappeared');
    return refund;
  }

  private async lockPayment(
    transaction: Pick<RefundTransactionClient, '$queryRaw'>,
    paymentId: string,
  ): Promise<void> {
    const locked = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id"
      FROM "payments"
      WHERE "id" = ${paymentId}::uuid
      FOR UPDATE
    `);
    if (!locked[0]) throw new NotFoundException('Payment not found');
  }

  private async findByIdempotencyKey(
    transaction: Pick<RefundTransactionClient, 'refund'>,
    idempotencyKey: string,
  ): Promise<RefundRecord | null> {
    return transaction.refund.findUnique({
      where: { idempotencyKey },
      select: refundSelect,
    });
  }

  private resolveIdempotentRefund(
    refund: RefundRecord,
    input: CreateRefundObligationInput,
  ): RefundRecord {
    if (
      refund.paymentId !== input.paymentId ||
      refund.amount !== input.amount ||
      refund.reason !== input.reason
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message:
          'Idempotency key was already used for a different refund request.',
      });
    }
    return refund;
  }

  private normalizeCreateInput(
    input: CreateRefundObligationInput,
  ): CreateRefundObligationInput {
    if (input.amount <= 0n) {
      throw new BadRequestException({
        code: 'INVALID_REFUND_AMOUNT',
        message: 'Refund amount must be greater than zero.',
      });
    }
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Refund idempotency key must contain 1 to 128 characters.',
      });
    }
    if (input.reasonNote && input.reasonNote.length > 500) {
      throw new BadRequestException({
        code: 'INVALID_REFUND_REASON_NOTE',
        message: 'Refund reason note must be at most 500 characters.',
      });
    }
    return { ...input, idempotencyKey };
  }

  private deriveRefundState(
    paymentAmount: bigint,
    succeededRefundAmount: bigint,
  ): PaymentRefundState {
    if (succeededRefundAmount === 0n) return PaymentRefundState.NONE;
    if (succeededRefundAmount === paymentAmount) return PaymentRefundState.FULL;
    return PaymentRefundState.PARTIAL;
  }

  private assertFinancialInvariant(
    paymentAmount: bigint,
    reservedRefundAmount: bigint,
  ): void {
    if (reservedRefundAmount > paymentAmount || reservedRefundAmount < 0n) {
      throw new ConflictException({
        code: 'REFUND_FINANCIAL_INVARIANT_VIOLATION',
        message:
          'Stored refund totals violate the payment financial invariant.',
      });
    }
  }

  private invalidTransition(from: RefundStatus, to: RefundStatus) {
    return new ConflictException({
      code: 'INVALID_REFUND_TRANSITION',
      message: `Refund cannot transition from ${from} to ${to}.`,
    });
  }

  private async getDatabaseNow(
    transaction: Pick<RefundTransactionClient, '$queryRaw'>,
  ): Promise<Date> {
    const [row] = await transaction.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Failed to read database time');
    return row.now;
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private logRefund(event: string, refund: RefundRecord): void {
    this.logger.log({
      event,
      refundId: refund.id,
      paymentId: refund.paymentId,
      status: refund.status,
      kind: refund.kind,
      amount: refund.amount.toString(),
      currency: refund.currency,
      reason: refund.reason,
    });
  }
}
