import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorBookingsClient from "./bookings/vendor-bookings-client";
import VendorDashboardClient from "./dashboard/vendor-dashboard-client";
import VendorBookingDetailClient from "./bookings/[bookingId]/vendor-booking-detail-client";

const apiMocks = vi.hoisted(() => ({
  getVendorBookings: vi.fn(),
  getVendorDashboard: vi.fn(),
  getVendorBooking: vi.fn(),
  apiRequest: vi.fn(),
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
vi.mock("@/lib/vendor-operations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vendor-operations")>()),
  getVendorBookings: apiMocks.getVendorBookings,
  getVendorDashboard: apiMocks.getVendorDashboard,
  getVendorBooking: apiMocks.getVendorBooking,
}));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  apiRequest: apiMocks.apiRequest,
}));

function renderQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("Vendor operations UI", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("gobook.accessToken", "test-token");
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.apiRequest.mockResolvedValue({ items: [] });
  });

  it("renders booking rows, status tabs, search, and pagination", async () => {
    apiMocks.getVendorBookings.mockImplementation(
      async (query: { status: string; page: number }) => ({
        data:
          query.status === "CANCELLED"
            ? []
            : [
                {
                  bookingId: "id-a",
                  bookingCode: "GBK-A",
                  status: "CONFIRMED",
                  operationalStatus: "UPCOMING",
                  currency: "VND",
                  grossAmount: "100000",
                  discountAmount: "0",
                  totalAmount: "100000",
                  platformFeeAmount: "10000",
                  vendorAmount: "90000",
                  createdAt: "2026-10-20T00:00:00.000Z",
                  itemCount: 1,
                  totalQuantity: 2,
                  itemsSummary: [
                    {
                      serviceId: "s",
                      serviceTitle: "Workshop",
                      startAt: "2026-10-21T00:00:00.000Z",
                      endAt: "2026-10-21T02:00:00.000Z",
                      quantity: 2,
                    },
                  ],
                },
              ],
        pagination: {
          page: query.page,
          limit: 20,
          total: query.status === "CANCELLED" ? 0 : 30,
          totalPages: query.status === "CANCELLED" ? 0 : 2,
        },
      }),
    );
    renderQuery(<VendorBookingsClient />);
    expect(await screen.findByText("GBK-A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() =>
      expect(apiMocks.getVendorBookings).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Đã hủy" }));
    expect(
      await screen.findByText("Không có Booking nào trong bộ lọc này."),
    ).toBeInTheDocument();
  });

  it("shows financial coverage and pending refunds without presenting them as settled", async () => {
    apiMocks.getVendorDashboard.mockResolvedValue({
      period: {
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-20T00:00:00.000Z",
      },
      bookings: {
        total: 3,
        confirmed: 1,
        cancelled: 1,
        paid: 2,
        paidCancelled: 1,
        cancellationRateBps: 5000,
      },
      financial: {
        paidRevenue: "440000",
        succeededRefunds: "0",
        pendingRefunds: "352000",
        netRetainedRevenue: "440000",
        estimatedPlatformFee: "44000",
        estimatedVendorEarnings: "396000",
        commissionCoveredBookingCount: 1,
        commissionUnknownBookingCount: 1,
      },
      occupancy: {
        confirmedQuantity: 7,
        activeHeldQuantity: 2,
        totalCapacity: 10,
        rateBps: 7000,
      },
      revenueTrend: [
        { day: "2026-10-19", paidRevenue: "440000", paymentCount: 1 },
      ],
    });
    renderQuery(<VendorDashboardClient />);
    expect(
      await screen.findByText(
        "1 Booking đã thu tiền nhưng không có snapshot commission. Ước tính thu nhập và phí nền tảng chỉ bao gồm Booking có dữ liệu tin cậy.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Chưa đầy đủ")).toHaveLength(2);
    expect(screen.getByText("Nghĩa vụ hoàn đang chờ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "7 ngày" }));
    await waitFor(() =>
      expect(apiMocks.getVendorDashboard).toHaveBeenCalledTimes(2),
    );
  });

  it("shows item ticket counts and separates original from retained amounts", async () => {
    apiMocks.getVendorBooking.mockResolvedValue({
      bookingId: "id-a",
      bookingCode: "GBK-A",
      status: "CANCELLED",
      operationalStatus: "CANCELLED",
      createdAt: "2026-10-20T00:00:00.000Z",
      currency: "VND",
      grossAmount: "500000",
      discountAmount: "60000",
      netAmount: "440000",
      commissionBps: 1000,
      platformFeeAmount: "44000",
      vendorAmount: "396000",
      commissionCovered: true,
      payment: {
        status: "SUCCEEDED",
        amount: "440000",
        succeededAt: "2026-10-20T00:00:00.000Z",
      },
      refunds: { succeededAmount: "352000", pendingAmount: "0" },
      retained: {
        netAmount: "88000",
        projectedNetAfterPending: "88000",
        platformFeeAmount: "8800",
        vendorAmount: "79200",
      },
      cancellation: null,
      items: [
        {
          id: "i",
          serviceId: "s",
          slotId: "slot",
          serviceTitle: "Workshop",
          startAt: "2026-10-21T00:00:00.000Z",
          endAt: "2026-10-21T02:00:00.000Z",
          quantity: 2,
          grossAmount: "500000",
          discountAmount: "60000",
          netAmount: "440000",
          platformFeeAmount: "44000",
          vendorAmount: "396000",
          tickets: { issued: 1, checkedIn: 1, voided: 0 },
        },
      ],
    });
    renderQuery(<VendorBookingDetailClient bookingId="id-a" />);
    expect(await screen.findByText("Workshop")).toBeInTheDocument();
    expect(screen.getByText(/1 đã check-in/)).toBeInTheDocument();
    expect(screen.getByText(/Doanh thu đã giữ lại:/)).toBeInTheDocument();
    expect(
      screen.getByText(/dự phóng, chưa phải số đã quyết toán/),
    ).toBeInTheDocument();
  });
});
