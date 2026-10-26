"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { logout } from "@/lib/api-client";
import { AccessibleDialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";

const sessionKey = "gobook.accessToken";
function subscribe(callback: () => void) {
  window.addEventListener("gobook:session", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("gobook:session", callback);
    window.removeEventListener("storage", callback);
  };
}
function snapshot() {
  try {
    return sessionStorage.getItem(sessionKey);
  } catch {
    return null;
  }
}
const vendorLinks = [
  ["/vendor/dashboard", "Tổng quan", "chart"],
  ["/vendor/services", "Dịch vụ", "grid"],
  ["/vendor/bookings", "Đặt chỗ", "calendar"],
  ["/vendor/check-in", "Check-in vé", "ticket"],
  ["/vendor/profile", "Hồ sơ đối tác", "user"],
  ["/vendor/application", "Hồ sơ xét duyệt", "shield"],
] as const;
const adminLinks = [
  ["/admin/transactions", "Giao dịch", "chart"],
  ["/admin/vendor-applications", "Duyệt đối tác", "shield"],
  ["/admin/categories", "Danh mục", "grid"],
  ["/admin/vouchers", "Mã ưu đãi", "ticket"],
] as const;

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="GoBookNow — Trang chủ"
      className="inline-flex shrink-0 items-center gap-2.5 text-[21px] font-extrabold tracking-[-.055em]"
    >
      <span className="grid size-9 rotate-[-8deg] place-items-center rounded-lg border-2 border-line bg-sun shadow-[2px_2px_0_var(--border)]">
        <Icon name="ticket" size={22} />
      </span>
      GoBook<span className="-ml-2 text-info">Now</span>
      <span className="mb-3 -ml-1 size-1.5 rounded-full bg-coral" />
    </Link>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useSyncExternalStore(subscribe, snapshot, () => null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // Decoding chooses navigation hints only. All authorization remains server-side.
  let roles: string[] = [];
  try {
    const decoded: unknown = JSON.parse(
      atob(
        token?.split(".")[1]?.replaceAll("-", "+").replaceAll("_", "/") ?? "",
      ),
    );
    if (
      decoded &&
      typeof decoded === "object" &&
      "roles" in decoded &&
      Array.isArray(decoded.roles)
    )
      roles = decoded.roles.filter(
        (role): role is string => typeof role === "string",
      );
  } catch {
    /* No identity is trusted from this hint. */
  }
  const workspace = pathname.startsWith("/admin")
    ? "admin"
    : pathname.startsWith("/vendor")
      ? "vendor"
      : null;
  const account = roles.includes("ADMIN")
    ? "/admin/transactions"
    : roles.includes("VENDOR")
      ? "/vendor/dashboard"
      : "/bookings";
  async function signOut() {
    setBusy(true);
    setNotice("");
    try {
      await logout();
      sessionStorage.removeItem(sessionKey);
      window.dispatchEvent(new Event("gobook:session"));
      setMenuOpen(false);
      router.replace("/");
    } catch {
      setNotice("Chưa thể đăng xuất. Vui lòng kiểm tra kết nối và thử lại.");
    } finally {
      setBusy(false);
    }
  }
  const links = workspace === "admin" ? adminLinks : vendorLinks;
  return (
    <>
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <header className="sticky top-0 z-40 border-b-2 border-line bg-canvas">
        <div className="mx-auto flex min-h-20 max-w-[1440px] items-center justify-between gap-5 px-5 lg:px-8">
          <Brand />
          <nav
            className="hidden items-center gap-7 text-sm font-semibold lg:flex"
            aria-label="Điều hướng chính"
          >
            <Link
              href="/services"
              aria-current={pathname === "/services" ? "page" : undefined}
            >
              Khám phá
            </Link>
            <Link href="/#cach-dat">Cách đặt chỗ</Link>
            <Link href="/vendor/profile">
              Dành cho đối tác <span aria-hidden="true">↗</span>
            </Link>
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            {token ? (
              <>
                <Link href={account} className="secondary-button">
                  <Icon name="user" />
                  Tài khoản của bạn
                </Link>
                <button
                  className="ghost-button"
                  onClick={signOut}
                  disabled={busy}
                >
                  {busy ? "Đang thoát…" : "Đăng xuất"}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="ghost-button"
                  aria-label="Đăng nhập tài khoản"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register"
                  className="primary-button"
                  aria-label="Đăng ký khách hàng"
                >
                  Bắt đầu ngay <Icon name="arrow" size={17} />
                </Link>
              </>
            )}
          </div>
          <button
            className="ghost-button lg:hidden"
            aria-label="Mở menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
        </div>
        {notice && (
          <p role="alert" className="px-5 pb-3 text-sm text-danger">
            {notice}
          </p>
        )}
      </header>
      {menuOpen && (
        <AccessibleDialog
          labelledBy="mobile-menu-title"
          onClose={() => setMenuOpen(false)}
        >
          <div className="flex items-center justify-between">
            <h2 id="mobile-menu-title" className="text-2xl">
              Bạn muốn đi đâu?
            </h2>
            <button
              className="ghost-button"
              aria-label="Đóng menu"
              onClick={() => setMenuOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <nav aria-label="Menu di động" className="mt-6 grid gap-3">
            {[
              ["/services", "Khám phá trải nghiệm"],
              ["/bookings", "Đặt chỗ & vé của tôi"],
              ["/vendor/profile", "Dành cho đối tác"],
              ...(token
                ? [[account, "Tài khoản của bạn"]]
                : [
                    ["/login", "Đăng nhập"],
                    ["/register", "Đăng ký khách hàng"],
                  ]),
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="secondary-button justify-between"
              >
                {label}
                <Icon name="arrow" />
              </Link>
            ))}
          </nav>
          {token && (
            <button
              className="ghost-button mt-4"
              onClick={signOut}
              disabled={busy}
            >
              Đăng xuất
            </button>
          )}
        </AccessibleDialog>
      )}
      <div id="main-content" tabIndex={-1} className="outline-none">
        {workspace ? (
          <div className="workspace">
            <aside className="workspace-nav">
              <p className="eyebrow mb-4 hidden lg:block">
                {workspace === "admin"
                  ? "GoBookNow · Quản trị"
                  : "GoBookNow · Đối tác"}
              </p>
              <nav
                aria-label={
                  workspace === "admin" ? "Quản trị" : "Không gian đối tác"
                }
              >
                {links.map(([href, label, icon]) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={
                      pathname === href || pathname.startsWith(href + "/")
                        ? "page"
                        : undefined
                    }
                    className="workspace-link"
                  >
                    <Icon name={icon} size={18} />
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="mt-10 hidden rounded-xl border-2 border-line bg-lavender p-4 lg:block">
                <Icon name="ticket" size={28} />
                <p className="mt-3 text-sm font-bold">
                  Trải nghiệm tốt, bắt đầu từ bạn.
                </p>
                <Link
                  href="/services"
                  className="mt-3 inline-flex items-center gap-2 text-xs font-semibold underline"
                >
                  Xem trang khám phá <Icon name="arrow" size={15} />
                </Link>
              </div>
            </aside>
            <div className="workspace-content">{children}</div>
          </div>
        ) : (
          children
        )}
      </div>
      <footer className="border-t-2 border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-6 py-10 md:flex-row">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-sm text-muted">
              Đặt một lịch hẹn. Mở thêm một trải nghiệm.
            </p>
          </div>
          <nav
            aria-label="Liên kết cuối trang"
            className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm"
          >
            <Link href="/services">Tìm trải nghiệm</Link>
            <Link href="/bookings">Đặt chỗ & vé</Link>
            <Link href="/vendor/profile">Trở thành đối tác</Link>
            <Link href="/#cach-dat">Hướng dẫn đặt chỗ</Link>
          </nav>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 border-t border-line/15 px-6 py-5 text-xs text-muted">
          <p>© GoBookNow · Mỗi trải nghiệm đều đáng nhớ.</p>
          <p>Thanh toán qua SePay · Vé QR trong tài khoản</p>
        </div>
      </footer>
    </>
  );
}
