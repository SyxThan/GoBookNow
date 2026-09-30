import { Injectable } from '@nestjs/common';
import {
  PaymentAttemptStatus,
  PaymentStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { NormalizedPaymentTransaction } from './normalized-payment-transaction.js';

export const paymentMatchAttemptSelect = {
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
          totalAmount: true,
          currency: true,
          expiresAt: true,
        },
      },
    },
  },
} as const satisfies Prisma.PaymentAttemptSelect;

export type MatchedPaymentAttempt = Prisma.PaymentAttemptGetPayload<{
  select: typeof paymentMatchAttemptSelect;
}>;

export type PaymentMatchFailureReason =
  | 'UNKNOWN_REFERENCE'
  | 'PROVIDER_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'TRANSACTION_ID_CONFLICT';

export type PaymentMatchResult =
  | Readonly<{
      matched: false;
      reason: PaymentMatchFailureReason;
      attempt?: MatchedPaymentAttempt;
    }>
  | Readonly<{
      matched: true;
      processable: true;
      attempt: MatchedPaymentAttempt;
      payment: MatchedPaymentAttempt['payment'];
      booking: MatchedPaymentAttempt['payment']['booking'];
    }>
  | Readonly<{
      matched: true;
      processable: false;
      reason: 'ALREADY_SUCCEEDED' | 'INVALID_STATE';
      attempt: MatchedPaymentAttempt;
      payment: MatchedPaymentAttempt['payment'];
      booking: MatchedPaymentAttempt['payment']['booking'];
    }>;

export type PaymentMatchingClient = Pick<
  Prisma.TransactionClient,
  'paymentAttempt'
>;

@Injectable()
export class PaymentMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async match(
    input: NormalizedPaymentTransaction,
    client: PaymentMatchingClient = this.prisma,
  ): Promise<PaymentMatchResult> {
    const attempt = await client.paymentAttempt.findUnique({
      where: { merchantReference: input.merchantReference },
      select: paymentMatchAttemptSelect,
    });

    if (!attempt) {
      return { matched: false, reason: 'UNKNOWN_REFERENCE' };
    }
    if (attempt.provider !== input.provider) {
      return { matched: false, reason: 'PROVIDER_MISMATCH', attempt };
    }
    if (
      input.amount !== attempt.amount ||
      input.amount !== attempt.payment.amount ||
      input.amount !== attempt.payment.booking.totalAmount
    ) {
      return { matched: false, reason: 'AMOUNT_MISMATCH', attempt };
    }
    if (
      input.currency !== 'VND' ||
      input.currency !== attempt.currency ||
      input.currency !== attempt.payment.currency ||
      input.currency !== attempt.payment.booking.currency
    ) {
      return { matched: false, reason: 'CURRENCY_MISMATCH', attempt };
    }
    if (
      attempt.providerTransactionId !== null &&
      attempt.providerTransactionId !== input.providerTransactionId
    ) {
      return {
        matched: false,
        reason: 'TRANSACTION_ID_CONFLICT',
        attempt,
      };
    }

    const collision = await client.paymentAttempt.findFirst({
      where: {
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        id: { not: attempt.id },
      },
      select: { id: true },
    });
    if (collision) {
      return {
        matched: false,
        reason: 'TRANSACTION_ID_CONFLICT',
        attempt,
      };
    }

    const aggregate = {
      attempt,
      payment: attempt.payment,
      booking: attempt.payment.booking,
    } as const;

    if (
      attempt.status === PaymentAttemptStatus.PENDING &&
      attempt.payment.status === PaymentStatus.PENDING
    ) {
      return { matched: true, processable: true, ...aggregate };
    }
    if (
      attempt.status === PaymentAttemptStatus.SUCCEEDED &&
      attempt.payment.status === PaymentStatus.SUCCEEDED &&
      attempt.providerTransactionId === input.providerTransactionId
    ) {
      return {
        matched: true,
        processable: false,
        reason: 'ALREADY_SUCCEEDED',
        ...aggregate,
      };
    }

    return {
      matched: true,
      processable: false,
      reason: 'INVALID_STATE',
      ...aggregate,
    };
  }
}
