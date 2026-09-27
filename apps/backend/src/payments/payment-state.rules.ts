import {
  PaymentAttemptStatus,
  PaymentStatus,
} from '../generated/prisma/client.js';

export const PAYMENT_STATUS_TRANSITIONS: Readonly<
  Record<PaymentStatus, readonly PaymentStatus[]>
> = Object.freeze({
  [PaymentStatus.PENDING]: [
    PaymentStatus.SUCCEEDED,
    PaymentStatus.EXPIRED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.SUCCEEDED]: [],
  [PaymentStatus.EXPIRED]: [],
  [PaymentStatus.CANCELLED]: [],
});

export const PAYMENT_ATTEMPT_STATUS_TRANSITIONS: Readonly<
  Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]>
> = Object.freeze({
  [PaymentAttemptStatus.PENDING]: [
    PaymentAttemptStatus.SUCCEEDED,
    PaymentAttemptStatus.FAILED,
    PaymentAttemptStatus.CANCELLED,
    PaymentAttemptStatus.EXPIRED,
  ],
  [PaymentAttemptStatus.SUCCEEDED]: [],
  [PaymentAttemptStatus.FAILED]: [],
  [PaymentAttemptStatus.CANCELLED]: [],
  [PaymentAttemptStatus.EXPIRED]: [],
});

export const TERMINAL_PAYMENT_STATUSES = Object.freeze([
  PaymentStatus.SUCCEEDED,
  PaymentStatus.EXPIRED,
  PaymentStatus.CANCELLED,
] satisfies readonly PaymentStatus[]);

export const TERMINAL_PAYMENT_ATTEMPT_STATUSES = Object.freeze([
  PaymentAttemptStatus.SUCCEEDED,
  PaymentAttemptStatus.FAILED,
  PaymentAttemptStatus.CANCELLED,
  PaymentAttemptStatus.EXPIRED,
] satisfies readonly PaymentAttemptStatus[]);

export function canTransitionPaymentStatus(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionPaymentAttemptStatus(
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus,
): boolean {
  return PAYMENT_ATTEMPT_STATUS_TRANSITIONS[from].includes(to);
}
