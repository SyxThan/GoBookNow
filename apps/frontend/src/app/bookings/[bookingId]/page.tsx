import type { Metadata } from "next";
import { BookingTicketsClient } from "./booking-tickets-client";

export const metadata: Metadata = {
  title: "Vé của tôi | GoBook",
  description: "Xem và tải mã QR vé điện tử GoBook.",
};

export default async function BookingTicketsPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <BookingTicketsClient bookingId={bookingId} />;
}
