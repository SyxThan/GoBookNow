"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { ApiError, createBookingReview, deleteBookingReview, getBookingReview,
  getBookingReviewEligibility, updateBookingReview } from "@/lib/api-client";

export function BookingReviewPanel({ bookingId, accessToken, onToken }: {
  bookingId: string; accessToken: string | null; onToken: (token: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState("");
  const eligibility = useQuery({ queryKey: ["booking-review-eligibility", bookingId],
    queryFn: ({ signal }) => getBookingReviewEligibility(bookingId, accessToken, onToken, signal),
    retry: false, staleTime: 0, refetchOnWindowFocus: "always" });
  const review = useQuery({ queryKey: ["booking-review", bookingId],
    queryFn: ({ signal }) => getBookingReview(bookingId, accessToken, onToken, signal),
    enabled: Boolean(eligibility.data?.reviewId), retry: false, staleTime: 0 });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["booking-review-eligibility", bookingId] }),
      queryClient.invalidateQueries({ queryKey: ["booking-review", bookingId] }),
    ]);
  };
  const save = useMutation({ mutationFn: () => {
    const input = { rating, comment: comment.trim() };
    return review.data && eligibility.data?.reviewId ? updateBookingReview(review.data.id, input, accessToken, onToken) :
      createBookingReview(bookingId, input, accessToken, onToken);
  }, onSuccess: async () => { setNotice("Đã lưu đánh giá."); setEditing(false); await refresh(); } });
  const remove = useMutation({ mutationFn: () => deleteBookingReview(review.data!.id, accessToken, onToken),
    onSuccess: async () => { setNotice("Đã xóa đánh giá. Booking này không thể tạo Review thứ hai.");
      setConfirmDelete(false); setEditing(false); await refresh(); } });
  const open = () => { setRating(review.data?.rating ?? 5); setComment(review.data?.comment ?? "");
    setNotice(""); setEditing(true); save.reset(); };
  const submit = (event: FormEvent) => { event.preventDefault(); if (rating >= 1 && rating <= 5 && comment.length <= 2000) save.mutate(); };
  const error = save.error ?? remove.error;

  return <section className="panel mt-8 p-6" aria-label="Đánh giá Booking">
    <h2 className="text-xl font-bold">Đánh giá trải nghiệm</h2>
    <p className="mt-2 text-sm text-muted">Một Booking có tối đa một đánh giá cho toàn bộ trải nghiệm với Vendor.</p>
    {eligibility.isPending && <p role="status" className="mt-4">Đang kiểm tra điều kiện đánh giá…</p>}
    {eligibility.error && <p role="alert" className="mt-4 text-danger">
      {eligibility.error instanceof ApiError && eligibility.error.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Không thể kiểm tra điều kiện đánh giá."}
      <button className="ml-3 underline" onClick={() => void eligibility.refetch()}>Thử lại</button></p>}
    {eligibility.data?.reason === "REVIEW_BOOKING_NOT_COMPLETED" && <p className="mt-4 text-muted">Booking chỉ có thể được đánh giá khi mọi lịch đã kết thúc và Booking đã xác nhận.</p>}
    {eligibility.data?.reason === "REVIEW_BOOKING_CANCELLED" && <p className="mt-4 text-muted">Booking đã hủy không thể đánh giá.</p>}
    {eligibility.data?.reviewDeleted && <p className="mt-4 text-muted">Đánh giá đã được xóa. Mỗi Booking chỉ có một Review, kể cả sau khi xóa.</p>}
    {review.isPending && eligibility.data?.reviewId && <p role="status" className="mt-4">Đang tải đánh giá…</p>}
    {review.error && <p role="alert" className="mt-4 text-danger">Không thể tải đánh giá. <button className="underline" onClick={() => void review.refetch()}>Thử lại</button></p>}
    {review.data && eligibility.data?.reviewId && !editing && <div className="mt-5 rounded-2xl border border-line/10 bg-canvas p-4">
      <p aria-label={`${review.data.rating} trên 5 sao`} className="text-warning">{"★".repeat(review.data.rating)}{"☆".repeat(5 - review.data.rating)}</p>
      {review.data.comment && <p className="mt-3 whitespace-pre-wrap text-ink">{review.data.comment}</p>}
      <div className="mt-5 flex flex-wrap gap-3"><button className="secondary-button" onClick={open}>Chỉnh sửa đánh giá</button>
        <button className="secondary-button" onClick={() => setConfirmDelete(true)}>Xóa đánh giá</button></div>
      {confirmDelete && <div className="mt-4 rounded-xl border border-danger/30 p-4">
        <p className="text-sm text-danger">Xóa Review này? Bạn sẽ không thể tạo Review mới cho cùng Booking.</p>
        <div className="mt-3 flex gap-3"><button className="secondary-button" onClick={() => remove.mutate()} disabled={remove.isPending}>Xác nhận xóa</button>
          <button className="secondary-button" onClick={() => setConfirmDelete(false)}>Giữ lại</button></div></div>}
    </div>}
    {eligibility.data?.eligible && !editing && <button className="primary-button mt-5" onClick={open}>Đánh giá trải nghiệm</button>}
    {editing && <form className="mt-5 space-y-4" onSubmit={submit}>
      <fieldset><legend className="mb-2 text-sm text-ink">Chọn số sao</legend><div className="flex flex-wrap gap-3">
        {[1, 2, 3, 4, 5].map((value) => <label key={value} className="cursor-pointer rounded-lg border border-line p-2">
          <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} className="mr-2" />{value} ★
        </label>)}
      </div></fieldset>
      <label className="block text-sm text-ink">Nhận xét (không bắt buộc)
        <textarea className="input mt-2 min-h-28" value={comment} maxLength={2000}
          onChange={(event) => setComment(event.target.value)} placeholder="Chia sẻ trải nghiệm của bạn" />
      </label>
      <div className="flex gap-3"><button className="primary-button" type="submit" disabled={save.isPending}>Lưu đánh giá</button>
        <button className="secondary-button" type="button" onClick={() => setEditing(false)}>Hủy</button></div>
    </form>}
    {error && <p role="alert" className="mt-4 text-danger">{error instanceof ApiError ? error.message : "Không thể lưu thay đổi. Vui lòng thử lại."}</p>}
    {notice && <p role="status" className="mt-4 text-info">{notice}</p>}
  </section>;
}
