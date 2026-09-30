import type { PrismaService } from '../database/prisma/prisma.service.js';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
} from '../generated/prisma/client.js';
import type { SepayIpnDto } from './dto/sepay-ipn.dto.js';
import { PaymentMatchingService } from './payment-matching.service.js';
import { SepayIpnService } from './sepay-ipn.service.js';

const NOW = new Date('2026-09-29T08:00:00.000Z');
const EXPIRES_AT = new Date('2026-09-29T08:10:00.000Z');

function payload(
  overrides: Partial<{
    notificationType: string;
    merchantReference: string;
    orderStatus: string;
    orderAmount: string;
    orderCurrency: string;
    transactionId: string;
    transactionType: string;
    transactionStatus: string;
    transactionAmount: string;
    transactionCurrency: string;
  }> = {},
): SepayIpnDto {
  return {
    timestamp: 1_757_058_220,
    notification_type: overrides.notificationType ?? 'ORDER_PAID',
    order: {
      id: 'provider-order-id',
      order_id: 'provider-order-code',
      order_status: overrides.orderStatus ?? 'CAPTURED',
      order_currency: overrides.orderCurrency ?? 'VND',
      order_amount: overrides.orderAmount ?? '250000.00',
      order_invoice_number:
        overrides.merchantReference ?? 'GBKABCDEF1234567890',
    },
    transaction: {
      id: 'provider-transaction-row-id',
      payment_method: 'BANK_TRANSFER',
      transaction_id: overrides.transactionId ?? 'SEPAY-TXN-001',
      transaction_type: overrides.transactionType ?? 'PAYMENT',
      transaction_status: overrides.transactionStatus ?? 'APPROVED',
      transaction_amount: overrides.transactionAmount ?? '250000',
      transaction_currency: overrides.transactionCurrency ?? 'VND',
    },
    customer: null,
  };
}

function setup(
  overrides: Partial<{
    unknownReference: boolean;
    provider: PaymentProvider;
    attemptStatus: PaymentAttemptStatus;
    paymentStatus: PaymentStatus;
    bookingStatus: BookingStatus;
    providerTransactionId: string | null;
    collision: boolean;
    expiresAt: Date | null;
  }> = {},
) {
  const attempt = {
    id: '11111111-1111-4111-8111-111111111111',
    paymentId: '22222222-2222-4222-8222-222222222222',
    provider: overrides.provider ?? PaymentProvider.SEPAY,
    status: overrides.attemptStatus ?? PaymentAttemptStatus.PENDING,
    amount: 250_000n,
    currency: 'VND',
    merchantReference: 'GBKABCDEF1234567890',
    providerTransactionId: overrides.providerTransactionId ?? null,
    expiresAt:
      overrides.expiresAt === undefined ? EXPIRES_AT : overrides.expiresAt,
    payment: {
      id: '22222222-2222-4222-8222-222222222222',
      status: overrides.paymentStatus ?? PaymentStatus.PENDING,
      amount: 250_000n,
      currency: 'VND',
      booking: {
        id: '33333333-3333-4333-8333-333333333333',
        status: overrides.bookingStatus ?? BookingStatus.PENDING_PAYMENT,
        totalAmount: 250_000n,
        currency: 'VND',
        expiresAt: EXPIRES_AT,
      },
    },
  };
  let rawCall = 0;
  const transaction = {
    $queryRaw: vi.fn(() => {
      rawCall += 1;
      return Promise.resolve(
        rawCall % 4 === 0 ? [{ now: NOW }] : [{ id: 'locked' }],
      );
    }),
    paymentAttempt: {
      findUnique: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(overrides.unknownReference ? null : attempt),
        ),
      findFirst: vi.fn().mockResolvedValue(
        overrides.collision
          ? {
              id: '44444444-4444-4444-8444-444444444444',
              paymentId: '55555555-5555-4555-8555-555555555555',
              status: PaymentAttemptStatus.SUCCEEDED,
            }
          : null,
      ),
      update: vi.fn().mockImplementation(({ data }) => {
        Object.assign(attempt, data);
        return Promise.resolve(attempt);
      }),
    },
    payment: {
      update: vi.fn().mockImplementation(({ data }) => {
        Object.assign(attempt.payment, data);
        return Promise.resolve(attempt.payment);
      }),
    },
  };
  const runTransaction = vi.fn((callback) => callback(transaction));
  const prisma = {
    $transaction: runTransaction,
  } as unknown as PrismaService;

  return {
    service: new SepayIpnService(prisma, new PaymentMatchingService(prisma)),
    runTransaction,
    transaction,
    attempt,
  };
}

describe('SepayIpnService', () => {
  it('atomically marks only PaymentAttempt and Payment successful', async () => {
    const { service, transaction, attempt } = setup();

    await expect(service.process(payload())).resolves.toEqual({
      success: true,
    });

    expect(transaction.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: attempt.id },
      data: {
        status: PaymentAttemptStatus.SUCCEEDED,
        providerTransactionId: 'SEPAY-TXN-001',
        succeededAt: NOW,
      },
    });
    expect(transaction.payment.update).toHaveBeenCalledWith({
      where: { id: attempt.payment.id },
      data: { status: PaymentStatus.SUCCEEDED, succeededAt: NOW },
    });
    expect(transaction).not.toHaveProperty('booking.update');
    expect(transaction).not.toHaveProperty('reservation.update');
  });

  it('acknowledges duplicate delivery without a second state change', async () => {
    const { service, transaction } = setup();

    await service.process(payload());
    await service.process(payload());

    expect(transaction.paymentAttempt.update).toHaveBeenCalledTimes(1);
    expect(transaction.payment.update).toHaveBeenCalledTimes(1);
  });

  it('does not create records for an unknown merchant reference', async () => {
    const { service, transaction } = setup({ unknownReference: true });

    await expect(service.process(payload())).resolves.toEqual({
      success: true,
    });

    expect(transaction.paymentAttempt.update).not.toHaveBeenCalled();
    expect(transaction.payment.update).not.toHaveBeenCalled();
    expect(transaction.paymentAttempt).not.toHaveProperty('create');
  });

  it.each([
    ['order mismatch', { orderAmount: '250001' }],
    ['transaction mismatch', { transactionAmount: '249999' }],
    ['fractional VND', { orderAmount: '250000.50' }],
    ['malformed VND', { transactionAmount: '2.5e5' }],
    ['order currency mismatch', { orderCurrency: 'USD' }],
    ['transaction currency mismatch', { transactionCurrency: 'USD' }],
    ['order status mismatch', { orderStatus: 'PENDING' }],
    ['transaction type mismatch', { transactionType: 'REFUND' }],
    ['transaction status mismatch', { transactionStatus: 'DECLINED' }],
  ])('acknowledges but does not confirm %s', async (_name, change) => {
    const { service, transaction } = setup();

    await service.process(payload(change));

    expect(transaction.paymentAttempt.update).not.toHaveBeenCalled();
    expect(transaction.payment.update).not.toHaveBeenCalled();
  });

  it('does not process an attempt owned by another provider', async () => {
    const { service, transaction } = setup({
      provider: 'OTHER' as PaymentProvider,
    });

    await service.process(payload());

    expect(transaction.paymentAttempt.update).not.toHaveBeenCalled();
  });

  it('protects a provider transaction ID used by another attempt', async () => {
    const { service, transaction } = setup({ collision: true });

    await service.process(payload());

    expect(transaction.paymentAttempt.update).not.toHaveBeenCalled();
    expect(transaction.payment.update).not.toHaveBeenCalled();
  });

  it.each([
    [PaymentAttemptStatus.FAILED, PaymentStatus.PENDING],
    [PaymentAttemptStatus.EXPIRED, PaymentStatus.PENDING],
    [PaymentAttemptStatus.CANCELLED, PaymentStatus.PENDING],
    [PaymentAttemptStatus.PENDING, PaymentStatus.EXPIRED],
    [PaymentAttemptStatus.PENDING, PaymentStatus.CANCELLED],
  ])(
    'does not resurrect Attempt %s / Payment %s',
    async (attemptStatus, paymentStatus) => {
      const { service, transaction } = setup({
        attemptStatus,
        paymentStatus,
      });

      await service.process(payload());

      expect(transaction.paymentAttempt.update).not.toHaveBeenCalled();
      expect(transaction.payment.update).not.toHaveBeenCalled();
    },
  );

  it.each([BookingStatus.EXPIRED, BookingStatus.CANCELLED])(
    'does not apply payment success to a %s Booking aggregate',
    async (bookingStatus) => {
      const { service, transaction } = setup({ bookingStatus });

      await service.process(payload());

      expect(transaction.paymentAttempt.update).not.toHaveBeenCalled();
    },
  );

  it('does not accept an IPN after the payment hold expiry time', async () => {
    const { service, transaction } = setup({ expiresAt: NOW });

    await service.process(payload());

    expect(transaction.paymentAttempt.update).not.toHaveBeenCalled();
  });

  it('acknowledges TRANSACTION_VOID without reversing state', async () => {
    const { service, runTransaction, transaction } = setup({
      attemptStatus: PaymentAttemptStatus.SUCCEEDED,
      paymentStatus: PaymentStatus.SUCCEEDED,
      providerTransactionId: 'SEPAY-TXN-001',
    });

    await expect(
      service.process(payload({ notificationType: 'TRANSACTION_VOID' })),
    ).resolves.toEqual({ success: true });

    expect(runTransaction).not.toHaveBeenCalled();
    expect(transaction.paymentAttempt.update).not.toHaveBeenCalled();
    expect(transaction.payment.update).not.toHaveBeenCalled();
  });
});
