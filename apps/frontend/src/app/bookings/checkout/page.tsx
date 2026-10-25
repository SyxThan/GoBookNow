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
    <main className="min-h-[70vh] bg-canvas px-5 py-12 text-ink">
      <div className="mx-auto max-w-5xl animate-pulse">
        <div className="h-6 w-40 rounded bg-soft" />
        <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_340px]">
          <div className="h-96 rounded-2xl bg-surface" />
          <div className="h-72 rounded-2xl bg-surface" />
        </div>
      </div>
    </main>
  );
}
