import type { SePayInitiationResponse } from "./api-client";

export type CheckoutPaymentState =
  | { step: "READY" }
  | { step: "INITIATING_PAYMENT" }
  | { step: "REDIRECTING"; payment: SePayInitiationResponse }
  | { step: "ERROR"; message: string; retryable: boolean };

export function isPositiveIntegerAmount(amount: string): boolean {
  return /^(0|[1-9]\d*)$/.test(amount) && BigInt(amount) > BigInt(0);
}

export function canInitiateSePay(input: {
  bookingStatus: string;
  totalAmount: string;
  isExpired: boolean;
  paymentState: CheckoutPaymentState;
}): boolean {
  const stateAllowsPayment =
    input.paymentState.step === "READY" ||
    (input.paymentState.step === "ERROR" && input.paymentState.retryable);

  return (
    input.bookingStatus === "PENDING_PAYMENT" &&
    !input.isExpired &&
    isPositiveIntegerAmount(input.totalAmount) &&
    stateAllowsPayment
  );
}
