import {
  calculateBookingRefund,
  calculateItemRefund,
} from './cancellation-policy.engine.js';
import { normalizeCancellationPolicy } from './cancellation-policy.js';
import { CancellationPolicyError } from './cancellation-policy.types.js';

const REQUESTED_AT = new Date('2026-10-13T00:00:00.000Z');
const POLICY = normalizeCancellationPolicy({
  version: 1,
  policyCode: 'STANDARD_V1',
  tiers: [
    { minMinutesBeforeStart: 0, refundBps: 0 },
    { minMinutesBeforeStart: 1_440, refundBps: 10_000 },
    { minMinutesBeforeStart: 360, refundBps: 5_000 },
  ],
  afterStart: { cancellationAllowed: false, refundBps: 0 },
});

function minutesAfterRequestedAt(minutes: number): Date {
  return new Date(REQUESTED_AT.getTime() + minutes * 60_000);
}

function policyJson(): unknown {
  return {
    version: POLICY.version,
    policyCode: POLICY.policyCode,
    tiers: POLICY.tiers.map((tier) => ({ ...tier })),
    afterStart: { ...POLICY.afterStart },
  };
}

describe('calculateItemRefund', () => {
  it.each([
    ['exactly 24 hours', 1_440, 10_000, 100_001n, 100_001n, 0n],
    [
      'one second below 24 hours',
      1_439 + 59 / 60,
      5_000,
      100_001n,
      50_000n,
      50_001n,
    ],
    ['exactly 6 hours', 360, 5_000, 100_001n, 50_000n, 50_001n],
    ['one second below 6 hours', 359 + 59 / 60, 0, 100_001n, 0n, 100_001n],
    ['zero amount', 1_440, 10_000, 0n, 0n, 0n],
  ])(
    'uses the expected tier %s',
    (_description, minutes, refundBps, amount, refund, fee) => {
      const result = calculateItemRefund({
        policy: POLICY,
        subtotalAmount: amount,
        slotStartAt: minutesAfterRequestedAt(minutes),
        requestedAt: REQUESTED_AT,
      });
      expect(result).toMatchObject({
        refundBps,
        refundAmount: refund,
        cancellationFeeAmount: fee,
        cancellationAllowed: true,
      });
      expect(result.refundAmount + result.cancellationFeeAmount).toBe(amount);
    },
  );

  it.each([0, -60])(
    'uses afterStart at and after the exact start boundary (%s minutes)',
    (minutes) => {
      expect(
        calculateItemRefund({
          policy: POLICY,
          subtotalAmount: 200_000n,
          slotStartAt: minutesAfterRequestedAt(minutes),
          requestedAt: REQUESTED_AT,
        }),
      ).toMatchObject({
        cancellationAllowed: false,
        refundBps: 0,
        refundAmount: 0n,
        cancellationFeeAmount: 200_000n,
        matchedTier: null,
        reason: 'CANCELLATION_NOT_ALLOWED',
      });
    },
  );

  it('rejects negative amounts and invalid dates', () => {
    expect(() =>
      calculateItemRefund({
        policy: POLICY,
        subtotalAmount: -1n,
        slotStartAt: minutesAfterRequestedAt(1),
        requestedAt: REQUESTED_AT,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_MONEY_AMOUNT' }));
    expect(() =>
      calculateItemRefund({
        policy: POLICY,
        subtotalAmount: 1n,
        slotStartAt: new Date(Number.NaN),
        requestedAt: REQUESTED_AT,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_DATE' }));
  });

  it('produces identical results for equivalent timezone instants', () => {
    const utc = calculateItemRefund({
      policy: POLICY,
      subtotalAmount: 100_000n,
      slotStartAt: new Date('2026-10-14T00:00:00.000Z'),
      requestedAt: new Date('2026-10-13T00:00:00.000Z'),
    });
    const offset = calculateItemRefund({
      policy: POLICY,
      subtotalAmount: 100_000n,
      slotStartAt: new Date('2026-10-14T07:00:00.000+07:00'),
      requestedAt: new Date('2026-10-13T07:00:00.000+07:00'),
    });
    expect(offset).toEqual(utc);
  });
});

describe('calculateBookingRefund', () => {
  it('calculates and aggregates 100/50/0 refunds per multi-slot item', () => {
    const result = calculateBookingRefund({
      policySnapshot: policyJson(),
      bookingTotalAmount: 700_000n,
      requestedAt: REQUESTED_AT,
      items: [
        {
          bookingItemId: 'A',
          subtotalAmount: 300_000n,
          slotStartAtSnapshot: minutesAfterRequestedAt(48 * 60),
        },
        {
          bookingItemId: 'B',
          subtotalAmount: 200_000n,
          slotStartAtSnapshot: minutesAfterRequestedAt(12 * 60),
        },
        {
          bookingItemId: 'C',
          subtotalAmount: 200_000n,
          slotStartAtSnapshot: minutesAfterRequestedAt(2 * 60),
        },
      ],
    });

    expect(result).toMatchObject({
      originalAmount: 700_000n,
      refundAmount: 400_000n,
      cancellationFeeAmount: 300_000n,
      cancellationAllowed: true,
      reason: 'PARTIAL_REFUND',
    });
    expect(result.items.map((item) => item.refundAmount)).toEqual([
      300_000n,
      100_000n,
      0n,
    ]);
  });

  it('returns all item details when started and future items are mixed', () => {
    const result = calculateBookingRefund({
      policySnapshot: policyJson(),
      bookingTotalAmount: 500_000n,
      requestedAt: REQUESTED_AT,
      items: [
        {
          bookingItemId: 'started',
          subtotalAmount: 200_000n,
          slotStartAtSnapshot: minutesAfterRequestedAt(-60),
        },
        {
          bookingItemId: 'future',
          subtotalAmount: 300_000n,
          slotStartAtSnapshot: minutesAfterRequestedAt(48 * 60),
        },
      ],
    });

    expect(result).toMatchObject({
      refundAmount: 300_000n,
      cancellationFeeAmount: 200_000n,
      cancellationAllowed: false,
      reason: 'PARTIAL_CANCELLATION_REQUIRED',
    });
    expect(result.items).toHaveLength(2);
  });

  it('marks a booking non-cancellable when all items have started', () => {
    const result = calculateBookingRefund({
      policySnapshot: policyJson(),
      bookingTotalAmount: 300_000n,
      requestedAt: REQUESTED_AT,
      items: [
        {
          bookingItemId: 'A',
          subtotalAmount: 100_000n,
          slotStartAtSnapshot: minutesAfterRequestedAt(0),
        },
        {
          bookingItemId: 'B',
          subtotalAmount: 200_000n,
          slotStartAtSnapshot: minutesAfterRequestedAt(-1),
        },
      ],
    });
    expect(result).toMatchObject({
      cancellationAllowed: false,
      reason: 'CANCELLATION_NOT_ALLOWED',
      refundAmount: 0n,
      cancellationFeeAmount: 300_000n,
    });
  });

  it('rounds down per item before aggregation', () => {
    const result = calculateBookingRefund({
      policySnapshot: policyJson(),
      bookingTotalAmount: 200_002n,
      requestedAt: REQUESTED_AT,
      items: ['A', 'B'].map((bookingItemId) => ({
        bookingItemId,
        subtotalAmount: 100_001n,
        slotStartAtSnapshot: minutesAfterRequestedAt(360),
      })),
    });
    expect(result.items.map((item) => item.refundAmount)).toEqual([
      50_000n,
      50_000n,
    ]);
    expect(result).toMatchObject({
      refundAmount: 100_000n,
      cancellationFeeAmount: 100_002n,
    });
  });

  it('rejects a mismatch between booking total and item snapshots', () => {
    expect(() =>
      calculateBookingRefund({
        policySnapshot: policyJson(),
        bookingTotalAmount: 700_000n,
        requestedAt: REQUESTED_AT,
        items: [
          {
            bookingItemId: 'A',
            subtotalAmount: 690_000n,
            slotStartAtSnapshot: minutesAfterRequestedAt(1_440),
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'BOOKING_AMOUNT_MISMATCH' }),
    );
  });

  it('rejects legacy bookings instead of loading the current policy', () => {
    expect(() =>
      calculateBookingRefund({
        policySnapshot: null,
        bookingTotalAmount: 0n,
        requestedAt: REQUESTED_AT,
        items: [],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'POLICY_SNAPSHOT_MISSING' }),
    );
  });

  it('uses the old snapshot after the policy source changes', () => {
    const oldSnapshot = {
      version: 1,
      policyCode: 'OLD',
      tiers: [{ minMinutesBeforeStart: 0, refundBps: 10_000 }],
      afterStart: { cancellationAllowed: false, refundBps: 0 },
    };
    const newSnapshot = {
      version: 1,
      policyCode: 'NEW',
      tiers: [{ minMinutesBeforeStart: 0, refundBps: 0 }],
      afterStart: { cancellationAllowed: false, refundBps: 0 },
    };
    const input = {
      bookingTotalAmount: 250_000n,
      requestedAt: REQUESTED_AT,
      items: [
        {
          bookingItemId: 'A',
          subtotalAmount: 250_000n,
          slotStartAtSnapshot: minutesAfterRequestedAt(60),
        },
      ],
    };

    expect(
      calculateBookingRefund({ ...input, policySnapshot: oldSnapshot })
        .refundAmount,
    ).toBe(250_000n);
    expect(
      calculateBookingRefund({ ...input, policySnapshot: newSnapshot })
        .refundAmount,
    ).toBe(0n);
    expect(
      calculateBookingRefund({ ...input, policySnapshot: oldSnapshot })
        .refundAmount,
    ).toBe(250_000n);
  });

  it('ignores later live price and Slot time changes', () => {
    const liveService = { priceAmount: 250_000n };
    const liveSlot = {
      priceAmount: 250_000n,
      startAt: minutesAfterRequestedAt(48 * 60),
    };
    const bookingItemSnapshot = {
      bookingItemId: 'A',
      subtotalAmount: 250_000n,
      slotStartAtSnapshot: new Date(liveSlot.startAt.getTime()),
    };

    liveService.priceAmount = 1n;
    liveSlot.priceAmount = 1n;
    liveSlot.startAt = minutesAfterRequestedAt(1);

    const result = calculateBookingRefund({
      policySnapshot: policyJson(),
      bookingTotalAmount: 250_000n,
      requestedAt: REQUESTED_AT,
      items: [bookingItemSnapshot],
    });
    expect(result.refundAmount).toBe(250_000n);
    expect(liveService.priceAmount).toBe(1n);
    expect(liveSlot.startAt).not.toEqual(
      bookingItemSnapshot.slotStartAtSnapshot,
    );
  });

  it.each([0n, 1n, 99_999n, 100_001n, 9_007_199_254_740_993n])(
    'preserves money invariants for amount %s',
    (amount) => {
      const result = calculateBookingRefund({
        policySnapshot: policyJson(),
        bookingTotalAmount: amount,
        requestedAt: REQUESTED_AT,
        items: [
          {
            bookingItemId: 'A',
            subtotalAmount: amount,
            slotStartAtSnapshot: minutesAfterRequestedAt(360),
          },
        ],
      });
      expect(result.refundAmount).toBeGreaterThanOrEqual(0n);
      expect(result.refundAmount).toBeLessThanOrEqual(amount);
      expect(result.cancellationFeeAmount).toBeGreaterThanOrEqual(0n);
      expect(result.refundAmount + result.cancellationFeeAmount).toBe(amount);
    },
  );

  it('does not accept negative booking or item amounts', () => {
    for (const input of [
      { bookingTotalAmount: -1n, itemAmount: -1n },
      { bookingTotalAmount: 1n, itemAmount: -1n },
    ]) {
      expect(() =>
        calculateBookingRefund({
          policySnapshot: policyJson(),
          bookingTotalAmount: input.bookingTotalAmount,
          requestedAt: REQUESTED_AT,
          items: [
            {
              bookingItemId: 'A',
              subtotalAmount: input.itemAmount,
              slotStartAtSnapshot: minutesAfterRequestedAt(360),
            },
          ],
        }),
      ).toThrow(CancellationPolicyError);
    }
  });
});
