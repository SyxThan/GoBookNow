import {
  PaymentAttemptStatus,
  PaymentStatus,
} from '../generated/prisma/client.js';
import {
  PAYMENT_ATTEMPT_STATUS_TRANSITIONS,
  PAYMENT_STATUS_TRANSITIONS,
  TERMINAL_PAYMENT_ATTEMPT_STATUSES,
  TERMINAL_PAYMENT_STATUSES,
  canTransitionPaymentAttemptStatus,
  canTransitionPaymentStatus,
} from './payment-state.rules.js';

describe('payment state rules', () => {
  it('allows only PENDING to transition for a Payment', () => {
    expect(PAYMENT_STATUS_TRANSITIONS).toEqual({
      [PaymentStatus.PENDING]: [
        PaymentStatus.SUCCEEDED,
        PaymentStatus.EXPIRED,
        PaymentStatus.CANCELLED,
      ],
      [PaymentStatus.SUCCEEDED]: [],
      [PaymentStatus.EXPIRED]: [],
      [PaymentStatus.CANCELLED]: [],
    });

    for (const target of TERMINAL_PAYMENT_STATUSES) {
      expect(canTransitionPaymentStatus(PaymentStatus.PENDING, target)).toBe(
        true,
      );
    }
    expect(
      canTransitionPaymentStatus(
        PaymentStatus.SUCCEEDED,
        PaymentStatus.PENDING,
      ),
    ).toBe(false);
    expect(
      canTransitionPaymentStatus(
        PaymentStatus.EXPIRED,
        PaymentStatus.SUCCEEDED,
      ),
    ).toBe(false);
    expect(
      canTransitionPaymentStatus(
        PaymentStatus.CANCELLED,
        PaymentStatus.SUCCEEDED,
      ),
    ).toBe(false);
    expect(TERMINAL_PAYMENT_STATUSES).toEqual([
      PaymentStatus.SUCCEEDED,
      PaymentStatus.EXPIRED,
      PaymentStatus.CANCELLED,
    ]);
  });

  it('makes every PaymentAttempt outcome terminal', () => {
    expect(PAYMENT_ATTEMPT_STATUS_TRANSITIONS).toEqual({
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

    for (const target of TERMINAL_PAYMENT_ATTEMPT_STATUSES) {
      expect(
        canTransitionPaymentAttemptStatus(PaymentAttemptStatus.PENDING, target),
      ).toBe(true);
      expect(
        canTransitionPaymentAttemptStatus(target, PaymentAttemptStatus.PENDING),
      ).toBe(false);
    }
    expect(TERMINAL_PAYMENT_ATTEMPT_STATUSES).toEqual([
      PaymentAttemptStatus.SUCCEEDED,
      PaymentAttemptStatus.FAILED,
      PaymentAttemptStatus.CANCELLED,
      PaymentAttemptStatus.EXPIRED,
    ]);
  });
});
