"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PortalFrame, PortalBreadcrumbs } from "@gobook/ui/portal-frame";
import { Icon, type IconName } from "@gobook/ui/icon";
import { PortalGuard } from "@gobook/auth/portal-guard";
import { PortalLogout } from "@gobook/auth/portal-logout";
const groups = [
  {
    label: "Vận hành",
    links: [
      { href: "/vendor-applications", label: "Hồ sơ đối tác", icon: "shield" },
      { href: "/categories", label: "Danh mục", icon: "grid" },
    ],
  },
  {
    label: "Khuyến mãi",
    links: [{ href: "/vouchers", label: "Voucher", icon: "ticket" }],
  },
  {
    label: "Tài chính",
    links: [{ href: "/transactions", label: "Giao dịch", icon: "chart" }],
  },
];
const names: Record<string, string> = {
  dashboard: "Tổng quan",
  bookings: "Đơn đặt chỗ",
  services: "Dịch vụ",
  new: "Tạo mới",
  edit: "Chỉnh sửa",
  slots: "Lịch trống",
  profile: "Hồ sơ",
  onboarding: "Đăng ký đối tác",
  application: "Đơn đăng ký",
  status: "Trạng thái xét duyệt",
  "check-in": "Check-in",
  "vendor-applications": "Hồ sơ đối tác",
  categories: "Danh mục",
  vouchers: "Voucher",
  transactions: "Giao dịch",
};
export function AdminConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const login = pathname === "/login";
  const segments = pathname.split("/").filter(Boolean);
  const navigation = (
    <nav aria-label="Điều hướng GoBookNow Admin" className="grid gap-6">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="eyebrow mb-2 px-3">{group.label}</h2>
          <ul className="grid gap-1">
            {group.links.map((item) => (
              <li key={item.href}>
                <Link
                  className="workspace-link"
                  href={item.href}
                  aria-current={
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/")
                      ? "page"
                      : undefined
                  }
                >
                  <Icon name={item.icon as IconName} size={18} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
  const content = login ? (
    children
  ) : (
    <>
      <PortalBreadcrumbs
        items={segments.map((segment, index) => ({
          label: names[segment] ?? "Chi tiết",
          ...(index < segments.length - 1 &&
          (index === 0 || segments[0] !== "vouchers")
            ? { href: "/" + segments.slice(0, index + 1).join("/") }
            : {}),
        }))}
      />
      <PortalGuard roles={["ADMIN"]}>{children}</PortalGuard>
    </>
  );
  return (
    <PortalFrame
      brand="GoBookNow Admin"
      subtitle="Quản trị nền tảng"
      navigation={login ? null : navigation}
      sessionActions={<PortalLogout />}
    >
      {content}
    </PortalFrame>
  );
}
