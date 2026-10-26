"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ApiError,
  listMyBookings,
  type CustomerBooking,
} from "@/lib/api-client";
import { usePortalSession } from "@gobook/auth/use-session";
import {
  EmptyState,
  PageHeading,
  StatusBadge,
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { formatDate, formatMoney, formatTime } from "@/lib/format";

const tabs = [
  { label: "Tất cả", status: undefined },
  { label: "Chờ xử lý", status: "PENDING_PAYMENT" },
  { label: "Đã xác nhận", status: "CONFIRMED" },
  { label: "Hết hạn", status: "EXPIRED" },
  { label: "Đã hủy", status: "CANCELLED" },
] as const;
const paymentLabels = {
  PENDING: "Đang chờ xác nhận",
  SUCCEEDED: "Đã nhận thanh toán",
  EXPIRED: "Đã hết hạn",
  CANCELLED: "Đã hủy",
} as const;

export function BookingsHub() {
  const { ready, token, onToken } = usePortalSession();
  const [status, setStatus] = useState<
    CustomerBooking["bookingStatus"] | undefined
  >();
  const [searchInput, setSearchInput] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [filters, setFilters] = useState({ search: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["customer-bookings", token, status, filters, page],
    enabled: ready,
    queryFn: ({ signal }) =>
      listMyBookings(
        { status, ...filters, page, limit: 10 },
        token,
        onToken,
        signal,
      ),
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters({ search: searchInput.trim(), from: fromInput, to: toInput });
  }

  const items = query.data?.items ?? [];
  const hasPending = items.some(
    (booking) =>
      booking.displayStatus === "WAITING_PAYMENT" ||
      booking.displayStatus === "WAITING_CONFIRMATION",
  );

  return (
    <main className="page-wrap">
      <PageHeading eyebrow="Tài khoản của bạn" title="Đơn đặt chỗ của tôi">
        Theo dõi và quản lý tất cả đơn đặt chỗ của bạn.
      </PageHeading>
      {hasPending && (
        <div className="panel mb-7 flex flex-wrap items-center gap-3 bg-sun/30 p-5">
          <Icon name="ticket" size={24} />
          <p className="font-semibold">
            Bạn có đơn đang chờ xử lý trong danh sách này.
          </p>
          <a href="#booking-list" className="secondary-button ml-auto">
            Xem đơn
          </a>
        </div>
      )}
      <nav
        aria-label="Lọc trạng thái đơn đặt chỗ"
        className="mb-6 flex gap-2 overflow-x-auto pb-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            aria-pressed={status === tab.status}
            className={`shrink-0 rounded-xl border-2 border-line px-4 py-2 text-sm font-bold ${status === tab.status ? "bg-sun shadow-[3px_3px_0_var(--border)]" : "bg-surface"}`}
            onClick={() => {
              setStatus(tab.status);
              setPage(1);
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <form
        onSubmit={applyFilters}
        className="panel mb-8 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      >
        <label className="text-sm font-semibold">
          Tìm mã đơn hoặc dịch vụ
          <input
            className="input mt-1"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={100}
            placeholder="Mã đơn, tên trải nghiệm…"
          />
        </label>
        <label className="text-sm font-semibold">
          Từ ngày
          <input
            className="input mt-1"
            type="date"
            value={fromInput}
            onChange={(event) => setFromInput(event.target.value)}
          />
        </label>
        <label className="text-sm font-semibold">
          Đến ngày
          <input
            className="input mt-1"
            type="date"
            min={fromInput || undefined}
            value={toInput}
            onChange={(event) => setToInput(event.target.value)}
          />
        </label>
        <button type="submit" className="primary-button">
          Tìm đơn
        </button>
      </form>
      <div id="booking-list">
        {query.isPending ? (
          <p role="status">Đang tải lịch sử đặt chỗ…</p>
        ) : query.isError ? (
          <EmptyState
            title={
              query.error instanceof ApiError && query.error.status === 401
                ? "Vui lòng đăng nhập"
                : "Chưa thể tải đơn đặt chỗ"
            }
            action={
              query.error instanceof ApiError && query.error.status === 401 ? (
                <Link href="/login" className="primary-button">
                  Đăng nhập
                </Link>
              ) : (
                <button
                  className="primary-button"
                  onClick={() => void query.refetch()}
                >
                  Thử lại
                </button>
              )
            }
          >
            {query.error instanceof ApiError && query.error.status === 401
              ? "Đăng nhập để xem lịch sử trên mọi thiết bị."
              : "Kiểm tra kết nối và thử lại."}
          </EmptyState>
        ) : items.length === 0 ? (
          <EmptyState
            title="Chưa có đơn phù hợp"
            action={
              <Link href="/services" className="primary-button">
                Khám phá dịch vụ
              </Link>
            }
          >
            {status || filters.search || filters.from || filters.to
              ? "Hãy thử thay đổi bộ lọc để tìm đơn khác."
              : "Khi bạn giữ chỗ, đơn sẽ xuất hiện tại đây ngay cả khi chưa thanh toán."}
          </EmptyState>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {items.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>
      {query.data && query.data.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            className="secondary-button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Trước
          </button>
          <span className="text-sm font-semibold">
            Trang {page}/{query.data.totalPages}
          </span>
          <button
            className="secondary-button"
            disabled={page >= query.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </main>
  );
}

function BookingCard({ booking }: { booking: CustomerBooking }) {
  const first = booking.items[0];
  const otherCount = Math.max(0, booking.items.length - 1);
  const action =
    booking.displayStatus === "WAITING_PAYMENT"
      ? "Thanh toán ngay"
      : booking.displayStatus === "WAITING_CONFIRMATION"
        ? "Xem trạng thái"
        : booking.displayStatus === "REFUND_PENDING" ||
            booking.displayStatus === "REFUND_COMPLETED"
          ? "Theo dõi hoàn tiền"
          : booking.displayStatus === "CONFIRMED" && booking.ticketCount
            ? "Xem vé"
            : "Xem chi tiết";
  return (
    <article
      className={`panel flex flex-col p-6 ${booking.displayStatus.startsWith("WAITING_") ? "border-sun bg-sun/10" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Đơn đặt chỗ</p>
          <h2 className="mt-2 text-xl">{booking.bookingCode}</h2>
        </div>
        <StatusBadge status={booking.bookingStatus} />
      </div>
      <p className="mt-4 font-semibold">
        {first?.serviceTitle ?? "Trải nghiệm GoBookNow"}
        {otherCount > 0 ? ` và ${otherCount} mục khác` : ""}
      </p>
      {first && (
        <p className="mt-1 text-sm text-muted">
          {formatDate(first.slotStartAt)} · {formatTime(first.slotStartAt)} ·{" "}
          {booking.items.reduce((sum, item) => sum + item.quantity, 0)} chỗ
        </p>
      )}
      <dl className="mt-5 grid gap-2 border-t border-line/20 pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt>Thanh toán</dt>
          <dd className="font-semibold">
            {booking.paymentSummary
              ? paymentLabels[booking.paymentSummary.status]
              : "Chưa bắt đầu"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Tổng tiền</dt>
          <dd className="font-bold">
            {formatMoney(booking.totalAmount, booking.currency)}
          </dd>
        </div>
        {booking.bookingStatus === "PENDING_PAYMENT" && booking.expiresAt && (
          <div className="flex justify-between gap-4">
            <dt>Hạn giữ chỗ</dt>
            <dd className="text-right">
              {formatDate(booking.expiresAt)} · {formatTime(booking.expiresAt)}
            </dd>
          </div>
        )}
      </dl>
      <Link
        className="primary-button mt-6 self-start"
        href={`/bookings/${encodeURIComponent(booking.id)}`}
      >
        {action}
        <Icon name="arrow" size={17} />
      </Link>
    </article>
  );
}
