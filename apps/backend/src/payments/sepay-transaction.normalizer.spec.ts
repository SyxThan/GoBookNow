import { PaymentProvider } from '../generated/prisma/client.js';
import type { SepayIpnDto } from './dto/sepay-ipn.dto.js';
import { normalizeSepayTransaction } from './sepay-transaction.normalizer.js';

function payload(
  orderAmount: string,
  transactionAmount = orderAmount,
): SepayIpnDto {
  return {
    timestamp: 1_757_058_220,
    notification_type: 'ORDER_PAID',
    order: {
      id: 'order-id',
      order_id: 'order-code',
      order_status: 'CAPTURED',
      order_currency: 'VND',
      order_amount: orderAmount,
      order_invoice_number: 'GBKA',
    },
    transaction: {
      id: 'transaction-row-id',
      payment_method: 'BANK_TRANSFER',
      transaction_id: 'TX1',
      transaction_type: 'PAYMENT',
      transaction_status: 'APPROVED',
      transaction_amount: transactionAmount,
      transaction_currency: 'VND',
    },
  };
}

describe('normalizeSepayTransaction', () => {
  it('normalizes equivalent decimal and integer VND values to bigint', () => {
    expect(normalizeSepayTransaction(payload('250000.00', '250000'))).toEqual({
      normalized: true,
      transaction: {
        provider: PaymentProvider.SEPAY,
        merchantReference: 'GBKA',
        providerTransactionId: 'TX1',
        amount: 250_000n,
        currency: 'VND',
      },
    });
  });

  it.each(['250000.50', '-250000', '2.5e5', '250,000', 'abc', ''])(
    'rejects invalid exact amount %j',
    (amount) => {
      expect(normalizeSepayTransaction(payload(amount))).toEqual({
        normalized: false,
        reason: 'INVALID_AMOUNT',
      });
    },
  );

  it('rejects disagreement between provider amount fields', () => {
    expect(normalizeSepayTransaction(payload('250000', '300000'))).toEqual({
      normalized: false,
      reason: 'AMOUNT_MISMATCH',
    });
  });

  it('does not case-fold or trim the merchant reference', () => {
    const dto = payload('250000');
    dto.order.order_invoice_number = ' GBKa ';

    expect(normalizeSepayTransaction(dto)).toMatchObject({
      normalized: true,
      transaction: { merchantReference: ' GBKa ' },
    });
  });
});
