"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { AccessibleDialog } from "@/components/ui/dialog";
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
  cancelBooking,
  getBookingTickets,
  getTicketQr,
  previewBookingCancellation,
  type BookingCancellationPreview,
  type BookingCancellationResult,
  type CustomerTicket,
  type TicketStatus,
} from "@/lib/api-client";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { BookingReviewPanel } from "@/components/booking/booking-review-panel";

const ACCESS_TOKEN_KEY = "gobook.accessToken";

export function BookingTicketsClient({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
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
  const cancellationKey = useRef<string | null>(null);
  const [cancellationOpen, setCancellationOpen] = useState(false);
  const [reasonNote, setReasonNote] = useState("");

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
    refetchOnMount: "always",
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      previewBookingCancellation(bookingId, accessToken, setAccessToken),
  });

  const cancellationMutation = useMutation({
    mutationFn: () => {
      cancellationKey.current ??= crypto.randomUUID();
      return cancelBooking(
        {
          bookingId,
          idempotencyKey: cancellationKey.current,
          reasonNote: reasonNote.trim() || undefined,
        },
        accessToken,
        setAccessToken,
      );
    },
    onSuccess: (cancellation) => {
      void queryClient.invalidateQueries({ queryKey: ["booking-review-eligibility", bookingId] });
      queryClient.setQueryData(
        ["customer-booking-tickets", bookingId],
        (current: typeof ticketQuery.data) =>
          current
            ? {
                ...current,
                bookingStatus: "CANCELLED" as const,
                cancellation,
                tickets: current.tickets.map((ticket) =>
                  ticket.status === "ISSUED"
                    ? { ...ticket, status: "VOIDED" as const }
                    : ticket,
                ),
              }
            : current,
      );
    },
  });

  function openCancellation(): void {
    cancellationKey.current = null;
    setReasonNote("");
    cancellationMutation.reset();
    previewMutation.reset();
    setCancellationOpen(true);
    previewMutation.mutate();
  }

  function closeCancellation(): void {
    if (cancellationMutation.isPending) return;
    setCancellationOpen(false);
    cancellationKey.current = null;
    setReasonNote("");
    cancellationMutation.reset();
    previewMutation.reset();
  }

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
        <h1 className="mt-3 text-3xl font-bold">Vé chưa sẵn sàng</h1>
        <p className="mt-4 text-muted">
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

  if (
    booking.bookingStatus === "PENDING_PAYMENT" ||
    booking.bookingStatus === "EXPIRED"
  )
    return null;

  return (
    <section id="tickets" className="bg-canvas px-5 py-10 text-ink">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-info hover:text-info">
          ← Trang chủ
        </Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Booking {booking.bookingCode}</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
              Vé điện tử của bạn
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="rounded-full border border-line/10 px-4 py-2 text-sm text-ink">
              {booking.tickets.length} vé
            </p>
            {booking.bookingStatus === "CONFIRMED" ? (
              <button
                type="button"
                className="secondary-button"
                onClick={openCancellation}
              >
                Hủy đặt chỗ
              </button>
            ) : null}
          </div>
        </div>

        {booking.cancellation ? (
          <CancellationSummary cancellation={booking.cancellation} />
        ) : null}

        {booking.tickets.length === 0 ? (
          <section className="panel mt-8 p-8 text-center text-muted">
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

        <BookingReviewPanel bookingId={bookingId} accessToken={accessToken} onToken={setAccessToken} />

        {qrError && !selectedTicket ? (
          <p className="mt-6 text-sm text-danger" role="alert">
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
          onRetry={() => void openQr(selectedTicket)}
        />
      ) : null}
      {cancellationOpen ? (
        <CancellationDialog
          preview={previewMutation.data ?? null}
          previewPending={previewMutation.isPending}
          previewError={previewMutation.error}
          cancellation={cancellationMutation.data ?? null}
          cancellationPending={cancellationMutation.isPending}
          cancellationError={cancellationMutation.error}
          reasonNote={reasonNote}
          onReasonNoteChange={setReasonNote}
          onRetryPreview={() => previewMutation.mutate()}
          onConfirm={() => cancellationMutation.mutate()}
          onClose={closeCancellation}
        />
      ) : null}
    </section>
  );
}

function CancellationSummary({
  cancellation,
}: {
  cancellation: BookingCancellationResult;
}) {
  return (
    <section className="panel mt-8 border border-warning/20 p-6">
      <p className="eyebrow">Đặt chỗ đã hủy</p>
      <h2 className="mt-2 text-xl font-bold">Kết quả hoàn tiền</h2>
      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
        <Detail label="Tổng ban đầu">
          {formatMoney(cancellation.originalAmount, cancellation.currency)}
        </Detail>
        <Detail label="Khoản hoàn">
          {formatMoney(cancellation.refundAmount, cancellation.currency)}
        </Detail>
        <Detail label="Phí hủy">
          {formatMoney(
            cancellation.cancellationFeeAmount,
            cancellation.currency,
          )}
        </Detail>
      </div>
      {cancellation.refund?.status === "PENDING" ? (
        <p className="mt-5 rounded-xl bg-sun/30 p-4 text-sm text-warning">
          Yêu cầu hoàn tiền đã được ghi nhận và đang chờ xử lý. Khoản tiền chưa
          được xác nhận là đã về tài khoản.
        </p>
      ) : cancellation.refundAmount === "0" ? (
        <p className="mt-5 text-sm text-ink">
          Chính sách áp dụng không có khoản hoàn tiền.
        </p>
      ) : null}
    </section>
  );
}

function CancellationDialog({
  preview,
  previewPending,
  previewError,
  cancellation,
  cancellationPending,
  cancellationError,
  reasonNote,
  onReasonNoteChange,
  onRetryPreview,
  onConfirm,
  onClose,
}: {
  preview: BookingCancellationPreview | null;
  previewPending: boolean;
  previewError: unknown;
  cancellation: BookingCancellationResult | null;
  cancellationPending: boolean;
  cancellationError: unknown;
  reasonNote: string;
  onReasonNoteChange: (value: string) => void;
  onRetryPreview: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const canConfirm =
    preview?.cancellationAllowed === true &&
    preview.reason !== "PARTIAL_CANCELLATION_REQUIRED" &&
    !cancellation;

  return (
    <AccessibleDialog labelledBy="cancellation-title" onClose={onClose} busy={cancellationPending} className="">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Xác nhận hủy</p>
            <h2 id="cancellation-title" className="mt-2 text-2xl font-bold">
              Chính sách hủy đặt chỗ
            </h2>
          </div>
          <button
            type="button"
            aria-label="Đóng xác nhận hủy"
            className="rounded-lg border border-line/10 px-3 py-2 text-ink hover:text-ink"
            disabled={cancellationPending}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {previewPending ? (
          <p className="mt-6" role="status">
            Đang tính quyền hoàn tiền...
          </p>
        ) : previewError ? (
          <div className="mt-6">
            <p className="text-danger" role="alert">
              {cancellationErrorMessage(previewError)}
            </p>
            <button
              type="button"
              className="secondary-button mt-4"
              onClick={onRetryPreview}
            >
              Tính lại
            </button>
          </div>
        ) : preview ? (
          <>
            <div className="mt-6 grid gap-4 rounded-2xl bg-surface/5 p-5 sm:grid-cols-3">
              <Detail label="Tổng ban đầu">
                {formatMoney(preview.originalAmount, preview.currency)}
              </Detail>
              <Detail label="Dự kiến hoàn">
                {formatMoney(preview.refundAmount, preview.currency)}
              </Detail>
              <Detail label="Phí hủy">
                {formatMoney(preview.cancellationFeeAmount, preview.currency)}
              </Detail>
            </div>
            <div className="mt-5 space-y-3">
              {preview.items.map((item, index) => (
                <div
                  key={item.bookingItemId}
                  className="flex flex-wrap justify-between gap-3 border-b border-line/10 pb-3 text-sm"
                >
                  <span>Hạng mục {index + 1}</span>
                  <span className="text-ink">
                    Hoàn {formatMoney(item.refundAmount, preview.currency)} ·
                    Phí {formatMoney(item.cancellationFeeAmount, preview.currency)}
                  </span>
                </div>
              ))}
            </div>
            {preview.refundAmount === "0" && preview.cancellationAllowed ? (
              <p className="mt-5 rounded-xl bg-sun/30 p-4 text-sm text-warning">
                Bạn vẫn có thể hủy, nhưng chính sách hiện tại không hoàn tiền.
              </p>
            ) : null}
            {!preview.cancellationAllowed ||
            preview.reason === "PARTIAL_CANCELLATION_REQUIRED" ? (
              <p className="mt-5 rounded-xl bg-coral/30 p-4 text-sm text-danger">
                {preview.reason === "PARTIAL_CANCELLATION_REQUIRED"
                  ? "Một số hạng mục không thể hủy; GoBook hiện chưa hỗ trợ hủy từng phần."
                  : "Chính sách không cho phép hủy đặt chỗ này."}
              </p>
            ) : null}
            <p className="mt-5 text-sm text-muted">
              Đây là bản xem trước. Hệ thống sẽ tính lại bằng thời gian máy chủ
              khi bạn xác nhận, nên số tiền có thể thay đổi.
            </p>
            {canConfirm ? (
              <label className="mt-5 block text-sm text-ink">
                Lý do (không bắt buộc)
                <textarea
                  className="mt-2 min-h-20 w-full rounded-xl border border-line/10 bg-surface p-3 text-ink"
                  maxLength={500}
                  value={reasonNote}
                  onChange={(event) => onReasonNoteChange(event.target.value)}
                />
              </label>
            ) : null}
          </>
        ) : null}

        {cancellationError ? (
          <p className="mt-5 text-sm text-danger" role="alert">
            {cancellationErrorMessage(cancellationError)}
          </p>
        ) : null}
        {cancellation ? (
          <div className="mt-6">
            <CancellationSummary cancellation={cancellation} />
          </div>
        ) : null}
        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="secondary-button"
            disabled={cancellationPending}
            onClick={onClose}
          >
            {cancellation ? "Đóng" : "Quay lại"}
          </button>
          {!cancellation ? (
            <button
              type="button"
              className="danger-button"
              disabled={!canConfirm || cancellationPending}
              onClick={onConfirm}
            >
              {cancellationPending ? "Đang hủy..." : "Xác nhận hủy"}
            </button>
          ) : null}
        </div>
      </AccessibleDialog>
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
    <article className="panel relative overflow-hidden border-l-[7px] border-l-electric p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label">{ticket.bookingItem.serviceTitle}</p>
          <h2 className="mt-2 text-xl font-bold">{ticket.ticketCode}</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}
        >
          {status.label}
        </span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line/10 pt-5 text-sm">
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
        <p className="mt-4 text-xs text-muted">
          Đã check-in lúc {formatTime(ticket.checkedInAt)}
        </p>
      ) : null}
      {!bookingConfirmed ? (
        <p className="mt-4 text-sm text-warning">
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
  onRetry,
}: {
  ticket: CustomerTicket;
  qrUrl: string | null;
  loading: boolean;
  error: string | null;
  downloading: boolean;
  onClose: () => void;
  onDownload: () => void;
  onRetry: () => void;
}) {
  return (
    <AccessibleDialog labelledBy="ticket-qr-title" onClose={onClose} className="text-center">
        <div className="flex items-start justify-between gap-4 text-left">
          <div>
            <p className="eyebrow">Mã QR vé</p>
            <h2 id="ticket-qr-title" className="mt-2 text-2xl font-bold">
              {ticket.ticketCode}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Đóng mã QR"
            className="rounded-lg border border-line/10 px-3 py-2 text-ink hover:text-ink"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="mx-auto mt-6 grid min-h-72 max-w-md place-items-center rounded-2xl bg-surface p-4 text-ink">
          {loading ? (
            <p role="status">Đang tạo mã QR...</p>
          ) : error ? (
            <div>
              <p className="break-words text-danger" role="alert">
                {error}
              </p>
              <button
                type="button"
                className="secondary-button mt-4"
                onClick={onRetry}
              >
                Thử lại mã QR
              </button>
            </div>
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

        <p className="mt-4 text-sm text-muted">
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
      </AccessibleDialog>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-canvas px-5 text-center text-ink">
      <section className="panel w-full max-w-xl p-8">{children}</section>
    </main>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="section-label">{label}</p>
      <p className="mt-1 text-ink">{children}</p>
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
      className: "bg-lavender/40 text-info",
    };
  }
  if (status === "VOIDED") {
    return {
      label: "Vé không còn hiệu lực",
      className: "bg-coral/30 text-danger",
    };
  }
  return {
    label: "Sẵn sàng sử dụng",
    className: "bg-mint/30 text-success",
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
  return (
    "Không thể tạo mã QR. Vui lòng thử lại." +
    (error instanceof ApiError && error.requestId
      ? ` Mã hỗ trợ: ${error.requestId}`
      : "")
  );
}

function cancellationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn.";
    if (error.status === 403) return "Bạn không có quyền hủy booking này.";
    if (error.code === "TICKET_ALREADY_USED") {
      return "Booking có vé đã check-in nên không thể hủy.";
    }
    if (error.code === "PARTIAL_CANCELLATION_REQUIRED") {
      return "Một số hạng mục không thể hủy; GoBook chưa hỗ trợ hủy từng phần.";
    }
    if (error.code === "CANCELLATION_NOT_ALLOWED") {
      return "Chính sách không cho phép hủy booking này.";
    }
    if (error.code === "POLICY_SNAPSHOT_MISSING") {
      return "Booking cũ thiếu chính sách hủy; vui lòng liên hệ hỗ trợ.";
    }
    if (error.code === "INCONSISTENT_PAYMENT_STATE") {
      return "Trạng thái thanh toán cần được hỗ trợ kiểm tra trước khi hủy.";
    }
  }
  return "Không thể xử lý yêu cầu hủy. Bạn có thể thử lại an toàn.";
}
