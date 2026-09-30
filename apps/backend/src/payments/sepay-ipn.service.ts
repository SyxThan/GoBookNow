import { Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { SepayIpnDto } from './dto/sepay-ipn.dto.js';
import { parseExactVndAmount } from './sepay-vnd-amount.js';

const ORDER_PAID = 'ORDER_PAID';
const TRANSACTION_VOID = 'TRANSACTION_VOID';

const attemptSelect = {
  id: true,
  paymentId: true,
  provider: true,
  status: true,
  amount: true,
  currency: true,
  merchantReference: true,
  providerTransactionId: true,
  expiresAt: true,
  payment: {
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      booking: {
        select: {
          id: true,
          status: true,
          expiresAt: true,
        },
      },
    },
  },
} as const satisfies Prisma.PaymentAttemptSelect;

type MatchedAttempt = Prisma.PaymentAttemptGetPayload<{
  select: typeof attemptSelect;
}>;
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
}>;

export type SepayIpnAcknowledgement = Readonly<{ success: true }>;

@Injectable()
export class SepayIpnService {
  private readonly logger = new Logger(SepayIpnService.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(dto: SepayIpnDto): Promise<SepayIpnAcknowledgement> {
    if (dto.notification_type === TRANSACTION_VOID) {
      this.warn('TRANSACTION_VOID_RECONCILIATION_DEFERRED', dto);
      return { success: true };
    }
    if (dto.notification_type !== ORDER_PAID) {
      this.warn('UNSUPPORTED_NOTIFICATION_TYPE', dto);
      return { success: true };
    }

    let orderAmount: bigint;
    let transactionAmount: bigint;
    try {
      orderAmount = parseExactVndAmount(dto.order.order_amount);
      transactionAmount = parseExactVndAmount(
        dto.transaction.transaction_amount,
      );
    } catch {
      this.warn('INVALID_VND_AMOUNT', dto);
      return { success: true };
    }

    try {
      await this.prisma.$transaction((transaction) =>
        this.processOrderPaidInTransaction(
          transaction,
          dto,
          orderAmount,
          transactionAmount,
        ),
      );
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        this.warn('PROVIDER_TRANSACTION_COLLISION', dto);
        return { success: true };
      }
      throw error;
    }

    return { success: true };
  }

  private async processOrderPaidInTransaction(
    transaction: SepayIpnTransactionClient,
    dto: SepayIpnDto,
    orderAmount: bigint,
    transactionAmount: bigint,
  ): Promise<void> {
    const initialMatch = await transaction.paymentAttempt.findUnique({
      where: { merchantReference: dto.order.order_invoice_number },
      select: attemptSelect,
    });
    if (!initialMatch) {
      this.warn('UNKNOWN_MERCHANT_REFERENCE', dto);
      return;
    }

    await this.lockRows(transaction, initialMatch);
    const attempt = await transaction.paymentAttempt.findUnique({
      where: { merchantReference: dto.order.order_invoice_number },
      select: attemptSelect,
    });
    if (!attempt) throw new Error('Matched PaymentAttempt disappeared');

    const local = this.localContext(attempt);
    if (attempt.provider !== PaymentProvider.SEPAY) {
      this.warn('PAYMENT_PROVIDER_MISMATCH', dto, local);
      return;
    }
    if (attempt.merchantReference !== dto.order.order_invoice_number) {
      this.warn('MERCHANT_REFERENCE_MISMATCH', dto, local);
      return;
    }
    if (
      dto.order.order_status !== 'CAPTURED' ||
      dto.transaction.transaction_type !== 'PAYMENT' ||
      dto.transaction.transaction_status !== 'APPROVED'
    ) {
      this.warn('PROVIDER_SUCCESS_STATUS_MISMATCH', dto, local);
      return;
    }
    if (
      attempt.currency !== 'VND' ||
      attempt.payment.currency !== 'VND' ||
      dto.order.order_currency !== attempt.payment.currency ||
      dto.transaction.transaction_currency !== attempt.payment.currency ||
      dto.order.order_currency !== attempt.currency ||
      dto.transaction.transaction_currency !== attempt.currency
    ) {
      this.warn('CURRENCY_MISMATCH', dto, local);
      return;
    }
    if (
      orderAmount !== attempt.amount ||
      transactionAmount !== attempt.amount ||
      orderAmount !== attempt.payment.amount ||
      transactionAmount !== attempt.payment.amount
    ) {
      this.warn('AMOUNT_MISMATCH', dto, local);
      return;
    }

    const providerTransactionId = dto.transaction.transaction_id;
    if (
      attempt.status === PaymentAttemptStatus.SUCCEEDED &&
      attempt.payment.status === PaymentStatus.SUCCEEDED &&
      attempt.providerTransactionId === providerTransactionId
    ) {
      return;
    }
    if (
      attempt.providerTransactionId !== null &&
      attempt.providerTransactionId !== providerTransactionId
    ) {
      this.warn('ATTEMPT_TRANSACTION_ID_MISMATCH', dto, local);
      return;
    }
    if (attempt.status !== PaymentAttemptStatus.PENDING) {
      this.warn('ATTEMPT_TERMINAL_STATE', dto, local);
      return;
    }
    if (attempt.payment.status !== PaymentStatus.PENDING) {
      this.warn('PAYMENT_TERMINAL_STATE', dto, local);
      return;
    }
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

    const collision = await transaction.paymentAttempt.findFirst({
      where: {
        provider: PaymentProvider.SEPAY,
        providerTransactionId,
        id: { not: attempt.id },
      },
      select: { id: true, paymentId: true, status: true },
    });
    if (collision) {
      this.warn('PROVIDER_TRANSACTION_COLLISION', dto, local);
      return;
    }

    await transaction.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentAttemptStatus.SUCCEEDED,
        providerTransactionId,
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
      status: PaymentStatus.SUCCEEDED,
    });
  }

  private async lockRows(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
    attempt: MatchedAttempt,
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

  private localContext(attempt: MatchedAttempt): LocalLogContext {
    return {
      attemptId: attempt.id,
      paymentId: attempt.payment.id,
      status: `${attempt.status}/${attempt.payment.status}`,
    };
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
