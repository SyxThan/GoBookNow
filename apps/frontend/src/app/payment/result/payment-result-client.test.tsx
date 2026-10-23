import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configure, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  getPaymentResult,
  initiateSePayPayment,
  type PaymentResult,
} from "@/lib/api-client";
import { PaymentResultClient } from "./payment-result-client";

let query = "paymentId=payment-a&return=success";
configure({ asyncUtilTimeout: 3000 });

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
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
    getPaymentResult: vi.fn(),
    initiateSePayPayment: vi.fn(),
  };
});

const pending: PaymentResult = {
  id: "payment-a",
  status: "PENDING",
  amount: "250000",
  currency: "VND",
  booking: { id: "booking-a", status: "PENDING_PAYMENT" },
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
};

function renderResult() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PaymentResultClient />
    </QueryClientProvider>,
  );
}

describe("PaymentResultClient backend authority", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("gobook.accessToken", "customer-token");
    query = "paymentId=payment-a&return=success";
    vi.mocked(getPaymentResult).mockReset();
    vi.mocked(initiateSePayPayment).mockReset();
  });

  it("does not let return=success fake a pending payment", async () => {
    vi.mocked(getPaymentResult).mockResolvedValue(pending);
    renderResult();

    expect(
      await screen.findByRole("heading", {
        name: "Đang xác nhận thanh toán",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Thanh toán thành công")).toBeNull();
    expect(screen.getByText(/vẫn đang chờ xác nhận trực tiếp/)).toBeVisible();
  });

  it("shows authoritative success even when the browser return hint is cancel", async () => {
    query = "paymentId=payment-a&return=cancel";
    vi.mocked(getPaymentResult).mockResolvedValue({
      ...pending,
      status: "SUCCEEDED",
      booking: { ...pending.booking, status: "CONFIRMED" },
    });
    renderResult();

    expect(await screen.findByText("Thanh toán thành công")).toBeVisible();
    expect(screen.getByText("Đặt chỗ của bạn đã được xác nhận.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Xem vé điện tử" }),
    ).toHaveAttribute("href", "/bookings/booking-a");
  });

  it("distinguishes payment received from final booking confirmation", async () => {
    vi.mocked(getPaymentResult).mockResolvedValue({
      ...pending,
      status: "SUCCEEDED",
    });
    renderResult();

    expect(await screen.findByText("Đã nhận thanh toán")).toBeVisible();
    expect(
      screen.getByText(/Hệ thống đang xử lý xác nhận đặt chỗ/),
    ).toBeVisible();
    expect(screen.queryByText("Thanh toán thành công")).toBeNull();
  });

  it("stops at the backend expired state", async () => {
    vi.mocked(getPaymentResult).mockResolvedValue({
      ...pending,
      status: "EXPIRED",
      booking: { ...pending.booking, status: "EXPIRED" },
    });
    renderResult();

    expect(
      await screen.findByText("Phiên thanh toán đã hết hạn"),
    ).toBeVisible();
  });

  it("shows pending refund handling for received money on an expired booking", async () => {
    vi.mocked(getPaymentResult).mockResolvedValue({
      ...pending,
      status: "SUCCEEDED",
      booking: { ...pending.booking, status: "EXPIRED" },
    });
    renderResult();
    expect(
      await screen.findByText(/Khoản tiền đang chờ xử lý hoàn tiền/),
    ).toBeVisible();
    expect(screen.queryByText("Thanh toán thành công")).toBeNull();
    expect(screen.queryByRole("link", { name: "Xem vé điện tử" })).toBeNull();
  });

  it.each(["error", "cancel"])(
    "keeps backend pending despite return=%s",
    async (hint) => {
      query = `paymentId=payment-a&return=${hint}`;
      vi.mocked(getPaymentResult).mockResolvedValue(pending);
      renderResult();
      expect(
        await screen.findByRole("heading", {
          name: "Đang xác nhận thanh toán",
        }),
      ).toBeVisible();
      expect(initiateSePayPayment).not.toHaveBeenCalled();
    },
  );

  it("refreshes authoritative state without initiating another checkout", async () => {
    vi.mocked(getPaymentResult).mockResolvedValue(pending);
    const first = renderResult();
    expect(
      await screen.findByRole("heading", { name: "Đang xác nhận thanh toán" }),
    ).toBeVisible();
    first.unmount();
    renderResult();
    expect(
      await screen.findByRole("heading", { name: "Đang xác nhận thanh toán" }),
    ).toBeVisible();
    expect(getPaymentResult).toHaveBeenCalledTimes(2);
    expect(initiateSePayPayment).not.toHaveBeenCalled();
  });

  it("hides another customer's financial details after ownership is denied", async () => {
    vi.mocked(getPaymentResult).mockRejectedValue(
      new ApiError(403, "Forbidden"),
    );
    renderResult();
    expect(
      await screen.findByText("Bạn không có quyền xem thanh toán này."),
    ).toBeVisible();
    expect(screen.queryByText("Mã thanh toán")).toBeNull();
    expect(initiateSePayPayment).not.toHaveBeenCalled();
  });
});
