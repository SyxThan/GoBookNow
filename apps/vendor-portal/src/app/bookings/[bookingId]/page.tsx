import type { Metadata } from "next";
import VendorBookingDetailClient from "@/features/bookings/[bookingId]/vendor-booking-detail-client";

export const metadata: Metadata = { title: "Chi tiết Booking | GoBook Vendor" };
export default async function VendorBookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <VendorBookingDetailClient bookingId={bookingId} />;
}
