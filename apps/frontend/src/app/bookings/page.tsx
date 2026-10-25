import type { Metadata } from "next";
import { BookingsHub } from "./bookings-hub";
export const metadata: Metadata = { title: "Đặt chỗ & vé của tôi" };
export default function BookingsPage() {
  return <BookingsHub />;
}
