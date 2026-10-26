import type { Metadata } from "next";
import VendorBookingsClient from "@/features/bookings/vendor-bookings-client";

export const metadata: Metadata = { title: "Booking | GoBook Vendor" };
export default function VendorBookingsPage() {
  return <VendorBookingsClient />;
}
