import {
  CANCELLATION_POLICY_VERSION,
  CancellationPolicyError,
  type CancellationPolicySnapshotJson,
  type CancellationPolicySnapshotV1,
  type CancellationPolicyTier,
} from './cancellation-policy.types.js';

type UnknownRecord = Record<string, unknown>;

function invalidPolicy(message: string): never {
  throw new CancellationPolicyError('INVALID_POLICY', message);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return invalidPolicy(
      `${field} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

function parseRefundBps(value: unknown, field: string): number {
  return parseInteger(value, field, 0, 10_000);
}

export function normalizeCancellationPolicy(
  value: unknown,
): CancellationPolicySnapshotV1 {
  if (!isRecord(value)) invalidPolicy('Policy must be an object');

  const version = parseInteger(value.version, 'version', 1);
  if (version !== CANCELLATION_POLICY_VERSION) {
    invalidPolicy(`Unsupported cancellation policy version: ${version}`);
  }

  if (typeof value.policyCode !== 'string' || value.policyCode.trim() === '') {
    invalidPolicy('policyCode must be a non-empty string');
  }
  if (!Array.isArray(value.tiers) || value.tiers.length === 0) {
    invalidPolicy('tiers must be a non-empty array');
  }

  const seenThresholds = new Set<number>();
  const tiers = value.tiers.map((tier, index): CancellationPolicyTier => {
    if (!isRecord(tier)) invalidPolicy(`tiers[${index}] must be an object`);
    const minMinutesBeforeStart = parseInteger(
      tier.minMinutesBeforeStart,
      `tiers[${index}].minMinutesBeforeStart`,
      0,
    );
    if (seenThresholds.has(minMinutesBeforeStart)) {
      invalidPolicy(
        `Duplicate minMinutesBeforeStart threshold: ${minMinutesBeforeStart}`,
      );
    }
    seenThresholds.add(minMinutesBeforeStart);

    return Object.freeze({
      minMinutesBeforeStart,
      refundBps: parseRefundBps(tier.refundBps, `tiers[${index}].refundBps`),
    });
  });
  tiers.sort(
    (left, right) => right.minMinutesBeforeStart - left.minMinutesBeforeStart,
  );

  if (!isRecord(value.afterStart)) {
    invalidPolicy('afterStart must be an object');
  }
  if (typeof value.afterStart.cancellationAllowed !== 'boolean') {
    invalidPolicy('afterStart.cancellationAllowed must be a boolean');
  }

  return Object.freeze({
    version: CANCELLATION_POLICY_VERSION,
    policyCode: value.policyCode.trim(),
    tiers: Object.freeze(tiers),
    afterStart: Object.freeze({
      cancellationAllowed: value.afterStart.cancellationAllowed,
      refundBps: parseRefundBps(
        value.afterStart.refundBps,
        'afterStart.refundBps',
      ),
    }),
  });
}

export function serializeCancellationPolicySnapshot(
  policy: CancellationPolicySnapshotV1,
): CancellationPolicySnapshotJson {
  const normalized = normalizeCancellationPolicy(policy);
  return {
    version: normalized.version,
    policyCode: normalized.policyCode,
    tiers: normalized.tiers.map((tier) => ({ ...tier })),
    afterStart: { ...normalized.afterStart },
  };
}
