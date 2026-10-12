import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TicketCheckInResult,
  VendorTicketValidation,
} from "@/lib/api-client";
import VendorCheckInClient from "./vendor-check-in-client";

const apiMocks = vi.hoisted(() => ({
  validateVendorTicket: vi.fn(),
  checkInVendorTicket: vi.fn(),
  login: vi.fn(),
}));

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return { ...actual, ...apiMocks };
});

vi.mock("./qr-scanner", () => ({
  default: ({
    active,
    onDetected,
    onCameraError,
  }: {
    active: boolean;
    onDetected: (token: string) => void;
    onCameraError: (message: string) => void;
  }) => (
    <div>
      <span>{active ? "camera-active" : "camera-paused"}</span>
      <button type="button" onClick={() => onDetected("opaque-scanned-token")}>
        Mô phỏng quét
      </button>
      <button
        type="button"
        onClick={() =>
          onCameraError("Quyền truy cập camera bị từ chối. Dán mã thủ công.")
        }
      >
        Từ chối camera
      </button>
    </div>
  ),
}));

const valid: VendorTicketValidation = {
  authentic: true,
  valid: true,
  checkInEligible: true,
  reason: "VALID",
  ticket: {
    id: "ticket-a",
    ticketCode: "GBT-TEST-1",
    status: "ISSUED",
    sequenceNo: 1,
    checkedInAt: null,
  },
  booking: { id: "booking-a", bookingCode: "GBK-1", status: "CONFIRMED" },
  service: { id: "service-a", title: "Workshop gốm", kind: "EVENT" },
  slot: {
    id: "slot-a",
    startAt: "2026-10-12T02:00:00.000Z",
    endAt: "2026-10-12T04:00:00.000Z",
    status: "OPEN",
  },
};

const success: TicketCheckInResult = {
  success: true,
  ticket: {
    id: "ticket-a",
    ticketCode: "GBT-TEST-1",
    status: "CHECKED_IN",
    sequenceNo: 1,
    checkedInAt: "2026-10-12T03:00:00.000Z",
  },
  booking: { bookingCode: "GBK-1" },
  service: { title: "Workshop gốm", kind: "EVENT" },
  slot: {
    startAt: "2026-10-12T02:00:00.000Z",
    endAt: "2026-10-12T04:00:00.000Z",
  },
};

describe("VendorCheckInClient", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("gobook.accessToken", "vendor-access-token");
    apiMocks.validateVendorTicket.mockReset();
    apiMocks.checkInVendorTicket.mockReset();
    apiMocks.login.mockReset();
  });

  it("pauses after a scan, validates once, and renders the confirmation preview", async () => {
    apiMocks.validateVendorTicket.mockResolvedValue(valid);
    render(<VendorCheckInClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Mô phỏng quét" }),
    );

    expect(await screen.findByText("Vé hợp lệ")).toBeInTheDocument();
    expect(screen.getByText("GBT-TEST-1")).toBeInTheDocument();
    expect(screen.getByText("Workshop gốm")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Xác nhận check-in" }),
    ).toBeInTheDocument();
    expect(apiMocks.validateVendorTicket).toHaveBeenCalledTimes(1);
    expect(apiMocks.validateVendorTicket).toHaveBeenCalledWith(
      "opaque-scanned-token",
      "vendor-access-token",
      expect.any(Function),
    );
  });

  it("sends one mutation under rapid confirmation and shows success", async () => {
    apiMocks.validateVendorTicket.mockResolvedValue(valid);
    let resolveCheckIn: (result: TicketCheckInResult) => void = () => undefined;
    apiMocks.checkInVendorTicket.mockImplementation(
      () =>
        new Promise<TicketCheckInResult>((resolve) => {
          resolveCheckIn = resolve;
        }),
    );
    render(<VendorCheckInClient />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Mô phỏng quét" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "Xác nhận check-in",
    });

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(apiMocks.checkInVendorTicket).toHaveBeenCalledTimes(1);
    resolveCheckIn(success);

    expect(await screen.findByText("Check-in thành công")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quét vé tiếp theo" }),
    ).toBeInTheDocument();
  });

  it("shows an already-used warning without a confirmation action", async () => {
    apiMocks.validateVendorTicket.mockResolvedValue({
      ...valid,
      checkInEligible: false,
      reason: "ALREADY_CHECKED_IN",
      ticket: {
        ...valid.ticket!,
        status: "CHECKED_IN",
        checkedInAt: "2026-10-12T02:30:00.000Z",
      },
    });
    render(<VendorCheckInClient />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Mô phỏng quét" }),
    );

    expect(await screen.findByText("Vé đã được check-in.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Xác nhận check-in" }),
    ).not.toBeInTheDocument();
    expect(apiMocks.checkInVendorTicket).not.toHaveBeenCalled();
  });

  it("shows invalid QR feedback and never calls check-in", async () => {
    apiMocks.validateVendorTicket.mockResolvedValue({
      authentic: false,
      valid: false,
      checkInEligible: false,
      reason: "INVALID_TOKEN",
    });
    render(<VendorCheckInClient />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Mô phỏng quét" }),
    );

    expect(await screen.findByText("Mã QR không hợp lệ.")).toBeInTheDocument();
    expect(apiMocks.checkInVendorTicket).not.toHaveBeenCalled();
  });

  it("keeps the manual fallback usable when camera permission is denied", async () => {
    apiMocks.validateVendorTicket.mockResolvedValue(valid);
    render(<VendorCheckInClient />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Từ chối camera" }),
    );

    expect(
      screen.getByText("Quyền truy cập camera bị từ chối. Dán mã thủ công."),
    ).toBeInTheDocument();
    const input = screen.getByPlaceholderText("Dán mã vé tại đây");
    fireEvent.change(input, { target: { value: "manual-opaque-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra vé" }));

    await waitFor(() =>
      expect(apiMocks.validateVendorTicket).toHaveBeenCalledWith(
        "manual-opaque-token",
        "vendor-access-token",
        expect.any(Function),
      ),
    );
  });
});
