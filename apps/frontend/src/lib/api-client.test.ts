import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelBooking,
  createBookingHold,
  checkInVendorTicket,
  getBookingTickets,
  getTicketQr,
  initiateSePayPayment,
  logout,
  previewBookingCancellation,
  validateVendorTicket,
  validateVoucher,
} from "./api-client";

describe("logout acknowledgement", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("does not report success when the server could not revoke the session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Unavailable" }), { status: 503 })));
    await expect(logout()).rejects.toMatchObject({ status: 503 });
  });
  it("accepts an acknowledged logout without a response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(logout()).resolves.toBeUndefined();
  });
});

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
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer access-token",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ slotId: "slot-a", quantity: 2 }],
    });
    expect(String(init.body)).not.toContain("customerId");
    expect(String(init.body)).not.toContain("price");
  });

  it("includes voucherCode without client financial amounts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "booking-a" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await createBookingHold(
      {
        idempotencyKey: "safe-key",
        items: [{ slotId: "slot-a", quantity: 2 }],
        voucherCode: "SALE20",
      },
      "access-token",
      vi.fn(),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ slotId: "slot-a", quantity: 2 }],
      voucherCode: "SALE20",
    });
    expect(String(init.body)).not.toContain("discountAmount");
  });
});

describe("validateVoucher", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("submits only code and selected items for a read-only quote", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            valid: true,
            code: "SALE20",
            discountAmount: "40000",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await validateVoucher(
      "SALE20",
      [{ slotId: "slot-a", quantity: 2 }],
      "access-token",
      vi.fn(),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/vouchers/validate");
    expect(JSON.parse(String(init.body))).toEqual({
      code: "SALE20",
      items: [{ slotId: "slot-a", quantity: 2 }],
    });
  });
});

describe("Booking cancellation API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("previews without sending browser-owned financial or time inputs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          bookingId: "booking-a",
          cancellationAllowed: true,
          reason: "NO_REFUND",
          originalAmount: "100000",
          refundAmount: "0",
          cancellationFeeAmount: "100000",
          currency: "VND",
          policyVersion: 1,
          items: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await previewBookingCancellation("booking-a", "token", vi.fn());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://localhost:3001/api/v1/bookings/booking-a/cancellation/preview",
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("sends only the safe note and stable Idempotency-Key on confirm", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cancellationId: "cancellation-a",
          bookingId: "booking-a",
          bookingStatus: "CANCELLED",
          refund: null,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await cancelBooking(
      {
        bookingId: "booking-a",
        idempotencyKey: "cancel-key",
        reasonNote: "Đổi kế hoạch",
      },
      "token",
      vi.fn(),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("cancel-key");
    expect(JSON.parse(String(init.body))).toEqual({
      reasonNote: "Đổi kế hoạch",
    });
    expect(String(init.body)).not.toMatch(
      /refundAmount|refundBps|requestedAt|policy|status|ticket/i,
    );
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

describe("Ticket API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads safe Ticket metadata through the authenticated Booking route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          bookingId: "booking-a",
          bookingCode: "GBK-TEST",
          bookingStatus: "CONFIRMED",
          tickets: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getBookingTickets("booking-a", "customer-token", vi.fn());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3001/api/v1/bookings/booking-a/tickets");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer customer-token",
    );
  });

  it("fetches a QR Blob by Ticket ID without putting the credential in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("png", {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getTicketQr("ticket-a", true, "customer-token", vi.fn());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://localhost:3001/api/v1/tickets/ticket-a/qr?download=true",
    );
    expect(url).not.toMatch(/token|nonce|signature/i);
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer customer-token",
    );
  });

  it.each([
    ["validate", validateVendorTicket],
    ["check-in", checkInVendorTicket],
  ] as const)(
    "sends the opaque credential only in the POST body for %s",
    async (path, call) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ authentic: false, reason: "INVALID_TOKEN" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      await call("opaque-sensitive-value", "vendor-token", vi.fn());

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://localhost:3001/api/v1/vendor/tickets/${path}`);
      expect(url).not.toContain("opaque-sensitive-value");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        token: "opaque-sensitive-value",
      });
      expect(String(init.body)).not.toMatch(
        /vendorId|userId|checkedInAt|status/,
      );
    },
  );
});
