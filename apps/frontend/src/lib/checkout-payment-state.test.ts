import { describe, expect, it } from "vitest";
import { canInitiateSePay } from "./checkout-payment-state";

describe("SePay initiation button state", () => {
  it("only enables a positive payable hold in READY or retryable ERROR", () => {
    const base = {
      bookingStatus: "PENDING_PAYMENT",
      totalAmount: "250000",
      isExpired: false,
    };
    expect(canInitiateSePay({ ...base, paymentState: { step: "READY" } })).toBe(
      true,
    );
    expect(
      canInitiateSePay({
        ...base,
        isExpired: true,
        paymentState: { step: "READY" },
      }),
    ).toBe(false);
    expect(
      canInitiateSePay({
        ...base,
        bookingStatus: "CONFIRMED",
        paymentState: { step: "READY" },
      }),
    ).toBe(false);
    expect(
      canInitiateSePay({
        ...base,
        paymentState: { step: "INITIATING_PAYMENT" },
      }),
    ).toBe(false);
    expect(
      canInitiateSePay({
        ...base,
        totalAmount: "0",
        paymentState: { step: "READY" },
      }),
    ).toBe(false);
  });
});
