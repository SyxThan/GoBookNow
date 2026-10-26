import type { Metadata } from "next";
import { BookingsHub } from "./bookings-hub";
export const metadata: Metadata = { title: "Đơn đặt chỗ của tôi" };
export default function BookingsPage() {
  return <BookingsHub />;
}
