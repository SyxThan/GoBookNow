"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  getVendorBookings,
  localDateToInstant,
  type VendorBookingStatus,
} from "@/lib/vendor-operations";
import { OperationsNav } from "../operations-nav";
import { usePortalSession } from "@gobook/auth/use-session";

const TABS: { value: VendorBookingStatus; label: string }[] = [
  { value: "UPCOMING", label: "Sắp diễn ra" },
  { value: "COMPLETED", label: "Đã hoàn thành" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "ALL", label: "Tất cả" },
];
const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Sắp diễn ra",
  COMPLETED: "Đã hoàn thành",
  CANCELLED: "Đã hủy",
  PENDING_PAYMENT: "Chờ thanh toán",
  EXPIRED: "Hết hạn",
};
type Filters = { search: string; serviceId: string; from: string; to: string };
const emptyFilters: Filters = { search: "", serviceId: "", from: "", to: "" };

export default function VendorBookingsClient() {
  const { ready, token, onToken } = usePortalSession();
  const [status, setStatus] = useState<VendorBookingStatus>("UPCOMING");
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const query = useQuery({
    queryKey: ["vendor", "bookings", status, filters, page, sort],
    enabled: ready,
    queryFn: ({ signal }) =>
      getVendorBookings(
        {
          status,
          page,
          limit: 20,
          sort,
          search: filters.search,
          serviceId: filters.serviceId,
          from: localDateToInstant(filters.from),
          to: localDateToInstant(filters.to, true),
        },
        token,
        onToken,
        signal,
      ),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const services = useQuery({
    queryKey: ["vendor", "services", "filter"],
    enabled: ready,
    queryFn: ({ signal }) =>
      apiRequest<{ items: { id: string; title: string }[] }>(
        "/vendor/services?limit=100",
        { method: "GET", signal },
        token,
        onToken,
      ),
    staleTime: 60_000,
  });
  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters(draft);
    setPage(1);
  };
  const error = query.error ?? services.error;
  return (
    <main className="min-h-[70vh] bg-canvas px-4 py-10 text-ink sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">GoBook Vendor · Vận hành</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Quản lý Booking
        </h1>
        <p className="mt-2 text-muted">
          Theo dõi lịch, trạng thái vé và khoản thu dự kiến của bạn.
        </p>
        <div className="mt-7">
          <OperationsNav current="bookings" />
        </div>
        <div
          role="tablist"
          aria-label="Trạng thái Booking"
          className="mb-6 flex flex-wrap gap-2"
        >
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              className={
                status === tab.value ? "primary-button" : "secondary-button"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={applyFilters}
          className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="text-sm text-ink">
            Tìm mã / dịch vụ
            <input
              className="input mt-2"
              value={draft.search}
              onChange={(event) =>
                setDraft({ ...draft, search: event.target.value })
              }
              placeholder="Mã Booking hoặc tên"
              maxLength={100}
            />
          </label>
          <label className="text-sm text-ink">
            Dịch vụ / sự kiện
            <select
              className="input mt-2"
              value={draft.serviceId}
              onChange={(event) =>
                setDraft({ ...draft, serviceId: event.target.value })
              }
            >
              <option value="">Tất cả dịch vụ</option>
              {services.data?.items.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink">
            Từ ngày tạo
            <input
              className="input mt-2"
              type="date"
              value={draft.from}
              onChange={(event) =>
                setDraft({ ...draft, from: event.target.value })
              }
            />
          </label>
          <label className="text-sm text-ink">
            Đến ngày tạo
            <input
              className="input mt-2"
              type="date"
              value={draft.to}
              onChange={(event) =>
                setDraft({ ...draft, to: event.target.value })
              }
            />
          </label>
          <div className="flex items-end gap-2">
            <button className="primary-button w-full" type="submit">
              Áp dụng
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setDraft(emptyFilters);
                setFilters(emptyFilters);
                setPage(1);
              }}
            >
              Xóa
            </button>
          </div>
        </form>
        <div className="mb-4 flex items-center justify-between gap-3 text-sm text-muted">
          <span>
            {query.data
              ? `${query.data.pagination.total} Booking`
              : "Đang tải dữ liệu"}
            {query.isFetching && query.data ? " · Đang cập nhật…" : ""}
          </span>
          <label>
            Sắp xếp{" "}
            <select
              className="ml-2 rounded-lg border border-line bg-surface p-2"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as "asc" | "desc");
                setPage(1);
              }}
            >
              <option value="desc">Mới nhất</option>
              <option value="asc">Cũ nhất</option>
            </select>
          </label>
        </div>
        {query.isPending && (
          <div role="status" className="panel p-8 text-muted">
            Đang tải Booking…
          </div>
        )}
        {error && (
          <div role="alert" className="panel p-8 text-danger">
            {error instanceof ApiError && error.status === 401
              ? "Phiên đăng nhập đã hết hạn. "
              : error instanceof ApiError && error.status === 403
                ? "Bạn cần hồ sơ Vendor đã được duyệt. "
                : "Không thể tải Booking. "}
            <Link className="underline" href="/profile">
              Mở hồ sơ / đăng nhập
            </Link>
            <button
              className="ml-4 underline"
              type="button"
              onClick={() => void query.refetch()}
            >
              Thử lại
            </button>
          </div>
        )}
        {!query.isPending && !query.error && query.data?.data.length === 0 && (
          <div className="panel p-10 text-center text-muted">
            Không có Booking nào trong bộ lọc này.
          </div>
        )}
        {!!query.data?.data.length && (
          <div
            className="panel table-scroll responsive-records"
            role="region"
            tabIndex={0}
            aria-label="Bảng đặt chỗ — cuộn ngang để xem đủ cột"
          >
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface text-muted">
                <tr>
                  <th className="p-4">Booking</th>
                  <th className="p-4">Dịch vụ / lịch</th>
                  <th className="p-4">Số vé</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4">Khách thanh toán</th>
                  <th className="p-4">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((booking) => (
                  <tr
                    key={booking.bookingId}
                    className="border-t border-line/10 align-top"
                  >
                    <td data-label="Đặt chỗ" className="p-4">
                      <strong>{booking.bookingCode}</strong>
                      <p className="mt-1 text-muted">
                        {formatDateTime(booking.createdAt)}
                      </p>
                    </td>
                    <td data-label="Dịch vụ / lịch" className="p-4">
                      <p>
                        {booking.itemCount} mục ·{" "}
                        {booking.itemsSummary
                          .map((item) => item.serviceTitle)
                          .join(", ")}
                      </p>
                      <p className="mt-1 text-muted">
                        {booking.itemsSummary.length
                          ? formatDateTime(booking.itemsSummary[0].startAt)
                          : "—"}
                      </p>
                    </td>
                    <td data-label="Số vé" className="p-4">
                      {booking.totalQuantity}
                    </td>
                    <td data-label="Trạng thái" className="p-4">
                      {STATUS_LABEL[booking.operationalStatus] ??
                        booking.status}
                    </td>
                    <td data-label="Khách thanh toán" className="p-4">
                      {formatMoney(booking.totalAmount, booking.currency)}
                    </td>
                    <td data-label="Chi tiết" className="p-4">
                      <Link
                        className="text-info hover:underline"
                        href={`/bookings/${booking.bookingId}`}
                      >
                        Xem chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {query.data && query.data.pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Trước
            </button>
            <span>
              Trang {page}/{query.data.pagination.totalPages}
            </span>
            <button
              className="secondary-button"
              disabled={page >= query.data.pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
