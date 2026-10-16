import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  PaymentStatus,
  RefundKind,
  RefundReason,
  RefundStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import {
  PaymentRefundState,
  RefundService,
} from '../src/refunds/refund.service.js';
import type { BookingRefundResult } from '../src/bookings/cancellation/cancellation-policy.types.js';
import { assertIsolatedPaymentTestDatabase } from './payment-test-database.js';

describe('Refund domain (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let refunds: RefundService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const bookingIds: string[] = [];
  const paymentIds: string[] = [];
  let customerId: string;
  let vendorId: string;
  let sequence = 0;

  beforeAll(async () => {
    assertIsolatedPaymentTestDatabase();
    const fixture = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    prisma = fixture.get(PrismaService);
    refunds = new RefundService(prisma);

    customerId = await createUser('customer');
    const ownerId = await createUser('owner');
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId: ownerId,
        displayName: `Refund Vendor ${run}`,
        slug: `refund-vendor-${run}`,
        status: VendorStatus.APPROVED,
      },
      select: { id: true },
    });
    vendorId = vendor.id;
    vendorIds.push(vendor.id);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.refund.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `refund-${run}-${label}@example.com`,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function createPayment(input?: {
    amount?: bigint;
    currency?: string;
    status?: PaymentStatus;
    bookingStatus?: BookingStatus;
  }) {
    sequence += 1;
    const amount = input?.amount ?? 250_000n;
    const currency = input?.currency ?? 'VND';
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `RF-${run}-${sequence}`,
        customerId,
        vendorId,
        status: input?.bookingStatus ?? BookingStatus.CONFIRMED,
        currency,
        subtotalAmount: amount,
        totalAmount: amount,
        confirmedAt: new Date('2026-10-16T03:00:00.000Z'),
      },
    });
    bookingIds.push(booking.id);
    const status = input?.status ?? PaymentStatus.SUCCEEDED;
    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        status,
        amount,
        currency,
        succeededAt:
          status === PaymentStatus.SUCCEEDED
            ? new Date('2026-10-16T03:30:00.000Z')
            : null,
      },
    });
    paymentIds.push(payment.id);
    return { booking, payment };
  }

  function key(label: string): string {
    return `refund:${run}:${label}`;
  }

  function cancellationResult(
    overrides: Partial<BookingRefundResult> = {},
  ): BookingRefundResult {
    return {
      policyVersion: 1,
      originalAmount: 250_000n,
      refundAmount: 125_000n,
      cancellationFeeAmount: 125_000n,
      cancellationAllowed: true,
      reason: 'PARTIAL_REFUND',
      items: [],
      ...overrides,
    };
  }

  it('creates partial then remaining FULL obligations and derives settled state', async () => {
    const { payment } = await createPayment();
    const first = await refunds.createRefundObligation({
      paymentId: payment.id,
      amount: 100_000n,
      reason: RefundReason.BOOKING_CANCELLATION,
      idempotencyKey: key('partial-first'),
    });
    const second = await refunds.createRefundObligation({
      paymentId: payment.id,
      amount: 150_000n,
      reason: RefundReason.BOOKING_CANCELLATION,
      idempotencyKey: key('partial-completes'),
    });

    expect(first.kind).toBe(RefundKind.PARTIAL);
    expect(second.kind).toBe(RefundKind.FULL);
    expect(first.status).toBe(RefundStatus.PENDING);
    expect(second.currency).toBe('VND');

    let summary = await refunds.getRefundSummary(payment.id);
    expect(summary).toEqual({
      paymentAmount: 250_000n,
      currency: 'VND',
      pendingRefundAmount: 250_000n,
      succeededRefundAmount: 0n,
      reservedRefundAmount: 250_000n,
      remainingRefundableAmount: 0n,
      refundState: PaymentRefundState.NONE,
    });

    await refunds.markRefundSucceeded(first.id);
    summary = await refunds.getRefundSummary(payment.id);
    expect(summary.succeededRefundAmount).toBe(100_000n);
    expect(summary.refundState).toBe(PaymentRefundState.PARTIAL);

    await refunds.markRefundSucceeded(second.id);
    summary = await refunds.getRefundSummary(payment.id);
    expect(summary.succeededRefundAmount).toBe(250_000n);
    expect(summary.refundState).toBe(PaymentRefundState.FULL);
  });

  it.each([
    PaymentStatus.PENDING,
    PaymentStatus.EXPIRED,
    PaymentStatus.CANCELLED,
  ])('rejects refund creation for a %s Payment', async (status) => {
    const { payment } = await createPayment({ status });
    await expect(
      refunds.createRefundObligation({
        paymentId: payment.id,
        amount: 1n,
        reason: RefundReason.SYSTEM_CORRECTION,
        idempotencyKey: key(`payment-${status}`),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      prisma.refund.count({ where: { paymentId: payment.id } }),
    ).resolves.toBe(0);
  });

  it('rejects over-refund while PENDING reserves balance', async () => {
    const { payment } = await createPayment();
    await refunds.createRefundObligation({
      paymentId: payment.id,
      amount: 200_000n,
      reason: RefundReason.SYSTEM_CORRECTION,
      idempotencyKey: key('pending-reservation'),
    });
    await expect(
      refunds.createRefundObligation({
        paymentId: payment.id,
        amount: 100_000n,
        reason: RefundReason.SYSTEM_CORRECTION,
        idempotencyKey: key('pending-over-refund'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REFUND_AMOUNT_EXCEEDS_REMAINING',
      }),
    });
    await expect(refunds.getRefundSummary(payment.id)).resolves.toMatchObject({
      reservedRefundAmount: 200_000n,
      remainingRefundableAmount: 50_000n,
    });
  });

  it('releases cancelled reservation and keeps terminal timestamps idempotent', async () => {
    const { payment } = await createPayment();
    const pending = await refunds.createRefundObligation({
      paymentId: payment.id,
      amount: 200_000n,
      reason: RefundReason.SYSTEM_CORRECTION,
      idempotencyKey: key('cancel-release'),
    });
    const cancelled = await refunds.cancelPendingRefund(pending.id);
    const retried = await refunds.cancelPendingRefund(pending.id);
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(retried.cancelledAt).toEqual(cancelled.cancelledAt);

    const replacement = await refunds.createRefundObligation({
      paymentId: payment.id,
      amount: 250_000n,
      reason: RefundReason.SYSTEM_CORRECTION,
      idempotencyKey: key('after-cancel'),
    });
    expect(replacement.kind).toBe(RefundKind.FULL);
    await expect(refunds.markRefundSucceeded(pending.id)).rejects.toMatchObject(
      {
        response: expect.objectContaining({
          code: 'INVALID_REFUND_TRANSITION',
        }),
      },
    );
  });

  it('makes creation and success retries idempotent and detects key conflicts', async () => {
    const { payment } = await createPayment();
    const request = {
      paymentId: payment.id,
      amount: 100_000n,
      reason: RefundReason.BOOKING_CANCELLATION,
      idempotencyKey: key('idempotent'),
    } as const;
    const first = await refunds.createRefundObligation(request);
    const retry = await refunds.createRefundObligation(request);
    expect(retry.id).toBe(first.id);
    await expect(
      prisma.refund.count({
        where: { idempotencyKey: request.idempotencyKey },
      }),
    ).resolves.toBe(1);

    await expect(
      refunds.createRefundObligation({ ...request, amount: 150_000n }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_CONFLICT' }),
    });

    const succeeded = await refunds.markRefundSucceeded(first.id);
    const succeededRetry = await refunds.markRefundSucceeded(first.id);
    expect(succeededRetry.succeededAt).toEqual(succeeded.succeededAt);
    await expect(refunds.cancelPendingRefund(first.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_REFUND_TRANSITION' }),
    });
  });

  it('prevents concurrent cumulative over-refund with a Payment row lock', async () => {
    const { payment } = await createPayment();
    const results = await Promise.allSettled([
      refunds.createRefundObligation({
        paymentId: payment.id,
        amount: 200_000n,
        reason: RefundReason.SYSTEM_CORRECTION,
        idempotencyKey: key('race-over-a'),
      }),
      refunds.createRefundObligation({
        paymentId: payment.id,
        amount: 100_000n,
        reason: RefundReason.SYSTEM_CORRECTION,
        idempotencyKey: key('race-over-b'),
      }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    const summary = await refunds.getRefundSummary(payment.id);
    expect(summary.reservedRefundAmount).toBeLessThanOrEqual(payment.amount);
    expect(summary.remainingRefundableAmount).toBeGreaterThanOrEqual(0n);
  });

  it('converges concurrent requests with the same idempotency key', async () => {
    const { payment } = await createPayment();
    const request = {
      paymentId: payment.id,
      amount: 125_000n,
      reason: RefundReason.BOOKING_CANCELLATION,
      idempotencyKey: key('race-same-key'),
    } as const;
    const [first, second] = await Promise.all([
      refunds.createRefundObligation(request),
      refunds.createRefundObligation(request),
    ]);
    expect(second.id).toBe(first.id);
    await expect(
      prisma.refund.count({
        where: { idempotencyKey: request.idempotencyKey },
      }),
    ).resolves.toBe(1);
  });

  it('allows valid concurrent partials and derives FULL at lock order time', async () => {
    const { payment } = await createPayment();
    const created = await Promise.all([
      refunds.createRefundObligation({
        paymentId: payment.id,
        amount: 100_000n,
        reason: RefundReason.SYSTEM_CORRECTION,
        idempotencyKey: key('race-valid-a'),
      }),
      refunds.createRefundObligation({
        paymentId: payment.id,
        amount: 150_000n,
        reason: RefundReason.SYSTEM_CORRECTION,
        idempotencyKey: key('race-valid-b'),
      }),
    ]);
    expect(created.map(({ kind }) => kind).sort()).toEqual(
      [RefundKind.FULL, RefundKind.PARTIAL].sort(),
    );
    const summary = await refunds.getRefundSummary(payment.id);
    expect(summary.reservedRefundAmount).toBe(250_000n);
    expect(summary.remainingRefundableAmount).toBe(0n);
  });

  it('enforces positive amount and unique idempotency at database level', async () => {
    const { payment } = await createPayment();
    const duplicateKey = key('db-unique');
    const direct = {
      paymentId: payment.id,
      idempotencyKey: duplicateKey,
      status: RefundStatus.PENDING,
      kind: RefundKind.PARTIAL,
      reason: RefundReason.SYSTEM_CORRECTION,
      amount: 1n,
      currency: payment.currency,
    } as const;
    await prisma.refund.create({ data: direct });
    await expect(prisma.refund.create({ data: direct })).rejects.toBeTruthy();
    await expect(
      prisma.refund.create({
        data: { ...direct, idempotencyKey: key('db-zero'), amount: 0n },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.refund.create({
        data: { ...direct, idempotencyKey: key('db-negative'), amount: -1n },
      }),
    ).rejects.toBeTruthy();
  });

  it('uses the Payment currency and leaves Payment and Booking snapshots unchanged', async () => {
    const { booking, payment } = await createPayment({ currency: 'USD' });
    const before = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const refund = await refunds.createRefundObligation({
      paymentId: payment.id,
      amount: 50_000n,
      reason: RefundReason.SYSTEM_CORRECTION,
      idempotencyKey: key('currency-snapshot'),
    });
    await refunds.markRefundSucceeded(refund.id);
    const after = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const bookingAfter = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(refund.currency).toBe('USD');
    expect(after).toMatchObject({
      amount: before.amount,
      currency: before.currency,
      status: PaymentStatus.SUCCEEDED,
      succeededAt: before.succeededAt,
    });
    expect(bookingAfter.status).toBe(BookingStatus.CONFIRMED);
  });

  it('demonstrates cancellation entitlement to partial obligation to success', async () => {
    const { payment } = await createPayment();
    const result = await refunds.createRefundFromCancellation({
      paymentId: payment.id,
      cancellationResult: cancellationResult(),
      idempotencyKey: key('flow-partial'),
    });
    expect(result.outcome).toBe('REFUND_CREATED');
    if (result.outcome !== 'REFUND_CREATED') throw new Error('Refund missing');
    expect(result.refund).toMatchObject({
      amount: 125_000n,
      currency: 'VND',
      kind: RefundKind.PARTIAL,
      status: RefundStatus.PENDING,
      reason: RefundReason.BOOKING_CANCELLATION,
    });
    await expect(refunds.getRefundSummary(payment.id)).resolves.toMatchObject({
      reservedRefundAmount: 125_000n,
      succeededRefundAmount: 0n,
      remainingRefundableAmount: 125_000n,
      refundState: PaymentRefundState.NONE,
    });
    await refunds.markRefundSucceeded(result.refund.id);
    await expect(refunds.getRefundSummary(payment.id)).resolves.toMatchObject({
      succeededRefundAmount: 125_000n,
      refundState: PaymentRefundState.PARTIAL,
    });
  });

  it('demonstrates full and zero-refund cancellation outcomes', async () => {
    const fullPayment = await createPayment();
    const full = await refunds.createRefundFromCancellation({
      paymentId: fullPayment.payment.id,
      cancellationResult: cancellationResult({
        refundAmount: 250_000n,
        cancellationFeeAmount: 0n,
        reason: 'FULL_REFUND',
      }),
      idempotencyKey: key('flow-full'),
    });
    expect(full.outcome).toBe('REFUND_CREATED');
    if (full.outcome === 'REFUND_CREATED') {
      expect(full.refund.kind).toBe(RefundKind.FULL);
      await refunds.markRefundSucceeded(full.refund.id);
    }
    await expect(
      refunds.getRefundSummary(fullPayment.payment.id),
    ).resolves.toMatchObject({ refundState: PaymentRefundState.FULL });

    const zeroPayment = await createPayment();
    await expect(
      refunds.createRefundFromCancellation({
        paymentId: zeroPayment.payment.id,
        cancellationResult: cancellationResult({
          refundAmount: 0n,
          cancellationFeeAmount: 250_000n,
          reason: 'NO_REFUND',
        }),
        idempotencyKey: key('flow-zero'),
      }),
    ).resolves.toEqual({ outcome: 'NO_REFUND_REQUIRED' });
    await expect(
      prisma.refund.count({ where: { paymentId: zeroPayment.payment.id } }),
    ).resolves.toBe(0);
  });

  it.each([
    cancellationResult({
      cancellationAllowed: false,
      refundAmount: 0n,
      cancellationFeeAmount: 250_000n,
      reason: 'CANCELLATION_NOT_ALLOWED',
    }),
    cancellationResult({
      cancellationAllowed: false,
      reason: 'PARTIAL_CANCELLATION_REQUIRED',
    }),
  ])(
    'creates no obligation for a rejected cancellation result',
    async (result) => {
      const { payment } = await createPayment();
      await expect(
        refunds.createRefundFromCancellation({
          paymentId: payment.id,
          cancellationResult: result,
          idempotencyKey: key(`rejected-${result.reason}`),
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        prisma.refund.count({ where: { paymentId: payment.id } }),
      ).resolves.toBe(0);
    },
  );
});
