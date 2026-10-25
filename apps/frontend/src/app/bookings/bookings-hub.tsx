"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBookingTickets } from "@/lib/api-client";
import { recentBookingIds } from "@/lib/recent-bookings";
import { useVendorToken } from "@/app/vendor/use-vendor-token";
import {
  EmptyState,
  PageHeading,
  StatusBadge,
  Button,
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";

export function BookingsHub() {
  const { ready, token, onToken } = useVendorToken();
  const router = useRouter();
  const [lookupError, setLookupError] = useState("");
  const query = useQuery({
    queryKey: ["customer", "recent-bookings"],
    enabled: ready,
    queryFn: async () => {
      const ids = recentBookingIds();
      const results = await Promise.allSettled(
        ids.map((id) => getBookingTickets(id, token, onToken)),
      );
      if (ids.length && results.every((result) => result.status === "rejected"))
        throw new Error(
          "Không tải được đặt chỗ gần đây. Hãy đăng nhập hoặc mở liên kết đặt chỗ.",
        );
      return results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
    },
  });
  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookupError("");
    const value = String(
      new FormData(event.currentTarget).get("booking"),
    ).trim();
    let id = value;
    if (value.includes("://")) {
      try {
        const url = new URL(value);
        if (url.origin !== location.origin) throw new Error();
        id = url.pathname.split("/").at(-1) ?? "";
      } catch {
        setLookupError("Hãy dùng liên kết đặt chỗ thuộc GoBookNow.");
        return;
      }
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      setLookupError("Vui lòng dán liên kết đặt chỗ hoặc ID hợp lệ.");
      return;
    }
    router.push(`/bookings/${id}`);
  }
  return (
    <main className="page-wrap">
      <PageHeading eyebrow="Cuộc hẹn đang chờ" title="Đặt chỗ & vé của bạn">
        Mở lại lịch hẹn, xem trạng thái xác nhận và lấy vé QR trước khi lên
        đường.
      </PageHeading>
      <section className="panel mb-9 grid gap-5 p-6 md:grid-cols-[1fr_1fr] md:items-center">
        <div>
          <h2 className="text-xl">Bạn đã có liên kết đặt chỗ?</h2>
          <p className="mt-2 text-sm text-muted">
            Dán liên kết bạn đã nhận để mở chi tiết. GoBookNow luôn kiểm tra
            quyền truy cập của bạn.
          </p>
        </div>
        <form onSubmit={open}>
          <label className="sr-only" htmlFor="booking-lookup">
            Liên kết hoặc ID đặt chỗ
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="booking-lookup"
              name="booking"
              className="input"
              placeholder="Dán liên kết đặt chỗ…"
              required
            />
            <Button type="submit">
              Mở
              <Icon name="arrow" size={17} />
            </Button>
          </div>
          {lookupError && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {lookupError}
            </p>
          )}
        </form>
      </section>
      <h2 className="mb-2 text-xl">Gần đây trên thiết bị này</h2>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Danh sách ghi nhớ các đặt chỗ bạn đã mở trong phiên này, không phải toàn
        bộ lịch sử tài khoản. Trạng thái và vé luôn được tải lại từ GoBookNow.
      </p>
      {query.isPending ? (
        <p role="status">Đang kiểm tra đặt chỗ…</p>
      ) : query.isError ? (
        <EmptyState
          title="Chưa thể tải đặt chỗ"
          action={
            <button
              className="secondary-button"
              onClick={() => query.refetch()}
            >
              Thử lại
            </button>
          }
        >
          {query.error.message}
        </EmptyState>
      ) : !query.data?.length ? (
        <EmptyState
          title="Chưa có cuộc hẹn gần đây"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/services" className="primary-button">
                Tìm trải nghiệm
                <Icon name="arrow" />
              </Link>
              {!token && (
                <Link href="/login" className="secondary-button">
                  Đăng nhập để mở vé
                </Link>
              )}
            </div>
          }
        >
          Khi bạn đặt chỗ hoặc mở vé trong phiên này, liên kết sẽ xuất hiện tại
          đây.
        </EmptyState>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {query.data.map((booking) => (
            <article className="panel p-6" key={booking.bookingId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Đặt chỗ của bạn</p>
                  <h3 className="mt-2 text-xl">{booking.bookingCode}</h3>
                </div>
                <StatusBadge status={booking.bookingStatus} />
              </div>
              <p className="mt-4 text-sm text-muted">
                {booking.tickets.length > 0
                  ? `${booking.tickets.length} vé điện tử`
                  : "Vé sẽ hiển thị khi đặt chỗ được xác nhận."}
              </p>
              <Link
                className="secondary-button mt-5"
                href={`/bookings/${booking.bookingId}`}
              >
                Xem chi tiết & vé
                <Icon name="arrow" />
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
