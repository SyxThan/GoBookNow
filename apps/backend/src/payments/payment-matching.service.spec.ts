import type { PrismaService } from '../database/prisma/prisma.service.js';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
} from '../generated/prisma/client.js';
import type { NormalizedPaymentTransaction } from './normalized-payment-transaction.js';
import {
  type MatchedPaymentAttempt,
  PaymentMatchingService,
} from './payment-matching.service.js';

type AttemptOverrides = Partial<{
  id: string;
  paymentId: string;
  bookingId: string;
  merchantReference: string;
  provider: PaymentProvider;
  providerTransactionId: string | null;
  attemptStatus: PaymentAttemptStatus;
  paymentStatus: PaymentStatus;
  amount: bigint;
  paymentAmount: bigint;
  bookingAmount: bigint;
  currency: string;
  paymentCurrency: string;
  bookingCurrency: string;
}>;

function makeAttempt(overrides: AttemptOverrides = {}): MatchedPaymentAttempt {
  const amount = overrides.amount ?? 250_000n;
  const currency = overrides.currency ?? 'VND';
  const paymentId = overrides.paymentId ?? 'payment-a';

  return {
    id: overrides.id ?? 'attempt-a',
    paymentId,
    provider: overrides.provider ?? PaymentProvider.SEPAY,
    status: overrides.attemptStatus ?? PaymentAttemptStatus.PENDING,
    amount,
    currency,
    merchantReference: overrides.merchantReference ?? 'GBKA',
    providerTransactionId: overrides.providerTransactionId ?? null,
    expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    payment: {
      id: paymentId,
      status: overrides.paymentStatus ?? PaymentStatus.PENDING,
      amount: overrides.paymentAmount ?? amount,
      currency: overrides.paymentCurrency ?? currency,
      booking: {
        id: overrides.bookingId ?? 'booking-a',
        status: BookingStatus.PENDING_PAYMENT,
        totalAmount: overrides.bookingAmount ?? amount,
        currency: overrides.bookingCurrency ?? currency,
        expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    },
  };
}

function normalized(
  overrides: Partial<NormalizedPaymentTransaction> = {},
): NormalizedPaymentTransaction {
  return {
    provider: PaymentProvider.SEPAY,
    merchantReference: 'GBKA',
    providerTransactionId: 'TX1',
    amount: 250_000n,
    currency: 'VND',
    ...overrides,
  };
}

function setup(attempts: MatchedPaymentAttempt[]) {
  const paymentAttempt = {
    findUnique: vi.fn(({ where }: { where: { merchantReference: string } }) =>
      Promise.resolve(
        attempts.find(
          ({ merchantReference }) =>
            merchantReference === where.merchantReference,
        ) ?? null,
      ),
    ),
    findFirst: vi.fn(
      ({
        where,
      }: {
        where: {
          provider: PaymentProvider;
          providerTransactionId: string;
          id: { not: string };
        };
      }) =>
        Promise.resolve(
          attempts.find(
            (attempt) =>
              attempt.provider === where.provider &&
              attempt.providerTransactionId === where.providerTransactionId &&
              attempt.id !== where.id.not,
          ) ?? null,
        ),
    ),
  };
  const prisma = { paymentAttempt } as unknown as PrismaService;
  return {
    service: new PaymentMatchingService(prisma),
    paymentAttempt,
  };
}

describe('PaymentMatchingService', () => {
  it('resolves only Booking A when two Bookings have the same amount', async () => {
    const attemptA = makeAttempt();
    const attemptB = makeAttempt({
      id: 'attempt-b',
      paymentId: 'payment-b',
      bookingId: 'booking-b',
      merchantReference: 'GBKB',
    });
    const { service, paymentAttempt } = setup([attemptA, attemptB]);

    const result = await service.match(normalized());

    expect(result).toMatchObject({
      matched: true,
      processable: true,
      attempt: { id: 'attempt-a' },
      payment: { id: 'payment-a' },
      booking: { id: 'booking-a' },
    });
    expect(paymentAttempt.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantReference: 'GBKA' } }),
    );
  });

  it('does not fall back to amount when the exact reference is unknown', async () => {
    const { service, paymentAttempt } = setup([
      makeAttempt(),
      makeAttempt({
        id: 'attempt-b',
        paymentId: 'payment-b',
        bookingId: 'booking-b',
        merchantReference: 'GBKB',
      }),
    ]);

    await expect(
      service.match(normalized({ merchantReference: 'UNKNOWN' })),
    ).resolves.toEqual({ matched: false, reason: 'UNKNOWN_REFERENCE' });
    expect(paymentAttempt.findFirst).not.toHaveBeenCalled();
  });

  it('does not fuzzy-match a longer merchant reference', async () => {
    const { service } = setup([makeAttempt()]);

    await expect(
      service.match(normalized({ merchantReference: 'GBKA1' })),
    ).resolves.toEqual({ matched: false, reason: 'UNKNOWN_REFERENCE' });
  });

  it('does not switch to Booking B when code A carries amount B', async () => {
    const attemptA = makeAttempt();
    const attemptB = makeAttempt({
      id: 'attempt-b',
      paymentId: 'payment-b',
      bookingId: 'booking-b',
      merchantReference: 'GBKB',
      amount: 300_000n,
    });
    const { service } = setup([attemptA, attemptB]);

    const result = await service.match(normalized({ amount: 300_000n }));

    expect(result).toMatchObject({
      matched: false,
      reason: 'AMOUNT_MISMATCH',
      attempt: { id: 'attempt-a' },
    });
  });

  it('requires the incoming and all snapshot currencies to be VND', async () => {
    const { service } = setup([makeAttempt()]);

    await expect(
      service.match(normalized({ currency: 'USD' })),
    ).resolves.toMatchObject({
      matched: false,
      reason: 'CURRENCY_MISMATCH',
    });
  });

  it('rejects an Attempt owned by another provider', async () => {
    const { service } = setup([
      makeAttempt({ provider: 'OTHER' as PaymentProvider }),
    ]);

    await expect(service.match(normalized())).resolves.toMatchObject({
      matched: false,
      reason: 'PROVIDER_MISMATCH',
    });
  });

  it('validates the immutable Booking amount snapshot', async () => {
    const { service } = setup([makeAttempt({ bookingAmount: 300_000n })]);

    await expect(service.match(normalized())).resolves.toMatchObject({
      matched: false,
      reason: 'AMOUNT_MISMATCH',
    });
  });

  it('requires the Payment amount to equal the Attempt and incoming amount', async () => {
    const { service } = setup([makeAttempt({ paymentAmount: 300_000n })]);

    await expect(service.match(normalized())).resolves.toMatchObject({
      matched: false,
      reason: 'AMOUNT_MISMATCH',
    });
  });

  it('accepts an unassigned transaction ID, recognizes its duplicate, and rejects replacement', async () => {
    const attempt = makeAttempt();
    const { service } = setup([attempt]);

    await expect(service.match(normalized())).resolves.toMatchObject({
      matched: true,
      processable: true,
    });

    attempt.providerTransactionId = 'TX1';
    attempt.status = PaymentAttemptStatus.SUCCEEDED;
    attempt.payment.status = PaymentStatus.SUCCEEDED;

    await expect(service.match(normalized())).resolves.toMatchObject({
      matched: true,
      processable: false,
      reason: 'ALREADY_SUCCEEDED',
      attempt: { id: 'attempt-a' },
      payment: { id: 'payment-a' },
      booking: { id: 'booking-a' },
    });
    await expect(
      service.match(normalized({ providerTransactionId: 'TX2' })),
    ).resolves.toMatchObject({
      matched: false,
      reason: 'TRANSACTION_ID_CONFLICT',
    });
  });

  it('detects a provider transaction ID attached to another Attempt', async () => {
    const attemptA = makeAttempt({
      providerTransactionId: 'TX1',
      attemptStatus: PaymentAttemptStatus.SUCCEEDED,
      paymentStatus: PaymentStatus.SUCCEEDED,
    });
    const attemptB = makeAttempt({
      id: 'attempt-b',
      paymentId: 'payment-b',
      bookingId: 'booking-b',
      merchantReference: 'GBKB',
    });
    const { service } = setup([attemptA, attemptB]);

    await expect(
      service.match(normalized({ merchantReference: 'GBKB' })),
    ).resolves.toMatchObject({
      matched: false,
      reason: 'TRANSACTION_ID_CONFLICT',
      attempt: { id: 'attempt-b' },
    });
  });

  it('recognizes an expired Payment identity but marks it unprocessable', async () => {
    const { service } = setup([
      makeAttempt({ paymentStatus: PaymentStatus.EXPIRED }),
    ]);

    await expect(service.match(normalized())).resolves.toMatchObject({
      matched: true,
      processable: false,
      reason: 'INVALID_STATE',
      booking: { id: 'booking-a' },
    });
  });

  it('returns the same aggregate for repeated matching without creating rows', async () => {
    const { service, paymentAttempt } = setup([makeAttempt()]);

    const first = await service.match(normalized());
    const second = await service.match(normalized());

    expect(first).toMatchObject({
      attempt: { id: 'attempt-a' },
      payment: { id: 'payment-a' },
      booking: { id: 'booking-a' },
    });
    expect(second).toMatchObject({
      attempt: { id: 'attempt-a' },
      payment: { id: 'payment-a' },
      booking: { id: 'booking-a' },
    });
    expect(paymentAttempt).not.toHaveProperty('create');
  });
});
