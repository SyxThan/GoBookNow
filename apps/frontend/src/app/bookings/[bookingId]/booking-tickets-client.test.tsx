import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBookingTickets,
  getTicketQr,
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
  tickets: [issued],
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
  const createObjectURL = vi.fn(() => "blob:ticket-qr");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("gobook.accessToken", "customer-token");
    vi.mocked(getBookingTickets).mockReset().mockResolvedValue(response);
    vi.mocked(getTicketQr).mockReset();
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
});
