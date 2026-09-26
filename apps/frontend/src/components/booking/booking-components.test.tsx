import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  BookingHoldResponse,
  PublicServiceDetail,
  PublicSlot,
} from "@/lib/api-client";
import { BookingHeldCard } from "./booking-held-card";
import { BookingSlotSelector } from "./booking-slot-selector";
import { BookingSummary } from "./booking-summary";
import { QuantitySelector } from "./quantity-selector";

const slot: PublicSlot = {
  id: "slot-a",
  startAt: "2026-10-03T02:00:00.000Z",
  endAt: "2026-10-03T03:00:00.000Z",
  capacity: 10,
  status: "OPEN",
  price: { amount: "150000", currency: "VND", source: "SLOT" },
};

const service: PublicServiceDetail = {
  id: "service-a",
  kind: "SERVICE",
  title: "Massage 60 phút",
  slug: "massage-60-phut",
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

describe("booking selection components", () => {
  it("renders and selects an available Slot with visible selected state", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <BookingSlotSelector slots={[slot]} selectedSlotId={null} onSelect={onSelect} />,
    );
    const option = screen.getByRole("radio");
    expect(option).toHaveAttribute("aria-checked", "false");
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(slot);
    rerender(
      <BookingSlotSelector slots={[slot]} selectedSlotId="slot-a" onSelect={onSelect} />,
    );
    expect(screen.getByRole("radio")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Đã chọn")).toBeVisible();
  });

  it("defaults safely, cannot decrement below one, and rejects decimal input", () => {
    const onChange = vi.fn();
    render(<QuantitySelector value={1} max={10} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Giảm số lượng" })).toBeDisabled();
    const input = screen.getByRole("textbox", { name: "Số lượng" });
    fireEvent.change(input, { target: { value: "1.5" } });
    expect(input).toHaveValue("1");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("1");
  });

  it("shows service, Slot, quantity, unit price, and integer-safe estimated total", () => {
    render(<BookingSummary service={service} slot={slot} quantity={2} />);
    expect(screen.getByText("Massage 60 phút")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByText(/150\.000 ₫ × 2/)).toBeVisible();
    expect(screen.getByText("300.000 ₫")).toBeVisible();
  });
});

describe("held booking", () => {
  it("renders the authoritative server price and reservation state", () => {
    const booking: BookingHoldResponse = {
      id: "booking-a",
      bookingCode: "GBK-TEST",
      status: "PENDING_PAYMENT",
      currency: "VND",
      subtotalAmount: "240000",
      totalAmount: "240000",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
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
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        },
      ],
    };
    render(<BookingHeldCard booking={booking} priceChanged onExpired={vi.fn()} />);
    expect(screen.getByText("GBK-TEST")).toBeVisible();
    expect(screen.getByText("120.000 ₫")).toBeVisible();
    expect(screen.getByText("240.000 ₫")).toBeVisible();
    expect(screen.getByText("HELD")).toBeVisible();
    expect(screen.getByText(/Giá đã được cập nhật/)).toBeVisible();
  });
});
