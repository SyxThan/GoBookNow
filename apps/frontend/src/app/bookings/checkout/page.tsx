import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingCheckoutClient } from "./booking-checkout-client";

export const metadata: Metadata = {
  title: "Xác nhận booking | GoBook",
  description: "Kiểm tra booking và giữ chỗ trước khi thanh toán.",
};

export default function BookingCheckoutPage() {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <BookingCheckoutClient />
    </Suspense>
  );
}

function CheckoutSkeleton() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl animate-pulse">
        <div className="h-6 w-40 rounded bg-slate-800" />
        <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_340px]">
          <div className="h-96 rounded-3xl bg-slate-900" />
          <div className="h-72 rounded-3xl bg-slate-900" />
        </div>
      </div>
    </main>
  );
}
