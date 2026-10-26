"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import {
  getTransaction,
  type TransactionDetail,
} from "@/lib/admin-transactions";

const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("vi-VN") : "—";
const amount = (value: string) =>
  `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ₫`;
export default function TransactionDetailClient({
  paymentId,
}: {
  paymentId: string;
}) {
  const [token, setTokenState] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem("gobook.accessToken"),
  );
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const setToken = useCallback((value: string | null) => {
    setTokenState(value);
    if (value) sessionStorage.setItem("gobook.accessToken", value);
    else sessionStorage.removeItem("gobook.accessToken");
  }, []);
  useEffect(() => {
    let active = true;
    void getTransaction(paymentId, token, setToken)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((cause: unknown) => {
        if (active) {
          if (
            cause instanceof ApiError &&
            (cause.status === 401 || cause.status === 403)
          )
            setDetail(null);
          setError(
            cause instanceof ApiError && cause.status === 403
              ? "Tài khoản này không có quyền ADMIN."
              : cause instanceof Error
                ? cause.message
                : "Không thể tải giao dịch.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [paymentId, token, setToken, retry]);
  return (
    <main className="min-h-[70vh] bg-canvas text-ink">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <Link href="/transactions" className="text-info underline">
          ← Danh sách giao dịch
        </Link>
        <header className="mt-6 border-b border-line/10 pb-8">
          <p className="eyebrow">Quản trị · Chỉ xem</p>
          <h1 className="mt-3 text-3xl font-bold">Chi tiết giao dịch</h1>
          <p className="mt-2 break-all text-muted">{paymentId}</p>
        </header>
        {loading && (
          <p role="status" className="mt-8">
            Đang tải chi tiết…
          </p>
        )}
        {error && (
          <p role="alert" className="mt-8 text-danger">
            {error}{" "}
            <button
              className="underline"
              onClick={() => {
                setLoading(true);
                setError(null);
                setRetry(retry + 1);
              }}
            >
              Thử lại
            </button>
          </p>
        )}
        {detail && (
          <div className="mt-8 space-y-8">
            <section className="panel p-6" aria-label="Payment và Booking">
              <dl className="grid gap-5 sm:grid-cols-2">
                <Info label="Booking" value={detail.booking.bookingCode} />
                <Info label="Booking status" value={detail.booking.status} />
                <Info label="Customer" value={detail.booking.customer.email} />
                <Info
                  label="Vendor"
                  value={detail.booking.vendor.displayName}
                />
                <Info label="Payment status" value={detail.status} />
                <Info label="Amount" value={amount(detail.amount)} />
                <Info label="Created" value={date(detail.createdAt)} />
                <Info label="Succeeded" value={date(detail.succeededAt)} />
                <Info
                  label="Refund state"
                  value={`${detail.refund.state} · thành công ${amount(detail.refund.succeededAmount)} · đang chờ ${amount(detail.refund.pendingAmount)}`}
                />
              </dl>
            </section>
            <section className="panel p-6" aria-label="Payment Attempts">
              <h2 className="text-xl font-bold">
                Attempts ({detail.attempts.length})
              </h2>
              {detail.attempts.length === 0 && (
                <p className="mt-4 text-muted">Chưa có Attempt.</p>
              )}
              <div className="mt-5 space-y-4">
                {detail.attempts.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-line/10 p-4"
                  >
                    <p className="font-medium">
                      {item.provider} · {item.status} · {amount(item.amount)}
                    </p>
                    <p className="mt-1 break-all text-sm text-muted">
                      Reference: {item.merchantReference} · Provider ID:{" "}
                      {item.providerTransactionId || "—"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Created: {date(item.createdAt)} · Succeeded:{" "}
                      {date(item.succeededAt)} · Failed: {date(item.failedAt)}
                    </p>
                    {item.failureCode && (
                      <p className="mt-2 text-sm text-danger">
                        Failure code: {item.failureCode}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
            <section className="panel p-6" aria-label="Refunds">
              <h2 className="text-xl font-bold">
                Refunds ({detail.refunds.length})
              </h2>
              {detail.refunds.length === 0 && (
                <p className="mt-4 text-muted">Chưa có Refund.</p>
              )}
              <div className="mt-5 space-y-4">
                {detail.refunds.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-line/10 p-4"
                  >
                    <p className="font-medium">
                      {item.status} · {item.kind} · {amount(item.amount)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {item.reason}
                      {item.reasonNote ? ` · ${item.reasonNote}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Requested: {date(item.requestedAt)} · Succeeded:{" "}
                      {date(item.succeededAt)} · Cancelled:{" "}
                      {date(item.cancelledAt)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <section className="panel p-6" aria-label="Timeline">
              <h2 className="text-xl font-bold">Timeline</h2>
              <ol className="mt-5 space-y-3">
                {detail.timeline.map((event, index) => (
                  <li
                    key={`${event.reference}-${event.type}-${index}`}
                    className="border-l-2 border-line/40 pl-4"
                  >
                    <p>{event.type}</p>
                    <p className="text-sm text-muted">
                      {date(event.at)} · {event.reference}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 break-all text-sm">{value}</dd>
    </div>
  );
}
