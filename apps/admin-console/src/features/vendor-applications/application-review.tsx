"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiDownload } from "@gobook/api-client";
import { usePortalSession } from "@gobook/auth/use-session";
import {
  ActionFeedback,
  ResourceState,
  useWorkspaceAction,
  useWorkspaceQuery,
} from "@gobook/auth/resource";
import { Button, PageHeading } from "@gobook/ui/primitives";
import { AccessibleDialog } from "@gobook/ui/dialog";
import { ApplicationDetail } from "./application-detail-view";
import type { Detail, AuditLog, Document, Page } from "./types";
export default function ApplicationReview({
  applicationId,
}: {
  applicationId: string;
}) {
  const detail = useWorkspaceQuery<Detail>(
    `/admin/vendor-applications/${applicationId}`,
    ["admin-application", applicationId],
  );
  const audit = useWorkspaceQuery<Page<AuditLog>>(
    `/admin/audit-logs?entityType=VendorApplication&entityId=${applicationId}&page=1&limit=20`,
    ["admin-application-audit", applicationId],
  );
  const action = useWorkspaceAction(),
    cache = useQueryClient();
  const { token, onToken } = usePortalSession();
  const [note, setNote] = useState(""),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false);
  async function refresh() {
    await Promise.all([
      detail.refetch(),
      audit.refetch(),
      cache.invalidateQueries({ queryKey: ["admin-applications"] }),
    ]);
  }
  async function approve() {
    if (
      await action.act(async () => {
        await detail.request(
          `/admin/vendor-applications/${applicationId}/approve`,
          {
            method: "POST",
            body: JSON.stringify({ note: note.trim() || undefined }),
          },
        );
        await refresh();
      }, "Đã phê duyệt hồ sơ đối tác.")
    )
      setConfirm(false);
  }
  async function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) {
      action.setError("Nhập lý do từ chối hồ sơ.");
      return;
    }
    await action.act(async () => {
      await detail.request(
        `/admin/vendor-applications/${applicationId}/reject`,
        { method: "POST", body: JSON.stringify({ reason: reason.trim() }) },
      );
      setReason("");
      await refresh();
    }, "Đã phản hồi hồ sơ.");
  }
  async function download(document: Document) {
    await action.act(async () => {
      const blob = await apiDownload(document.fileUrl, token, onToken);
      const url = URL.createObjectURL(blob);
      try {
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = document.originalName;
        anchor.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    }, "Đã tải tài liệu.");
  }
  return (
    <main className="page-wrap">
      <Link href="/vendor-applications" className="text-sm font-bold underline">
        ← Danh sách hồ sơ
      </Link>
      <div className="mt-6">
        <PageHeading
          eyebrow="Xét duyệt đối tác"
          title={detail.data?.vendor.displayName ?? "Chi tiết hồ sơ"}
        >
          Xem thông tin tổ chức, tài liệu và lịch sử trước khi quyết định.
        </PageHeading>
      </div>
      <ActionFeedback {...action} />
      <ResourceState query={detail}>
        {detail.data && (
          <ApplicationDetail
            detail={detail.data}
            auditLogs={audit.data?.items ?? []}
            busy={action.busy}
            note={note}
            reason={reason}
            onNote={setNote}
            onReason={setReason}
            onApprove={() => setConfirm(true)}
            onReject={(event) => void reject(event)}
            onDownload={(document) => void download(document)}
          />
        )}
      </ResourceState>
      {audit.isError && (
        <p role="alert" className="status-note mt-5">
          Chưa tải được lịch sử kiểm tra.{" "}
          <button className="underline" onClick={() => void audit.refetch()}>
            Thử lại
          </button>
        </p>
      )}
      {confirm && (
        <AccessibleDialog
          labelledBy="approve-title"
          onClose={() => setConfirm(false)}
          busy={action.busy}
        >
          <h2 id="approve-title" className="text-2xl">
            Phê duyệt đối tác này?
          </h2>
          <p className="mt-4">
            {detail.data?.vendor.displayName} sẽ được cấp quyền vận hành theo
            quy định của hệ thống.
          </p>
          <ActionFeedback error={action.error} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button loading={action.busy} onClick={() => void approve()}>
              Xác nhận phê duyệt
            </Button>
            <Button
              variant="secondary"
              disabled={action.busy}
              onClick={() => setConfirm(false)}
            >
              Quay lại
            </Button>
          </div>
        </AccessibleDialog>
      )}
    </main>
  );
}
