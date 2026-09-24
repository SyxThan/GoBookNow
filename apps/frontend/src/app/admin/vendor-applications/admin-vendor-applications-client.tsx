"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError, apiDownload, apiRequest, login } from "@/lib/api-client";

type Status = "PENDING" | "APPROVED" | "REJECTED";
type Item = {
  id: string;
  status: Status;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  vendor: { id: string; displayName: string; slug: string; status: string };
};
type Document = {
  id: string;
  originalName: string;
  documentType: string;
  fileUrl: string;
  fileSize: number;
};
type History = {
  id: string;
  fromStatus: Status | null;
  toStatus: Status;
  note: string | null;
  createdAt: string;
};
type Detail = Item & {
  documents: Document[];
  history: History[];
  vendor: Item["vendor"] & {
    legalName: string | null;
    vendorType: string | null;
    taxCode: string | null;
    businessRegistrationNumber: string | null;
    legalRepresentativeName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    addressLine: string | null;
    ward: string | null;
    district: string | null;
    province: string | null;
    countryCode: string;
  };
};

function message(error: unknown): string {
  if (error instanceof ApiError && error.status === 403)
    return "Tài khoản này không có quyền ADMIN.";
  if (error instanceof ApiError) return error.message;
  return "Không thể kết nối đến GoBook API.";
}

export default function AdminVendorApplicationsClient() {
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem("gobook.accessToken"),
  );
  const [authRequired, setAuthRequired] = useState(false);
  const [status, setStatus] = useState<Status>("PENDING");
  const [items, setItems] = useState<Item[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    if (token) sessionStorage.setItem("gobook.accessToken", token);
    else sessionStorage.removeItem("gobook.accessToken");
  }, []);

  const loadList = useCallback(
    async (token: string | null, filter: Status) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiRequest<Item[]>(
          `/admin/vendor-applications?status=${filter}`,
          { method: "GET" },
          token,
          setAccessToken,
        );
        setItems(result);
        setDetail(null);
        setAuthRequired(false);
      } catch (loadError) {
        if (
          loadError instanceof ApiError &&
          (loadError.status === 401 || loadError.status === 403)
        )
          setAuthRequired(true);
        else setError(message(loadError));
      } finally {
        setLoading(false);
      }
    },
    [setAccessToken],
  );

  useEffect(() => {
    const token = sessionStorage.getItem("gobook.accessToken");
    const timer = window.setTimeout(() => void loadList(token, "PENDING"), 0);
    return () => window.clearTimeout(timer);
  }, [loadList]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const token = await login(
        String(data.get("email") ?? ""),
        String(data.get("password") ?? ""),
      );
      setAccessToken(token);
      await loadList(token, status);
    } catch (loginError) {
      setError(message(loginError));
    } finally {
      setBusy(false);
    }
  }

  async function select(id: string) {
    setBusy(true);
    setError(null);
    try {
      setDetail(
        await apiRequest<Detail>(
          `/admin/vendor-applications/${id}`,
          { method: "GET" },
          accessToken,
          setAccessToken,
        ),
      );
    } catch (selectError) {
      setError(message(selectError));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (
      !detail ||
      !window.confirm(`Approve Vendor “${detail.vendor.displayName}”?`)
    )
      return;
    setBusy(true);
    setError(null);
    try {
      setDetail(
        await apiRequest<Detail>(
          `/admin/vendor-applications/${detail.id}/approve`,
          { method: "POST", body: JSON.stringify({}) },
          accessToken,
          setAccessToken,
        ),
      );
      await loadList(accessToken, status);
    } catch (approveError) {
      setError(message(approveError));
    } finally {
      setBusy(false);
    }
  }

  async function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setDetail(
        await apiRequest<Detail>(
          `/admin/vendor-applications/${detail.id}/reject`,
          { method: "POST", body: JSON.stringify({ reason }) },
          accessToken,
          setAccessToken,
        ),
      );
      setReason("");
      await loadList(accessToken, status);
    } catch (rejectError) {
      setError(message(rejectError));
    } finally {
      setBusy(false);
    }
  }

  async function download(document: Document) {
    try {
      const blob = await apiDownload(
        document.fileUrl,
        accessToken,
        setAccessToken,
      );
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.originalName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(message(downloadError));
    }
  }

  if (authRequired)
    return <Login busy={busy} error={error} onSubmit={handleLogin} />;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-8">
          <div>
            <p className="eyebrow">GoBook Admin</p>
            <h1 className="mt-3 text-4xl font-semibold">Vendor Applications</h1>
          </div>
          <Link href="/" className="secondary-button">
            Trang chủ
          </Link>
        </header>
        {error && <Banner>{error}</Banner>}
        <div className="mt-8 flex flex-wrap gap-2">
          {(["PENDING", "APPROVED", "REJECTED"] as Status[]).map((value) => (
            <button
              key={value}
              className={
                value === status ? "primary-button" : "secondary-button"
              }
              onClick={() => {
                setStatus(value);
                void loadList(accessToken, value);
              }}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="panel p-5">
            <h2 className="text-lg font-semibold">
              Danh sách ({items.length})
            </h2>
            {loading ? (
              <p className="mt-5 text-sm text-slate-400">Đang tải…</p>
            ) : items.length === 0 ? (
              <p className="mt-5 text-sm text-slate-500">
                Không có application.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => void select(item.id)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 p-4 text-left hover:border-teal-400"
                    >
                      <span className="font-semibold">
                        {item.vendor.displayName}
                      </span>
                      <span className="mt-2 block text-xs text-slate-500">
                        {new Date(item.submittedAt).toLocaleString("vi-VN")} ·{" "}
                        {item.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {detail ? (
            <ApplicationDetail
              detail={detail}
              busy={busy}
              reason={reason}
              onReason={setReason}
              onApprove={approve}
              onReject={reject}
              onDownload={download}
            />
          ) : (
            <section className="panel grid min-h-80 place-items-center p-8 text-center text-slate-500">
              Chọn một application để review.
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function ApplicationDetail({
  detail,
  busy,
  reason,
  onReason,
  onApprove,
  onReject,
  onDownload,
}: {
  detail: Detail;
  busy: boolean;
  reason: string;
  onReason: (value: string) => void;
  onApprove: () => void;
  onReject: (event: FormEvent<HTMLFormElement>) => void;
  onDownload: (document: Document) => void;
}) {
  const vendor = detail.vendor;
  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="section-label">{detail.status}</p>
          <h2 className="mt-2 text-3xl font-semibold">{vendor.displayName}</h2>
          <p className="mt-1 font-mono text-xs text-slate-500">
            /{vendor.slug}
          </p>
        </div>
        <span className="h-fit rounded-full bg-teal-300/10 px-3 py-1 text-xs text-teal-200">
          {vendor.status}
        </span>
      </div>
      <dl className="mt-8 grid gap-5 sm:grid-cols-2">
        <Info label="Tên pháp lý" value={vendor.legalName} />
        <Info label="Loại hình" value={vendor.vendorType} />
        <Info label="Mã số thuế" value={vendor.taxCode} />
        <Info
          label="Đăng ký kinh doanh"
          value={vendor.businessRegistrationNumber}
        />
        <Info label="Người đại diện" value={vendor.legalRepresentativeName} />
        <Info
          label="Liên hệ"
          value={[vendor.contactEmail, vendor.contactPhone]
            .filter(Boolean)
            .join(" · ")}
        />
      </dl>
      <div className="mt-8 border-t border-white/10 pt-6">
        <h3 className="font-semibold">Tài liệu</h3>
        {detail.documents.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa tải tài liệu.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {detail.documents.map((document) => (
              <li
                key={document.id}
                className="flex items-center justify-between gap-4 rounded-xl bg-slate-950 p-3"
              >
                <span className="text-sm">
                  {document.originalName} ·{" "}
                  {(document.fileSize / 1024).toFixed(1)} KB
                </span>
                <button
                  className="secondary-button"
                  onClick={() => void onDownload(document)}
                >
                  Tải
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-8 border-t border-white/10 pt-6">
        <h3 className="font-semibold">Lịch sử</h3>
        <ol className="mt-4 space-y-3">
          {detail.history.map((entry) => (
            <li key={entry.id} className="text-sm">
              <span className="text-slate-500">
                {new Date(entry.createdAt).toLocaleString("vi-VN")}
              </span>
              <p className="mt-1">
                {entry.fromStatus ?? "Submitted"} → {entry.toStatus}
              </p>
              {entry.note && <p className="text-slate-400">{entry.note}</p>}
            </li>
          ))}
        </ol>
      </div>
      {detail.status === "PENDING" && (
        <div className="mt-8 grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-2">
          <div>
            <h3 className="font-semibold">Approve</h3>
            <p className="mt-2 text-sm text-slate-400">
              Cấp role VENDOR và giữ nguyên role CUSTOMER.
            </p>
            <button
              className="primary-button mt-4"
              disabled={busy}
              onClick={() => void onApprove()}
            >
              Approve Vendor
            </button>
          </div>
          <form onSubmit={onReject}>
            <h3 className="font-semibold">Reject</h3>
            <textarea
              className="input mt-3"
              required
              maxLength={1000}
              rows={3}
              value={reason}
              onChange={(event) => onReason(event.target.value)}
              placeholder="Lý do từ chối"
            />
            <button
              className="secondary-button mt-3"
              disabled={busy || !reason.trim()}
            >
              Reject
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 text-sm text-slate-200">
        {value || "Chưa cập nhật"}
      </dd>
    </div>
  );
}
function Login({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Centered>
      <form onSubmit={onSubmit} className="panel w-full max-w-md p-8">
        <p className="eyebrow">GoBook Admin</p>
        <h1 className="mt-3 text-3xl font-semibold">Đăng nhập Admin</h1>
        <input
          name="email"
          type="email"
          required
          className="input mt-6"
          placeholder="Email"
        />
        <input
          name="password"
          type="password"
          required
          className="input mt-3"
          placeholder="Mật khẩu"
        />
        {error && <Banner>{error}</Banner>}
        <button className="primary-button mt-6 w-full" disabled={busy}>
          Đăng nhập
        </button>
      </form>
    </Centered>
  );
}
function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 text-slate-100">
      {children}
    </main>
  );
}
function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-5 py-4 text-sm text-rose-200">
      {children}
    </div>
  );
}
