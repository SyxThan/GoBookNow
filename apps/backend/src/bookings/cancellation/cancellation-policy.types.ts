export const CANCELLATION_POLICY_VERSION = 1 as const;
export const FULL_REFUND_BPS = 10_000;

export type CancellationPolicyTier = Readonly<{
  minMinutesBeforeStart: number;
  refundBps: number;
}>;

export type CancellationAfterStartRule = Readonly<{
  cancellationAllowed: boolean;
  refundBps: number;
}>;

export type CancellationPolicySnapshotV1 = Readonly<{
  version: typeof CANCELLATION_POLICY_VERSION;
  policyCode: string;
  tiers: readonly CancellationPolicyTier[];
  afterStart: CancellationAfterStartRule;
}>;

export type CancellationPolicySnapshotJson = {
  version: typeof CANCELLATION_POLICY_VERSION;
  policyCode: string;
  tiers: Array<{
    minMinutesBeforeStart: number;
    refundBps: number;
  }>;
  afterStart: {
    cancellationAllowed: boolean;
    refundBps: number;
  };
};

export type CancellationPolicyErrorCode =
  | 'INVALID_POLICY'
  | 'POLICY_SNAPSHOT_MISSING'
  | 'INVALID_MONEY_AMOUNT'
  | 'INVALID_DATE'
  | 'BOOKING_ITEMS_EMPTY'
  | 'BOOKING_AMOUNT_MISMATCH';

export class CancellationPolicyError extends Error {
  constructor(
    readonly code: CancellationPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CancellationPolicyError';
  }
}

export type ItemRefundReason =
  'FULL_REFUND' | 'PARTIAL_REFUND' | 'NO_REFUND' | 'CANCELLATION_NOT_ALLOWED';

export type BookingRefundReason =
  | 'FULL_REFUND'
  | 'PARTIAL_REFUND'
  | 'NO_REFUND'
  | 'PARTIAL_CANCELLATION_REQUIRED'
  | 'CANCELLATION_NOT_ALLOWED';

export type ItemRefundResult = Readonly<{
  originalAmount: bigint;
  refundBps: number;
  refundAmount: bigint;
  cancellationFeeAmount: bigint;
  cancellationAllowed: boolean;
  matchedTier: CancellationPolicyTier | null;
  policyVersion: number;
  reason: ItemRefundReason;
}>;

export type BookingItemRefundResult = ItemRefundResult &
  Readonly<{
    bookingItemId: string;
    slotStartAt: Date;
  }>;

export type BookingRefundResult = Readonly<{
  policyVersion: number;
  originalAmount: bigint;
  refundAmount: bigint;
  cancellationFeeAmount: bigint;
  cancellationAllowed: boolean;
  reason: BookingRefundReason;
  items: readonly BookingItemRefundResult[];
}>;
