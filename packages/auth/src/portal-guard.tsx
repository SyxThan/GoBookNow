"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@gobook/api-client";
import { EmptyState, SkeletonCards } from "@gobook/ui/primitives";
import { usePortalSession } from "./use-session";

type PortalUser = { id: string; email: string; roles: string[]; profile: { fullName: string } | null };
export function PortalGuard({ children, roles, requireApprovedVendor = false }: {
  children: ReactNode; roles: readonly string[]; requireApprovedVendor?: boolean;
}) {
  const { ready, token, onToken } = usePortalSession();
  const pathname = usePathname(), router = useRouter();
  const session = useQuery({
    queryKey: ["portal-session", token], enabled: ready, retry: false,
    queryFn: ({ signal }) => apiRequest<PortalUser>("/auth/me", { signal }, token, onToken),
    staleTime: 30_000,
  });
  const allowed = session.data?.roles.some(role => roles.includes(role));
  const vendor = useQuery({
    queryKey: ["portal-vendor-approval", session.data?.id],
    enabled: Boolean(requireApprovedVendor && allowed), retry: false,
    queryFn: ({ signal }) => apiRequest<{ status: string }>("/vendors/me", { signal }, token, onToken),
  });
  const unauthorized = session.error instanceof ApiError && session.error.status === 401;
  useEffect(() => {
    if (unauthorized) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthorized, pathname, router]);
  if (!ready || session.isPending || unauthorized) return <main className="page-wrap"><p role="status">Đang xác minh phiên đăng nhập…</p><SkeletonCards /></main>;
  if (session.isError) return <main className="page-wrap"><EmptyState title="Chưa xác minh được tài khoản" action={<button className="primary-button" onClick={() => void session.refetch()}>Thử lại</button>}>Kiểm tra kết nối và thử lại.</EmptyState></main>;
  if (!allowed) return <main className="page-wrap"><EmptyState title="Bạn chưa có quyền truy cập">Tài khoản hiện tại không có quyền sử dụng khu vực này. Hãy đăng xuất và dùng tài khoản phù hợp.</EmptyState></main>;
  if (requireApprovedVendor && vendor.isPending) return <main className="page-wrap"><p role="status">Đang kiểm tra trạng thái đối tác…</p></main>;
  if (requireApprovedVendor && (vendor.isError || vendor.data?.status !== "APPROVED")) return <main className="page-wrap"><EmptyState title="Tài khoản đối tác chưa sẵn sàng" action={<Link href="/onboarding/status" className="primary-button">Xem hồ sơ xét duyệt</Link>}>Hoạt động kinh doanh chỉ mở cho đối tác đã được phê duyệt.</EmptyState></main>;
  return children;
}
