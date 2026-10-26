"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@gobook/api-client";
import { EmptyState } from "@gobook/ui/primitives";
import { Icon } from "@gobook/ui/icon";
import { usePortalSession } from "./use-session";

type PortalUser = {
  id: string;
  email: string;
  roles: string[];
  profile: { fullName: string } | null;
};
export function PortalGuard({
  children,
  roles,
  requireApprovedVendor = false,
}: {
  children: ReactNode;
  roles: readonly string[];
  requireApprovedVendor?: boolean;
}) {
  const { ready, token, onToken } = usePortalSession();
  const pathname = usePathname(),
    router = useRouter();
  const loginUrl = `/login?next=${encodeURIComponent(pathname)}`;
  const session = useQuery({
    queryKey: ["portal-session", token],
    enabled: ready,
    retry: false,
    queryFn: ({ signal }) =>
      apiRequest<PortalUser>(
        "/auth/me",
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) },
        token,
        onToken,
      ),
    staleTime: 30_000,
  });
  const allowed = session.data?.roles.some((role) => roles.includes(role));
  const vendor = useQuery({
    queryKey: ["portal-vendor-approval", session.data?.id],
    enabled: Boolean(requireApprovedVendor && allowed),
    retry: false,
    queryFn: ({ signal }) =>
      apiRequest<{ status: string }>(
        "/vendors/me",
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) },
        token,
        onToken,
      ),
  });
  const unauthorized =
    session.error instanceof ApiError && session.error.status === 401;
  useEffect(() => {
    if (unauthorized) router.replace(loginUrl);
  }, [unauthorized, loginUrl, router]);
  if (!ready || session.isPending || unauthorized)
    return (
      <main className="page-wrap grid min-h-[50vh] place-items-center">
        <section
          className="panel w-full max-w-lg p-8 text-center"
          aria-busy={!unauthorized}
        >
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border-2 border-line bg-mint">
            <Icon name="shield" size={28} />
          </span>
          <h1 className="mt-5 text-2xl" role="status">
            {unauthorized
              ? "Đang chuyển đến đăng nhập…"
              : "Đang xác minh phiên đăng nhập…"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Vui lòng đợi trong giây lát để mở khu vực của bạn.
          </p>
          <div className="skeleton mx-auto mt-6 h-2 w-40" aria-hidden="true" />
          {unauthorized && (
            <Link href={loginUrl} className="secondary-button mt-6">
              Tiếp tục đăng nhập
            </Link>
          )}
        </section>
      </main>
    );
  if (session.error instanceof ApiError && session.error.status === 403)
    return (
      <main className="page-wrap">
        <EmptyState
          title="Tài khoản chưa thể truy cập"
          action={
            <Link href={loginUrl} className="primary-button">
              Đăng nhập tài khoản khác
            </Link>
          }
        >
          Yêu cầu xác thực đã bị từ chối. Vui lòng kiểm tra trạng thái tài khoản
          hoặc dùng tài khoản khác.
        </EmptyState>
      </main>
    );
  if (session.isError)
    return (
      <main className="page-wrap">
        <EmptyState
          title="Chưa xác minh được tài khoản"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button
                className="primary-button"
                onClick={() => void session.refetch()}
              >
                Thử lại
              </button>
              <Link href={loginUrl} className="secondary-button">
                Đăng nhập lại
              </Link>
            </div>
          }
        >
          Kết nối bị gián đoạn hoặc máy chủ chưa phản hồi. Bạn có thể thử lại
          hoặc đăng nhập lại để tiếp tục.
        </EmptyState>
      </main>
    );
  if (!allowed)
    return (
      <main className="page-wrap">
        <EmptyState
          title="Bạn chưa có quyền truy cập"
          action={
            <Link href={loginUrl} className="primary-button">
              Đăng nhập tài khoản khác
            </Link>
          }
        >
          Tài khoản {session.data?.email} không có quyền sử dụng khu vực này.
          Vui lòng dùng tài khoản được cấp quyền phù hợp.
        </EmptyState>
      </main>
    );
  if (requireApprovedVendor && vendor.isPending)
    return (
      <main className="page-wrap">
        <p role="status">Đang kiểm tra trạng thái đối tác…</p>
      </main>
    );
  if (
    requireApprovedVendor &&
    vendor.isError &&
    !(vendor.error instanceof ApiError && vendor.error.status === 404)
  )
    return (
      <main className="page-wrap">
        <EmptyState
          title="Chưa kiểm tra được trạng thái đối tác"
          action={
            <button
              className="primary-button"
              onClick={() => void vendor.refetch()}
            >
              Thử lại
            </button>
          }
        >
          Vui lòng kiểm tra kết nối và thử lại để tiếp tục vào trang quản lý.
        </EmptyState>
      </main>
    );
  if (requireApprovedVendor && vendor.data?.status !== "APPROVED")
    return (
      <main className="page-wrap">
        <EmptyState
          title="Tài khoản đối tác chưa sẵn sàng"
          action={
            <Link href="/onboarding/status" className="primary-button">
              Xem hồ sơ xét duyệt
            </Link>
          }
        >
          Hoạt động kinh doanh chỉ mở cho đối tác đã được phê duyệt.
        </EmptyState>
      </main>
    );
  return children;
}
