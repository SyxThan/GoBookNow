import type { PaymentResult } from "./api-client";

export const PAYMENT_POLL_INTERVAL_MS = 2_500;
export const PAYMENT_POLL_GRACE_MS = 2 * 60_000;

export type PaymentResultViewState =
  | "PENDING_CONFIRMATION"
  | "PAYMENT_RECEIVED"
  | "CONFIRMED"
  | "EXPIRED"
  | "CANCELLED"
  | "RECONCILIATION";

export function derivePaymentResultViewState(
  payment: PaymentResult,
): PaymentResultViewState {
  if (
    payment.status === "SUCCEEDED" &&
    payment.booking.status === "CONFIRMED"
  ) {
    return "CONFIRMED";
  }

  if (
    payment.status === "SUCCEEDED" &&
    (payment.booking.status === "EXPIRED" ||
      payment.booking.status === "CANCELLED")
  ) {
    return "RECONCILIATION";
  }

  if (payment.status === "EXPIRED" || payment.booking.status === "EXPIRED") {
    return "EXPIRED";
  }
  if (
    payment.status === "CANCELLED" ||
    payment.booking.status === "CANCELLED"
  ) {
    return "CANCELLED";
  }
  if (payment.status === "SUCCEEDED") {
    return "PAYMENT_RECEIVED";
  }
  if (payment.booking.status !== "PENDING_PAYMENT") {
    return "RECONCILIATION";
  }
  return "PENDING_CONFIRMATION";
}

export function isPaymentPollingState(payment: PaymentResult): boolean {
  return (
    payment.booking.status === "PENDING_PAYMENT" &&
    (payment.status === "PENDING" || payment.status === "SUCCEEDED")
  );
}

export function paymentPollingDeadline(
  payment: PaymentResult,
  pollingStartedAt: number,
): number {
  const expiresAt = payment.expiresAt
    ? new Date(payment.expiresAt).getTime()
    : Number.NaN;
  const authoritativeDeadline = Number.isFinite(expiresAt)
    ? expiresAt
    : pollingStartedAt;
  return Math.max(pollingStartedAt, authoritativeDeadline) + PAYMENT_POLL_GRACE_MS;
}

export function hasPaymentPollingTimedOut(
  payment: PaymentResult,
  pollingStartedAt: number,
  now: number,
): boolean {
  return (
    isPaymentPollingState(payment) &&
    now >= paymentPollingDeadline(payment, pollingStartedAt)
  );
}

export function paymentRefetchInterval(
  payment: PaymentResult | undefined,
  pollingStartedAt: number,
  now: number,
): number | false {
  if (
    !payment ||
    !isPaymentPollingState(payment) ||
    hasPaymentPollingTimedOut(payment, pollingStartedAt, now)
  ) {
    return false;
  }
  return PAYMENT_POLL_INTERVAL_MS;
}
