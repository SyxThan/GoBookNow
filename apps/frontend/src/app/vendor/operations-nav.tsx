import Link from "next/link";

export function OperationsNav({ current }: { current: "bookings" | "dashboard" }) {
  return <nav aria-label="Vị trí trong khu vực đối tác" className="mb-8 flex flex-wrap items-center gap-3 text-sm">
    <Link href="/vendor/dashboard" className="text-muted underline underline-offset-4">Không gian đối tác</Link><span aria-hidden="true">/</span><span className="font-bold">{current === "dashboard" ? "Tổng quan" : "Đặt chỗ"}</span>
  </nav>;
}
