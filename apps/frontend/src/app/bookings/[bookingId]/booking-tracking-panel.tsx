"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getMyBooking,
  initiateSePayPayment,
  type CustomerBooking,
} from "@/lib/api-client";
import { usePortalSession } from "@gobook/auth/use-session";
import { calculateCountdown } from "@/hooks/use-countdown";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { submitExternalPaymentForm } from "@/lib/payment-form";
import { EmptyState, StatusBadge } from "@/components/ui/primitives";

const displayLabels: Record<CustomerBooking["displayStatus"], string> = {
  WAITING_PAYMENT: "Chờ thanh toán",
  WAITING_CONFIRMATION: "Đang chờ xác nhận thanh toán",
  CONFIRMED: "Đã xác nhận",
  EXPIRED: "Đã hết hạn",
  CANCELLED: "Đã hủy",
  REFUND_PENDING: "Đang xử lý hoàn tiền",
  REFUND_COMPLETED: "Đã hoàn tiền",
};
const paymentLabels = {
  PENDING: "Đang chờ",
  SUCCEEDED: "Đã nhận",
  EXPIRED: "Đã hết hạn",
  CANCELLED: "Đã hủy",
} as const;
const bookingLabels = {
  PENDING_PAYMENT: "Đang giữ chỗ",
  CONFIRMED: "Đã xác nhận",
  EXPIRED: "Đã hết hạn",
  CANCELLED: "Đã hủy",
} as const;

export function BookingTrackingPanel({ bookingId }: { bookingId: string }) {
  const { ready, token, onToken } = usePortalSession();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [providerError, setProviderError] = useState("");
  const deadlineRef = useRef<string | null>(null);
  const previousStatus = useRef<CustomerBooking["bookingStatus"] | null>(null);
  const [startedAt] = useState(() => Date.now());
  const bookingQuery = useQuery({
    queryKey: ["customer-booking-detail", token, bookingId],
    enabled: ready,
    queryFn: ({ signal }) => getMyBooking(bookingId, token, onToken, signal),
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      const booking = query.state.data as CustomerBooking | undefined;
      return booking &&
        booking.bookingStatus === "PENDING_PAYMENT" &&
        Date.now() - startedAt < 15 * 60_000 &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
        ? 5_000
        : false;
    },
    refetchIntervalInBackground: false,
  });
  const booking = bookingQuery.data;
  const offset = booking
    ? Date.parse(booking.serverTime) - bookingQuery.dataUpdatedAt
    : 0;
  const countdown = calculateCountdown(
    booking?.expiresAt ?? null,
    now + offset,
  );

  useEffect(() => {
    const currentStatus = booking?.bookingStatus ?? null;
    if (
      previousStatus.current === "PENDING_PAYMENT" &&
      currentStatus === "CONFIRMED"
    ) {
      void queryClient.invalidateQueries({
        queryKey: ["customer-booking-tickets", bookingId],
      });
      void queryClient.invalidateQueries({ queryKey: ["customer-bookings"] });
    }
    previousStatus.current = currentStatus;
  }, [booking?.bookingStatus, bookingId, queryClient]);

  useEffect(() => {
    if (booking?.bookingStatus !== "PENDING_PAYMENT" || countdown.isExpired)
      return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [booking?.bookingStatus, countdown.isExpired]);
  useEffect(() => {
    if (
      !booking?.expiresAt ||
      booking.bookingStatus !== "PENDING_PAYMENT" ||
      !countdown.isExpired ||
      deadlineRef.current === booking.expiresAt
    )
      return;
    deadlineRef.current = booking.expiresAt;
    void bookingQuery.refetch();
  }, [
    booking?.expiresAt,
    booking?.bookingStatus,
    countdown.isExpired,
    bookingQuery,
  ]);

  const pay = useMutation({
    mutationFn: () => initiateSePayPayment(bookingId, token, onToken),
    retry: false,
    onSuccess: (payment) => {
      void queryClient.invalidateQueries({ queryKey: ["customer-bookings"] });
      void bookingQuery.refetch();
      window.setTimeout(() => {
        try {
          submitExternalPaymentForm(payment);
        } catch {
          setProviderError(
            "Chưa thể mở trang thanh toán. Vui lòng kiểm tra lại trạng thái đơn.",
          );
        }
      }, 50);
    },
  });

  if (bookingQuery.isPending)
    return (
      <main className="page-wrap">
        <p role="status">Đang tải trạng thái đặt chỗ…</p>
      </main>
    );
  if (bookingQuery.isError || !booking)
    return (
      <main className="page-wrap">
        <EmptyState
          title={
            bookingQuery.error instanceof ApiError &&
            bookingQuery.error.status === 401
              ? "Vui lòng đăng nhập"
              : "Chưa thể mở đơn đặt chỗ"
          }
          action={
            bookingQuery.error instanceof ApiError &&
            bookingQuery.error.status === 401 ? (
              <Link href="/login" className="primary-button">
                Đăng nhập
              </Link>
            ) : (
              <button
                className="primary-button"
                onClick={() => void bookingQuery.refetch()}
              >
                Thử lại
              </button>
            )
          }
        >
          {bookingQuery.error instanceof ApiError &&
          bookingQuery.error.status === 404
            ? "Không tìm thấy đơn trong tài khoản của bạn."
            : "Kiểm tra kết nối hoặc đăng nhập lại."}
        </EmptyState>
      </main>
    );

  const canPay = booking.canInitiatePayment && !countdown.isExpired;
  const latePayment =
    booking.bookingStatus === "EXPIRED" &&
    booking.paymentSummary?.status === "SUCCEEDED";
  return (
    <main className="page-wrap">
      <Link href="/bookings" className="text-sm font-semibold text-info">
        ← Đơn của tôi
      </Link>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Đơn {booking.bookingCode}</p>
          <h1 className="mt-3 text-3xl sm:text-4xl">Chi tiết đặt chỗ</h1>
          <p className="mt-2 text-sm text-muted">
            Tạo ngày {formatDate(booking.createdAt)}
          </p>
        </div>
        <StatusBadge status={booking.bookingStatus} />
      </header>
      <section
        className="panel mt-7 overflow-hidden"
        aria-label="Trạng thái thanh toán"
      >
        <div
          className={`border-b-2 border-line p-6 ${booking.displayStatus === "CONFIRMED" ? "bg-mint" : booking.displayStatus === "EXPIRED" || booking.displayStatus === "REFUND_PENDING" ? "bg-coral/30" : "bg-sun/40"}`}
        >
          <p className="eyebrow">Trạng thái hiện tại</p>
          <h2 className="mt-2 text-2xl">
            {displayLabels[booking.displayStatus]}
          </h2>
          {booking.displayStatus === "WAITING_CONFIRMATION" && (
            <p className="mt-2 text-sm">
              Nếu bạn đã thanh toán, hệ thống sẽ cập nhật khi nhận được xác nhận
              từ SePay.
            </p>
          )}
          {booking.displayStatus === "CONFIRMED" && (
            <p className="mt-2 text-sm">Đặt chỗ đã được xác nhận.</p>
          )}
          {latePayment && (
            <p className="mt-2 text-sm font-semibold text-danger">
              Đã ghi nhận tiền sau khi đơn hết hạn. Đơn vẫn chưa được xác nhận;
              khoản tiền đang được đối soát hoặc hoàn lại.
            </p>
          )}
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <dl className="grid gap-3 text-sm">
            <Detail
              label="Đơn đặt chỗ"
              value={bookingLabels[booking.bookingStatus]}
            />
            <Detail
              label="Thanh toán"
              value={
                booking.paymentSummary
                  ? paymentLabels[booking.paymentSummary.status]
                  : "Chưa bắt đầu"
              }
            />
            <Detail
              label="Số tiền"
              value={formatMoney(
                booking.paymentSummary?.amount ?? booking.totalAmount,
                booking.currency,
              )}
            />
            {booking.paymentSummary?.merchantReference && (
              <Detail
                label="Mã tham chiếu SePay"
                value={booking.paymentSummary.merchantReference}
              />
            )}
            <Detail
              label="Cập nhật lúc"
              value={new Date(bookingQuery.dataUpdatedAt).toLocaleTimeString(
                "vi-VN",
              )}
            />
          </dl>
          <div className="rounded-xl border-2 border-line bg-canvas p-5">
            {booking.bookingStatus === "PENDING_PAYMENT" &&
              booking.expiresAt && (
                <>
                  <p className="text-sm text-muted">
                    Hạn giữ chỗ: {formatDate(booking.expiresAt)} ·{" "}
                    {formatTime(booking.expiresAt)}
                  </p>
                  <p
                    className="mt-3 font-mono text-3xl font-bold tabular-nums"
                    aria-label={`Thời gian giữ chỗ còn ${countdown.minutes} phút ${countdown.seconds} giây`}
                  >
                    {countdown.isExpired
                      ? "Đã hết hạn"
                      : `${String(countdown.minutes).padStart(2, "0")}:${String(countdown.seconds).padStart(2, "0")}`}
                  </p>
                </>
              )}
            {canPay && (
              <button
                className="primary-button mt-5 w-full"
                disabled={pay.isPending}
                onClick={() => pay.mutate()}
              >
                {pay.isPending ? "Đang mở SePay…" : "Thanh toán ngay"}
              </button>
            )}
            {booking.paymentSummary?.status === "PENDING" && (
              <p className="mt-4 text-sm text-muted">
                Đã bắt đầu thanh toán. Hãy kiểm tra lại kết quả trước khi thực
                hiện giao dịch khác.
              </p>
            )}
            {booking.bookingStatus === "CONFIRMED" &&
              (booking.ticketCount ? (
                <a className="primary-button mt-5" href="#tickets">
                  Xem vé QR
                </a>
              ) : (
                <p className="mt-5 text-sm font-semibold">
                  Đang chuẩn bị vé. Hãy kiểm tra lại sau ít phút.
                </p>
              ))}
            {(booking.displayStatus === "EXPIRED" ||
              booking.bookingStatus === "CANCELLED") && (
              <Link className="secondary-button mt-5" href="/services">
                Đặt lại với lịch mới
              </Link>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="secondary-button"
                disabled={bookingQuery.isFetching}
                onClick={() => void bookingQuery.refetch()}
              >
                {bookingQuery.isFetching ? "Đang kiểm tra…" : "Kiểm tra lại"}
              </button>
              <Link className="ghost-button" href="/bookings">
                Đơn của tôi
              </Link>
            </div>
            {(pay.isError || providerError) && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {providerError ||
                  (pay.error instanceof ApiError
                    ? pay.error.message
                    : "Chưa thể mở thanh toán. Vui lòng thử lại.")}
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="panel mt-7 p-6">
        <h2 className="text-xl">Dịch vụ đã đặt</h2>
        <ul className="mt-4 divide-y divide-line/20">
          {booking.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap justify-between gap-3 py-4"
            >
              <div>
                <p className="font-semibold">{item.serviceTitle}</p>
                <p className="text-sm text-muted">
                  {formatDate(item.slotStartAt)} ·{" "}
                  {formatTime(item.slotStartAt)}–{formatTime(item.slotEndAt)} ·{" "}
                  {item.quantity} chỗ
                </p>
              </div>
              <p className="font-semibold">
                {formatMoney(item.subtotalAmount, booking.currency)}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t-2 border-line pt-4 text-sm">
          <p className="flex justify-between">
            <span>Tạm tính</span>
            <span>{formatMoney(booking.subtotalAmount, booking.currency)}</span>
          </p>
          {booking.voucherDiscountAmount !== "0" && (
            <p className="mt-2 flex justify-between">
              <span>Ưu đãi</span>
              <span>
                -{formatMoney(booking.voucherDiscountAmount, booking.currency)}
              </span>
            </p>
          )}
          <p className="mt-4 flex justify-between text-lg font-bold">
            <span>Tổng thanh toán</span>
            <span>{formatMoney(booking.totalAmount, booking.currency)}</span>
          </p>
        </div>
      </section>
      {booking.refunds.length > 0 && (
        <section className="panel mt-7 p-6">
          <h2 className="text-xl">Hoàn tiền</h2>
          <ul className="mt-4 space-y-3">
            {booking.refunds.map((refund) => (
              <li
                key={refund.id}
                className="flex flex-wrap justify-between gap-3 rounded-xl bg-canvas p-4"
              >
                <span>
                  {refund.status === "PENDING"
                    ? "Đang xử lý"
                    : refund.status === "SUCCEEDED"
                      ? "Đã hoàn tiền"
                      : "Đã hủy hoàn tiền"}
                </span>
                <strong>{formatMoney(refund.amount, refund.currency)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-3 border-b border-line/10 pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
