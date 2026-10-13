import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  normalizeCancellationPolicy,
  serializeCancellationPolicySnapshot,
} from './cancellation-policy.js';
import type { CancellationPolicySnapshotJson } from './cancellation-policy.types.js';

export const MVP_DEFAULT_CANCELLATION_POLICY = Object.freeze({
  version: 1,
  policyCode: 'STANDARD_V1',
  tiers: Object.freeze([
    Object.freeze({ minMinutesBeforeStart: 1_440, refundBps: 10_000 }),
    Object.freeze({ minMinutesBeforeStart: 360, refundBps: 5_000 }),
    Object.freeze({ minMinutesBeforeStart: 0, refundBps: 0 }),
  ]),
  afterStart: Object.freeze({ cancellationAllowed: false, refundBps: 0 }),
});

export const CANCELLATION_POLICY_SOURCE = Symbol('CANCELLATION_POLICY_SOURCE');

@Injectable()
export class CancellationPolicyProvider {
  constructor(
    @Optional()
    @Inject(CANCELLATION_POLICY_SOURCE)
    private readonly source: unknown = MVP_DEFAULT_CANCELLATION_POLICY,
  ) {}

  createBookingSnapshot(): CancellationPolicySnapshotJson {
    return serializeCancellationPolicySnapshot(
      normalizeCancellationPolicy(this.source),
    );
  }
}
