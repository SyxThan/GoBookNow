import type { Metadata } from "next";
import VendorBookingsClient from "./vendor-bookings-client";

export const metadata: Metadata = { title: "Booking | GoBook Vendor" };
export default function VendorBookingsPage() { return <VendorBookingsClient />; }
