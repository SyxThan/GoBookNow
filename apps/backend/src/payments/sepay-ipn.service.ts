import { Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { SepayIpnDto } from './dto/sepay-ipn.dto.js';
import type { NormalizedPaymentTransaction } from './normalized-payment-transaction.js';
import {
  PaymentMatchingService,
  type MatchedPaymentAttempt,
  type PaymentMatchResult,
} from './payment-matching.service.js';
import { normalizeSepayTransaction } from './sepay-transaction.normalizer.js';

const ORDER_PAID = 'ORDER_PAID';
const TRANSACTION_VOID = 'TRANSACTION_VOID';

type DbNowRow = { now: Date };
type LockedRow = { id: string };
type SepayIpnTransactionClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'paymentAttempt' | 'payment'
>;
type LocalLogContext = Readonly<{
  attemptId?: string;
  paymentId?: string;
  status?: string;
  expectedAmount?: string;
  receivedAmount?: string;
  currency?: string;
}>;

export type SepayIpnAcknowledgement = Readonly<{ success: true }>;

@Injectable()
export class SepayIpnService {
  private readonly logger = new Logger(SepayIpnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentMatching: PaymentMatchingService,
  ) {}

  async process(dto: SepayIpnDto): Promise<SepayIpnAcknowledgement> {
    if (dto.notification_type === TRANSACTION_VOID) {
      this.warn('TRANSACTION_VOID_RECONCILIATION_DEFERRED', dto);
      return { success: true };
    }
    if (dto.notification_type !== ORDER_PAID) {
      this.warn('UNSUPPORTED_NOTIFICATION_TYPE', dto);
      return { success: true };
    }

    if (
      dto.order.order_status !== 'CAPTURED' ||
      dto.transaction.transaction_type !== 'PAYMENT' ||
      dto.transaction.transaction_status !== 'APPROVED'
    ) {
      this.warn('PROVIDER_SUCCESS_STATUS_MISMATCH', dto);
      return { success: true };
    }

    const normalization = normalizeSepayTransaction(dto);
    if (!normalization.normalized) {
      this.warn(normalization.reason, dto);
      return { success: true };
    }

    try {
      await this.prisma.$transaction((transaction) =>
        this.processOrderPaidInTransaction(
          transaction,
          dto,
          normalization.transaction,
        ),
      );
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        this.warn('TRANSACTION_ID_CONFLICT', dto);
        return { success: true };
      }
      throw error;
    }

    return { success: true };
  }

  private async processOrderPaidInTransaction(
    transaction: SepayIpnTransactionClient,
    dto: SepayIpnDto,
    input: NormalizedPaymentTransaction,
  ): Promise<void> {
    const initialMatch = await this.paymentMatching.match(input, transaction);
    if (!initialMatch.matched) {
      this.warnMatch(initialMatch, dto, input);
      return;
    }
    if (!initialMatch.processable) {
      if (initialMatch.reason !== 'ALREADY_SUCCEEDED') {
        this.warn(
          initialMatch.reason,
          dto,
          this.localContext(initialMatch.attempt),
        );
      }
      return;
    }

    await this.lockRows(transaction, initialMatch.attempt);
    const lockedMatch = await this.paymentMatching.match(input, transaction);
    if (!lockedMatch.matched) {
      if (lockedMatch.reason === 'UNKNOWN_REFERENCE') {
        throw new Error('Matched PaymentAttempt disappeared');
      }
      this.warnMatch(lockedMatch, dto, input);
      return;
    }
    if (!lockedMatch.processable) {
      if (lockedMatch.reason !== 'ALREADY_SUCCEEDED') {
        this.warn(
          lockedMatch.reason,
          dto,
          this.localContext(lockedMatch.attempt),
        );
      }
      return;
    }

    const attempt = lockedMatch.attempt;
    const local = this.localContext(attempt);
    if (attempt.payment.booking.status !== BookingStatus.PENDING_PAYMENT) {
      this.warn('BOOKING_NOT_PENDING_PAYMENT', dto, {
        ...local,
        status: attempt.payment.booking.status,
      });
      return;
    }

    const now = await this.getDatabaseNow(transaction);
    if (
      (attempt.expiresAt !== null && attempt.expiresAt <= now) ||
      (attempt.payment.booking.expiresAt !== null &&
        attempt.payment.booking.expiresAt <= now)
    ) {
      this.warn('PAYMENT_HOLD_EXPIRED_RECONCILIATION_REQUIRED', dto, local);
      return;
    }

    await transaction.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentAttemptStatus.SUCCEEDED,
        providerTransactionId: input.providerTransactionId,
        succeededAt: now,
      },
    });
    await transaction.payment.update({
      where: { id: attempt.payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        succeededAt: now,
      },
    });

    this.logger.log({
      event: 'sepay_ipn_payment_succeeded',
      notificationType: ORDER_PAID,
      merchantReference: this.safe(dto.order.order_invoice_number),
      providerTransactionId: this.safe(dto.transaction.transaction_id),
      attemptId: attempt.id,
      paymentId: attempt.payment.id,
      bookingId: attempt.payment.booking.id,
      status: PaymentStatus.SUCCEEDED,
    });
  }

  private async lockRows(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
    attempt: MatchedPaymentAttempt,
  ): Promise<void> {
    const bookingRows = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id" FROM "bookings"
      WHERE "id" = ${attempt.payment.booking.id}::uuid
      FOR UPDATE
    `);
    const paymentRows = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id" FROM "payments"
      WHERE "id" = ${attempt.payment.id}::uuid
      FOR UPDATE
    `);
    const attemptRows = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id" FROM "payment_attempts"
      WHERE "id" = ${attempt.id}::uuid
      FOR UPDATE
    `);

    if (!bookingRows[0] || !paymentRows[0] || !attemptRows[0]) {
      throw new Error('Failed to lock SePay payment aggregate');
    }
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

  private localContext(attempt: MatchedPaymentAttempt): LocalLogContext {
    return {
      attemptId: attempt.id,
      paymentId: attempt.payment.id,
      status: `${attempt.status}/${attempt.payment.status}`,
    };
  }

  private warnMatch(
    result: Extract<PaymentMatchResult, { matched: false }>,
    dto: SepayIpnDto,
    input: NormalizedPaymentTransaction,
  ): void {
    const local = result.attempt
      ? {
          ...this.localContext(result.attempt),
          expectedAmount: result.attempt.amount.toString(),
          receivedAmount: input.amount.toString(),
          currency: input.currency,
        }
      : {
          receivedAmount: input.amount.toString(),
          currency: input.currency,
        };
    this.warn(result.reason, dto, local);
  }

  private warn(
    reason: string,
    dto: SepayIpnDto,
    local: LocalLogContext = {},
  ): void {
    this.logger.warn({
      event: 'sepay_ipn_reconciliation',
      reason,
      notificationType: this.safe(dto.notification_type),
      merchantReference: this.safe(dto.order.order_invoice_number),
      providerTransactionId: this.safe(dto.transaction.transaction_id),
      ...local,
    });
  }

  private safe(value: string): string {
    return Array.from(value)
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('')
      .slice(0, 128);
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
