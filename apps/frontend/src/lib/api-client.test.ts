import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookingHold, initiateSePayPayment } from "./api-client";

describe("createBookingHold", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only Slot and quantity with the Idempotency-Key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "booking-a",
          bookingCode: "GBK-TEST",
          status: "PENDING_PAYMENT",
          currency: "VND",
          subtotalAmount: "300000",
          totalAmount: "300000",
          expiresAt: "2026-10-03T09:10:00.000Z",
          items: [],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createBookingHold(
      {
        idempotencyKey: "safe-key",
        items: [{ slotId: "slot-a", quantity: 2 }],
      },
      "access-token",
      vi.fn(),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3001/api/v1/bookings/hold");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("safe-key");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ slotId: "slot-a", quantity: 2 }],
    });
    expect(String(init.body)).not.toContain("customerId");
    expect(String(init.body)).not.toContain("price");
  });
});

describe("initiateSePayPayment", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only bookingId and never client-owned payment data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          paymentId: "payment-a",
          attemptId: "attempt-a",
          provider: "SEPAY",
          status: "PENDING",
          amount: "250000",
          currency: "VND",
          merchantReference: "GBKABC",
          paymentUrl: "https://pay.sepay.vn/v1/checkout/init",
          method: "POST",
          formFields: { signature: "signed" },
          expiresAt: "2026-10-03T09:10:00.000Z",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await initiateSePayPayment("booking-a", "access-token", vi.fn());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3001/api/v1/payments/sepay");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ bookingId: "booking-a" });
    expect(String(init.body)).not.toMatch(
      /amount|currency|customerId|merchantReference|status/,
    );
  });
});
