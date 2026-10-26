"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  getVendorDashboard,
  localDateToInstant,
} from "@/lib/vendor-operations";
import { OperationsNav } from "../operations-nav";
import { usePortalSession } from "@gobook/auth/use-session";

const percent = (bps: number) => `${(bps / 100).toFixed(2)}%`;
type Period = { label: string; from?: string; to?: string };

function card(label: string, value: string, note?: string) {
  return (
    <div className="panel p-5">
      <p className="section-label">{label}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

export default function VendorDashboardClient() {
  const { ready, token, onToken } = usePortalSession();
  const [period, setPeriod] = useState<Period>({ label: "30 ngày" });
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dateError, setDateError] = useState("");
  const query = useQuery({
    queryKey: ["vendor", "dashboard", period],
    enabled: ready,
    queryFn: ({ signal }) =>
      getVendorDashboard(
        { from: period.from, to: period.to },
        token,
        onToken,
        signal,
      ),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const selectPreset = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    setPeriod({
      label: `${days} ngày`,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    setDateError("");
  };
  const selectCustom = (event: FormEvent) => {
    event.preventDefault();
    const from = localDateToInstant(fromDate);
    const to = localDateToInstant(toDate, true);
    if (
      !from ||
      !to ||
      from >= to ||
      new Date(to).getTime() - new Date(from).getTime() > 366 * 86_400_000
    ) {
      setDateError("Chọn khoảng ngày hợp lệ, tối đa 366 ngày.");
      return;
    }
    setDateError("");
    setPeriod({ label: "Tùy chọn", from, to });
  };
  const data = query.data;
  const finance = data?.financial;
  const maxRevenue =
    data?.revenueTrend.reduce(
      (max, row) =>
        BigInt(row.paidRevenue) > max ? BigInt(row.paidRevenue) : max,
      BigInt(0),
    ) ?? BigInt(0);
  return (
    <main className="min-h-[70vh] bg-canvas px-4 py-10 text-ink sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">GoBook Vendor · Vận hành</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Tổng quan kinh doanh
        </h1>
        <p className="mt-2 text-muted">
          Booking, dòng tiền đã thu và tỷ lệ lấp đầy từ dữ liệu vận hành thực
          tế.
        </p>
        <div className="mt-7">
          <OperationsNav current="dashboard" />
        </div>
        <div className="panel mb-7 flex flex-wrap items-end gap-3 p-5">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => selectPreset(days)}
              className={
                period.label === `${days} ngày`
                  ? "primary-button"
                  : "secondary-button"
              }
            >
              {days} ngày
            </button>
          ))}
          <form
            onSubmit={selectCustom}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="text-sm text-ink">
              Từ ngày
              <input
                className="input mt-1"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <label className="text-sm text-ink">
              Đến ngày
              <input
                className="input mt-1"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
            <button className="secondary-button" type="submit">
              Áp dụng
            </button>
          </form>
          {dateError && (
            <p role="alert" className="w-full text-sm text-danger">
              {dateError}
            </p>
          )}
        </div>
        <p className="mb-5 text-sm text-muted">
          {period.label}
          {data
            ? ` · ${new Date(data.period.from).toLocaleDateString("vi-VN")} – ${new Date(data.period.to).toLocaleDateString("vi-VN")}`
            : ""}
          {query.isFetching && data ? " · Đang cập nhật…" : ""}
        </p>
        {query.isPending && (
          <div role="status" className="panel p-8">
            Đang tải dashboard…
          </div>
        )}
        {query.error && (
          <div role="alert" className="panel p-8 text-danger">
            {query.error instanceof ApiError && query.error.status === 401
              ? "Phiên đăng nhập đã hết hạn."
              : query.error instanceof ApiError && query.error.status === 403
                ? "Bạn cần hồ sơ Vendor đã được duyệt."
                : "Không thể tải dashboard."}
            <Link className="ml-3 underline" href="/profile">
              Đăng nhập / hồ sơ
            </Link>
            <button
              className="ml-3 underline"
              onClick={() => void query.refetch()}
            >
              Thử lại
            </button>
          </div>
        )}
        {data && finance && (
          <>
            <section
              aria-label="Chỉ số Booking"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {card(
                "Tổng Booking",
                String(data.bookings.total),
                "Theo ngày tạo Booking, mỗi Booking chỉ đếm một lần",
              )}
              {card("Booking xác nhận", String(data.bookings.confirmed))}
              {card("Booking đã hủy", String(data.bookings.cancelled))}
              {card(
                "Tỷ lệ hủy",
                percent(data.bookings.cancellationRateBps),
                `${data.bookings.paidCancelled}/${data.bookings.paid} Booking đã thanh toán`,
              )}
              {card(
                "Doanh thu đã thu",
                formatMoney(finance.paidRevenue),
                "Payment thành công trong kỳ",
              )}
              {card(
                "Doanh thu giữ lại sau hoàn tiền",
                formatMoney(finance.netRetainedRevenue),
                "Đã trừ refund thành công; không trừ refund đang chờ",
              )}
              {card(
                "Thu nhập Vendor dự kiến",
                finance.commissionUnknownBookingCount
                  ? "Chưa đầy đủ"
                  : formatMoney(finance.estimatedVendorEarnings),
                finance.commissionUnknownBookingCount
                  ? `${formatMoney(finance.estimatedVendorEarnings)} đã có snapshot · ${finance.commissionUnknownBookingCount} Booking chưa rõ commission`
                  : "Ước tính, chưa phải tiền đã chuyển",
              )}
              {card(
                "Phí nền tảng ước tính",
                finance.commissionUnknownBookingCount
                  ? "Chưa đầy đủ"
                  : formatMoney(finance.estimatedPlatformFee),
                `${finance.commissionCoveredBookingCount} Booking có snapshot commission`,
              )}
              {card(
                "Tỷ lệ lấp đầy Slot",
                percent(data.occupancy.rateBps),
                `${data.occupancy.confirmedQuantity}/${data.occupancy.totalCapacity} chỗ · ${data.occupancy.activeHeldQuantity} chỗ đang giữ`,
              )}
            </section>
            <section className="panel mt-6 grid gap-4 p-6 sm:grid-cols-2">
              <div>
                <h2 className="text-lg font-bold">Hoàn tiền thành công</h2>
                <p className="mt-2 text-2xl">
                  {formatMoney(finance.succeededRefunds)}
                </p>
              </div>
              <div>
                <h2 className="text-lg font-bold">Nghĩa vụ hoàn đang chờ</h2>
                <p className="mt-2 text-2xl">
                  {formatMoney(finance.pendingRefunds)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Chưa trừ khỏi doanh thu giữ lại.
                </p>
              </div>
            </section>
            {finance.commissionUnknownBookingCount > 0 && (
              <p
                role="status"
                className="mt-5 rounded-xl border border-warning/40 bg-sun/30 p-4 text-warning"
              >
                {finance.commissionUnknownBookingCount} Booking đã thu tiền
                nhưng không có snapshot commission. Ước tính thu nhập và phí nền
                tảng chỉ bao gồm Booking có dữ liệu tin cậy.
              </p>
            )}
            <section className="panel mt-6 p-6">
              <h2 className="text-xl font-bold">
                Doanh thu thanh toán theo ngày
              </h2>
              <p className="mt-1 text-sm text-muted">
                Ngày theo giờ Việt Nam; biểu đồ là Payment thành công, chưa trừ
                refund.
              </p>
              {data.revenueTrend.length === 0 ? (
                <p className="mt-8 text-muted">
                  Chưa có Payment thành công trong kỳ.
                </p>
              ) : (
                <div className="mt-6 space-y-3">
                  {data.revenueTrend.map((row) => (
                    <div
                      key={row.day}
                      className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[6rem_minmax(0,1fr)_8rem] items-center gap-3 text-sm"
                    >
                      <span className="text-muted">{row.day}</span>
                      <div className="col-span-2 row-start-2 h-5 rounded-md border border-line bg-soft sm:col-span-1 sm:row-auto">
                        <div
                          className="h-5 rounded-full bg-sun"
                          style={{
                            width: `${maxRevenue === BigInt(0) ? 0 : Number((BigInt(row.paidRevenue) * BigInt(100)) / maxRevenue)}%`,
                          }}
                        />
                      </div>
                      <span className="text-right">
                        {formatMoney(row.paidRevenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <p className="mt-6 text-sm text-muted">
              Booking: theo ngày tạo · Tài chính: cohort Payment thành công
              trong kỳ, refund thành công được tính đến lúc xem · Lấp đầy: Slot
              bắt đầu trong kỳ. Đây không phải báo cáo dòng tiền ngân hàng hoặc
              xác nhận payout Vendor.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
