import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createBookingHold,
  getPublicService,
  initiateSePayPayment,
  listPublicSlots,
  type BookingHoldResponse,
  type PublicServiceDetail,
  type PublicSlot,
} from "@/lib/api-client";
import {
  replaceHoldAttempt,
  saveCheckoutDraft,
  saveHeldBooking,
  type CheckoutDraft,
} from "@/lib/booking-storage";
import { submitExternalPaymentForm } from "@/lib/payment-form";
import { formatTime } from "@/lib/format";
import { BookingCheckoutClient } from "./booking-checkout-client";

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams("service=massage-60-phut"),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    createBookingHold: vi.fn(),
    getPublicService: vi.fn(),
    initiateSePayPayment: vi.fn(),
    listPublicSlots: vi.fn(),
    login: vi.fn(),
  };
});

vi.mock("@/lib/payment-form", () => ({
  submitExternalPaymentForm: vi.fn(),
}));

const draft: CheckoutDraft = {
  serviceId: "service-a",
  serviceSlug: "massage-60-phut",
  slotId: "slot-a",
  quantity: 2,
};

const slot: PublicSlot = {
  id: draft.slotId,
  startAt: "2099-10-03T02:00:00.000Z",
  endAt: "2099-10-03T03:00:00.000Z",
  capacity: 10,
  status: "OPEN",
  price: { amount: "100000", currency: "VND", source: "SERVICE" },
};

const service: PublicServiceDetail = {
  id: draft.serviceId,
  kind: "SERVICE",
  title: "Massage 60 phút",
  slug: draft.serviceSlug,
  summary: null,
  description: null,
  thumbnailUrl: null,
  priceAmount: "100000",
  currency: "VND",
  durationMinutes: 60,
  status: "PUBLISHED",
  category: { id: "cat", code: "SPA", name: "Spa", slug: "spa" },
  vendor: {
    id: "vendor",
    displayName: "An Spa",
    slug: "an-spa",
    province: "Hà Nội",
    district: "Ba Đình",
    ward: null,
  },
  images: [],
};

const booking: BookingHoldResponse = {
  id: "booking-a",
  bookingCode: "GBK-TEST",
  status: "PENDING_PAYMENT",
  currency: "VND",
  subtotalAmount: "240000",
  totalAmount: "240000",
  expiresAt: "2099-10-03T03:10:00.000Z",
  items: [
    {
      id: "item-a",
      serviceId: service.id,
      slotId: slot.id,
      serviceTitle: service.title,
      startAt: slot.startAt,
      endAt: slot.endAt,
      quantity: 2,
      unitPriceAmount: "120000",
      subtotalAmount: "240000",
      pricingSource: "SLOT",
      reservation: {
        id: "reservation-a",
        status: "HELD",
        expiresAt: "2099-10-03T03:10:00.000Z",
      },
    },
  ],
};

function renderCheckout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BookingCheckoutClient />
    </QueryClientProvider>,
  );
}

describe("BookingCheckoutClient hold behavior", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    routerPush.mockReset();
    vi.mocked(createBookingHold).mockReset();
    vi.mocked(getPublicService).mockReset();
    vi.mocked(initiateSePayPayment).mockReset();
    vi.mocked(listPublicSlots).mockReset();
    vi.mocked(submitExternalPaymentForm).mockReset();
    saveCheckoutDraft(draft, window.sessionStorage);
    replaceHoldAttempt(draft, window.sessionStorage, () => "stable-key");
    window.sessionStorage.setItem("gobook.accessToken", "customer-token");
    vi.mocked(getPublicService).mockResolvedValue(service);
    vi.mocked(listPublicSlots).mockResolvedValue({
      items: [slot],
      page: 1,
      limit: 100,
      total: 1,
      totalPages: 1,
    });
  });

  it("prevents duplicate clicks while the hold request is pending", async () => {
    let resolveHold: (value: BookingHoldResponse) => void = () => undefined;
    vi.mocked(createBookingHold).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHold = resolve;
        }),
    );
    renderCheckout();

    const button = await screen.findByRole("button", { name: "Giữ chỗ" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(createBookingHold).toHaveBeenCalledTimes(1));

    resolveHold(booking);
    expect(await screen.findByText("GBK-TEST")).toBeVisible();
  });

  it("retries a network failure with the same Idempotency-Key", async () => {
    vi.mocked(createBookingHold)
      .mockRejectedValueOnce(new TypeError("connection dropped"))
      .mockResolvedValueOnce(booking);
    renderCheckout();

    fireEvent.click(await screen.findByRole("button", { name: "Giữ chỗ" }));
    const retry = await screen.findByRole("button", {
      name: "Thử lại cùng request",
    });
    fireEvent.click(retry);
    expect(await screen.findByText("GBK-TEST")).toBeVisible();

    expect(createBookingHold).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createBookingHold).mock.calls[0]?.[0].idempotencyKey).toBe(
      "stable-key",
    );
    expect(vi.mocked(createBookingHold).mock.calls[1]?.[0].idempotencyKey).toBe(
      "stable-key",
    );
  });

  it("shows a friendly capacity error and refetches Slots", async () => {
    vi.mocked(createBookingHold).mockRejectedValueOnce(
      new ApiError(409, "raw database conflict", "INSUFFICIENT_CAPACITY"),
    );
    renderCheckout();

    fireEvent.click(await screen.findByRole("button", { name: "Giữ chỗ" }));
    expect(await screen.findByText("Không còn đủ chỗ cho số lượng bạn chọn.")).toBeVisible();
    await waitFor(() => expect(listPublicSlots).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Booking của bạn đang được giữ tạm thời.")).toBeNull();
  });

  it("renders snapshot checkout and submits one SePay POST-form contract", async () => {
    saveHeldBooking(
      { serviceSlug: draft.serviceSlug, booking },
      window.sessionStorage,
    );
    vi.mocked(initiateSePayPayment).mockResolvedValue({
      paymentId: "payment-a",
      attemptId: "attempt-a",
      provider: "SEPAY",
      status: "PENDING",
      amount: "240000",
      currency: "VND",
      merchantReference: "GBKABC",
      paymentUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
      method: "POST",
      formFields: {
        order_amount: "240000",
        signature: "signed-value",
      },
      expiresAt: booking.expiresAt!,
    });
    renderCheckout();

    expect(await screen.findByText("120.000 ₫")).toBeVisible();
    expect(screen.getAllByText("240.000 ₫").length).toBeGreaterThan(0);
    expect(screen.getByText("Massage 60 phút")).toBeVisible();
    expect(
      screen.getByText(
        `${formatTime(booking.items[0]!.startAt)} – ${formatTime(
          booking.items[0]!.endAt,
        )}`,
      ),
    ).toBeVisible();

    const pay = screen.getByRole("button", { name: "Thanh toán với SePay" });
    fireEvent.click(pay);
    fireEvent.click(pay);

    await waitFor(() =>
      expect(initiateSePayPayment).toHaveBeenCalledTimes(1),
    );
    expect(initiateSePayPayment).toHaveBeenCalledWith(
      booking.id,
      "customer-token",
      expect.any(Function),
    );
    await waitFor(() =>
      expect(submitExternalPaymentForm).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: "payment-a", method: "POST" }),
      ),
    );
  });

  it("allows a safe retry after an ambiguous initiation network failure", async () => {
    saveHeldBooking(
      { serviceSlug: draft.serviceSlug, booking },
      window.sessionStorage,
    );
    vi.mocked(initiateSePayPayment)
      .mockRejectedValueOnce(new TypeError("timeout"))
      .mockResolvedValueOnce({
        paymentId: "backend-controlled-payment",
        attemptId: "backend-controlled-attempt",
        provider: "SEPAY",
        status: "PENDING",
        amount: booking.totalAmount,
        currency: booking.currency,
        merchantReference: "GBKREUSED",
        paymentUrl: "https://pay.sepay.vn/v1/checkout/init",
        method: "POST",
        formFields: { signature: "signed-value" },
        expiresAt: booking.expiresAt!,
      });
    renderCheckout();

    fireEvent.click(
      await screen.findByRole("button", { name: "Thanh toán với SePay" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Thử thanh toán lại" }),
    );

    await waitFor(() =>
      expect(initiateSePayPayment).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(initiateSePayPayment).mock.calls[0]?.[0]).toBe(booking.id);
    expect(vi.mocked(initiateSePayPayment).mock.calls[1]?.[0]).toBe(booking.id);
  });

  it("shows the dedicated SePay unavailable message", async () => {
    saveHeldBooking(
      { serviceSlug: draft.serviceSlug, booking },
      window.sessionStorage,
    );
    vi.mocked(initiateSePayPayment).mockRejectedValueOnce(
      new ApiError(503, "provider internal details", "SEPAY_UNAVAILABLE"),
    );
    renderCheckout();

    fireEvent.click(
      await screen.findByRole("button", { name: "Thanh toán với SePay" }),
    );
    expect(
      await screen.findByText(
        "SePay hiện tạm thời không khả dụng. Vui lòng thử lại sau.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("provider internal details")).toBeNull();
  });
});
