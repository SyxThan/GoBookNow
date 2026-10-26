"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ApiError,
  getPaymentResult,
  type PaymentResult,
} from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  derivePaymentResultViewState,
  hasPaymentPollingTimedOut,
  isPaymentPollingState,
  paymentPollingDeadline,
  paymentRefetchInterval,
} from "@/lib/payment-result-state";

type ReturnHint = "success" | "error" | "cancel" | null;

function normalizeReturnHint(value: string | null): ReturnHint {
  return value === "success" || value === "error" || value === "cancel"
    ? value
    : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "Mã thanh toán không hợp lệ.";
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền xem thanh toán này.";
    if (error.status === 404) return "Không tìm thấy thanh toán.";
  }
  return (
    "Không thể kết nối đến GoBook API. Vui lòng thử lại." +
    (error instanceof ApiError && error.requestId
      ? ` Mã hỗ trợ: ${error.requestId}`
      : "")
  );
}

export function PaymentResultClient() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId") ?? "";
  const returnHint = normalizeReturnHint(searchParams.get("return"));
  const [pollingStartedAt] = useState(() => Date.now());
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem("gobook.accessToken"),
  );

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    if (token) sessionStorage.setItem("gobook.accessToken", token);
    else sessionStorage.removeItem("gobook.accessToken");
  }, []);

  const paymentQuery = useQuery({
    queryKey: ["payment-result", paymentId],
    queryFn: ({ signal }) =>
      getPaymentResult(paymentId, accessToken, setAccessToken, signal),
    enabled: Boolean(paymentId),
    retry: false,
    refetchInterval: (query) =>
      paymentRefetchInterval(
        query.state.data as PaymentResult | undefined,
        pollingStartedAt,
        Date.now(),
      ),
    refetchIntervalInBackground: false,
  });
  const pollingTimedOut = usePollingTimeout(
    paymentQuery.data,
    pollingStartedAt,
  );

  if (!paymentId) {
    return (
      <ResultShell>
        <StatusIcon tone="error">!</StatusIcon>
        <p className="eyebrow mt-7">Liên kết không hợp lệ</p>
        <h1 className="mt-3 text-3xl font-bold">Thiếu mã thanh toán</h1>
        <p className="mt-4 text-muted">
          Liên kết kết quả thanh toán không chứa định danh cần thiết.
        </p>
        <ResultActions />
      </ResultShell>
    );
  }

  if (paymentQuery.isPending && !paymentQuery.data) {
    return (
      <ResultShell>
        <StatusIcon tone="pending" spinning />
        <p className="eyebrow mt-7">Đang xác minh</p>
        <h1 className="mt-3 text-3xl font-bold">
          Đang kiểm tra trạng thái thanh toán...
        </h1>
        <p className="mt-4 text-muted">
          GoBook đang đọc trạng thái trực tiếp từ hệ thống thanh toán.
        </p>
      </ResultShell>
    );
  }

  if (paymentQuery.isError || !paymentQuery.data) {
    return (
      <ResultShell>
        <StatusIcon tone="error">!</StatusIcon>
        <p className="eyebrow mt-7">Không thể xác minh</p>
        <h1 className="mt-3 text-3xl font-bold">
          Chưa đọc được trạng thái thanh toán
        </h1>
        <p className="mt-4 text-muted">{errorMessage(paymentQuery.error)}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="primary-button"
            disabled={paymentQuery.isFetching}
            onClick={() => void paymentQuery.refetch()}
          >
            {paymentQuery.isFetching ? "Đang kiểm tra..." : "Thử lại"}
          </button>
          <Link href="/" className="secondary-button">
            Về trang chủ
          </Link>
        </div>
      </ResultShell>
    );
  }

  const payment = paymentQuery.data;
  const viewState = derivePaymentResultViewState(payment);
  const details = <PaymentDetails payment={payment} />;

  if (viewState === "CONFIRMED") {
    return (
      <ResultShell>
        <StatusIcon tone="success">✓</StatusIcon>
        <p className="eyebrow mt-7">Hoàn tất</p>
        <h1 className="mt-3 text-3xl font-bold">Thanh toán thành công</h1>
        <p className="mt-4 text-ink">Đặt chỗ của bạn đã được xác nhận.</p>
        {details}
        <ResultActions bookingId={payment.booking.id} />
      </ResultShell>
    );
  }

  if (viewState === "PAYMENT_RECEIVED") {
    return (
      <ResultShell>
        <StatusIcon tone="success">✓</StatusIcon>
        <p className="eyebrow mt-7">Đã nhận thanh toán</p>
        <h1 className="mt-3 text-3xl font-bold">
          Hệ thống đang xác nhận đặt chỗ
        </h1>
        <p className="mt-4 text-ink">
          Đã nhận thanh toán. Hệ thống đang xử lý xác nhận đặt chỗ.
        </p>
        {details}
        <PollingNote timedOut={pollingTimedOut} />
      </ResultShell>
    );
  }

  if (viewState === "RECONCILIATION") {
    return (
      <ResultShell>
        <StatusIcon tone="error">!</StatusIcon>
        <p className="eyebrow mt-7">Cần kiểm tra trạng thái</p>
        <h1 className="mt-3 text-3xl font-bold">Đặt chỗ chưa thể xác nhận</h1>
        <p className="mt-4 text-ink">
          {payment.booking.status === "EXPIRED"
            ? "Đã ghi nhận thanh toán, nhưng đặt chỗ đã hết hạn. Khoản tiền đang chờ xử lý hoàn tiền."
            : "Thanh toán đã được ghi nhận nhưng đặt chỗ chưa thể xác nhận. Vui lòng kiểm tra lại trạng thái đặt chỗ."}
        </p>
        {details}
        <ResultActions />
      </ResultShell>
    );
  }

  if (viewState === "EXPIRED") {
    return (
      <ResultShell>
        <StatusIcon tone="error">×</StatusIcon>
        <p className="eyebrow mt-7">Đã hết hạn</p>
        <h1 className="mt-3 text-3xl font-bold">Phiên thanh toán đã hết hạn</h1>
        <p className="mt-4 text-muted">
          GoBook không còn chờ thanh toán cho phiên đặt chỗ này.
        </p>
        {details}
        <ResultActions />
      </ResultShell>
    );
  }

  if (viewState === "CANCELLED") {
    return (
      <ResultShell>
        <StatusIcon tone="error">×</StatusIcon>
        <p className="eyebrow mt-7">Đã hủy</p>
        <h1 className="mt-3 text-3xl font-bold">
          Thanh toán/đặt chỗ đã bị hủy
        </h1>
        <p className="mt-4 text-muted">
          Trạng thái từ GoBook cho biết phiên này đã bị hủy.
        </p>
        {details}
        <ResultActions />
      </ResultShell>
    );
  }

  return (
    <ResultShell>
      <StatusIcon tone="pending" spinning />
      <p className="eyebrow mt-7">Đang chờ xác nhận</p>
      <h1 className="mt-3 text-3xl font-bold">
        {pollingTimedOut ? "Đang chờ xác nhận" : "Đang xác nhận thanh toán"}
      </h1>
      <p className="mt-4 text-muted">
        {returnHint === "success"
          ? "Trình duyệt đã quay lại, nhưng GoBook vẫn đang chờ xác nhận trực tiếp từ SePay."
          : returnHint === "cancel" || returnHint === "error"
            ? "Bạn đã quay lại từ SePay. GoBookNow đang kiểm tra kết quả thanh toán để xác nhận đặt chỗ."
            : "Giao dịch đang được hệ thống xác nhận."}
      </p>
      {details}
      <PollingNote timedOut={pollingTimedOut} />
    </ResultShell>
  );
}

function usePollingTimeout(
  payment: PaymentResult | undefined,
  pollingStartedAt: number,
): boolean {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!payment || !isPaymentPollingState(payment)) return;

    const remaining =
      paymentPollingDeadline(payment, pollingStartedAt) - Date.now();
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(timer);
  }, [payment, pollingStartedAt]);

  return payment
    ? hasPaymentPollingTimedOut(payment, pollingStartedAt, now)
    : false;
}

function PaymentDetails({ payment }: { payment: PaymentResult }) {
  return (
    <div className="mt-8 grid gap-3 rounded-2xl border border-line/10 bg-canvas/70 p-5 text-left sm:grid-cols-2">
      <Detail label="Số tiền">
        {formatMoney(payment.amount, payment.currency)}
      </Detail>
      <Detail label="Mã thanh toán">{payment.id}</Detail>
    </div>
  );
}

function PollingNote({ timedOut }: { timedOut: boolean }) {
  return (
    <p className="mt-5 text-sm text-muted" role="status">
      {timedOut
        ? "Đang chờ xác nhận. Bạn có thể tải lại trang hoặc kiểm tra lại trạng thái đặt chỗ sau."
        : "Trang này tự kiểm tra lại sau mỗi 2,5 giây."}
    </p>
  );
}

function ResultShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-[70vh] place-items-center overflow-hidden bg-canvas px-5 py-12 text-ink">
      <section
        className="panel relative w-full max-w-2xl p-7 text-center sm:p-12"
        aria-live="polite"
      >
        {children}
      </section>
    </main>
  );
}

function StatusIcon({
  tone,
  spinning = false,
  children,
}: {
  tone: "success" | "pending" | "error";
  spinning?: boolean;
  children?: ReactNode;
}) {
  const colors = {
    success: "border-success/30 bg-mint/30 text-success",
    pending: "border-line/30 bg-sun/30 text-info",
    error: "border-danger/30 bg-coral/30 text-danger",
  };
  return (
    <div
      className={`mx-auto grid h-16 w-16 place-items-center rounded-full border text-3xl font-bold ${colors[tone]}`}
      aria-hidden="true"
    >
      {spinning ? (
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        children
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="section-label">{label}</p>
      <p className="mt-2 truncate text-sm font-medium text-ink">{children}</p>
    </div>
  );
}

function ResultActions({ bookingId }: { bookingId?: string }) {
  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <Link href="/bookings" className="secondary-button">
        Đơn của tôi
      </Link>
      {bookingId ? (
        <Link
          href={`/bookings/${encodeURIComponent(bookingId)}`}
          className="primary-button"
        >
          Xem vé điện tử
        </Link>
      ) : null}
      <Link href="/services" className="secondary-button">
        Xem dịch vụ
      </Link>
      <Link href="/" className="secondary-button">
        Về trang chủ
      </Link>
    </div>
  );
}
