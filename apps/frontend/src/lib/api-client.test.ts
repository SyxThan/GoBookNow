import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBookingHold,
  checkInVendorTicket,
  getBookingTickets,
  getTicketQr,
  initiateSePayPayment,
  validateVendorTicket,
} from "./api-client";

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
