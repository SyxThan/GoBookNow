import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingsHub } from "./bookings-hub";
import { BookingTrackingPanel } from "./[bookingId]/booking-tracking-panel";

const mocks = vi.hoisted(() => ({
  listMyBookings: vi.fn(),
  getMyBooking: vi.fn(),
  initiateSePayPayment: vi.fn(),
}));
vi.mock("@gobook/auth/use-session", () => ({
  usePortalSession: () => ({
    ready: true,
    token: "customer-token",
    onToken: vi.fn(),
  }),
}));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  ...mocks,
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseBooking = {
  id: "booking-a",
  bookingCode: "GBK-2026-A",
  bookingStatus: "PENDING_PAYMENT",
  displayStatus: "WAITING_PAYMENT",
  createdAt: "2026-10-26T00:00:00.000Z",
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  confirmedAt: null,
  serverTime: new Date().toISOString(),
  subtotalAmount: "250000",
  voucherDiscountAmount: "0",
  totalAmount: "250000",
  currency: "VND",
  canInitiatePayment: true,
  ticketCount: 0,
  items: [
    {
      id: "item-a",
      serviceId: "service-a",
      serviceTitle: "Lớp làm gốm",
      slotStartAt: "2026-10-27T10:00:00.000Z",
      slotEndAt: "2026-10-27T11:00:00.000Z",
      quantity: 2,
      unitPriceAmount: "125000",
      subtotalAmount: "250000",
      voucherDiscountAmount: "0",
    },
  ],
  paymentSummary: null,
  refunds: [],
};
function renderWithQuery(ui: ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
}

describe("Customer booking history", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("loads the account history without any recent browser references", async () => {
    sessionStorage.clear();
    mocks.listMyBookings.mockResolvedValue({
      items: [baseBooking],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      serverTime: baseBooking.serverTime,
    });
    renderWithQuery(<BookingsHub />);
    expect(await screen.findByText("GBK-2026-A")).toBeInTheDocument();
    expect(screen.getByText("Lớp làm gốm")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Thanh toán ngay/ }),
    ).toHaveAttribute("href", "/bookings/booking-a");
    expect(mocks.listMyBookings).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
      "customer-token",
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("opens a recovered hold read-only and initiates SePay only on the customer's click", async () => {
    mocks.getMyBooking.mockResolvedValue(baseBooking);
    mocks.initiateSePayPayment.mockResolvedValue({
      paymentId: "payment-a",
      method: "POST",
      paymentUrl: "https://checkout.invalid",
      formFields: {},
    });
    renderWithQuery(<BookingTrackingPanel bookingId="booking-a" />);
    expect(await screen.findByText("Đơn GBK-2026-A")).toBeInTheDocument();
    expect(mocks.initiateSePayPayment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Thanh toán ngay" }));
    await waitFor(() =>
      expect(mocks.initiateSePayPayment).toHaveBeenCalledTimes(1),
    );
  });

  it("never offers another payment when an attempt is pending or the hold expired", async () => {
    mocks.getMyBooking.mockResolvedValueOnce({
      ...baseBooking,
      displayStatus: "WAITING_CONFIRMATION",
      canInitiatePayment: false,
      paymentSummary: {
        paymentId: "payment-a",
        status: "PENDING",
        amount: "250000",
        currency: "VND",
        attemptStatus: "PENDING",
        merchantReference: "GBK-REF",
      },
    });
    const first = renderWithQuery(
      <BookingTrackingPanel bookingId="booking-a" />,
    );
    expect(
      await screen.findByText("Đang chờ xác nhận thanh toán"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Thanh toán ngay" }),
    ).not.toBeInTheDocument();
    first.unmount();
    mocks.getMyBooking.mockResolvedValueOnce({
      ...baseBooking,
      bookingStatus: "EXPIRED",
      displayStatus: "EXPIRED",
      canInitiatePayment: false,
    });
    renderWithQuery(<BookingTrackingPanel bookingId="booking-a" />);
    expect(await screen.findByRole("heading", { name: "Đã hết hạn" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Thanh toán ngay" }),
    ).not.toBeInTheDocument();
    expect(mocks.initiateSePayPayment).not.toHaveBeenCalled();
  });
});
