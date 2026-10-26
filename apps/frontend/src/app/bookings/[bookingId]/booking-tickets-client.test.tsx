import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelBooking,
  ApiError,
  getBookingTickets,
  getTicketQr,
  previewBookingCancellation,
  type BookingCancellationResult,
  type BookingCancellationPreview,
  type CustomerTicket,
  type CustomerTicketList,
} from "@/lib/api-client";
import { BookingTicketsClient } from "./booking-tickets-client";

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

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    // The native element keeps the test focused on the wrapper component's output.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt ?? ""} {...props} />
  ),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    getBookingTickets: vi.fn(),
    getTicketQr: vi.fn(),
    previewBookingCancellation: vi.fn(),
    cancelBooking: vi.fn(),
  };
});

const issued: CustomerTicket = {
  id: "ticket-issued",
  ticketCode: "GBT-ISSUED",
  sequenceNo: 1,
  status: "ISSUED",
  issuedAt: "2026-10-12T01:00:00.000Z",
  checkedInAt: null,
  bookingItem: {
    serviceTitle: "Workshop an toàn",
    slotStartAt: "2026-10-12T02:00:00.000Z",
    slotEndAt: "2026-10-12T04:00:00.000Z",
    quantity: 3,
  },
};

const response: CustomerTicketList = {
  bookingId: "booking-a",
  bookingCode: "GBK-TEST",
  bookingStatus: "CONFIRMED",
  cancellation: null,
  tickets: [issued],
};

const preview: BookingCancellationPreview = {
  bookingId: "booking-a",
  cancellationAllowed: true,
  reason: "PARTIAL_REFUND",
  originalAmount: "700000",
  refundAmount: "400000",
  cancellationFeeAmount: "300000",
  currency: "VND",
  policyVersion: 1,
  items: [
    {
      bookingItemId: "item-a",
      originalAmount: "700000",
      refundBps: 5714,
      refundAmount: "400000",
      cancellationFeeAmount: "300000",
      cancellationAllowed: true,
      reason: "PARTIAL_REFUND",
    },
  ],
};

function renderTickets() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BookingTicketsClient bookingId="booking-a" />
    </QueryClientProvider>,
  );
}

describe("BookingTicketsClient", () => {
  it("shows a safe support ID and retries QR generation inside the dialog", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    vi.mocked(getTicketQr)
      .mockRejectedValueOnce(new ApiError(500, "private signing error", "INTERNAL_SERVER_ERROR", undefined, requestId))
      .mockResolvedValueOnce(new Blob(["png"], { type: "image/png" }));
    renderTickets();
    fireEvent.click(await screen.findByRole("button", { name: "Xem mã QR GBT-ISSUED" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(`Mã hỗ trợ: ${requestId}`);
    expect(screen.queryByText("private signing error")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại mã QR" }));
    expect(await screen.findByAltText("Mã QR vé GBT-ISSUED")).toBeVisible();
    expect(getTicketQr).toHaveBeenCalledTimes(2);
  });
  const createObjectURL = vi.fn(() => "blob:ticket-qr");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("gobook.accessToken", "customer-token");
    vi.mocked(getBookingTickets).mockReset().mockResolvedValue(response);
    vi.mocked(getTicketQr).mockReset();
    vi.mocked(previewBookingCancellation)
      .mockReset()
      .mockResolvedValue(preview);
    vi.mocked(cancelBooking).mockReset().mockResolvedValue({
      cancellationId: "cancellation-a",
      bookingId: "booking-a",
      bookingStatus: "CANCELLED",
      requestedAt: "2026-10-16T03:00:00.000Z",
      cancelledAt: "2026-10-16T03:00:00.000Z",
      originalAmount: "700000",
      refundAmount: "400000",
      cancellationFeeAmount: "300000",
      currency: "VND",
      policyVersion: 1,
      reason: "PARTIAL_REFUND",
      refund: {
        id: "refund-a",
        status: "PENDING",
        kind: "PARTIAL",
        amount: "400000",
        currency: "VND",
      },
    });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
  });

  it("renders ticket code, per-item sequence, service/slot data, and ISSUED status", async () => {
    renderTickets();
    expect(await screen.findByText("GBT-ISSUED")).toBeVisible();
    expect(screen.getByText("Vé 1/3")).toBeVisible();
    expect(screen.getByText("Workshop an toàn")).toBeVisible();
    expect(screen.getByText("Sẵn sàng sử dụng")).toBeVisible();
  });

  it("fetches the authenticated Blob, shows loading, displays QR, and revokes on close", async () => {
    let resolveQr: (blob: Blob) => void = () => undefined;
    vi.mocked(getTicketQr).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQr = resolve;
        }),
    );
    renderTickets();

    fireEvent.click(
      await screen.findByRole("button", { name: "Xem mã QR GBT-ISSUED" }),
    );
    expect(screen.getByText("Đang tạo mã QR...")).toBeVisible();
    expect(getTicketQr).toHaveBeenCalledWith(
      "ticket-issued",
      false,
      "customer-token",
      expect.any(Function),
    );

    resolveQr(new Blob(["png"], { type: "image/png" }));
    expect(await screen.findByAltText("Mã QR vé GBT-ISSUED")).toHaveAttribute(
      "src",
      "blob:ticket-qr",
    );
    fireEvent.click(screen.getByRole("button", { name: "Đóng mã QR" }));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:ticket-qr");
  });

  it("downloads the authenticated QR Blob with a safe filename", async () => {
    vi.mocked(getTicketQr).mockResolvedValue(
      new Blob(["png"], { type: "image/png" }),
    );
    renderTickets();
    fireEvent.click(
      await screen.findByRole("button", { name: "Tải QR GBT-ISSUED" }),
    );

    await waitFor(() =>
      expect(getTicketQr).toHaveBeenCalledWith(
        "ticket-issued",
        true,
        "customer-token",
        expect.any(Function),
      ),
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:ticket-qr");
  });

  it("disables both QR actions for a VOIDED Ticket without making a QR request", async () => {
    vi.mocked(getBookingTickets).mockResolvedValue({
      ...response,
      tickets: [{ ...issued, id: "voided", status: "VOIDED" }],
    });
    renderTickets();
    expect(await screen.findByText("Vé không còn hiệu lực")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Xem mã QR GBT-ISSUED" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Tải QR GBT-ISSUED" }),
    ).toBeDisabled();
    expect(getTicketQr).not.toHaveBeenCalled();
  });

  it("shows CHECKED_IN accurately and never labels it ready", async () => {
    vi.mocked(getBookingTickets).mockResolvedValue({
      ...response,
      tickets: [
        {
          ...issued,
          status: "CHECKED_IN",
          checkedInAt: "2026-10-12T02:30:00.000Z",
        },
      ],
    });
    renderTickets();
    expect(await screen.findByText("Đã check-in")).toBeVisible();
    expect(screen.queryByText("Sẵn sàng sử dụng")).toBeNull();
  });

  it("loads and renders the transparent cancellation preview", async () => {
    renderTickets();
    fireEvent.click(
      await screen.findByRole("button", { name: "Hủy đặt chỗ" }),
    );
    await waitFor(() =>
      expect(previewBookingCancellation).toHaveBeenCalledWith(
        "booking-a",
        "customer-token",
        expect.any(Function),
      ),
    );
    expect(await screen.findByText("400.000 ₫")).toBeVisible();
    expect(screen.getAllByText("300.000 ₫").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Hệ thống sẽ tính lại bằng thời gian máy chủ/),
    ).toBeVisible();
  });

  it("allows an explicit zero-refund cancellation", async () => {
    vi.mocked(previewBookingCancellation).mockResolvedValue({
      ...preview,
      reason: "NO_REFUND",
      refundAmount: "0",
      cancellationFeeAmount: "700000",
      items: [
        {
          ...preview.items[0]!,
          refundBps: 0,
          refundAmount: "0",
          cancellationFeeAmount: "700000",
          reason: "NO_REFUND",
        },
      ],
    });
    renderTickets();
    fireEvent.click(
      await screen.findByRole("button", { name: "Hủy đặt chỗ" }),
    );
    expect(
      await screen.findByText(/không hoàn tiền/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Xác nhận hủy" }),
    ).toBeEnabled();
  });

  it("blocks whole-booking confirmation when partial cancellation is required", async () => {
    vi.mocked(previewBookingCancellation).mockResolvedValue({
      ...preview,
      cancellationAllowed: false,
      reason: "PARTIAL_CANCELLATION_REQUIRED",
    });
    renderTickets();
    fireEvent.click(
      await screen.findByRole("button", { name: "Hủy đặt chỗ" }),
    );
    expect(
      await screen.findByText(/chưa hỗ trợ hủy từng phần/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Xác nhận hủy" }),
    ).toBeDisabled();
  });

  it("keeps one idempotency key while a cancellation request is pending and reports PENDING accurately", async () => {
    let resolveCancellation: (
      value: BookingCancellationResult | PromiseLike<BookingCancellationResult>,
    ) => void = () => undefined;
    vi.mocked(cancelBooking).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCancellation = resolve;
        }),
    );
    renderTickets();
    fireEvent.click(
      await screen.findByRole("button", { name: "Hủy đặt chỗ" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "Xác nhận hủy",
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Đang hủy..." }),
      ).toBeDisabled(),
    );
    expect(cancelBooking).toHaveBeenCalledTimes(1);
    const firstKey = vi.mocked(cancelBooking).mock.calls[0]![0].idempotencyKey;
    expect(firstKey).toBeTruthy();

    resolveCancellation({
      cancellationId: "cancellation-a",
      bookingId: "booking-a",
      bookingStatus: "CANCELLED",
      requestedAt: "2026-10-16T03:00:00.000Z",
      cancelledAt: "2026-10-16T03:00:00.000Z",
      originalAmount: "700000",
      refundAmount: "400000",
      cancellationFeeAmount: "300000",
      currency: "VND",
      policyVersion: 1,
      reason: "PARTIAL_REFUND",
      refund: {
        id: "refund-a",
        status: "PENDING",
        kind: "PARTIAL",
        amount: "400000",
        currency: "VND",
      },
    });
    expect(
      await screen.findAllByText(/đã được ghi nhận và đang chờ xử lý/),
    ).not.toHaveLength(0);
    expect(screen.queryByText(/đã hoàn tiền/)).toBeNull();
  });

  it("retries a failed cancellation with the same Idempotency-Key", async () => {
    vi.mocked(cancelBooking)
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({
        cancellationId: "cancellation-retry",
        bookingId: "booking-a",
        bookingStatus: "CANCELLED",
        requestedAt: "2026-10-16T03:00:00.000Z",
        cancelledAt: "2026-10-16T03:00:00.000Z",
        originalAmount: "700000",
        refundAmount: "0",
        cancellationFeeAmount: "700000",
        currency: "VND",
        policyVersion: 1,
        reason: "NO_REFUND",
        refund: null,
      });
    renderTickets();
    fireEvent.click(
      await screen.findByRole("button", { name: "Hủy đặt chỗ" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "Xác nhận hủy",
    });
    fireEvent.click(confirm);
    await screen.findByText(/Bạn có thể thử lại an toàn/);
    const firstKey = vi.mocked(cancelBooking).mock.calls[0]![0].idempotencyKey;

    fireEvent.click(confirm);
    await waitFor(() => expect(cancelBooking).toHaveBeenCalledTimes(2));
    expect(vi.mocked(cancelBooking).mock.calls[1]![0].idempotencyKey).toBe(
      firstKey,
    );
  });
});
