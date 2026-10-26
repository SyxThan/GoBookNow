"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getVendorBooking } from "@/lib/vendor-operations";
import { OperationsNav } from "../../operations-nav";
import { usePortalSession } from "@gobook/auth/use-session";

export default function VendorBookingDetailClient({
  bookingId,
}: {
  bookingId: string;
}) {
  const { ready, token, onToken } = usePortalSession();
  const query = useQuery({
    queryKey: ["vendor", "booking", bookingId],
    enabled: ready,
    queryFn: ({ signal }) =>
      getVendorBooking(bookingId, token, onToken, signal),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const booking = query.data;
  const money = (value: string | null) =>
    value === null
      ? "Không có snapshot commission"
      : formatMoney(value, booking?.currency);
  return (
    <main className="min-h-[70vh] bg-canvas px-4 py-10 text-ink sm:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="eyebrow">GoBook Vendor · Booking</p>
        <h1 className="mt-3 text-3xl font-bold">
          {booking?.bookingCode ?? "Chi tiết Booking"}
        </h1>
        <div className="mt-7">
          <OperationsNav current="bookings" />
        </div>
        <Link href="/bookings" className="text-info hover:underline">
          ← Quay lại danh sách
        </Link>
        {query.isPending && (
          <div role="status" className="panel mt-6 p-8">
            Đang tải chi tiết…
          </div>
        )}
        {query.error && (
          <div role="alert" className="panel mt-6 p-8 text-danger">
            {query.error instanceof ApiError && query.error.status === 404
              ? "Không tìm thấy Booking thuộc Vendor này."
              : query.error instanceof ApiError && query.error.status === 403
                ? "Bạn cần hồ sơ Vendor đã được duyệt."
                : query.error instanceof ApiError && query.error.status === 401
                  ? "Phiên đăng nhập đã hết hạn."
                  : "Không thể tải chi tiết Booking."}
            <button
              className="ml-3 underline"
              onClick={() => void query.refetch()}
            >
              Thử lại
            </button>
          </div>
        )}
        {booking && (
          <div className="mt-6 space-y-6">
            <section className="panel grid gap-4 p-6 sm:grid-cols-3">
              <div>
                <p className="section-label">Trạng thái</p>
                <p className="mt-2 font-bold">
                  {booking.operationalStatus} · {booking.status}
                </p>
              </div>
              <div>
                <p className="section-label">Ngày đặt</p>
                <p className="mt-2">{formatDateTime(booking.createdAt)}</p>
              </div>
              <div>
                <p className="section-label">Thanh toán</p>
                <p className="mt-2">
                  {booking.payment?.status ?? "Chưa tạo Payment"}
                </p>
              </div>
            </section>
            <section className="panel p-6">
              <h2 className="text-xl font-bold">Dịch vụ / lịch và vé</h2>
              <div className="mt-4 space-y-4">
                {booking.items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-line/10 bg-canvas p-4"
                  >
                    <h3 className="font-bold">{item.serviceTitle}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {formatDateTime(item.startAt)} –{" "}
                      {formatDateTime(item.endAt)} · {item.quantity} vé
                    </p>
                    <p className="mt-2 text-sm text-ink">
                      Vé: {item.tickets.issued} chưa check-in ·{" "}
                      {item.tickets.checkedIn} đã check-in ·{" "}
                      {item.tickets.voided} vô hiệu
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      Trước giảm:{" "}
                      {formatMoney(item.grossAmount, booking.currency)} · Giảm:{" "}
                      {formatMoney(item.discountAmount, booking.currency)} ·
                      Net: {formatMoney(item.netAmount, booking.currency)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Phí nền tảng: {money(item.platformFeeAmount)} · Vendor dự
                      kiến: {money(item.vendorAmount)}
                    </p>
                  </article>
                ))}
              </div>
              <Link
                href="/check-in"
                className="mt-5 inline-block text-info hover:underline"
              >
                Mở quy trình check-in hiện có →
              </Link>
            </section>
            <section className="panel p-6">
              <h2 className="text-xl font-bold">Phân bổ tài chính gốc</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="section-label">Tổng giá trị trước giảm giá</dt>
                  <dd className="mt-1">
                    {formatMoney(booking.grossAmount, booking.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="section-label">Giảm giá Voucher</dt>
                  <dd className="mt-1">
                    {formatMoney(booking.discountAmount, booking.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="section-label">Khách thanh toán</dt>
                  <dd className="mt-1">
                    {formatMoney(booking.netAmount, booking.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="section-label">Phí nền tảng</dt>
                  <dd className="mt-1">{money(booking.platformFeeAmount)}</dd>
                </div>
                <div>
                  <dt className="section-label">Doanh thu Vendor dự kiến</dt>
                  <dd className="mt-1">{money(booking.vendorAmount)}</dd>
                </div>
                <div>
                  <dt className="section-label">Tỷ lệ commission gốc</dt>
                  <dd className="mt-1">
                    {booking.commissionBps === null
                      ? "Không có snapshot"
                      : `${(booking.commissionBps / 100).toFixed(2)}%`}
                  </dd>
                </div>
              </dl>
              <p className="mt-5 text-sm text-muted">
                Đây là phân bổ tại thời điểm tạo Booking, không phải xác nhận đã
                chuyển tiền cho Vendor.
              </p>
            </section>
            {(booking.cancellation ||
              booking.refunds.pendingAmount !== "0" ||
              booking.refunds.succeededAmount !== "0") && (
              <section className="panel p-6">
                <h2 className="text-xl font-bold">Hủy / hoàn tiền</h2>
                <p className="mt-3">
                  Hoàn thành công:{" "}
                  {formatMoney(
                    booking.refunds.succeededAmount,
                    booking.currency,
                  )}
                </p>
                <p className="mt-2">
                  Hoàn đang chờ:{" "}
                  {formatMoney(booking.refunds.pendingAmount, booking.currency)}
                </p>
                {booking.retained && (
                  <>
                    <p className="mt-2">
                      Doanh thu đã giữ lại:{" "}
                      {formatMoney(
                        booking.retained.netAmount,
                        booking.currency,
                      )}
                    </p>
                    <p className="mt-2">
                      Phí nền tảng giữ lại ước tính:{" "}
                      {money(booking.retained.platformFeeAmount)} · Vendor giữ
                      lại ước tính: {money(booking.retained.vendorAmount)}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      Nếu hoàn đang chờ hoàn tất:{" "}
                      {formatMoney(
                        booking.retained.projectedNetAfterPending,
                        booking.currency,
                      )}{" "}
                      (dự phóng, chưa phải số đã quyết toán).
                    </p>
                  </>
                )}
                {booking.cancellation && (
                  <p className="mt-2 text-sm text-muted">
                    Yêu cầu hủy:{" "}
                    {formatDateTime(booking.cancellation.requestedAt)} · Phí
                    hủy:{" "}
                    {formatMoney(
                      booking.cancellation.cancellationFeeAmount,
                      booking.currency,
                    )}
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
