import { normalizeCancellationPolicy } from './cancellation-policy.js';
import {
  FULL_REFUND_BPS,
  CancellationPolicyError,
  type BookingItemRefundResult,
  type BookingRefundReason,
  type BookingRefundResult,
  type CancellationPolicySnapshotV1,
  type CancellationPolicyTier,
  type ItemRefundReason,
  type ItemRefundResult,
} from './cancellation-policy.types.js';

const BPS_DIVISOR = 10_000n;
const MILLISECONDS_PER_MINUTE = 60_000n;

type CalculateItemRefundInput = Readonly<{
  policy: CancellationPolicySnapshotV1;
  subtotalAmount: bigint;
  slotStartAt: Date;
  requestedAt: Date;
}>;

type BookingRefundItemInput = Readonly<{
  bookingItemId: string;
  subtotalAmount: bigint;
  slotStartAtSnapshot: Date;
}>;

type CalculateBookingRefundInput = Readonly<{
  policySnapshot: unknown;
  bookingTotalAmount: bigint;
  items: readonly BookingRefundItemInput[];
  requestedAt: Date;
}>;

function assertNonNegativeMoney(amount: bigint, field: string): void {
  if (amount < 0n) {
    throw new CancellationPolicyError(
      'INVALID_MONEY_AMOUNT',
      `${field} must be non-negative`,
    );
  }
}

function getInstantMilliseconds(value: Date, field: string): bigint {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new CancellationPolicyError(
      'INVALID_DATE',
      `${field} must be a valid absolute instant`,
    );
  }
  return BigInt(milliseconds);
}

function itemReason(
  cancellationAllowed: boolean,
  refundBps: number,
): ItemRefundReason {
  if (!cancellationAllowed) return 'CANCELLATION_NOT_ALLOWED';
  if (refundBps === FULL_REFUND_BPS) return 'FULL_REFUND';
  if (refundBps === 0) return 'NO_REFUND';
  return 'PARTIAL_REFUND';
}

function createItemResult(
  policy: CancellationPolicySnapshotV1,
  subtotalAmount: bigint,
  cancellationAllowed: boolean,
  refundBps: number,
  matchedTier: CancellationPolicyTier | null,
): ItemRefundResult {
  const refundAmount = (subtotalAmount * BigInt(refundBps)) / BPS_DIVISOR;
  return Object.freeze({
    originalAmount: subtotalAmount,
    refundBps,
    refundAmount,
    cancellationFeeAmount: subtotalAmount - refundAmount,
    cancellationAllowed,
    matchedTier,
    policyVersion: policy.version,
    reason: itemReason(cancellationAllowed, refundBps),
  });
}

export function calculateItemRefund(
  input: CalculateItemRefundInput,
): ItemRefundResult {
  assertNonNegativeMoney(input.subtotalAmount, 'subtotalAmount');
  const slotStartAtMs = getInstantMilliseconds(
    input.slotStartAt,
    'slotStartAt',
  );
  const requestedAtMs = getInstantMilliseconds(
    input.requestedAt,
    'requestedAt',
  );

  if (requestedAtMs >= slotStartAtMs) {
    return createItemResult(
      input.policy,
      input.subtotalAmount,
      input.policy.afterStart.cancellationAllowed,
      input.policy.afterStart.refundBps,
      null,
    );
  }

  const remainingMs = slotStartAtMs - requestedAtMs;
  const matchedTier = input.policy.tiers.find(
    (tier) =>
      remainingMs >=
      BigInt(tier.minMinutesBeforeStart) * MILLISECONDS_PER_MINUTE,
  );
  if (!matchedTier) {
    throw new CancellationPolicyError(
      'INVALID_POLICY',
      'Policy does not cover every pre-start instant',
    );
  }

  return createItemResult(
    input.policy,
    input.subtotalAmount,
    true,
    matchedTier.refundBps,
    matchedTier,
  );
}

function bookingReason(
  itemResults: readonly BookingItemRefundResult[],
  refundAmount: bigint,
  totalAmount: bigint,
): BookingRefundReason {
  const cancellableCount = itemResults.filter(
    (item) => item.cancellationAllowed,
  ).length;
  if (cancellableCount === 0) return 'CANCELLATION_NOT_ALLOWED';
  if (cancellableCount !== itemResults.length) {
    return 'PARTIAL_CANCELLATION_REQUIRED';
  }
  if (refundAmount === totalAmount) return 'FULL_REFUND';
  if (refundAmount === 0n) return 'NO_REFUND';
  return 'PARTIAL_REFUND';
}

export function calculateBookingRefund(
  input: CalculateBookingRefundInput,
): BookingRefundResult {
  if (input.policySnapshot === null || input.policySnapshot === undefined) {
    throw new CancellationPolicyError(
      'POLICY_SNAPSHOT_MISSING',
      'Booking does not contain a cancellation policy snapshot',
    );
  }
  const policy = normalizeCancellationPolicy(input.policySnapshot);
  assertNonNegativeMoney(input.bookingTotalAmount, 'bookingTotalAmount');
  if (input.items.length === 0) {
    throw new CancellationPolicyError(
      'BOOKING_ITEMS_EMPTY',
      'Booking must contain at least one item',
    );
  }

  let itemTotalAmount = 0n;
  for (const item of input.items) {
    assertNonNegativeMoney(item.subtotalAmount, 'item.subtotalAmount');
    itemTotalAmount += item.subtotalAmount;
  }
  if (itemTotalAmount !== input.bookingTotalAmount) {
    throw new CancellationPolicyError(
      'BOOKING_AMOUNT_MISMATCH',
      'Booking total does not equal the sum of item subtotal snapshots',
    );
  }

  const items = input.items.map((item): BookingItemRefundResult => {
    const result = calculateItemRefund({
      policy,
      subtotalAmount: item.subtotalAmount,
      slotStartAt: item.slotStartAtSnapshot,
      requestedAt: input.requestedAt,
    });
    return Object.freeze({
      bookingItemId: item.bookingItemId,
      slotStartAt: new Date(item.slotStartAtSnapshot.getTime()),
      ...result,
    });
  });
  const refundAmount = items.reduce(
    (total, item) => total + item.refundAmount,
    0n,
  );
  const cancellationFeeAmount = items.reduce(
    (total, item) => total + item.cancellationFeeAmount,
    0n,
  );

  return Object.freeze({
    policyVersion: policy.version,
    originalAmount: input.bookingTotalAmount,
    refundAmount,
    cancellationFeeAmount,
    cancellationAllowed: items.every((item) => item.cancellationAllowed),
    reason: bookingReason(items, refundAmount, input.bookingTotalAmount),
    items: Object.freeze(items),
  });
}
