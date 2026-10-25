"use client";

import { useEffect } from "react";
import { reportUnexpected } from "@/lib/monitoring";

export default function ApplicationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportUnexpected(error);
  }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 text-slate-100">
      <section role="alert" className="panel p-8 text-center">
        <h1 className="text-3xl font-semibold">Đã xảy ra lỗi hệ thống</h1>
        <p className="mt-4">Vui lòng thử lại sau.</p>
        <button className="primary-button mt-5" onClick={reset}>
          Thử lại
        </button>
      </section>
    </main>
  );
}
