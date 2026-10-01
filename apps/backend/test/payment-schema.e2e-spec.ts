import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  CategoryScope,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
  PricingSource,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import type { PaymentCheckoutProvider } from '../src/payments/providers/payment-checkout-provider.js';
import { assertIsolatedPaymentTestDatabase } from './payment-test-database.js';

describe('Payment schema foundation (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: PaymentsService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const categoryIds: string[] = [];
  const serviceIds: string[] = [];
  const slotIds: string[] = [];
  const bookingIds: string[] = [];
  const paymentIds: string[] = [];
  let customerId: string;
  let vendorId: string;
  let categoryId: string;
  let serviceId: string;
  let slotId: string;

  beforeAll(async () => {
    assertIsolatedPaymentTestDatabase();
    const fixture = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    prisma = fixture.get(PrismaService);
    const checkoutProvider: PaymentCheckoutProvider = {
      createCheckout: async (input) => ({
        paymentUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
        method: 'POST',
        formFields: {
          order_invoice_number: input.merchantReference,
          order_amount: input.amount.toString(),
          currency: input.currency,
          signature: 'test-signature',
        },
      }),
    };
    payments = new PaymentsService(prisma, checkoutProvider);

    customerId = await createUser('customer');
    const ownerUserId = await createUser('vendor-owner');
    vendorId = await createVendor(ownerUserId);
    categoryId = await createCategory();
    serviceId = await createService();
    slotId = await createSlot();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.paymentAttempt.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
      await prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `payment-${run}-${label}@example.com`,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function createVendor(ownerUserId: string): Promise<string> {
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId,
        displayName: `Payment Vendor ${run}`,
        slug: `payment-vendor-${run}`,
        status: VendorStatus.APPROVED,
      },
      select: { id: true },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: {
        code: `PAY_${run.toUpperCase()}`,
        name: `Payment Category ${run}`,
        slug: `payment-category-${run}`,
        scope: CategoryScope.EVENT,
      },
      select: { id: true },
    });
    categoryIds.push(category.id);
    return category.id;
  }

  async function createService(): Promise<string> {
    const service = await prisma.service.create({
      data: {
        vendorId,
        categoryId,
        kind: ServiceKind.EVENT,
        title: `Payment Workshop ${run}`,
        slug: `payment-workshop-${run}`,
        priceAmount: 150_000n,
        status: ServiceStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    serviceIds.push(service.id);
    return service.id;
  }

  async function createSlot(): Promise<string> {
    const slot = await prisma.slot.create({
      data: {
        serviceId,
        startAt: new Date(Date.UTC(2099, 0, 1, 2)),
        endAt: new Date(Date.UTC(2099, 0, 1, 4)),
        capacity: 10,
        status: SlotStatus.OPEN,
      },
      select: { id: true },
    });
    slotIds.push(slot.id);
    return slot.id;
  }

  async function createBooking(
    suffix: string,
    totalAmount = 300_000n,
    withItem = false,
    withReservation = false,
  ) {
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `PAY-${run}-${suffix}`,
        customerId,
        vendorId,
        subtotalAmount: totalAmount,
        totalAmount,
        expiresAt: new Date(Date.UTC(2099, 0, 1, 1)),
        items: withItem
          ? {
              create: {
                serviceId,
                slotId,
                quantity: 2,
                unitPriceAmount: 150_000n,
                subtotalAmount: 300_000n,
                currency: 'VND',
                pricingSource: PricingSource.SERVICE,
                serviceTitleSnapshot: `Payment Workshop ${run}`,
                slotStartAtSnapshot: new Date(Date.UTC(2099, 0, 1, 2)),
                slotEndAtSnapshot: new Date(Date.UTC(2099, 0, 1, 4)),
                reservation: withReservation
                  ? {
                      create: {
                        slotId,
                        quantity: 2,
                        expiresAt: new Date(Date.UTC(2099, 0, 1, 1)),
                      },
                    }
                  : undefined,
              },
            }
          : undefined,
      },
    });
    bookingIds.push(booking.id);
    return booking;
  }

  it('converges concurrent initiation requests to one Payment and active attempt', async () => {
    const booking = await createBooking(
      'CONCURRENT-INIT',
      300_000n,
      true,
      true,
    );

    const [first, second] = await Promise.all([
      payments.initiateSepay(customerId, booking.id),
      payments.initiateSepay(customerId, booking.id),
    ]);
    paymentIds.push(first.paymentId);

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.attemptId).toBe(first.attemptId);
    expect(second.merchantReference).toBe(first.merchantReference);
    await expect(
      prisma.payment.count({ where: { bookingId: booking.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.paymentAttempt.count({
        where: {
          paymentId: first.paymentId,
          provider: PaymentProvider.SEPAY,
          status: PaymentAttemptStatus.PENDING,
        },
      }),
    ).resolves.toBe(1);
  });

  it('reuses the same active pending attempt on repeated initiation', async () => {
    const booking = await createBooking('SERIAL-INIT', 300_000n, true, true);
    const first = await payments.initiateSepay(customerId, booking.id);
    paymentIds.push(first.paymentId);
    const second = await payments.initiateSepay(customerId, booking.id);

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.attemptId).toBe(first.attemptId);
    expect(second.merchantReference).toBe(first.merchantReference);
    await expect(
      prisma.payment.count({ where: { bookingId: booking.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.paymentAttempt.count({ where: { paymentId: first.paymentId } }),
    ).resolves.toBe(1);
  });

  it.each([PaymentAttemptStatus.FAILED, PaymentAttemptStatus.EXPIRED])(
    'preserves a %s attempt and creates one pending retry',
    async (previousStatus) => {
      const booking = await createBooking(
        `RETRY-${previousStatus}`,
        300_000n,
        true,
        true,
      );
      const first = await payments.initiateSepay(customerId, booking.id);
      paymentIds.push(first.paymentId);
      await prisma.paymentAttempt.update({
        where: { id: first.attemptId },
        data: {
          status: previousStatus,
          failedAt:
            previousStatus === PaymentAttemptStatus.FAILED ? new Date() : null,
        },
      });

      const retry = await payments.initiateSepay(customerId, booking.id);
      expect(retry.paymentId).toBe(first.paymentId);
      expect(retry.attemptId).not.toBe(first.attemptId);
      expect(retry.merchantReference).not.toBe(first.merchantReference);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: first.paymentId },
        include: { attempts: true },
      });
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.attempts).toHaveLength(2);
      expect(
        payment.attempts.find(({ id }) => id === first.attemptId)?.status,
      ).toBe(previousStatus);
      expect(
        payment.attempts.find(({ id }) => id === retry.attemptId)?.status,
      ).toBe(PaymentAttemptStatus.PENDING);
    },
  );

  it('creates a fresh attempt when a pending attempt has elapsed', async () => {
    const booking = await createBooking(
      'ELAPSED-ATTEMPT',
      300_000n,
      true,
      true,
    );
    const first = await payments.initiateSepay(customerId, booking.id);
    paymentIds.push(first.paymentId);
    await prisma.paymentAttempt.update({
      where: { id: first.attemptId },
      data: { expiresAt: new Date('1900-01-01T00:00:00.000Z') },
    });

    const retry = await payments.initiateSepay(customerId, booking.id);
    expect(retry.attemptId).not.toBe(first.attemptId);
    await expect(
      prisma.paymentAttempt.count({ where: { paymentId: first.paymentId } }),
    ).resolves.toBe(2);
    await expect(
      prisma.paymentAttempt.count({
        where: {
          paymentId: first.paymentId,
          status: PaymentAttemptStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
      }),
    ).resolves.toBe(1);
  });

  it('rejects an elapsed Booking before creating a Payment or checkout', async () => {
    const booking = await createBooking(
      'ELAPSED-BOOKING',
      300_000n,
      true,
      true,
    );
    await prisma.booking.update({
      where: { id: booking.id },
      data: { expiresAt: new Date('1900-01-01T00:00:00.000Z') },
    });

    await expect(
      payments.initiateSepay(customerId, booking.id),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      prisma.payment.count({ where: { bookingId: booking.id } }),
    ).resolves.toBe(0);
  });

  it.each([BookingStatus.CONFIRMED, BookingStatus.CANCELLED])(
    'rejects initiation for a %s Booking without creating a Payment',
    async (status) => {
      const booking = await createBooking(
        `DONE-${status}`,
        300_000n,
        true,
        true,
      );
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status },
      });

      await expect(
        payments.initiateSepay(customerId, booking.id),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        prisma.payment.count({ where: { bookingId: booking.id } }),
      ).resolves.toBe(0);
    },
  );

  it('does not create a SePay purchase for a free Booking', async () => {
    const booking = await createBooking('FREE-INIT', 0n, true, true);
    await expect(
      payments.initiateSepay(customerId, booking.id),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      prisma.payment.count({ where: { bookingId: booking.id } }),
    ).resolves.toBe(0);
  });

  async function createPayment(
    bookingId: string,
    amount: bigint,
    status: PaymentStatus = PaymentStatus.PENDING,
  ) {
    const payment = await prisma.payment.create({
      data: { bookingId, amount, currency: 'VND', status },
    });
    paymentIds.push(payment.id);
    return payment;
  }

  async function createAttempt(input: {
    paymentId: string;
    suffix: string;
    amount?: bigint;
    status?: PaymentAttemptStatus;
    providerTransactionId?: string | null;
  }) {
    return prisma.paymentAttempt.create({
      data: {
        paymentId: input.paymentId,
        provider: PaymentProvider.SEPAY,
        status: input.status ?? PaymentAttemptStatus.PENDING,
        amount: input.amount ?? 300_000n,
        currency: 'VND',
        merchantReference: `GBK${run}${input.suffix}`.toUpperCase(),
        providerTransactionId: input.providerTransactionId,
        failedAt:
          input.status === PaymentAttemptStatus.FAILED ? new Date() : null,
      },
    });
  }

  it('supports an optional Payment and multiple correctly related Attempts', async () => {
    const bookingWithoutPayment = await createBooking('NO-PAYMENT');
    const beforePayment = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingWithoutPayment.id },
      include: { payment: true },
    });
    expect(beforePayment.payment).toBeNull();

    const payment = await createPayment(bookingWithoutPayment.id, 300_000n);
    const first = await createAttempt({
      paymentId: payment.id,
      suffix: 'REL1',
      status: PaymentAttemptStatus.FAILED,
    });
    const second = await createAttempt({
      paymentId: payment.id,
      suffix: 'REL2',
    });

    const reloaded = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingWithoutPayment.id },
      include: { payment: { include: { attempts: true } } },
    });
    expect(reloaded.payment?.id).toBe(payment.id);
    expect(reloaded.payment?.attempts).toHaveLength(2);
    expect(reloaded.payment?.attempts.map(({ id }) => id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    expect(
      reloaded.payment?.attempts.every((item) => item.paymentId === payment.id),
    ).toBe(true);
  });

  it('enforces one Payment per Booking and preserves it across Booking state changes', async () => {
    const booking = await createBooking('ONE-PAYMENT');
    const payment = await createPayment(booking.id, booking.totalAmount);

    await expect(
      createPayment(booking.id, booking.totalAmount),
    ).rejects.toBeTruthy();

    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
    });
    const reloaded = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { booking: true },
    });
    expect(reloaded.booking.status).toBe(BookingStatus.CANCELLED);
    expect(reloaded.id).toBe(payment.id);
  });

  it('stores non-negative Payment and Attempt amounts as bigint', async () => {
    const positiveBooking = await createBooking('POSITIVE', 300_000n);
    const positive = await createPayment(
      positiveBooking.id,
      positiveBooking.totalAmount,
    );
    expect(positive.amount).toBe(300_000n);
    expect(typeof positive.amount).toBe('bigint');

    const zeroBooking = await createBooking('ZERO', 0n);
    const zero = await createPayment(zeroBooking.id, 0n);
    expect(zero.amount).toBe(0n);
    const zeroAttempt = await createAttempt({
      paymentId: zero.id,
      suffix: 'ZERO',
      amount: 0n,
    });
    expect(zeroAttempt.amount).toBe(0n);
    expect(typeof zeroAttempt.amount).toBe('bigint');

    const negativeBooking = await createBooking('NEGATIVE', 0n);
    await expect(createPayment(negativeBooking.id, -1n)).rejects.toBeTruthy();
    await expect(
      createAttempt({
        paymentId: positive.id,
        suffix: 'NEGATIVE',
        amount: -1n,
      }),
    ).rejects.toBeTruthy();
  });

  it('uses PostgreSQL BIGINT for both monetary columns', async () => {
    const columns = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string; data_type: string }>
    >`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('payments', 'payment_attempts')
        AND column_name = 'amount'
      ORDER BY table_name
    `;
    expect(columns).toEqual([
      {
        table_name: 'payment_attempts',
        column_name: 'amount',
        data_type: 'bigint',
      },
      {
        table_name: 'payments',
        column_name: 'amount',
        data_type: 'bigint',
      },
    ]);
  });

  it('keeps Payment amount frozen after Service and Slot prices change', async () => {
    const booking = await createBooking('SNAPSHOT', 300_000n, true);
    const payment = await createPayment(booking.id, booking.totalAmount);

    await prisma.service.update({
      where: { id: serviceId },
      data: { priceAmount: 450_000n },
    });
    await prisma.slot.update({
      where: { id: slotId },
      data: { priceAmount: 500_000n },
    });

    const reloaded = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(reloaded.amount).toBe(300_000n);
  });

  it('enforces globally unique merchant references', async () => {
    const firstBooking = await createBooking('MERCHANT-A');
    const secondBooking = await createBooking('MERCHANT-B');
    const firstPayment = await createPayment(firstBooking.id, 300_000n);
    const secondPayment = await createPayment(secondBooking.id, 300_000n);

    await createAttempt({ paymentId: firstPayment.id, suffix: 'DUPREF' });
    await expect(
      createAttempt({ paymentId: secondPayment.id, suffix: 'DUPREF' }),
    ).rejects.toBeTruthy();
  });

  it('allows multiple null provider transaction IDs and rejects duplicate SePay IDs', async () => {
    const booking = await createBooking('PROVIDER-ID');
    const payment = await createPayment(booking.id, 300_000n);

    await expect(
      createAttempt({ paymentId: payment.id, suffix: 'NULL1' }),
    ).resolves.toBeTruthy();
    await expect(
      createAttempt({ paymentId: payment.id, suffix: 'NULL2' }),
    ).resolves.toBeTruthy();
    await createAttempt({
      paymentId: payment.id,
      suffix: 'TXN1',
      providerTransactionId: `sepay-${run}`,
    });
    await expect(
      createAttempt({
        paymentId: payment.id,
        suffix: 'TXN2',
        providerTransactionId: `sepay-${run}`,
      }),
    ).rejects.toBeTruthy();
  });

  it('retains a failed Attempt when a new retry Attempt is created', async () => {
    const booking = await createBooking('RETRY');
    const payment = await createPayment(booking.id, 300_000n);
    const failed = await createAttempt({
      paymentId: payment.id,
      suffix: 'FAILED',
      status: PaymentAttemptStatus.FAILED,
    });
    const retry = await createAttempt({
      paymentId: payment.id,
      suffix: 'RETRY',
    });

    const reloaded = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { attempts: { orderBy: { createdAt: 'asc' } } },
    });
    expect(reloaded.status).toBe(PaymentStatus.PENDING);
    expect(reloaded.attempts).toHaveLength(2);
    expect(reloaded.attempts.find(({ id }) => id === failed.id)?.status).toBe(
      PaymentAttemptStatus.FAILED,
    );
    expect(reloaded.attempts.find(({ id }) => id === retry.id)?.status).toBe(
      PaymentAttemptStatus.PENDING,
    );
  });

  it('stores exactly the supported Payment status enum values', async () => {
    const providerLabels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'PaymentProvider'
      ORDER BY e.enumsortorder
    `;
    expect(providerLabels.map(({ enumlabel }) => enumlabel)).toEqual([
      PaymentProvider.SEPAY,
    ]);

    const paymentLabels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'PaymentStatus'
      ORDER BY e.enumsortorder
    `;
    expect(paymentLabels.map(({ enumlabel }) => enumlabel)).toEqual([
      PaymentStatus.PENDING,
      PaymentStatus.SUCCEEDED,
      PaymentStatus.EXPIRED,
      PaymentStatus.CANCELLED,
    ]);

    const attemptLabels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'PaymentAttemptStatus'
      ORDER BY e.enumsortorder
    `;
    expect(attemptLabels.map(({ enumlabel }) => enumlabel)).toEqual([
      PaymentAttemptStatus.PENDING,
      PaymentAttemptStatus.SUCCEEDED,
      PaymentAttemptStatus.FAILED,
      PaymentAttemptStatus.CANCELLED,
      PaymentAttemptStatus.EXPIRED,
    ]);
  });
});
