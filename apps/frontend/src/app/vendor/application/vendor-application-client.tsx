"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import {
  ApiError,
  apiDownload,
  apiRequest,
  login,
  logout,
} from "@/lib/api-client";

type VendorStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
type ApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";
type DocumentType =
  "BUSINESS_REGISTRATION" | "TAX_DOCUMENT" | "REPRESENTATIVE_ID" | "OTHER";
type Vendor = { id: string; displayName: string; status: VendorStatus };
type Document = {
  id: string;
  documentType: DocumentType;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
};
type History = {
  id: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  note: string | null;
  createdAt: string;
};
type Application = {
  id: string;
  vendorId: string;
  status: ApplicationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  documents: Document[];
  history: History[];
};

const STATUS_LABELS: Record<VendorStatus | ApplicationStatus, string> = {
  DRAFT: "Bản nháp",
  PENDING: "Đang chờ duyệt",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Cần bổ sung",
  SUSPENDED: "Tạm ngưng",
};
const DOCUMENT_LABELS: Record<DocumentType, string> = {
  BUSINESS_REGISTRATION: "Đăng ký kinh doanh",
  TAX_DOCUMENT: "Tài liệu thuế",
  REPRESENTATIVE_ID: "Giấy tờ người đại diện",
  OTHER: "Tài liệu khác",
};

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Không thể kết nối đến GoBook API.";
}

export default function VendorApplicationClient() {
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem("gobook.accessToken"),
  );
  const [authRequired, setAuthRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>(
    "BUSINESS_REGISTRATION",
  );
  const [file, setFile] = useState<File | null>(null);

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    if (token) sessionStorage.setItem("gobook.accessToken", token);
    else sessionStorage.removeItem("gobook.accessToken");
  }, []);

  const load = useCallback(
    async (token: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const currentVendor = await apiRequest<Vendor>(
          "/vendors/me",
          { method: "GET" },
          token,
          setAccessToken,
        );
        setVendor(currentVendor);
        try {
          const latest = await apiRequest<Application>(
            `/vendors/${currentVendor.id}/applications/latest`,
            { method: "GET" },
            token,
            setAccessToken,
          );
          setApplication(latest);
        } catch (latestError) {
          if (latestError instanceof ApiError && latestError.status === 404)
            setApplication(null);
          else throw latestError;
        }
        setAuthRequired(false);
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 404) {
          setVendor(null);
          setApplication(null);
          setAuthRequired(false);
        } else if (loadError instanceof ApiError && loadError.status === 401) {
          setAuthRequired(true);
        } else setError(message(loadError));
      } finally {
        setLoading(false);
      }
    },
    [setAccessToken],
  );

  useEffect(() => {
    const token = sessionStorage.getItem("gobook.accessToken");
    const timer = window.setTimeout(() => void load(token), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const token = await login(
        String(data.get("email") ?? ""),
        String(data.get("password") ?? ""),
      );
      setAccessToken(token);
      await load(token);
    } catch (loginError) {
      setError(message(loginError));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await logout();
    setAccessToken(null);
    setVendor(null);
    setApplication(null);
    setAuthRequired(true);
  }

  async function submitApplication() {
    if (!vendor) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(
        `/vendors/${vendor.id}/applications`,
        { method: "POST" },
        accessToken,
        setAccessToken,
      );
      setNotice("Hồ sơ đã được gửi để xét duyệt.");
      await load(accessToken);
    } catch (submitError) {
      setError(message(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!application || !file) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setError("Chỉ chấp nhận PDF, JPG hoặc PNG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Tệp không được lớn hơn 5 MB.");
      return;
    }
    const body = new FormData();
    body.set("documentType", documentType);
    body.set("file", file);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(
        `/vendor-applications/${application.id}/documents`,
        { method: "POST", body },
        accessToken,
        setAccessToken,
      );
      setFile(null);
      setNotice("Tài liệu đã được tải lên.");
      await load(accessToken);
    } catch (uploadError) {
      setError(message(uploadError));
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

  if (loading) return <Centered>Đang tải hồ sơ xét duyệt…</Centered>;
  if (authRequired)
    return <LoginForm busy={busy} error={error} onSubmit={handleLogin} />;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-8">
          <div>
            <p className="eyebrow">Vendor Onboarding</p>
            <h1 className="mt-3 text-4xl font-semibold">Đăng ký Vendor</h1>
            <p className="mt-3 text-slate-400">
              Gửi hồ sơ, bổ sung tài liệu và theo dõi kết quả xét duyệt.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/vendor/profile" className="secondary-button">
              Hồ sơ Vendor
            </Link>
            <button
              className="secondary-button"
              onClick={() => void handleLogout()}
            >
              Đăng xuất
            </button>
          </div>
        </header>
        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone="success">{notice}</Banner>}

        {!vendor ? (
          <section className="panel mt-10 p-8 text-center">
            <h2 className="text-2xl font-semibold">Bạn chưa có hồ sơ Vendor</h2>
            <p className="mt-3 text-slate-400">
              Tạo hồ sơ tổ chức trước khi bắt đầu xét duyệt.
            </p>
            <Link
              href="/vendor/profile"
              className="primary-button mt-6 inline-flex"
            >
              Tạo Vendor Profile
            </Link>
          </section>
        ) : (
          <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="panel p-6 sm:p-8">
              <p className="section-label">{vendor.displayName}</p>
              <div className="mt-4 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-semibold">
                  {STATUS_LABELS[vendor.status]}
                </h2>
                <span className="rounded-full bg-teal-300/10 px-3 py-1 text-xs font-semibold text-teal-200">
                  {vendor.status}
                </span>
              </div>
              <StatusAction
                vendor={vendor}
                application={application}
                busy={busy}
                onSubmit={submitApplication}
              />
              {application?.status === "PENDING" && (
                <UploadForm
                  busy={busy}
                  count={application.documents.length}
                  documentType={documentType}
                  file={file}
                  onDocumentType={setDocumentType}
                  onFile={setFile}
                  onSubmit={uploadDocument}
                />
              )}
            </section>
            <section className="space-y-6">
              <Documents
                documents={application?.documents ?? []}
                onDownload={download}
              />
              <Timeline history={application?.history ?? []} />
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function StatusAction({
  vendor,
  application,
  busy,
  onSubmit,
}: {
  vendor: Vendor;
  application: Application | null;
  busy: boolean;
  onSubmit: () => void;
}) {
  if (vendor.status === "DRAFT" || vendor.status === "REJECTED") {
    return (
      <div className="mt-7 rounded-2xl bg-slate-950 p-5">
        {vendor.status === "REJECTED" && (
          <p className="mb-4 text-sm text-rose-200">
            Lý do: {application?.reviewNote ?? "Vui lòng cập nhật hồ sơ."}
          </p>
        )}
        <p className="text-sm leading-6 text-slate-400">
          Mỗi lần gửi lại tạo một application mới và giữ nguyên lịch sử cũ.
        </p>
        <button
          onClick={onSubmit}
          disabled={busy}
          className="primary-button mt-5"
        >
          {busy
            ? "Đang gửi…"
            : vendor.status === "REJECTED"
              ? "Gửi lại hồ sơ"
              : "Submit Application"}
        </button>
      </div>
    );
  }
  const descriptions: Record<
    Exclude<VendorStatus, "DRAFT" | "REJECTED">,
    string
  > = {
    PENDING: "Admin đang xem xét hồ sơ. Bạn có thể bổ sung tối đa 5 tài liệu.",
    APPROVED: "Onboarding hoàn tất. Tài khoản đã được cấp quyền VENDOR.",
    SUSPENDED: "Vendor đang tạm ngưng và không thể gửi hồ sơ mới.",
  };
  return (
    <p className="mt-7 rounded-2xl bg-slate-950 p-5 text-sm leading-6 text-slate-300">
      {descriptions[vendor.status]}
    </p>
  );
}

function UploadForm({
  busy,
  count,
  documentType,
  file,
  onDocumentType,
  onFile,
  onSubmit,
}: {
  busy: boolean;
  count: number;
  documentType: DocumentType;
  file: File | null;
  onDocumentType: (value: DocumentType) => void;
  onFile: (value: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-7 border-t border-white/10 pt-7">
      <h3 className="font-semibold">Tải tài liệu ({count}/5)</h3>
      <select
        className="input mt-4"
        value={documentType}
        onChange={(event) => onDocumentType(event.target.value as DocumentType)}
      >
        {Object.entries(DOCUMENT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        className="input mt-3"
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      {file && (
        <p className="mt-2 text-xs text-slate-400">
          {file.name} · {(file.size / 1024).toFixed(1)} KB
        </p>
      )}
      <button
        className="primary-button mt-4"
        disabled={busy || !file || count >= 5}
      >
        Upload
      </button>
    </form>
  );
}

function Documents({
  documents,
  onDownload,
}: {
  documents: Document[];
  onDownload: (document: Document) => void;
}) {
  return (
    <section className="panel p-6">
      <h2 className="text-xl font-semibold">Tài liệu</h2>
      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Chưa có tài liệu.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center justify-between gap-4 rounded-xl bg-slate-950 p-4"
            >
              <div>
                <p className="text-sm font-medium">{document.originalName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {DOCUMENT_LABELS[document.documentType]} ·{" "}
                  {(document.fileSize / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() => void onDownload(document)}
              >
                Tải xuống
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Timeline({ history }: { history: History[] }) {
  return (
    <section className="panel p-6">
      <h2 className="text-xl font-semibold">Lịch sử xử lý</h2>
      {history.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Chưa có sự kiện.</p>
      ) : (
        <ol className="mt-5 space-y-5 border-l border-slate-700 pl-5">
          {history.map((entry) => (
            <li key={entry.id}>
              <p className="text-xs text-slate-500">
                {new Date(entry.createdAt).toLocaleString("vi-VN")}
              </p>
              <p className="mt-1 font-semibold">
                {entry.fromStatus
                  ? `${STATUS_LABELS[entry.fromStatus]} → `
                  : "Submitted · "}
                {STATUS_LABELS[entry.toStatus]}
              </p>
              {entry.note && (
                <p className="mt-1 text-sm text-slate-400">{entry.note}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LoginForm({
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
      <form onSubmit={onSubmit} className="panel w-full max-w-md p-8 text-left">
        <p className="eyebrow">Vendor Onboarding</p>
        <h1 className="mt-3 text-3xl font-semibold">Đăng nhập</h1>
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
        {error && <Banner tone="error">{error}</Banner>}
        <button className="primary-button mt-6 w-full" disabled={busy}>
          Tiếp tục
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
function Banner({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  return (
    <div
      className={`mt-6 rounded-2xl border px-5 py-4 text-sm ${tone === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}
    >
      {children}
    </div>
  );
}
