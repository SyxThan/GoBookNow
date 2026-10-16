import type { HttpException } from '@nestjs/common';
import {
  PaymentStatus,
  RefundKind,
  RefundReason,
  RefundStatus,
} from '../generated/prisma/client.js';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import type { BookingRefundResult } from '../bookings/cancellation/cancellation-policy.types.js';
import {
  PaymentRefundState,
  RefundService,
  type RefundRecord,
} from './refund.service.js';

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const REFUND_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-16T04:00:00.000Z');

function makeRefund(overrides: Partial<RefundRecord> = {}): RefundRecord {
  return {
    id: REFUND_ID,
    paymentId: PAYMENT_ID,
    idempotencyKey: 'refund-key',
    status: RefundStatus.PENDING,
    kind: RefundKind.PARTIAL,
    reason: RefundReason.BOOKING_CANCELLATION,
    reasonNote: null,
    amount: 100_000n,
    currency: 'VND',
    requestedAt: NOW,
    succeededAt: null,
    cancelledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function setupCreate(input?: {
  paymentStatus?: PaymentStatus;
  paymentAmount?: bigint;
  reservedAmount?: bigint;
  existing?: RefundRecord | null;
}) {
  const paymentAmount = input?.paymentAmount ?? 250_000n;
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: PAYMENT_ID }]),
    payment: {
      findUnique: vi.fn().mockResolvedValue({
        id: PAYMENT_ID,
        status: input?.paymentStatus ?? PaymentStatus.SUCCEEDED,
        amount: paymentAmount,
        currency: 'VND',
      }),
    },
    refund: {
      findUnique: vi.fn().mockResolvedValue(input?.existing ?? null),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { amount: input?.reservedAmount ?? 0n },
      }),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve(
          makeRefund({
            ...data,
            id: REFUND_ID,
            requestedAt: NOW,
            succeededAt: null,
            cancelledAt: null,
            createdAt: NOW,
            updatedAt: NOW,
          }),
        ),
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(transaction)),
    refund: { findUnique: vi.fn() },
  } as unknown as PrismaService;
  return { service: new RefundService(prisma), transaction, prisma };
}

function setupTransition(refund: RefundRecord) {
  const succeeded = makeRefund({
    ...refund,
    status: RefundStatus.SUCCEEDED,
    succeededAt: NOW,
  });
  const cancelled = makeRefund({
    ...refund,
    status: RefundStatus.CANCELLED,
    cancelledAt: NOW,
  });
  const transaction = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ id: PAYMENT_ID }])
      .mockResolvedValueOnce([{ id: REFUND_ID }])
      .mockResolvedValueOnce([{ now: NOW }]),
    payment: {},
    refund: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({ paymentId: PAYMENT_ID })
        .mockResolvedValueOnce(refund),
      update: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve(
            data.status === RefundStatus.SUCCEEDED ? succeeded : cancelled,
          ),
        ),
    },
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(transaction)),
  } as unknown as PrismaService;
  return { service: new RefundService(prisma), transaction };
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

async function expectErrorCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject<HttpException>({
    response: expect.objectContaining({ code }),
  });
}

describe('RefundService', () => {
  it.each([
    [100_000n, 0n, RefundKind.PARTIAL],
    [250_000n, 0n, RefundKind.FULL],
    [150_000n, 100_000n, RefundKind.FULL],
  ])(
    'derives kind for amount %s with %s already reserved',
    async (amount, reservedAmount, expectedKind) => {
      const { service, transaction } = setupCreate({ reservedAmount });

      const refund = await service.createRefundObligation({
        paymentId: PAYMENT_ID,
        amount,
        reason: RefundReason.BOOKING_CANCELLATION,
        idempotencyKey: 'refund-key',
      });

      expect(refund).toMatchObject({
        amount,
        currency: 'VND',
        status: RefundStatus.PENDING,
        kind: expectedKind,
      });
      expect(transaction.refund.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currency: 'VND',
            status: RefundStatus.PENDING,
            kind: expectedKind,
          }),
        }),
      );
    },
  );

  it.each([
    PaymentStatus.PENDING,
    PaymentStatus.EXPIRED,
    PaymentStatus.CANCELLED,
  ])('rejects a %s Payment', async (paymentStatus) => {
    const { service, transaction } = setupCreate({ paymentStatus });
    await expectErrorCode(
      service.createRefundObligation({
        paymentId: PAYMENT_ID,
        amount: 100_000n,
        reason: RefundReason.BOOKING_CANCELLATION,
        idempotencyKey: 'refund-key',
      }),
      'PAYMENT_NOT_REFUNDABLE',
    );
    expect(transaction.refund.create).not.toHaveBeenCalled();
  });

  it.each([0n, -1n])('rejects non-positive amount %s', async (amount) => {
    const { service, transaction } = setupCreate();
    await expectErrorCode(
      service.createRefundObligation({
        paymentId: PAYMENT_ID,
        amount,
        reason: RefundReason.BOOKING_CANCELLATION,
        idempotencyKey: 'refund-key',
      }),
      'INVALID_REFUND_AMOUNT',
    );
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it('counts pending and succeeded obligations against the remaining balance', async () => {
    const { service, transaction } = setupCreate({ reservedAmount: 200_000n });
    await expectErrorCode(
      service.createRefundObligation({
        paymentId: PAYMENT_ID,
        amount: 100_000n,
        reason: RefundReason.BOOKING_CANCELLATION,
        idempotencyKey: 'refund-key',
      }),
      'REFUND_AMOUNT_EXCEEDS_REMAINING',
    );
    expect(transaction.refund.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [RefundStatus.PENDING, RefundStatus.SUCCEEDED] },
        }),
      }),
    );
    expect(transaction.refund.create).not.toHaveBeenCalled();
  });

  it('returns the same Refund for an equivalent idempotent retry', async () => {
    const existing = makeRefund();
    const { service, transaction } = setupCreate({ existing });
    const refund = await service.createRefundObligation({
      paymentId: PAYMENT_ID,
      amount: 100_000n,
      reason: RefundReason.BOOKING_CANCELLATION,
      idempotencyKey: 'refund-key',
    });
    expect(refund).toBe(existing);
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.refund.create).not.toHaveBeenCalled();
  });

  it.each([
    { paymentId: '33333333-3333-4333-8333-333333333333' },
    { amount: 150_000n },
    { reason: RefundReason.SYSTEM_CORRECTION },
  ])('rejects an idempotency conflict for %o', async (change) => {
    const { service } = setupCreate({ existing: makeRefund() });
    await expectErrorCode(
      service.createRefundObligation({
        paymentId: PAYMENT_ID,
        amount: 100_000n,
        reason: RefundReason.BOOKING_CANCELLATION,
        idempotencyKey: 'refund-key',
        ...change,
      }),
      'IDEMPOTENCY_KEY_CONFLICT',
    );
  });

  it('marks PENDING as SUCCEEDED using database time', async () => {
    const { service, transaction } = setupTransition(makeRefund());
    const refund = await service.markRefundSucceeded(REFUND_ID);
    expect(refund.status).toBe(RefundStatus.SUCCEEDED);
    expect(refund.succeededAt).toEqual(NOW);
    expect(transaction.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: RefundStatus.SUCCEEDED, succeededAt: NOW },
      }),
    );
  });

  it('does not rewrite succeededAt when success is retried', async () => {
    const succeededAt = new Date('2026-10-15T00:00:00.000Z');
    const existing = makeRefund({
      status: RefundStatus.SUCCEEDED,
      succeededAt,
    });
    const { service, transaction } = setupTransition(existing);
    const refund = await service.markRefundSucceeded(REFUND_ID);
    expect(refund.succeededAt).toBe(succeededAt);
    expect(transaction.refund.update).not.toHaveBeenCalled();
  });

  it('cancels PENDING and keeps cancellation idempotent', async () => {
    const pendingSetup = setupTransition(makeRefund());
    const cancelled = await pendingSetup.service.cancelPendingRefund(REFUND_ID);
    expect(cancelled.status).toBe(RefundStatus.CANCELLED);
    expect(cancelled.cancelledAt).toEqual(NOW);

    const existingCancelled = makeRefund({
      status: RefundStatus.CANCELLED,
      cancelledAt: NOW,
    });
    const retrySetup = setupTransition(existingCancelled);
    const retried = await retrySetup.service.cancelPendingRefund(REFUND_ID);
    expect(retried.cancelledAt).toBe(NOW);
    expect(retrySetup.transaction.refund.update).not.toHaveBeenCalled();
  });

  it('keeps SUCCEEDED and CANCELLED terminal', async () => {
    const succeeded = setupTransition(
      makeRefund({ status: RefundStatus.SUCCEEDED, succeededAt: NOW }),
    );
    await expectErrorCode(
      succeeded.service.cancelPendingRefund(REFUND_ID),
      'INVALID_REFUND_TRANSITION',
    );

    const cancelled = setupTransition(
      makeRefund({ status: RefundStatus.CANCELLED, cancelledAt: NOW }),
    );
    await expectErrorCode(
      cancelled.service.markRefundSucceeded(REFUND_ID),
      'INVALID_REFUND_TRANSITION',
    );
  });

  it.each([
    [0n, 50_000n, PaymentRefundState.NONE],
    [100_000n, 50_000n, PaymentRefundState.PARTIAL],
    [250_000n, 0n, PaymentRefundState.FULL],
  ])(
    'derives summary from %s succeeded and %s pending',
    async (succeeded, pending, refundState) => {
      const transaction = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: PAYMENT_ID }]),
        payment: {
          findUnique: vi.fn().mockResolvedValue({
            amount: 250_000n,
            currency: 'VND',
          }),
        },
        refund: {
          groupBy: vi.fn().mockResolvedValue([
            { status: RefundStatus.SUCCEEDED, _sum: { amount: succeeded } },
            { status: RefundStatus.PENDING, _sum: { amount: pending } },
          ]),
        },
      };
      const prisma = {
        $transaction: vi.fn((callback) => callback(transaction)),
      } as unknown as PrismaService;
      const summary = await new RefundService(prisma).getRefundSummary(
        PAYMENT_ID,
      );
      expect(summary).toEqual({
        paymentAmount: 250_000n,
        currency: 'VND',
        pendingRefundAmount: pending,
        succeededRefundAmount: succeeded,
        reservedRefundAmount: succeeded + pending,
        remainingRefundableAmount: 250_000n - succeeded - pending,
        refundState,
      });
    },
  );

  it('adapts an allowed cancellation entitlement into a Refund obligation', async () => {
    const { service } = setupCreate();
    const create = vi
      .spyOn(service, 'createRefundObligation')
      .mockResolvedValue(makeRefund({ amount: 125_000n }));
    const result = await service.createRefundFromCancellation({
      paymentId: PAYMENT_ID,
      cancellationResult: cancellationResult(),
      idempotencyKey: 'cancel:booking:operation',
    });
    expect(result.outcome).toBe('REFUND_CREATED');
    expect(create).toHaveBeenCalledWith(
      {
        paymentId: PAYMENT_ID,
        amount: 125_000n,
        reason: RefundReason.BOOKING_CANCELLATION,
        reasonNote: 'Cancellation policy result PARTIAL_REFUND',
        idempotencyKey: 'cancel:booking:operation',
      },
      undefined,
    );
  });

  it('creates no Refund for a zero entitlement', async () => {
    const { service } = setupCreate();
    const create = vi.spyOn(service, 'createRefundObligation');
    await expect(
      service.createRefundFromCancellation({
        paymentId: PAYMENT_ID,
        cancellationResult: cancellationResult({
          refundAmount: 0n,
          cancellationFeeAmount: 250_000n,
          reason: 'NO_REFUND',
        }),
        idempotencyKey: 'cancel:no-refund',
      }),
    ).resolves.toEqual({ outcome: 'NO_REFUND_REQUIRED' });
    expect(create).not.toHaveBeenCalled();
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
      refundAmount: 125_000n,
      reason: 'PARTIAL_CANCELLATION_REQUIRED',
    }),
  ])('rejects a non-actionable cancellation result', async (result) => {
    const { service } = setupCreate();
    await expect(
      service.createRefundFromCancellation({
        paymentId: PAYMENT_ID,
        cancellationResult: result,
        idempotencyKey: 'cancel:rejected',
      }),
    ).rejects.toBeTruthy();
  });
});
