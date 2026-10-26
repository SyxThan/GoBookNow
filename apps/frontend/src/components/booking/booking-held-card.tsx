"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { BookingHoldResponse } from "@/lib/api-client";
import { useCountdown } from "@/hooks/use-countdown";
import {
  canInitiateSePay,
  isPositiveIntegerAmount,
  type CheckoutPaymentState,
} from "@/lib/checkout-payment-state";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { StatusBadge } from "@/components/ui/primitives";

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
      <div className="border-b border-line/20 bg-sun/30 p-6 sm:p-8">
        <p className="eyebrow">Chỗ của bạn đang được giữ</p>
        <h1 id="held-title" className="mt-3 text-3xl font-bold text-ink">
          Booking của bạn đang được giữ tạm thời.
        </h1>
        <p className="mt-3 text-sm text-ink">
          Booking <strong className="text-ink">{booking.bookingCode}</strong> ·{" "}
          <StatusBadge status={booking.status} />
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
          <HeldRow
            label="Trạng thái giữ chỗ"
            value={
              {
                HELD: "Đang giữ chỗ",
                CONFIRMED: "Đã xác nhận",
                RELEASED: "Đã trả chỗ",
                EXPIRED: "Đã hết hạn",
              }[item.reservation.status]
            }
          />
          {booking.voucherCode && (
            <HeldRow
              label="Tạm tính"
              value={formatMoney(booking.subtotalAmount, booking.currency)}
            />
          )}
          {booking.voucherCode && (
            <HeldRow
              label={`Voucher ${booking.voucherCode}`}
              value={`-${formatMoney(booking.voucherDiscountAmount ?? "0", booking.currency)}`}
            />
          )}
          <div className="flex justify-between gap-6 border-t border-line/10 pt-5">
            <dt className="font-bold text-ink">Tổng chính thức</dt>
            <dd className="text-2xl font-bold text-info">
              {formatMoney(booking.totalAmount, booking.currency)}
            </dd>
          </div>
          {priceChanged && (
            <p className="rounded-xl border border-warning/30 bg-sun/30 p-3 text-warning">
              Giá đã được cập nhật trước khi giữ chỗ. Giá phía trên là giá trị
              chính thức đã được xác nhận.
            </p>
          )}
        </dl>

        <aside className="rounded-2xl border border-line/10 bg-canvas p-5">
          <p className="eyebrow">Thanh toán</p>
          <div className="mt-4 border-b border-line/10 pb-4">
            <p className="text-sm text-muted">Tổng tiền</p>
            <p className="mt-1 text-2xl font-bold text-info">
              {formatMoney(booking.totalAmount, booking.currency)}
            </p>
          </div>
          <div className="border-b border-line/10 py-4">
            <p className="text-sm text-muted">Phương thức</p>
            <p className="mt-1 font-medium text-ink">
              SePay / Chuyển khoản ngân hàng
            </p>
          </div>
          <p className="mt-4 text-sm text-muted">Giữ chỗ còn</p>
          <p
            data-countdown
            className={`mt-2 break-all text-center font-mono text-4xl font-bold tabular-nums ${
              urgent ? "text-warning" : "text-ink"
            }`}
            aria-label={`Thời gian giữ chỗ còn lại ${countdown.minutes} phút ${countdown.seconds} giây`}
          >
            {time}
          </p>
          {urgent && (
            <p
              className="mt-3 text-center text-sm font-medium text-warning"
              role="status"
            >
              Thời gian giữ chỗ sắp hết.
            </p>
          )}
          {countdown.isExpired && (
            <p className="mt-4 text-sm font-medium text-danger" role="status">
              Phiên giữ chỗ đã hết hạn.
            </p>
          )}
          {freeBooking && (
            <p className="mt-4 text-sm text-warning" role="status">
              Booking miễn phí chưa có luồng xác nhận tự động qua SePay.
            </p>
          )}
          {paymentState.step === "ERROR" && (
            <p
              id="payment-initiation-error"
              className="mt-4 rounded-xl border border-danger/30 bg-coral/30 p-3 text-sm text-danger"
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
          <p
            id="payment-provider-note"
            className="mt-3 text-xs leading-5 text-muted"
          >
            Bạn sẽ được chuyển sang trang thanh toán bảo mật của SePay để quét
            mã QR.
          </p>
          <p className="mt-5 text-sm text-muted">
            Bạn có thể quay lại kiểm tra đơn này bất cứ lúc nào trong Đơn của
            tôi.
          </p>
          <div className="mt-4 grid gap-2">
            <Link
              className="secondary-button"
              href={`/bookings/${encodeURIComponent(booking.id)}`}
            >
              Xem chi tiết đơn
            </Link>
            <Link className="ghost-button" href="/bookings">
              Đơn của tôi
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}

function HeldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-line/5 pb-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
