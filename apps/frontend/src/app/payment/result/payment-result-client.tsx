"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ApiError,
  getPaymentResult,
  type PaymentResult,
} from "@/lib/api-client";

const POLL_INTERVAL_MS = 2_500;

type ReturnHint = "success" | "error" | "cancel" | null;

function normalizeReturnHint(value: string | null): ReturnHint {
  return value === "success" || value === "error" || value === "cancel"
    ? value
    : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Vui lòng đăng nhập để xem thanh toán này.";
    if (error.status === 403) return "Bạn không có quyền xem thanh toán này.";
    if (error.status === 404) return "Không tìm thấy thanh toán.";
    return error.message;
  }
  return "Không thể kết nối đến GoBook API.";
}

function formatMoney(amount: string, currency: string): string {
  try {
    return `${new Intl.NumberFormat("vi-VN").format(BigInt(amount))} ${
      currency === "VND" ? "₫" : currency
    }`;
  } catch {
    return `${amount} ${currency}`;
  }
}

export function PaymentResultClient() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId") ?? "";
  const returnHint = normalizeReturnHint(searchParams.get("return"));
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem("gobook.accessToken"),
  );
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    if (token) sessionStorage.setItem("gobook.accessToken", token);
    else sessionStorage.removeItem("gobook.accessToken");
  }, []);

  useEffect(() => {
    if (!paymentId) {
      return;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const result = await getPaymentResult(
          paymentId,
          accessToken,
          setAccessToken,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setPayment(result);
        setError(null);
        setLoading(false);

        if (result.status === "PENDING") {
          timer = setTimeout(() => void load(), POLL_INTERVAL_MS);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(errorMessage(loadError));
        setLoading(false);
      }
    }

    const startTimer = setTimeout(() => void load(), 0);
    return () => {
      controller.abort();
      clearTimeout(startTimer);
      if (timer) clearTimeout(timer);
    };
  }, [accessToken, paymentId, retry, setAccessToken]);

  if (!paymentId) {
    return (
      <ResultShell>
        <StatusIcon tone="error">!</StatusIcon>
        <p className="eyebrow mt-7">Liên kết không hợp lệ</p>
        <h1 className="mt-3 text-3xl font-semibold">Thiếu mã thanh toán</h1>
        <p className="mt-4 text-slate-400">
          Liên kết kết quả thanh toán không chứa định danh cần thiết.
        </p>
        <ResultActions />
      </ResultShell>
    );
  }

  if (loading && !payment) {
    return (
      <ResultShell>
        <StatusIcon tone="pending" spinning />
        <p className="eyebrow mt-7">Đang xác minh</p>
        <h1 className="mt-3 text-3xl font-semibold">
          Đang kiểm tra trạng thái thanh toán…
        </h1>
        <p className="mt-4 text-slate-400">
          GoBook đang đọc trạng thái trực tiếp từ hệ thống thanh toán.
        </p>
      </ResultShell>
    );
  }

  if (error || !payment) {
    return (
      <ResultShell>
        <StatusIcon tone="error">!</StatusIcon>
        <p className="eyebrow mt-7">Không thể xác minh</p>
        <h1 className="mt-3 text-3xl font-semibold">
          Chưa đọc được trạng thái thanh toán
        </h1>
        <p className="mt-4 text-slate-400">{error}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {paymentId && (
            <button
              className="primary-button"
              onClick={() => {
                setLoading(true);
                setError(null);
                setRetry((value) => value + 1);
              }}
            >
              Thử lại
            </button>
          )}
          <Link href="/" className="secondary-button">
            Về trang chủ
          </Link>
        </div>
      </ResultShell>
    );
  }

  const details = (
    <div className="mt-8 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-5 text-left sm:grid-cols-2">
      <Detail label="Số tiền">
        {formatMoney(payment.amount, payment.currency)}
      </Detail>
      <Detail label="Mã thanh toán">{payment.id}</Detail>
    </div>
  );

  if (payment.status === "EXPIRED" || payment.booking.status === "EXPIRED") {
    return (
      <ResultShell>
        <StatusIcon tone="error">×</StatusIcon>
        <p className="eyebrow mt-7">Đã hết hạn</p>
        <h1 className="mt-3 text-3xl font-semibold">
          Phiên thanh toán đã hết hạn
        </h1>
        <p className="mt-4 text-slate-400">
          GoBook không còn chờ thanh toán cho phiên đặt chỗ này.
        </p>
        {details}
        <ResultActions />
      </ResultShell>
    );
  }

  if (
    payment.status === "CANCELLED" ||
    payment.booking.status === "CANCELLED"
  ) {
    return (
      <ResultShell>
        <StatusIcon tone="error">×</StatusIcon>
        <p className="eyebrow mt-7">Đã hủy</p>
        <h1 className="mt-3 text-3xl font-semibold">
          Thanh toán chưa được xác nhận
        </h1>
        <p className="mt-4 text-slate-400">
          Trạng thái từ GoBook cho biết phiên này đã bị hủy.
        </p>
        {details}
        <ResultActions />
      </ResultShell>
    );
  }

  if (
    payment.status === "SUCCEEDED" &&
    payment.booking.status === "CONFIRMED"
  ) {
    return (
      <ResultShell>
        <StatusIcon tone="success">✓</StatusIcon>
        <p className="eyebrow mt-7">Hoàn tất</p>
        <h1 className="mt-3 text-3xl font-semibold">Thanh toán thành công</h1>
        <p className="mt-4 text-slate-300">Đặt chỗ đã được xác nhận.</p>
        {details}
        <ResultActions />
      </ResultShell>
    );
  }

  if (payment.status === "SUCCEEDED") {
    return (
      <ResultShell>
        <StatusIcon tone="success">✓</StatusIcon>
        <p className="eyebrow mt-7">Đã nhận thanh toán</p>
        <h1 className="mt-3 text-3xl font-semibold">
          Hệ thống đang xác nhận đặt chỗ
        </h1>
        <p className="mt-4 text-slate-300">
          Khoản thanh toán đã được GoBook xác minh. Đặt chỗ chưa được xác nhận ở
          bước này.
        </p>
        {details}
        <ResultActions />
      </ResultShell>
    );
  }

  const returnedWithoutSuccess =
    returnHint === "cancel" || returnHint === "error";
  return (
    <ResultShell>
      <StatusIcon tone="pending" spinning />
      <p className="eyebrow mt-7">Đang chờ xác nhận</p>
      <h1 className="mt-3 text-3xl font-semibold">
        {returnedWithoutSuccess
          ? "Thanh toán chưa được xác nhận"
          : "Đang xác nhận thanh toán…"}
      </h1>
      <p className="mt-4 text-slate-400">
        {returnHint === "success"
          ? "Trình duyệt đã quay lại, nhưng GoBook vẫn đang chờ xác nhận trực tiếp từ SePay."
          : "GoBook sẽ tự cập nhật khi nhận được xác nhận trực tiếp từ SePay."}
      </p>
      {details}
      <p className="mt-5 text-sm text-slate-500">
        Trang này tự kiểm tra lại sau mỗi vài giây.
      </p>
    </ResultShell>
  );
}

function ResultShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-5 py-12 text-slate-100">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-teal-400/10 blur-3xl" />
      <section className="panel relative w-full max-w-2xl p-7 text-center shadow-2xl shadow-black/30 sm:p-12">
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
    success: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
    pending: "border-teal-300/30 bg-teal-300/10 text-teal-200",
    error: "border-rose-300/30 bg-rose-300/10 text-rose-200",
  };
  return (
    <div
      className={`mx-auto grid h-16 w-16 place-items-center rounded-full border text-3xl font-semibold ${colors[tone]}`}
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
      <p className="mt-2 truncate text-sm font-medium text-slate-200">
        {children}
      </p>
    </div>
  );
}

function ResultActions() {
  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <Link href="/services" className="primary-button">
        Khám phá dịch vụ
      </Link>
      <Link href="/" className="secondary-button">
        Về trang chủ
      </Link>
    </div>
  );
}
