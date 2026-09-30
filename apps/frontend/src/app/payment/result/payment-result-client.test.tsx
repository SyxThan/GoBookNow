import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPaymentResult, type PaymentResult } from "@/lib/api-client";
import { PaymentResultClient } from "./payment-result-client";

let query = "paymentId=payment-a&return=success";

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
  return { ...actual, getPaymentResult: vi.fn() };
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
    expect(
      screen.getByText("Đặt chỗ của bạn đã được xác nhận."),
    ).toBeVisible();
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
});
