"use client";

import { useEffect, useRef } from "react";
import type { BookingHoldResponse } from "@/lib/api-client";
import { useCountdown } from "@/hooks/use-countdown";
import {
  canInitiateSePay,
  isPositiveIntegerAmount,
  type CheckoutPaymentState,
} from "@/lib/checkout-payment-state";
import { formatDate, formatMoney, formatTime } from "@/lib/format";

export function BookingHeldCard({
  booking,
  priceChanged,
  paymentState,
  onPay,
  onExpired,
}: {
  booking: BookingHoldResponse;
  priceChanged: boolean;
  paymentState: CheckoutPaymentState;
  onPay: () => void;
  onExpired: () => void;
}) {
  const countdown = useCountdown(booking.expiresAt);
  const expiredNotified = useRef(false);
  const item = booking.items[0];

  useEffect(() => {
    if (countdown.isExpired && !expiredNotified.current) {
      expiredNotified.current = true;
      onExpired();
    }
  }, [countdown.isExpired, onExpired]);

  if (!item) return null;

  const time = `${String(countdown.minutes).padStart(2, "0")}:${String(
    countdown.seconds,
  ).padStart(2, "0")}`;
  const urgent = countdown.remainingMs > 0 && countdown.remainingMs <= 120_000;
  const freeBooking = !isPositiveIntegerAmount(booking.totalAmount);
  const canPay = canInitiateSePay({
    bookingStatus: booking.status,
    totalAmount: booking.totalAmount,
    isExpired: countdown.isExpired,
    paymentState,
  });

  return (
    <section className="panel overflow-hidden" aria-labelledby="held-title">
      <div className="border-b border-teal-300/20 bg-teal-300/10 p-6 sm:p-8">
        <p className="eyebrow">Reservation HELD</p>
        <h1 id="held-title" className="mt-3 text-3xl font-semibold text-white">
          Booking của bạn đang được giữ tạm thời.
        </h1>
        <p className="mt-3 text-sm text-slate-300">
          Booking <strong className="text-white">{booking.bookingCode}</strong> · trạng thái{" "}
          <strong className="text-white">{booking.status}</strong>
        </p>
      </div>

      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_280px]">
        <dl className="space-y-4 text-sm">
          <HeldRow label="Dịch vụ" value={item.serviceTitle} />
          <HeldRow label="Ngày" value={formatDate(item.startAt)} />
          <HeldRow
            label="Thời gian"
            value={`${formatTime(item.startAt)} – ${formatTime(item.endAt)}`}
          />
          <HeldRow label="Số lượng" value={String(item.quantity)} />
          <HeldRow
            label="Đơn giá chính thức"
            value={formatMoney(item.unitPriceAmount, booking.currency)}
          />
          <HeldRow label="Reservation" value={item.reservation.status} />
          <div className="flex justify-between gap-6 border-t border-white/10 pt-5">
            <dt className="font-semibold text-slate-300">Tổng chính thức</dt>
            <dd className="text-2xl font-semibold text-teal-200">
              {formatMoney(booking.totalAmount, booking.currency)}
            </dd>
          </div>
          {priceChanged && (
            <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-100">
              Giá đã được cập nhật trước khi reservation được tạo. Giá phía trên là
              snapshot chính thức từ backend.
            </p>
          )}
        </dl>

        <aside className="rounded-2xl border border-white/10 bg-slate-950 p-5">
          <p className="eyebrow">Thanh toán</p>
          <div className="mt-4 border-b border-white/10 pb-4">
            <p className="text-sm text-slate-400">Tổng tiền</p>
            <p className="mt-1 text-2xl font-semibold text-teal-200">
              {formatMoney(booking.totalAmount, booking.currency)}
            </p>
          </div>
          <div className="border-b border-white/10 py-4">
            <p className="text-sm text-slate-400">Phương thức</p>
            <p className="mt-1 font-medium text-white">
              SePay / Chuyển khoản ngân hàng
            </p>
          </div>
          <p className="mt-4 text-sm text-slate-400">Giữ chỗ còn</p>
          <p
            className={`mt-2 text-center font-mono text-5xl font-semibold tabular-nums ${
              urgent ? "text-amber-300" : "text-white"
            }`}
            aria-label={`Thời gian giữ chỗ còn lại ${countdown.minutes} phút ${countdown.seconds} giây`}
          >
            {time}
          </p>
          {urgent && (
            <p className="mt-3 text-center text-sm font-medium text-amber-200" role="status">
              Thời gian giữ chỗ sắp hết.
            </p>
          )}
          {countdown.isExpired && (
            <p className="mt-4 text-sm font-medium text-rose-200" role="status">
              Phiên giữ chỗ đã hết hạn.
            </p>
          )}
          {freeBooking && (
            <p className="mt-4 text-sm text-amber-100" role="status">
              Booking miễn phí chưa có luồng xác nhận tự động qua SePay.
            </p>
          )}
          {paymentState.step === "ERROR" && (
            <p
              id="payment-initiation-error"
              className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm text-rose-100"
              role="alert"
            >
              {paymentState.message}
            </p>
          )}
          <button
            type="button"
            className="primary-button mt-6 w-full"
            disabled={!canPay}
            aria-describedby={
              paymentState.step === "ERROR"
                ? "payment-initiation-error payment-provider-note"
                : "payment-provider-note"
            }
            onClick={onPay}
          >
            {paymentState.step === "INITIATING_PAYMENT"
              ? "Đang khởi tạo thanh toán..."
              : paymentState.step === "REDIRECTING"
                ? "Đang chuyển đến SePay..."
                : paymentState.step === "ERROR" && paymentState.retryable
                  ? "Thử thanh toán lại"
                  : "Thanh toán với SePay"}
          </button>
          <p id="payment-provider-note" className="mt-3 text-xs leading-5 text-slate-500">
            Bạn sẽ được chuyển sang trang thanh toán bảo mật của SePay để quét mã QR.
          </p>
        </aside>
      </div>
    </section>
  );
}

function HeldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-white/5 pb-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-200">{value}</dd>
    </div>
  );
}
