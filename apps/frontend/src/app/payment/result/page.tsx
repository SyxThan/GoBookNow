import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentResultClient } from "./payment-result-client";

export const metadata: Metadata = {
  title: "Kết quả thanh toán | GoBook",
  description: "Kiểm tra trạng thái thanh toán và đặt chỗ từ GoBook.",
};

function PaymentResultFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 text-slate-100">
      <section className="panel w-full max-w-xl p-8 text-center sm:p-12">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-teal-300" />
        <h1 className="mt-7 text-2xl font-semibold">
          Đang kiểm tra trạng thái thanh toán…
        </h1>
      </section>
    </main>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<PaymentResultFallback />}>
      <PaymentResultClient />
    </Suspense>
  );
}
