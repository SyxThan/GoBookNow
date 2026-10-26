"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, login } from "@/lib/api-client";
import { getTransactions, getTransactionSummary, type TransactionFilters,
  type TransactionList, type TransactionSummary } from "@/lib/admin-transactions";

const emptyFilters: TransactionFilters = { search: "", bookingCode: "", bookingId: "", userId: "", userEmail: "",
  paymentStatus: "", attemptStatus: "", provider: "", from: "", to: "", sort: "newest", page: 1, limit: 20 };
const date = (value: string) => new Date(value).toLocaleString("vi-VN");
const localDateTime = (value: string | undefined) => {
  if (!value) return "";
  const dateValue = new Date(value);
  return new Date(dateValue.getTime() - dateValue.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const amount = (value: string) => `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ₫`;
const failure = (error: unknown) => error instanceof ApiError && error.status === 403
  ? "Tài khoản này không có quyền ADMIN." : error instanceof Error ? error.message : "Không thể kết nối API.";

export default function AdminTransactionsClient() {
  const [token, setTokenState] = useState<string | null>(() =>
    typeof window === "undefined" ? null : sessionStorage.getItem("gobook.accessToken"));
  const [authRequired, setAuthRequired] = useState(false);
  const [draft, setDraft] = useState<TransactionFilters>(emptyFilters);
  const [filters, setFilters] = useState<TransactionFilters>(emptyFilters);
  const [list, setList] = useState<TransactionList | null>(null);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setToken = useCallback((value: string | null) => {
    setTokenState(value);
    if (value) sessionStorage.setItem("gobook.accessToken", value);
    else sessionStorage.removeItem("gobook.accessToken");
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const [rows, totals] = await Promise.all([
          getTransactions(filters, token, setToken), getTransactionSummary(filters, token, setToken),
        ]);
        if (active) { setList(rows); setSummary(totals); setAuthRequired(false); }
      } catch (cause) {
        if (active) { setError(failure(cause));
          if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
            setList(null); setSummary(null); setAuthRequired(true);
          } }
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [filters, token, setToken]);
  const submit = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft, page: 1 }); };
  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    try { setToken(await login(String(data.get("email")), String(data.get("password"))));
      window.dispatchEvent(new Event("gobook:session"));
      setAuthRequired(false); }
    catch (cause) { setError(failure(cause)); } finally { setBusy(false); }
  };
  if (authRequired) return <main className="grid min-h-[70vh] place-items-center bg-canvas px-5 text-ink">
    <form onSubmit={authenticate} className="panel w-full max-w-md p-8">
      <p className="eyebrow">GoBook Admin</p><h1 className="mt-3 text-3xl font-bold">Đăng nhập Admin</h1>
      <input name="email" type="email" aria-label="Email" autoComplete="username" required className="input mt-6" placeholder="Email" />
      <input name="password" type="password" aria-label="Mật khẩu" autoComplete="current-password" required className="input mt-3" placeholder="Mật khẩu" />
      {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      <button className="primary-button mt-6 w-full" disabled={busy}>Đăng nhập</button>
    </form></main>;
  return <main className="min-h-[70vh] bg-canvas text-ink"><div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
    <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line/10 pb-8">
      <div><p className="eyebrow">Quản trị · Chỉ xem</p><h1 className="mt-3 text-4xl font-bold">Giao dịch & thanh toán</h1>
        <p className="mt-2 text-sm text-muted">Điều tra Payment, Attempt và Refund. Mặc định 30 ngày gần nhất.</p></div>
      <div className="flex gap-2"><Link className="secondary-button" href="/admin/vendor-applications">Hồ sơ đối tác</Link>
        <Link className="secondary-button" href="/">Trang chủ</Link></div>
    </header>
    <form onSubmit={submit} className="panel mt-8 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Bộ lọc giao dịch">
      <input className="input" aria-label="Tìm mã giao dịch" placeholder="Payment / Attempt / reference" value={draft.search}
        onChange={(event) => setDraft({ ...draft, search: event.target.value })} />
      <input className="input" aria-label="Mã Booking" placeholder="Mã Booking" value={draft.bookingCode}
        onChange={(event) => setDraft({ ...draft, bookingCode: event.target.value })} />
      <input className="input" aria-label="Booking ID" placeholder="Booking UUID" value={draft.bookingId}
        onChange={(event) => setDraft({ ...draft, bookingId: event.target.value })} />
      <input className="input" aria-label="Customer ID" placeholder="Customer UUID" value={draft.userId}
        onChange={(event) => setDraft({ ...draft, userId: event.target.value })} />
      <input className="input" aria-label="Email khách hàng" type="email" placeholder="Email khách hàng" value={draft.userEmail}
        onChange={(event) => setDraft({ ...draft, userEmail: event.target.value })} />
      <select className="input" aria-label="Payment status" value={draft.paymentStatus}
        onChange={(event) => setDraft({ ...draft, paymentStatus: event.target.value })}>
        <option value="">Mọi Payment status</option>{["PENDING", "SUCCEEDED", "EXPIRED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
      </select>
      <select className="input" aria-label="Attempt status" value={draft.attemptStatus}
        onChange={(event) => setDraft({ ...draft, attemptStatus: event.target.value })}>
        <option value="">Mọi Attempt status</option>{["PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"].map((s) => <option key={s}>{s}</option>)}
      </select>
      <select className="input" aria-label="Provider" value={draft.provider}
        onChange={(event) => setDraft({ ...draft, provider: event.target.value })}>
        <option value="">Mọi Provider</option><option value="SEPAY">SEPAY</option>
      </select>
      <label className="text-sm text-muted">Từ ngày <input className="input mt-1" type="datetime-local" value={localDateTime(draft.from)}
        onChange={(event) => setDraft({ ...draft, from: event.target.value ? new Date(event.target.value).toISOString() : "" })} /></label>
      <label className="text-sm text-muted">Đến ngày <input className="input mt-1" type="datetime-local" value={localDateTime(draft.to)}
        onChange={(event) => setDraft({ ...draft, to: event.target.value ? new Date(event.target.value).toISOString() : "" })} /></label>
      <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4">
        <button className="primary-button" type="submit">Áp dụng bộ lọc</button>
        <button className="secondary-button" type="button" onClick={() => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); }}>Xóa bộ lọc</button>
        <select className="input max-w-44" aria-label="Sắp xếp" value={filters.sort}
          onChange={(event) => { const sort = event.target.value as "newest" | "oldest"; setDraft({ ...draft, sort }); setFilters({ ...filters, sort, page: 1 }); }}>
          <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option>
        </select>
      </div>
    </form>
    {error && <p role="alert" className="mt-5 text-danger">{error} <button className="underline" onClick={() => setFilters({ ...filters })}>Thử lại</button></p>}
    {loading && <p role="status" className="mt-5">Đang tải giao dịch…</p>}
    {summary && <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Tổng quan giao dịch">
      {Object.entries(summary.byStatus).map(([status, value]) => <div key={status} className="panel p-5">
        <p className="section-label">{status}</p><p className="mt-2 text-2xl font-bold">{value.count}</p>
        <p className="mt-1 text-sm text-muted">{amount(value.amount)}</p></div>)}
      <p className="text-sm text-muted sm:col-span-2 lg:col-span-4">Refund thành công: {summary.refunds.SUCCEEDED?.count ?? 0} · {amount(summary.refunds.SUCCEEDED?.amount ?? "0")} · Đang chờ: {summary.refunds.PENDING?.count ?? 0}</p>
    </section>}
    <section className="panel table-scroll responsive-records mt-8" tabIndex={0} role="region" aria-label="Danh sách giao dịch — cuộn ngang để xem đủ cột">
      <table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-line/10 text-muted"><tr>
        <th className="p-4">Thời gian</th><th className="p-4">Booking / khách hàng</th><th className="p-4">Payment</th>
        <th className="p-4">Attempt gần nhất</th><th className="p-4">Refund</th><th className="p-4">Số tiền</th></tr></thead>
      <tbody>{list?.data.map((row) => <tr key={row.id} className="border-b border-line/5 align-top">
        <td data-label="Thời gian" className="p-4">{date(row.createdAt)}</td><td data-label="Đặt chỗ / khách hàng" className="p-4"><p>{row.bookingCode}</p><p className="text-muted">{row.customerEmail}</p></td>
        <td data-label="Thanh toán" className="p-4"><Link className="text-info underline" href={`/admin/transactions/${row.id}`}>{row.id.slice(0, 8)}…</Link><p>{row.status}</p></td>
        <td data-label="Lần thanh toán gần nhất" className="p-4">{row.latestAttempt ? <><p>{row.latestAttempt.provider} · {row.latestAttempt.status}</p><p className="text-muted">{row.latestAttempt.merchantReference}</p></> : "—"}</td>
        <td data-label="Hoàn tiền" className="p-4">{row.refund.state}{row.refund.pendingAmount !== "0" && <p>Pending: {amount(row.refund.pendingAmount)}</p>}</td>
        <td data-label="Số tiền" className="p-4">{amount(row.amount)}</td></tr>)}</tbody></table>
      {!loading && list?.data.length === 0 && <p className="p-6 text-muted">Không có giao dịch phù hợp.</p>}
    </section>
    {list && <nav className="mt-5 flex items-center gap-3" aria-label="Phân trang giao dịch">
      <button className="secondary-button" disabled={list.page <= 1} onClick={() => setFilters({ ...filters, page: list.page - 1 })}>Trước</button>
      <span>Trang {list.page} / {Math.max(1, list.totalPages)} · {list.total} Payment</span>
      <button className="secondary-button" disabled={list.page >= list.totalPages} onClick={() => setFilters({ ...filters, page: list.page + 1 })}>Sau</button>
    </nav>}
  </div></main>;
}
