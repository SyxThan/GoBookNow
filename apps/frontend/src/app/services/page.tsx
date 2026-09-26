import type { Metadata } from "next";
import { Suspense } from "react";
import { ServicesSearch } from "./services-search";

export const metadata: Metadata = {
  title: "Khám phá dịch vụ | GoBook",
  description: "Tìm dịch vụ và sự kiện theo thời gian, giá và địa điểm.",
};

function SearchFallback() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-16 text-slate-100">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-5 w-28 rounded bg-slate-800" />
        <div className="mt-6 h-12 max-w-xl rounded bg-slate-800" />
        <div className="mt-10 grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="h-96 rounded-3xl bg-slate-900" />
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-80 rounded-3xl bg-slate-900" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <ServicesSearch />
    </Suspense>
  );
}
