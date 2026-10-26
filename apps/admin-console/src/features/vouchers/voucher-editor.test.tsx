import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VoucherEditor from "./voucher-editor";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
vi.mock("@gobook/api-client", async (original) => ({
  ...(await original<typeof import("@gobook/api-client")>()),
  apiRequest: mocks.request,
}));

function setup() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <VoucherEditor />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Mã ưu đãi"), {
    target: { value: "spring26" },
  });
  fireEvent.change(screen.getByLabelText("Cách giảm"), {
    target: { value: "PERCENTAGE" },
  });
  fireEvent.change(screen.getByLabelText(/Mức giảm/), {
    target: { value: "12.34" },
  });
  fireEvent.change(screen.getByLabelText("Bắt đầu"), {
    target: { value: "2099-01-01T08:00" },
  });
  fireEvent.change(screen.getByLabelText("Kết thúc"), {
    target: { value: "2099-02-01T08:00" },
  });
  return screen.getByRole("button", { name: "Lưu ưu đãi" }).closest("form")!;
}

describe("Dedicated voucher editor", () => {
  beforeEach(() => {
    sessionStorage.setItem("gobook.accessToken", "unit-only");
    mocks.request.mockReset().mockResolvedValue({});
    mocks.replace.mockReset();
  });
  it("submits exact basis points and decimal money strings to the existing API", async () => {
    fireEvent.submit(setup());
    await waitFor(() => expect(mocks.request).toHaveBeenCalled());
    const [path, options] = mocks.request.mock.calls[0];
    expect(path).toBe("/admin/vouchers");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toMatchObject({
      code: "SPRING26",
      percentageBps: 1234,
      fixedAmount: null,
      minOrderAmount: "0",
      maxDiscountAmount: null,
      type: "PERCENTAGE",
    });
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/vouchers"),
    );
  });
  it("keeps the form and values when the date range is invalid", async () => {
    const form = setup();
    fireEvent.change(screen.getByLabelText("Kết thúc"), {
      target: { value: "2098-01-01T08:00" },
    });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Thời gian kết thúc ưu đãi phải sau thời gian bắt đầu.",
    );
    expect(mocks.request).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Mức giảm/)).toHaveValue("12.34");
  });
  it("rejects precision that cannot be represented as basis points", async () => {
    const form = setup();
    fireEvent.change(screen.getByLabelText(/Mức giảm/), {
      target: { value: "12.345" },
    });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
