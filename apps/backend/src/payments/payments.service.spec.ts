import type { HttpException } from '@nestjs/common';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
  ReservationStatus,
} from '../generated/prisma/client.js';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import type { PaymentCheckoutProvider } from './providers/payment-checkout-provider.js';
import { PaymentsService } from './payments.service.js';

const NOW = new Date('2026-09-27T10:00:00.000Z');
const EXPIRES_AT = new Date('2026-09-27T10:10:00.000Z');
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

type TestBooking = ReturnType<typeof makeBooking>;

function makeBooking(
  overrides: Partial<{
    customerId: string;
    status: BookingStatus;
    totalAmount: bigint;
    currency: string;
    expiresAt: Date | null;
    payment: ReturnType<typeof makePayment> | null;
    reservationStatus: ReservationStatus;
    reservationExpiresAt: Date | null;
    itemCount: number;
  }> = {},
) {
  const reservation = {
    status: overrides.reservationStatus ?? ReservationStatus.HELD,
    expiresAt:
      overrides.reservationExpiresAt === undefined
        ? EXPIRES_AT
        : overrides.reservationExpiresAt,
  };
  return {
    id: BOOKING_ID,
    bookingCode: 'GBK-20260927-ABC12345',
    customerId: overrides.customerId ?? CUSTOMER_ID,
    status: overrides.status ?? BookingStatus.PENDING_PAYMENT,
    totalAmount: overrides.totalAmount ?? 300_000n,
    currency: overrides.currency ?? 'VND',
    expiresAt:
      overrides.expiresAt === undefined ? EXPIRES_AT : overrides.expiresAt,
    items: Array.from({ length: overrides.itemCount ?? 1 }, () => ({
      reservation,
    })),
    payment: overrides.payment === undefined ? null : overrides.payment,
  };
}

function makePayment(
  overrides: Partial<{
    status: PaymentStatus;
    amount: bigint;
    currency: string;
  }> = {},
) {
  return {
    id: 'payment-1',
    status: overrides.status ?? PaymentStatus.PENDING,
    amount: overrides.amount ?? 300_000n,
    currency: overrides.currency ?? 'VND',
  };
}

function makeAttempt(
  overrides: Partial<{
    id: string;
    amount: bigint;
    currency: string;
    merchantReference: string;
    expiresAt: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 'attempt-1',
    provider: PaymentProvider.SEPAY,
    status: PaymentAttemptStatus.PENDING,
    amount: overrides.amount ?? 300_000n,
    currency: overrides.currency ?? 'VND',
    merchantReference: overrides.merchantReference ?? 'GBKABCDEF1234567890',
    expiresAt:
      overrides.expiresAt === undefined ? EXPIRES_AT : overrides.expiresAt,
  };
}

function setup(
  input: {
    booking?: TestBooking | null;
    locked?: boolean;
    existingAttempt?: ReturnType<typeof makeAttempt> | null;
    providerFailure?: Error;
  } = {},
) {
  const booking = input.booking === undefined ? makeBooking() : input.booking;
  const createdPayment = makePayment({
    amount: booking?.totalAmount,
    currency: booking?.currency,
  });
  const createdAttempt = makeAttempt({
    amount: createdPayment.amount,
    currency: createdPayment.currency,
    expiresAt: booking?.expiresAt,
  });
  const transaction = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce(input.locked === false ? [] : [{ id: BOOKING_ID }])
      .mockResolvedValueOnce([{ now: NOW }]),
    booking: { findUnique: vi.fn().mockResolvedValue(booking) },
    payment: { create: vi.fn().mockResolvedValue(createdPayment) },
    paymentAttempt: {
      findFirst: vi.fn().mockResolvedValue(input.existingAttempt ?? null),
      create: vi.fn().mockResolvedValue(createdAttempt),
    },
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(transaction)),
  } as unknown as PrismaService;
  const createCheckout = vi.fn().mockImplementation(async () => {
    if (input.providerFailure) throw input.providerFailure;
    return {
      paymentUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
      method: 'POST' as const,
      formFields: { signature: 'signed' },
    };
  });
  const checkoutProvider: PaymentCheckoutProvider = {
    createCheckout,
  };
  return {
    service: new PaymentsService(prisma, checkoutProvider),
    transaction,
    checkoutProvider,
    createCheckout,
    createdPayment,
    createdAttempt,
  };
}

async function expectHttpStatus(promise: Promise<unknown>, status: number) {
  await expect(promise).rejects.toMatchObject<HttpException>({
    status,
  });
}

describe('PaymentsService', () => {
  it('creates a pending Payment and SEPAY attempt from Booking snapshots', async () => {
    const { service, transaction, createCheckout } = setup();

    const response = await service.initiateSepay(CUSTOMER_ID, BOOKING_ID);

    expect(transaction.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: BOOKING_ID,
          status: PaymentStatus.PENDING,
          amount: 300_000n,
          currency: 'VND',
        }),
      }),
    );
    expect(transaction.paymentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: PaymentProvider.SEPAY,
          status: PaymentAttemptStatus.PENDING,
          amount: 300_000n,
          currency: 'VND',
          expiresAt: EXPIRES_AT,
          merchantReference: expect.stringMatching(/^GBK[A-F0-9]{16}$/),
        }),
      }),
    );
    expect(createCheckout).toHaveBeenCalledWith({
      merchantReference: 'GBKABCDEF1234567890',
      amount: 300_000n,
      currency: 'VND',
      description: 'GoBook payment GBK-20260927-ABC12345',
      customerId: CUSTOMER_ID,
    });
    expect(response).toMatchObject({
      paymentId: 'payment-1',
      attemptId: 'attempt-1',
      provider: PaymentProvider.SEPAY,
      status: PaymentAttemptStatus.PENDING,
      amount: '300000',
      currency: 'VND',
      method: 'POST',
      formFields: { signature: 'signed' },
      expiresAt: EXPIRES_AT.toISOString(),
    });
  });

  it('uses the frozen Booking total and never reads current pricing', async () => {
    const booking = {
      ...makeBooking({ totalAmount: 300_000n }),
      currentServicePrice: 999_999n,
      currentSlotPrice: 888_888n,
    } as TestBooking;
    const { service, transaction } = setup({ booking });

    await service.initiateSepay(CUSTOMER_ID, BOOKING_ID);

    expect(transaction.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 300_000n }),
      }),
    );
  });

  it('reuses an existing pending Payment and usable pending attempt', async () => {
    const payment = makePayment();
    const existingAttempt = makeAttempt({
      id: 'attempt-existing',
      merchantReference: 'GBKEXISTING1234567',
    });
    const { service, transaction, createCheckout } = setup({
      booking: makeBooking({ payment }),
      existingAttempt,
    });

    const response = await service.initiateSepay(CUSTOMER_ID, BOOKING_ID);

    expect(transaction.payment.create).not.toHaveBeenCalled();
    expect(transaction.paymentAttempt.create).not.toHaveBeenCalled();
    expect(transaction.paymentAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentId: payment.id,
          provider: PaymentProvider.SEPAY,
          status: PaymentAttemptStatus.PENDING,
          expiresAt: { gt: NOW },
        }),
      }),
    );
    expect(response.attemptId).toBe('attempt-existing');
    expect(response.merchantReference).toBe('GBKEXISTING1234567');
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantReference: 'GBKEXISTING1234567',
      }),
    );
  });

  it.each([
    PaymentAttemptStatus.FAILED,
    PaymentAttemptStatus.CANCELLED,
    PaymentAttemptStatus.EXPIRED,
  ])('creates a new attempt after a terminal %s attempt', async () => {
    const { service, transaction } = setup({
      booking: makeBooking({ payment: makePayment() }),
      existingAttempt: null,
    });

    await service.initiateSepay(CUSTOMER_ID, BOOKING_ID);

    expect(transaction.paymentAttempt.create).toHaveBeenCalledOnce();
  });

  it('returns 404 when the Booking does not exist', async () => {
    const { service } = setup({ locked: false, booking: null });
    await expectHttpStatus(service.initiateSepay(CUSTOMER_ID, BOOKING_ID), 404);
  });

  it('returns 403 for another customer Booking', async () => {
    const { service } = setup({
      booking: makeBooking({ customerId: 'another-customer' }),
    });
    await expectHttpStatus(service.initiateSepay(CUSTOMER_ID, BOOKING_ID), 403);
  });

  it.each([
    BookingStatus.CONFIRMED,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ])('rejects a %s Booking', async (status) => {
    const { service } = setup({ booking: makeBooking({ status }) });
    await expectHttpStatus(service.initiateSepay(CUSTOMER_ID, BOOKING_ID), 409);
  });

  it.each([NOW, new Date(NOW.getTime() - 1)])(
    'rejects a Booking with expiresAt %s according to database time',
    async (expiresAt) => {
      const { service } = setup({ booking: makeBooking({ expiresAt }) });
      await expectHttpStatus(
        service.initiateSepay(CUSTOMER_ID, BOOKING_ID),
        409,
      );
    },
  );

  it('rejects a free Booking', async () => {
    const { service } = setup({ booking: makeBooking({ totalAmount: 0n }) });
    await expectHttpStatus(service.initiateSepay(CUSTOMER_ID, BOOKING_ID), 409);
  });

  it('rejects a non-VND Booking', async () => {
    const { service } = setup({ booking: makeBooking({ currency: 'USD' }) });
    await expectHttpStatus(service.initiateSepay(CUSTOMER_ID, BOOKING_ID), 409);
  });

  it.each([ReservationStatus.EXPIRED, ReservationStatus.RELEASED])(
    'rejects a Booking whose Reservation is %s',
    async (reservationStatus) => {
      const { service } = setup({
        booking: makeBooking({ reservationStatus }),
      });
      await expectHttpStatus(
        service.initiateSepay(CUSTOMER_ID, BOOKING_ID),
        409,
      );
    },
  );

  it.each([
    PaymentStatus.SUCCEEDED,
    PaymentStatus.EXPIRED,
    PaymentStatus.CANCELLED,
  ])('rejects a %s Payment without creating an attempt', async (status) => {
    const { service, transaction } = setup({
      booking: makeBooking({ payment: makePayment({ status }) }),
    });

    await expectHttpStatus(service.initiateSepay(CUSTOMER_ID, BOOKING_ID), 409);
    expect(transaction.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('rejects an inconsistent Payment snapshot', async () => {
    const { service, transaction } = setup({
      booking: makeBooking({
        payment: makePayment({ amount: 1n }),
      }),
    });

    await expectHttpStatus(service.initiateSepay(CUSTOMER_ID, BOOKING_ID), 409);
    expect(transaction.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('rejects an active attempt that would outlive the Booking hold', async () => {
    const { service, transaction } = setup({
      booking: makeBooking({ payment: makePayment() }),
      existingAttempt: makeAttempt({
        expiresAt: new Date(EXPIRES_AT.getTime() + 1),
      }),
    });

    await expectHttpStatus(service.initiateSepay(CUSTOMER_ID, BOOKING_ID), 409);
    expect(transaction.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('does not report success or mutate domain state after provider failure', async () => {
    const { service, transaction } = setup({
      providerFailure: new Error('provider secret detail'),
    });

    await expect(
      service.initiateSepay(CUSTOMER_ID, BOOKING_ID),
    ).rejects.toThrow('provider secret detail');
    expect(transaction.booking).not.toHaveProperty('update');
    expect(transaction.payment).not.toHaveProperty('update');
    expect(transaction.paymentAttempt).not.toHaveProperty('update');
  });

  it('checks and locks the Booking before reading database NOW()', async () => {
    const { service, transaction } = setup();
    await service.initiateSepay(CUSTOMER_ID, BOOKING_ID);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.$queryRaw.mock.invocationCallOrder[1]!,
    );
  });
});
