"use client";
import Link from "next/link";
import { useState } from "react";
import {
  EmptyState,
  PageHeading,
  StatusBadge,
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import {
  ResourceState,
  useWorkspaceQuery,
  type PageResult,
} from "@/components/workspace/resource";
import type { ManagedService } from "@/lib/catalog-management";
import { formatMoney } from "@/lib/format";

export function VendorServicesClient() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1);
  const params = new URLSearchParams({
    page: String(page),
    limit: "12",
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
  });
  const query = useWorkspaceQuery<PageResult<ManagedService>>(
    `/vendor/services?${params}`,
    ["vendor", "catalog", search, status, page],
  );
  return (
    <main className="page-wrap">
      <PageHeading
        eyebrow="Không gian đối tác"
        title="Trải nghiệm bạn tạo ra"
        action={
          <Link href="/services/new" className="primary-button">
            <Icon name="plus" />
            Thêm dịch vụ
          </Link>
        }
      >
        Chăm chút nội dung, mở lịch trống và sẵn sàng đón những khách hàng tiếp
        theo.
      </PageHeading>
      <div className="panel mb-7 grid gap-4 p-5 sm:grid-cols-[1fr_220px]">
        <label>
          <span className="section-label">Tìm dịch vụ</span>
          <input
            type="search"
            className="input mt-2"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tên hoặc nội dung dịch vụ…"
          />
        </label>
        <label>
          <span className="section-label">Trạng thái</span>
          <select
            className="input mt-2"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="PUBLISHED">Đang hiển thị</option>
            <option value="HIDDEN">Đang ẩn</option>
            <option value="ARCHIVED">Đã lưu trữ</option>
          </select>
        </label>
      </div>
      <ResourceState query={query}>
        {query.data?.items.length === 0 ? (
          <EmptyState
            title="Dành chỗ cho trải nghiệm đầu tiên"
            action={
              <Link href="/services/new" className="primary-button">
                Tạo dịch vụ
              </Link>
            }
          >
            Thêm nội dung, hình ảnh và lịch để giới thiệu dịch vụ của bạn. Nếu
            đang lọc, hãy thử bỏ bộ lọc.
          </EmptyState>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {query.data?.items.map((service) => (
              <article className="panel p-6" key={service.id}>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-line bg-lavender">
                    <Icon
                      name={service.kind === "EVENT" ? "ticket" : "star"}
                      size={25}
                    />
                  </span>
                  <StatusBadge status={service.status} />
                </div>
                <p className="eyebrow">
                  {service.category?.name ??
                    (service.kind === "EVENT" ? "Sự kiện" : "Dịch vụ")}
                </p>
                <h2 className="mt-2 text-xl">{service.title}</h2>
                <p className="mt-3 line-clamp-2 min-h-12 text-sm text-muted">
                  {service.summary ||
                    "Bổ sung mô tả để khách hàng hiểu hơn về trải nghiệm."}
                </p>
                <p className="mt-5 border-t border-line/15 pt-4 text-xl font-extrabold">
                  {formatMoney(service.priceAmount, service.currency)}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    className="secondary-button"
                    href={`/services/${service.id}`}
                  >
                    Chỉnh sửa
                    <Icon name="arrow" size={16} />
                  </Link>
                  <Link
                    className="secondary-button"
                    href={`/services/${service.id}/slots`}
                  >
                    <Icon name="calendar" size={16} />
                    Quản lý lịch
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
        {query.data && query.data.totalPages > 1 && (
          <nav
            className="mt-7 flex flex-wrap items-center gap-4"
            aria-label="Phân trang dịch vụ"
          >
            <button
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Trước
            </button>
            <span className="text-sm">
              Trang {page} / {query.data.totalPages}
            </span>
            <button
              className="secondary-button"
              disabled={page >= query.data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </nav>
        )}
      </ResourceState>
    </main>
  );
}
