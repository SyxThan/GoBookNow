import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import { TicketService } from '../tickets/ticket.service.js';
import { recordPaymentReconciliation } from './payment-reconciliation.js';
import type { SepayIpnDto } from './dto/sepay-ipn.dto.js';
import type { NormalizedPaymentTransaction } from './normalized-payment-transaction.js';
import {
  PaymentMatchingService,
  type MatchedPaymentAttempt,
  type PaymentMatchResult,
} from './payment-matching.service.js';
import {
  PaymentSettlementService,
  type PaymentSettlementResult,
} from './payment-settlement.service.js';
import {
  normalizeSepayTransaction,
  normalizeSepayReceivedTransaction,
} from './sepay-transaction.normalizer.js';

const ORDER_PAID = 'ORDER_PAID';
const TRANSACTION_VOID = 'TRANSACTION_VOID';

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
    private readonly paymentMatching: PaymentMatchingService,
    private readonly paymentSettlement: PaymentSettlementService,
    private readonly prisma: PrismaService,
    private readonly tickets: TicketService,
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
      const received = normalizeSepayReceivedTransaction(dto);
      if (received)
        await recordPaymentReconciliation(
          this.prisma,
          received,
          `PROVIDER_${normalization.reason}`,
        );
      this.warn(normalization.reason, dto);
      return { success: true };
    }

    const input = normalization.transaction;
    const initialMatch = await this.paymentMatching.match(input);
    if (!initialMatch.matched) {
      await recordPaymentReconciliation(
        this.prisma,
        input,
        initialMatch.reason,
        initialMatch.attempt?.paymentId,
      );
      this.warnMatch(initialMatch, dto, input);
      return { success: true };
    }
    if (
      !initialMatch.processable &&
      initialMatch.reason !== 'ALREADY_SUCCEEDED'
    ) {
      await recordPaymentReconciliation(
        this.prisma,
        input,
        initialMatch.reason,
        initialMatch.payment.id,
      );
      this.warn(
        initialMatch.reason,
        dto,
        this.localContext(initialMatch.attempt),
      );
      return { success: true };
    }

    let settlement: PaymentSettlementResult;
    try {
      settlement = await this.paymentSettlement.settle({
        attemptId: initialMatch.attempt.id,
        paymentId: initialMatch.payment.id,
        bookingId: initialMatch.booking.id,
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        amount: input.amount,
        currency: input.currency,
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        await recordPaymentReconciliation(
          this.prisma,
          input,
          'TRANSACTION_ID_CONFLICT',
          initialMatch.payment.id,
        );
        this.warn(
          'TRANSACTION_ID_CONFLICT',
          dto,
          this.localContext(initialMatch.attempt),
        );
        return { success: true };
      }
      throw error;
    }

    // Confirmation is durable already. An issuance failure returns 5xx; a replay
    // re-enters ALREADY_CONFIRMED and repairs missing sequences without rotating tokens.
    if (
      settlement.outcome === 'CONFIRMED' ||
      settlement.outcome === 'ALREADY_CONFIRMED'
    ) {
      await this.tickets.issueTicketsForBooking(initialMatch.booking.id);
    }

    return { success: true };
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
