import {
  normalizeCancellationPolicy,
  serializeCancellationPolicySnapshot,
} from './cancellation-policy.js';
import { CancellationPolicyProvider } from './cancellation-policy.provider.js';
import { CancellationPolicyError } from './cancellation-policy.types.js';

describe('cancellation policy', () => {
  it('validates and normalizes unsorted tiers without mutating the source', () => {
    const source = {
      version: 1,
      policyCode: 'STANDARD_V1',
      tiers: [
        { minMinutesBeforeStart: 0, refundBps: 0 },
        { minMinutesBeforeStart: 1_440, refundBps: 10_000 },
        { minMinutesBeforeStart: 360, refundBps: 5_000 },
      ],
      afterStart: { cancellationAllowed: false, refundBps: 0 },
    };

    const policy = normalizeCancellationPolicy(source);

    expect(policy.tiers.map((tier) => tier.minMinutesBeforeStart)).toEqual([
      1_440, 360, 0,
    ]);
    expect(source.tiers.map((tier) => tier.minMinutesBeforeStart)).toEqual([
      0, 1_440, 360,
    ]);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.tiers)).toBe(true);
    expect(policy.tiers.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    ['refund BPS below zero', { tierRefundBps: -1 }],
    ['refund BPS above 10000', { tierRefundBps: 10_001 }],
    ['negative threshold', { threshold: -1 }],
    ['empty tiers', { emptyTiers: true }],
    ['version zero', { version: 0 }],
    ['negative after-start BPS', { afterStartRefundBps: -1 }],
    ['after-start BPS above 10000', { afterStartRefundBps: 10_001 }],
  ])('rejects %s', (_description, overrides) => {
    const policy = {
      version: overrides.version ?? 1,
      policyCode: 'TEST',
      tiers: overrides.emptyTiers
        ? []
        : [
            {
              minMinutesBeforeStart: overrides.threshold ?? 0,
              refundBps: overrides.tierRefundBps ?? 0,
            },
          ],
      afterStart: {
        cancellationAllowed: false,
        refundBps: overrides.afterStartRefundBps ?? 0,
      },
    };

    expect(() => normalizeCancellationPolicy(policy)).toThrow(
      CancellationPolicyError,
    );
  });

  it('rejects duplicate thresholds', () => {
    expect(() =>
      normalizeCancellationPolicy({
        version: 1,
        policyCode: 'DUPLICATE',
        tiers: [
          { minMinutesBeforeStart: 360, refundBps: 5_000 },
          { minMinutesBeforeStart: 360, refundBps: 0 },
        ],
        afterStart: { cancellationAllowed: false, refundBps: 0 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_POLICY' }));
  });

  it('serializes a detached snapshot and does not retain source references', () => {
    const source = {
      version: 1,
      policyCode: 'POLICY_A',
      tiers: [{ minMinutesBeforeStart: 0, refundBps: 10_000 }],
      afterStart: { cancellationAllowed: false, refundBps: 0 },
    };
    const snapshot = serializeCancellationPolicySnapshot(
      normalizeCancellationPolicy(source),
    );

    source.policyCode = 'POLICY_B';
    source.tiers[0]!.refundBps = 0;
    source.afterStart.cancellationAllowed = true;

    expect(snapshot).toEqual({
      version: 1,
      policyCode: 'POLICY_A',
      tiers: [{ minMinutesBeforeStart: 0, refundBps: 10_000 }],
      afterStart: { cancellationAllowed: false, refundBps: 0 },
    });
  });

  it('provides the centralized normalized MVP policy for new bookings', () => {
    const snapshot = new CancellationPolicyProvider().createBookingSnapshot();
    expect(snapshot).toEqual({
      version: 1,
      policyCode: 'STANDARD_V1',
      tiers: [
        { minMinutesBeforeStart: 1_440, refundBps: 10_000 },
        { minMinutesBeforeStart: 360, refundBps: 5_000 },
        { minMinutesBeforeStart: 0, refundBps: 0 },
      ],
      afterStart: { cancellationAllowed: false, refundBps: 0 },
    });
  });

  it('gives new bookings a changed source policy without changing old snapshots', () => {
    const policyA = {
      version: 1,
      policyCode: 'POLICY_A',
      tiers: [{ minMinutesBeforeStart: 0, refundBps: 10_000 }],
      afterStart: { cancellationAllowed: false, refundBps: 0 },
    };
    const bookingASnapshot = new CancellationPolicyProvider(
      policyA,
    ).createBookingSnapshot();

    const policyB = {
      version: 1,
      policyCode: 'POLICY_B',
      tiers: [{ minMinutesBeforeStart: 0, refundBps: 0 }],
      afterStart: { cancellationAllowed: false, refundBps: 0 },
    };
    const bookingBSnapshot = new CancellationPolicyProvider(
      policyB,
    ).createBookingSnapshot();

    expect(bookingASnapshot.policyCode).toBe('POLICY_A');
    expect(bookingASnapshot.tiers[0]!.refundBps).toBe(10_000);
    expect(bookingBSnapshot.policyCode).toBe('POLICY_B');
    expect(bookingBSnapshot.tiers[0]!.refundBps).toBe(0);
  });
});
