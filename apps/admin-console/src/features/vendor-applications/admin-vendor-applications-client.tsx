"use client";
import Link from "next/link";
import { useState } from "react";
import {
  PageHeading,
  EmptyState,
  StatusBadge,
  Button,
} from "@gobook/ui/primitives";
import { ResourceState, useWorkspaceQuery } from "@gobook/auth/resource";
import { formatDateTime } from "@gobook/api-client/format";
import type { Status, Item, Page } from "./types";
export default function AdminVendorApplicationsClient() {
  const [status, setStatus] = useState<Status>("PENDING"),
    [page, setPage] = useState(1);
  const query = useWorkspaceQuery<Page<Item>>(
    `/admin/vendor-applications?status=${status}&page=${page}&limit=10`,
    ["admin-applications", status, page],
  );
  return (
    <main className="page-wrap">
      <PageHeading eyebrow="Vận hành nền tảng" title="Hồ sơ đối tác">
        Lọc danh sách, mở từng hồ sơ để xem tài liệu và xét duyệt.
      </PageHeading>
      <div className="mb-6 flex flex-wrap gap-3">
        {(["PENDING", "APPROVED", "REJECTED"] as Status[]).map((value) => (
          <Button
            key={value}
            variant={status === value ? "primary" : "secondary"}
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {
              {
                PENDING: "Chờ xét duyệt",
                APPROVED: "Đã duyệt",
                REJECTED: "Cần bổ sung",
              }[value]
            }
          </Button>
        ))}
      </div>
      <ResourceState query={query}>
        {query.data?.items.length ? (
          <section className="grid gap-4">
            {query.data.items.map((item) => (
              <article
                key={item.applicationId}
                className="panel flex flex-wrap items-center justify-between gap-5 p-5"
              >
                <div className="min-w-0">
                  <h2 className="text-xl">{item.vendor.displayName}</h2>
                  <p className="mt-2 text-sm text-muted">
                    {item.vendor.legalName || "Chưa có tên pháp lý"} ·{" "}
                    {item.vendor.owner.profile?.fullName ||
                      item.vendor.owner.email}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Gửi ngày {formatDateTime(item.submittedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <StatusBadge status={item.status} />
                  <Link
                    className="secondary-button"
                    aria-label={`Xem hồ sơ ${item.vendor.displayName}`}
                    href={`/vendor-applications/${item.applicationId}`}
                  >
                    Xem hồ sơ
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <EmptyState title="Chưa có hồ sơ trong trạng thái này">
            Chọn trạng thái khác hoặc quay lại khi có hồ sơ mới.
          </EmptyState>
        )}
      </ResourceState>
      {(query.data?.totalPages ?? 0) > 1 && (
        <nav
          aria-label="Phân trang hồ sơ"
          className="mt-6 flex flex-wrap items-center gap-4"
        >
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Trước
          </Button>
          <span>
            Trang {page}/{query.data?.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= (query.data?.totalPages ?? 1)}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </Button>
        </nav>
      )}
    </main>
  );
}
