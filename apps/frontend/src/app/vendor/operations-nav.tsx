import Link from "next/link";

export function OperationsNav({ current }: { current: "bookings" | "dashboard" }) {
  return <nav aria-label="Vendor operations" className="mb-8 flex flex-wrap gap-3">
    <Link href="/vendor/dashboard" aria-current={current === "dashboard" ? "page" : undefined}
      className={current === "dashboard" ? "primary-button" : "secondary-button"}>Tổng quan</Link>
    <Link href="/vendor/bookings" aria-current={current === "bookings" ? "page" : undefined}
      className={current === "bookings" ? "primary-button" : "secondary-button"}>Booking</Link>
    <Link href="/vendor/check-in" className="secondary-button">Check-in vé</Link>
    <Link href="/vendor/profile" className="secondary-button">Hồ sơ Vendor</Link>
  </nav>;
}
