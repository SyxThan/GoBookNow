"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./icon";

export function Button({
  variant = "primary",
  loading,
  children,
  disabled,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${variant}-button ${className}`}
    >
      {loading && (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

const labels: Record<string, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  CONFIRMED: "Đã xác nhận",
  CANCELLED: "Đã hủy",
  EXPIRED: "Đã hết hạn",
  COMPLETED: "Đã hoàn thành",
  PENDING: "Đang chờ xử lý",
  SUCCEEDED: "Thành công",
  FAILED: "Chưa thành công",
  ISSUED: "Vé sẵn sàng",
  CHECKED_IN: "Đã check-in",
  VOIDED: "Vé đã vô hiệu",
  DRAFT: "Bản nháp",
  PUBLISHED: "Đang hiển thị",
  APPROVED: "Đã duyệt",
  REJECTED: "Cần chỉnh sửa",
  SUSPENDED: "Tạm ngưng",
  OPEN: "Đang mở",
  ACTIVE: "Đang hoạt động",
  UPCOMING: "Sắp diễn ra",
};
export function StatusBadge({ status }: { status: string }) {
  const color = [
    "CONFIRMED",
    "SUCCEEDED",
    "ISSUED",
    "APPROVED",
    "PUBLISHED",
    "ACTIVE",
    "OPEN",
  ].includes(status)
    ? "bg-mint"
    : ["CANCELLED", "FAILED", "REJECTED", "VOIDED", "SUSPENDED"].includes(
          status,
        )
      ? "bg-coral/40"
      : ["EXPIRED", "COMPLETED", "CHECKED_IN"].includes(status)
        ? "bg-soft"
        : "bg-sun/60";
  return (
    <span className={`badge ${color}`}>
      {{ HIDDEN: "Đã ẩn", ARCHIVED: "Đã lưu trữ", CLOSED: "Đã đóng" }[status] ??
        labels[status] ??
        status}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel grid min-h-64 place-items-center px-6 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-xl border-2 border-line bg-lavender">
          <Icon name="ticket" size={28} />
        </div>
        <h2 className="text-xl">{title}</h2>
        <p className="mt-3 text-sm text-muted">{children}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </section>
  );
}

export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="section-title">{title}</h1>
        {children && (
          <p className="mt-3 max-w-2xl text-sm text-muted">{children}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Đang tải nội dung"
    >
      {Array.from({ length: count }, (_, i) => (
        <div className="panel p-5" key={i}>
          <div className="skeleton h-40" />
          <div className="skeleton mt-5 h-5 w-3/4" />
          <div className="skeleton mt-3 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
