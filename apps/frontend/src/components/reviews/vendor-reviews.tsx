"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getPublicVendorReviews } from "@/lib/api-client";

export function VendorReviews({ vendorId }: { vendorId: string }) {
  const [page, setPage] = useState(1);
  const reviews = useQuery({ queryKey: ["vendor-reviews", vendorId, page],
    queryFn: ({ signal }) => getPublicVendorReviews(vendorId, page, signal) });
  return <section className="panel mt-8 p-6" aria-label="Đánh giá Vendor">
    <h2 className="text-xl font-semibold">Đánh giá khách đã đặt</h2>
    {reviews.isPending && <p role="status" className="mt-4">Đang tải đánh giá…</p>}
    {reviews.isError && <p role="alert" className="mt-4 text-rose-300">Không thể tải đánh giá. <button className="underline" onClick={() => void reviews.refetch()}>Thử lại</button></p>}
    {reviews.data && <><p className="mt-3 text-slate-300">
      {reviews.data.reviewCount} đánh giá · {reviews.data.averageRating === null ? "Chưa có điểm" : `${reviews.data.averageRating}/5 ★`}
    </p>
      {reviews.data.reviewCount === 0 && <p className="mt-4 text-slate-400">Chưa có đánh giá.</p>}
      <div className="mt-5 space-y-4">{reviews.data.data.map((item, index) => <article key={`${item.createdAt}-${index}`} className="rounded-xl border border-white/10 p-4">
        <p className="text-amber-300" aria-label={`${item.rating} trên 5 sao`}>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</p>
        {item.comment && <p className="mt-2 whitespace-pre-wrap">{item.comment}</p>}
        <p className="mt-2 text-sm text-slate-400">{item.author} · {new Date(item.createdAt).toLocaleDateString("vi-VN")}</p></article>)}</div>
      {reviews.data.pagination.totalPages > 1 && <div className="mt-5 flex items-center gap-3">
        <button className="secondary-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
        <span>Trang {page} / {reviews.data.pagination.totalPages}</span>
        <button className="secondary-button" disabled={page >= reviews.data.pagination.totalPages} onClick={() => setPage(page + 1)}>Sau</button>
      </div>}</>}
  </section>;
}
