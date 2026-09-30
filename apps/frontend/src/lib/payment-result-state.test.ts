import { describe, expect, it } from "vitest";
import type { PaymentResult } from "./api-client";
import {
  derivePaymentResultViewState,
  PAYMENT_POLL_GRACE_MS,
  PAYMENT_POLL_INTERVAL_MS,
  paymentRefetchInterval,
} from "./payment-result-state";

const startedAt = Date.parse("2026-10-01T00:00:00.000Z");

function result(
  status: PaymentResult["status"],
  bookingStatus: PaymentResult["booking"]["status"],
): PaymentResult {
  return {
    id: "payment-a",
    status,
    amount: "250000",
    currency: "VND",
    booking: { id: "booking-a", status: bookingStatus },
    expiresAt: "2026-10-01T00:10:00.000Z",
  };
}

describe("authoritative payment result state", () => {
  it("keeps pending backend state pending regardless of a success return hint", () => {
    const returnHint = "success";
    expect(returnHint).toBe("success");
    expect(
      derivePaymentResultViewState(result("PENDING", "PENDING_PAYMENT")),
    ).toBe("PENDING_CONFIRMATION");
  });

  it("requires both Payment success and Booking confirmation for final success", () => {
    expect(
      derivePaymentResultViewState(result("SUCCEEDED", "PENDING_PAYMENT")),
    ).toBe("PAYMENT_RECEIVED");
    expect(
      derivePaymentResultViewState(result("SUCCEEDED", "CONFIRMED")),
    ).toBe("CONFIRMED");
  });

  it("uses a reconciliation-safe state for paid but expired/cancelled bookings", () => {
    expect(derivePaymentResultViewState(result("SUCCEEDED", "EXPIRED"))).toBe(
      "RECONCILIATION",
    );
  });

  it("renders expiry from backend and stops polling", () => {
    const expired = result("PENDING", "EXPIRED");
    expect(derivePaymentResultViewState(expired)).toBe("EXPIRED");
    expect(paymentRefetchInterval(expired, startedAt, startedAt)).toBe(false);
  });

  it("polls pending, pending, received, then stops at confirmed", () => {
    const sequence: PaymentResult[] = [
      result("PENDING", "PENDING_PAYMENT"),
      result("PENDING", "PENDING_PAYMENT"),
      result("SUCCEEDED", "PENDING_PAYMENT"),
      result("SUCCEEDED", "CONFIRMED"),
    ];
    expect(
      sequence.map((payment) =>
        paymentRefetchInterval(payment, startedAt, startedAt),
      ),
    ).toEqual([
      PAYMENT_POLL_INTERVAL_MS,
      PAYMENT_POLL_INTERVAL_MS,
      PAYMENT_POLL_INTERVAL_MS,
      false,
    ]);
  });

  it("stops aggressive polling after expiresAt plus grace without inventing failure", () => {
    const pending = result("PENDING", "PENDING_PAYMENT");
    const afterDeadline =
      Date.parse(pending.expiresAt!) + PAYMENT_POLL_GRACE_MS;
    expect(paymentRefetchInterval(pending, startedAt, afterDeadline)).toBe(
      false,
    );
    expect(derivePaymentResultViewState(pending)).toBe(
      "PENDING_CONFIRMATION",
    );
  });
});
