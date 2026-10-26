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
    label: "Tổng quan",
    links: [{ href: "/dashboard", label: "Tổng quan", icon: "chart" }],
  },
  {
    label: "Vận hành",
    links: [
      { href: "/bookings", label: "Đơn đặt chỗ", icon: "calendar" },
      { href: "/check-in", label: "Check-in vé", icon: "ticket" },
    ],
  },
  {
    label: "Dịch vụ",
    links: [{ href: "/services", label: "Dịch vụ của tôi", icon: "grid" }],
  },
  {
    label: "Tài khoản",
    links: [
      { href: "/profile", label: "Hồ sơ đối tác", icon: "user" },
      { href: "/onboarding/status", label: "Hồ sơ xét duyệt", icon: "shield" },
    ],
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
export function VendorPortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const login = pathname === "/login";
  const segments = pathname.split("/").filter(Boolean);
  const navigation = (
    <nav aria-label="Điều hướng GoBookNow Vendor" className="grid gap-6">
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
          ((index === 0 && segment !== "onboarding") ||
            (segments[0] === "services" && (index === 1 || index === 2)))
            ? { href: "/" + segments.slice(0, index + 1).join("/") }
            : {}),
        }))}
      />
      <PortalGuard
        roles={
          pathname === "/profile" || pathname.startsWith("/onboarding/")
            ? ["CUSTOMER", "VENDOR"]
            : ["VENDOR"]
        }
        requireApprovedVendor={
          pathname !== "/profile" && !pathname.startsWith("/onboarding/")
        }
      >
        {children}
      </PortalGuard>
    </>
  );
  return (
    <PortalFrame
      brand="GoBookNow Vendor"
      subtitle="Vận hành dịch vụ, đặt chỗ và khách hàng"
      navigation={login ? null : navigation}
      sessionActions={<PortalLogout />}
    >
      {content}
    </PortalFrame>
  );
}
