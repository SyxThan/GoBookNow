"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  getBookingTickets,
  getTicketQr,
  type CustomerTicket,
  type TicketStatus,
} from "@/lib/api-client";
import { formatDate, formatTime } from "@/lib/format";

const ACCESS_TOKEN_KEY = "gobook.accessToken";

export function BookingTicketsClient({ bookingId }: { bookingId: string }) {
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem(ACCESS_TOKEN_KEY),
  );
  const [selectedTicket, setSelectedTicket] = useState<CustomerTicket | null>(
    null,
  );
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [downloadingTicketId, setDownloadingTicketId] = useState<string | null>(
    null,
  );
  const qrUrlRef = useRef<string | null>(null);
  const requestSequence = useRef(0);

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }, []);

  const ticketQuery = useQuery({
    queryKey: ["customer-booking-tickets", bookingId],
    queryFn: ({ signal }) =>
      getBookingTickets(bookingId, accessToken, setAccessToken, signal),
    retry: false,
  });

  const revokeQrUrl = useCallback(() => {
    if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
    qrUrlRef.current = null;
    setQrUrl(null);
  }, []);

  useEffect(() => () => revokeQrUrl(), [revokeQrUrl]);

  async function openQr(ticket: CustomerTicket): Promise<void> {
    const currentRequest = ++requestSequence.current;
    revokeQrUrl();
    setSelectedTicket(ticket);
    setQrError(null);
    setQrLoading(true);
    try {
      const blob = await getTicketQr(
        ticket.id,
        false,
        accessToken,
        setAccessToken,
      );
      if (currentRequest !== requestSequence.current) return;
      const objectUrl = URL.createObjectURL(blob);
      qrUrlRef.current = objectUrl;
      setQrUrl(objectUrl);
    } catch (error) {
      if (currentRequest === requestSequence.current) {
        setQrError(ticketQrError(error));
      }
    } finally {
      if (currentRequest === requestSequence.current) setQrLoading(false);
    }
  }

  function closeQr(): void {
    requestSequence.current += 1;
    revokeQrUrl();
    setSelectedTicket(null);
    setQrError(null);
    setQrLoading(false);
  }

  async function downloadQr(ticket: CustomerTicket): Promise<void> {
    setDownloadingTicketId(ticket.id);
    setQrError(null);
    try {
      const blob = await getTicketQr(
        ticket.id,
        true,
        accessToken,
        setAccessToken,
      );
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `gobook-ticket-${safeTicketCode(ticket.ticketCode)}.png`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setQrError(ticketQrError(error));
    } finally {
      setDownloadingTicketId(null);
    }
  }

  if (ticketQuery.isPending) {
    return <PageShell>Đang tải vé của bạn...</PageShell>;
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <PageShell>
        <p className="eyebrow">Không thể tải vé</p>
        <h1 className="mt-3 text-3xl font-semibold">Vé chưa sẵn sàng</h1>
        <p className="mt-4 text-slate-400">
          {ticketListError(ticketQuery.error)}
        </p>
        <button
          type="button"
          className="primary-button mt-7"
          onClick={() => void ticketQuery.refetch()}
        >
          Thử lại
        </button>
      </PageShell>
    );
  }

  const booking = ticketQuery.data;

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-teal-300 hover:text-teal-200">
          ← Trang chủ
        </Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Booking {booking.bookingCode}</p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
              Vé điện tử của bạn
            </h1>
          </div>
          <p className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">
            {booking.tickets.length} vé
          </p>
        </div>

        {booking.tickets.length === 0 ? (
          <section className="panel mt-8 p-8 text-center text-slate-400">
            Booking này chưa có vé được phát hành.
          </section>
        ) : (
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {booking.tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                bookingConfirmed={booking.bookingStatus === "CONFIRMED"}
                downloading={downloadingTicketId === ticket.id}
                onView={() => void openQr(ticket)}
                onDownload={() => void downloadQr(ticket)}
              />
            ))}
          </div>
        )}

        {qrError && !selectedTicket ? (
          <p className="mt-6 text-sm text-rose-300" role="alert">
            {qrError}
          </p>
        ) : null}
      </div>

      {selectedTicket ? (
        <QrDialog
          ticket={selectedTicket}
          qrUrl={qrUrl}
          loading={qrLoading}
          error={qrError}
          downloading={downloadingTicketId === selectedTicket.id}
          onClose={closeQr}
          onDownload={() => void downloadQr(selectedTicket)}
        />
      ) : null}
    </main>
  );
}

function TicketCard({
  ticket,
  bookingConfirmed,
  downloading,
  onView,
  onDownload,
}: {
  ticket: CustomerTicket;
  bookingConfirmed: boolean;
  downloading: boolean;
  onView: () => void;
  onDownload: () => void;
}) {
  const status = ticketStatus(ticket.status);
  const actionsEnabled = bookingConfirmed && ticket.status !== "VOIDED";

  return (
    <article className="panel overflow-hidden p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label">{ticket.bookingItem.serviceTitle}</p>
          <h2 className="mt-2 text-xl font-semibold">{ticket.ticketCode}</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 text-sm">
        <Detail label="Số vé">
          Vé {ticket.sequenceNo}/{ticket.bookingItem.quantity}
        </Detail>
        <Detail label="Ngày">
          {formatDate(ticket.bookingItem.slotStartAt)}
        </Detail>
        <Detail label="Bắt đầu">
          {formatTime(ticket.bookingItem.slotStartAt)}
        </Detail>
        <Detail label="Kết thúc">
          {formatTime(ticket.bookingItem.slotEndAt)}
        </Detail>
      </div>
      {ticket.status === "CHECKED_IN" && ticket.checkedInAt ? (
        <p className="mt-4 text-xs text-slate-400">
          Đã check-in lúc {formatTime(ticket.checkedInAt)}
        </p>
      ) : null}
      {!bookingConfirmed ? (
        <p className="mt-4 text-sm text-amber-300">
          Booking không còn ở trạng thái xác nhận; mã QR đã bị khóa.
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="primary-button"
          disabled={!actionsEnabled}
          aria-label={`Xem mã QR ${ticket.ticketCode}`}
          onClick={onView}
        >
          Xem mã QR
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!actionsEnabled || downloading}
          aria-label={`Tải QR ${ticket.ticketCode}`}
          onClick={onDownload}
        >
          {downloading ? "Đang tải..." : "Tải QR"}
        </button>
      </div>
    </article>
  );
}

function QrDialog({
  ticket,
  qrUrl,
  loading,
  error,
  downloading,
  onClose,
  onDownload,
}: {
  ticket: CustomerTicket;
  qrUrl: string | null;
  loading: boolean;
  error: string | null;
  downloading: boolean;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/85 p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-qr-title"
        className="panel w-full max-w-xl p-6 text-center shadow-2xl shadow-black/60 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4 text-left">
          <div>
            <p className="eyebrow">Mã QR vé</p>
            <h2 id="ticket-qr-title" className="mt-2 text-2xl font-semibold">
              {ticket.ticketCode}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Đóng mã QR"
            className="rounded-lg border border-white/10 px-3 py-2 text-slate-300 hover:text-white"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="mx-auto mt-6 grid min-h-72 max-w-md place-items-center rounded-2xl bg-white p-4 text-slate-900">
          {loading ? (
            <p role="status">Đang tạo mã QR...</p>
          ) : error ? (
            <p className="text-rose-700" role="alert">
              {error}
            </p>
          ) : qrUrl ? (
            <Image
              src={qrUrl}
              width={512}
              height={512}
              unoptimized
              alt={`Mã QR vé ${ticket.ticketCode}`}
              className="h-auto w-full"
            />
          ) : null}
        </div>

        <p className="mt-4 text-sm text-slate-400">
          Chỉ đưa mã này cho nhân viên khi check-in. Không chia sẻ công khai.
        </p>
        <button
          type="button"
          className="primary-button mt-6"
          disabled={loading || Boolean(error) || downloading}
          onClick={onDownload}
        >
          {downloading ? "Đang tải..." : "Tải QR"}
        </button>
      </section>
    </div>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 text-center text-slate-100">
      <section className="panel w-full max-w-xl p-8">{children}</section>
    </main>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="section-label">{label}</p>
      <p className="mt-1 text-slate-200">{children}</p>
    </div>
  );
}

function ticketStatus(status: TicketStatus): {
  label: string;
  className: string;
} {
  if (status === "CHECKED_IN") {
    return {
      label: "Đã check-in",
      className: "bg-sky-300/10 text-sky-200",
    };
  }
  if (status === "VOIDED") {
    return {
      label: "Vé không còn hiệu lực",
      className: "bg-rose-300/10 text-rose-200",
    };
  }
  return {
    label: "Sẵn sàng sử dụng",
    className: "bg-emerald-300/10 text-emerald-200",
  };
}

function safeTicketCode(ticketCode: string): string {
  return ticketCode
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
}

function ticketListError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn.";
    if (error.status === 403) return "Bạn không có quyền xem booking này.";
    if (error.status === 404) return "Không tìm thấy booking.";
  }
  return "Không thể kết nối đến GoBook API. Vui lòng thử lại.";
}

function ticketQrError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn.";
    if (error.status === 403) return "Bạn không có quyền xem mã QR này.";
    if (error.status === 404) return "Không tìm thấy vé.";
    if (error.status === 409) return "Vé không còn khả dụng để hiển thị QR.";
  }
  return "Không thể tạo mã QR. Vui lòng thử lại.";
}
