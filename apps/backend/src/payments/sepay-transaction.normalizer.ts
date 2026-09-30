import { PaymentProvider } from '../generated/prisma/client.js';
import type { SepayIpnDto } from './dto/sepay-ipn.dto.js';
import type { NormalizedPaymentTransaction } from './normalized-payment-transaction.js';
import { parseExactVndAmount } from './sepay-vnd-amount.js';

export type SepayNormalizationResult =
  | Readonly<{
      normalized: true;
      transaction: NormalizedPaymentTransaction;
    }>
  | Readonly<{
      normalized: false;
      reason: 'INVALID_AMOUNT' | 'AMOUNT_MISMATCH' | 'CURRENCY_MISMATCH';
    }>;

export function normalizeSepayTransaction(
  dto: SepayIpnDto,
): SepayNormalizationResult {
  let orderAmount: bigint;
  let transactionAmount: bigint;

  try {
    orderAmount = parseExactVndAmount(dto.order.order_amount);
    transactionAmount = parseExactVndAmount(dto.transaction.transaction_amount);
  } catch {
    return { normalized: false, reason: 'INVALID_AMOUNT' };
  }

  if (orderAmount !== transactionAmount) {
    return { normalized: false, reason: 'AMOUNT_MISMATCH' };
  }
  if (dto.order.order_currency !== dto.transaction.transaction_currency) {
    return { normalized: false, reason: 'CURRENCY_MISMATCH' };
  }

  return {
    normalized: true,
    transaction: {
      provider: PaymentProvider.SEPAY,
      merchantReference: dto.order.order_invoice_number,
      providerTransactionId: dto.transaction.transaction_id,
      amount: orderAmount,
      currency: dto.order.order_currency,
    },
  };
}
