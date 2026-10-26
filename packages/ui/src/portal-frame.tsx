"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AccessibleDialog } from "./dialog";
import { Icon } from "./icon";

// Layout mechanics only: each application owns its navigation and route policy.
export function PortalFrame({
  brand,
  subtitle,
  navigation,
  children,
  sessionActions,
}: {
  brand: string;
  subtitle: string;
  navigation: ReactNode;
  children: ReactNode;
  sessionActions: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <header className="portal-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-3 text-lg font-extrabold"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border-2 border-line bg-[var(--primary)] shadow-[2px_2px_0_var(--border)]">
              <Icon name="ticket" />
            </span>
            {brand}
          </Link>
          <span className="hidden text-xs text-muted xl:block">{subtitle}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {sessionActions}
          <button
            className="secondary-button lg:hidden"
            aria-label="Mở điều hướng"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
        </div>
      </header>
      <div
        className={
          navigation ? "portal-layout" : "portal-layout portal-layout-public"
        }
      >
        {navigation && (
          <aside className="portal-sidebar hidden lg:block">{navigation}</aside>
        )}
        <div
          id="main-content"
          tabIndex={-1}
          className="portal-main outline-none"
        >
          {children}
        </div>
      </div>
      {open && (
        <AccessibleDialog
          labelledBy="portal-nav-title"
          onClose={() => setOpen(false)}
        >
          <div className="flex items-center justify-between">
            <h2 id="portal-nav-title" className="text-xl">
              Điều hướng {brand}
            </h2>
            <button
              className="ghost-button"
              aria-label="Đóng điều hướng"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div
            className="mt-5"
            onClickCapture={(event) => {
              if ((event.target as Element).closest("a")) setOpen(false);
            }}
          >
            {navigation}
          </div>
        </AccessibleDialog>
      )}
    </>
  );
}

export function PortalBreadcrumbs({
  items,
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav
      aria-label="Đường dẫn"
      className="px-6 pt-6 text-xs font-semibold text-muted"
    >
      <ol className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <li key={item.href ?? item.label} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link className="underline underline-offset-4" href={item.href}>
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
