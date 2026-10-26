"use client";
import type { FormEvent } from "react";
import type { Detail, AuditLog, Document } from "./types";
export function ApplicationDetail({
  detail,
  auditLogs,
  busy,
  note,
  reason,
  onNote,
  onReason,
  onApprove,
  onReject,
  onDownload,
}: {
  detail: Detail;
  auditLogs: AuditLog[];
  busy: boolean;
  note: string;
  reason: string;
  onNote: (value: string) => void;
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
          <h2 className="mt-2 text-3xl font-bold">{vendor.displayName}</h2>
          <p className="mt-1 font-mono text-xs text-muted">/{vendor.slug}</p>
        </div>
        <span className="h-fit rounded-full bg-sun/30 px-3 py-1 text-xs text-info">
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
          label="Chủ tài khoản"
          value={`${vendor.owner.profile?.fullName || "Chưa cập nhật tên"} · ${vendor.owner.email}`}
        />
        <Info
          label="Liên hệ"
          value={[vendor.contactEmail, vendor.contactPhone]
            .filter(Boolean)
            .join(" · ")}
        />
        <Info
          label="Địa chỉ"
          value={[
            vendor.addressLine,
            vendor.ward,
            vendor.district,
            vendor.province,
            vendor.countryCode,
          ]
            .filter(Boolean)
            .join(", ")}
        />
        <Info
          label="Gửi lúc"
          value={new Date(detail.submittedAt).toLocaleString("vi-VN")}
        />
        <Info
          label="Người duyệt"
          value={
            detail.reviewer
              ? `${detail.reviewer.profile?.fullName || "Admin"} · ${detail.reviewer.email}`
              : null
          }
        />
        {detail.reviewedAt && (
          <Info
            label="Duyệt lúc"
            value={new Date(detail.reviewedAt).toLocaleString("vi-VN")}
          />
        )}
        {detail.reviewNote && (
          <Info label="Ghi chú review" value={detail.reviewNote} />
        )}
      </dl>
      {vendor.description && (
        <div className="mt-6 rounded-xl bg-canvas p-4 text-sm text-ink">
          {vendor.description}
        </div>
      )}
      <div className="mt-8 border-t border-line/10 pt-6">
        <h3 className="font-bold">Tài liệu</h3>
        {detail.documents.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Chưa tải tài liệu.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {detail.documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-canvas p-3"
              >
                <span className="text-sm">
                  {document.documentType} · {document.originalName} ·{" "}
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
      <div className="mt-8 border-t border-line/10 pt-6">
        <h3 className="font-bold">Lịch sử</h3>
        <ol className="mt-4 space-y-3">
          {detail.history.map((entry) => (
            <li key={entry.id} className="text-sm">
              <span className="text-muted">
                {new Date(entry.createdAt).toLocaleString("vi-VN")}
              </span>
              <p className="mt-1">
                {entry.fromStatus ?? "Submitted"} → {entry.toStatus}
              </p>
              {entry.note && <p className="text-muted">{entry.note}</p>}
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-8 border-t border-line/10 pt-6">
        <h3 className="font-bold">Audit trail</h3>
        {auditLogs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Chưa có hành động quản trị.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {auditLogs.map((entry) => (
              <li key={entry.id} className="rounded-xl bg-canvas p-4 text-sm">
                <p>{auditSummary(entry)}</p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(entry.createdAt).toLocaleString("vi-VN")} ·{" "}
                  {entry.actor?.profile?.fullName ||
                    entry.actor?.email ||
                    "Tài khoản đã xoá"}
                  {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
      {detail.status === "PENDING" && (
        <div className="mt-8 grid gap-5 border-t border-line/10 pt-6 sm:grid-cols-2">
          <div>
            <h3 className="font-bold">Phê duyệt hồ sơ</h3>
            <p className="mt-2 text-sm text-muted">
              Đối tác được mở bán dịch vụ sau khi hồ sơ được duyệt.
            </p>
            <textarea
              className="input mt-3"
              maxLength={1000}
              rows={3}
              value={note}
              onChange={(event) => onNote(event.target.value)}
              aria-label="Ghi chú duyệt (không bắt buộc)"
              placeholder="Ghi chú duyệt (không bắt buộc)"
            />
            <button
              className="primary-button mt-4"
              disabled={busy}
              onClick={() => void onApprove()}
            >
              Phê duyệt đối tác
            </button>
          </div>
          <form onSubmit={onReject}>
            <h3 className="font-bold">Yêu cầu bổ sung</h3>
            <textarea
              className="input mt-3"
              required
              maxLength={1000}
              rows={3}
              value={reason}
              onChange={(event) => onReason(event.target.value)}
              aria-label="Lý do từ chối"
              placeholder="Lý do từ chối"
            />
            <button
              className="secondary-button mt-3"
              disabled={busy || !reason.trim()}
            >
              Từ chối hồ sơ
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
      <dd className="mt-1 text-sm text-ink">{value || "Chưa cập nhật"}</dd>
    </div>
  );
}

function auditSummary(entry: AuditLog): string {
  const from = String(entry.metadata?.fromStatus ?? "PENDING");
  const to = String(entry.metadata?.toStatus ?? "đã xử lý");
  const note = entry.metadata?.reason ?? entry.metadata?.reviewNote;
  return `${entry.action}: ${from} → ${to}${note ? ` · ${String(note)}` : ""}`;
}
