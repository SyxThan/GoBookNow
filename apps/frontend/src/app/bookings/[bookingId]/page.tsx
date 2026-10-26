import type { Metadata } from "next";
import { BookingTicketsClient } from "./booking-tickets-client";
import { BookingTrackingPanel } from "./booking-tracking-panel";

export const metadata: Metadata = {
  title: "Chi tiết đặt chỗ | GoBook",
  description: "Theo dõi trạng thái đặt chỗ, thanh toán và vé điện tử GoBook.",
};

export default async function BookingTicketsPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return (
    <>
      <BookingTrackingPanel bookingId={bookingId} />
      <BookingTicketsClient bookingId={bookingId} />
    </>
  );
}
