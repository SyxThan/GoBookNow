"use client";
import { setPortalToken } from "@gobook/auth/use-session";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError, apiDownload, apiRequest } from "@/lib/api-client";
import { PageHeading, StatusBadge } from "@gobook/ui/primitives";
import { Icon } from "@gobook/ui/icon";

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
    setPortalToken(token);
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
    return (
      <Centered>
        <div className="panel max-w-lg p-8 text-center">
          <h1 className="text-2xl">Vui lòng đăng nhập lại</h1>
          <p className="mt-3 text-sm text-muted">
            Phiên đăng nhập đã hết hạn. Đăng nhập để tiếp tục hoàn thiện hồ sơ.
          </p>
          <Link
            className="primary-button mt-6"
            href="/login?next=%2Fonboarding%2Fapplication"
          >
            Đăng nhập cổng đối tác
          </Link>
        </div>
      </Centered>
    );
  const currentStep =
    vendor?.status === "APPROVED"
      ? 3
      : application?.status === "PENDING"
        ? 2
        : vendor
          ? 1
          : 0;

  return (
    <main className="page-wrap">
      <PageHeading
        eyebrow="Hành trình đối tác"
        title={
          vendor?.status === "APPROVED"
            ? "Hồ sơ đối tác"
            : "Trở thành đối tác GoBookNow"
        }
        action={
          <Link
            href={vendor?.status === "APPROVED" ? "/dashboard" : "/profile"}
            className="secondary-button"
          >
            {vendor?.status === "APPROVED"
              ? "Vào trang quản lý"
              : "Thông tin đối tác"}
            <Icon name="arrow" size={18} />
          </Link>
        }
      >
        {vendor?.status === "APPROVED"
          ? "Đối tác đã được phê duyệt. Xem hồ sơ hoặc vào trang quản lý để bắt đầu kinh doanh."
          : "Hoàn thiện thông tin, gửi hồ sơ và theo dõi kết quả xét duyệt ngay tại đây."}
      </PageHeading>
      <ol
        aria-label="Các bước đăng ký đối tác"
        className="grid gap-3 sm:grid-cols-3"
      >
        {["Tạo hồ sơ đối tác", "Gửi hồ sơ xét duyệt", "Bắt đầu kinh doanh"].map(
          (label, index) => {
            const complete = index < currentStep;
            return (
              <li
                key={label}
                aria-current={index === currentStep ? "step" : undefined}
                className={`flex items-center gap-3 rounded-xl border-2 border-line p-4 ${complete ? "bg-mint" : index === currentStep ? "bg-sun/40" : "bg-surface"}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-line bg-canvas text-sm font-bold">
                  {complete ? <Icon name="check" size={16} /> : index + 1}
                </span>
                <span className="text-sm font-semibold">{label}</span>
              </li>
            );
          },
        )}
      </ol>
      {error && (
        <Banner tone="error">
          {error}{" "}
          <button
            className="ml-2 font-bold underline"
            onClick={() => void load(accessToken)}
          >
            Thử lại
          </button>
        </Banner>
      )}
      {notice && <Banner tone="success">{notice}</Banner>}

      {!vendor && !error ? (
        <section className="panel mt-10 p-8 text-center">
          <span className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl border-2 border-line bg-lavender">
            <Icon name="shield" size={32} />
          </span>
          <h2 className="text-2xl font-bold">Bắt đầu với thông tin đối tác</h2>
          <p className="mt-3 text-muted">
            Tạo hồ sơ tổ chức trước khi bắt đầu xét duyệt.
          </p>
          <Link href="/profile" className="primary-button mt-6 inline-flex">
            Tạo hồ sơ đối tác <Icon name="arrow" size={18} />
          </Link>
        </section>
      ) : vendor ? (
        <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="panel p-6 sm:p-8">
            <p className="section-label">{vendor.displayName}</p>
            <div className="mt-4 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold">
                {STATUS_LABELS[vendor.status]}
              </h2>
              <StatusBadge status={vendor.status} />
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
      ) : null}
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
      <div className="mt-7 rounded-2xl bg-canvas p-5">
        {vendor.status === "REJECTED" && (
          <p className="mb-4 text-sm text-danger">
            Lý do: {application?.reviewNote ?? "Vui lòng cập nhật hồ sơ."}
          </p>
        )}
        <p className="text-sm leading-6 text-muted">
          {vendor.status === "REJECTED"
            ? "Cập nhật thông tin theo góp ý trước khi gửi lại hồ sơ. Bạn vẫn có thể xem các lần xét duyệt trước trong lịch sử xử lý."
            : "Kiểm tra thông tin đối tác trước khi gửi. Bạn có thể bổ sung tài liệu khi hồ sơ đang được xét duyệt."}
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
              : "Gửi hồ sơ xét duyệt"}
        </button>
      </div>
    );
  }
  const descriptions: Record<
    Exclude<VendorStatus, "DRAFT" | "REJECTED">,
    string
  > = {
    PENDING:
      "Đội ngũ GoBookNow đang xem xét hồ sơ. Bạn có thể bổ sung tối đa 5 tài liệu.",
    APPROVED:
      "Hồ sơ đã được phê duyệt. Bạn có thể quản lý dịch vụ và tiếp nhận đặt chỗ.",
    SUSPENDED: "Tài khoản đối tác đang tạm ngưng và chưa thể gửi hồ sơ mới.",
  };
  return (
    <p className="mt-7 rounded-2xl bg-canvas p-5 text-sm leading-6 text-ink">
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
    <form onSubmit={onSubmit} className="mt-7 border-t border-line/10 pt-7">
      <h3 className="font-bold">Tải tài liệu ({count}/5)</h3>
      <select
        aria-label="Loại tài liệu"
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
        aria-label="Chọn tài liệu xét duyệt"
        accept="application/pdf,image/jpeg,image/png"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      {file && (
        <p className="mt-2 text-xs text-muted">
          {file.name} · {(file.size / 1024).toFixed(1)} KB
        </p>
      )}
      <button
        className="primary-button mt-4"
        disabled={busy || !file || count >= 5}
      >
        {busy ? "Đang tải lên…" : "Tải tài liệu lên"}
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
      <h2 className="text-xl font-bold">Tài liệu</h2>
      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Chưa có tài liệu.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center justify-between gap-4 rounded-xl bg-canvas p-4"
            >
              <div>
                <p className="text-sm font-medium">{document.originalName}</p>
                <p className="mt-1 text-xs text-muted">
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
      <h2 className="text-xl font-bold">Lịch sử xử lý</h2>
      {history.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Chưa có sự kiện.</p>
      ) : (
        <ol className="mt-5 space-y-5 border-l border-line pl-5">
          {history.map((entry) => (
            <li key={entry.id}>
              <p className="text-xs text-muted">
                {new Date(entry.createdAt).toLocaleString("vi-VN")}
              </p>
              <p className="mt-1 font-bold">
                {entry.fromStatus
                  ? `${STATUS_LABELS[entry.fromStatus]} → `
                  : "Đã gửi · "}
                {STATUS_LABELS[entry.toStatus]}
              </p>
              {entry.note && (
                <p className="mt-1 text-sm text-muted">{entry.note}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-canvas px-5 text-ink">
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
      role={tone === "error" ? "alert" : "status"}
      className={`mt-6 rounded-2xl border px-5 py-4 text-sm ${tone === "error" ? "border-danger/30 bg-coral/30 text-danger" : "border-success/30 bg-mint/30 text-success"}`}
    >
      {children}
    </div>
  );
}
