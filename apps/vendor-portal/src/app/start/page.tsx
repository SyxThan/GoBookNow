"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@gobook/api-client";
import { usePortalSession } from "@gobook/auth/use-session";
import { EmptyState } from "@gobook/ui/primitives";

export default function VendorStartPage() {
  const { ready, token, onToken } = usePortalSession();
  const router = useRouter();
  const vendor = useQuery({
    queryKey: ["vendor-entry", token],
    enabled: ready,
    retry: false,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      apiRequest<{ status: string }>(
        "/vendors/me",
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) },
        token,
        onToken,
      ),
  });
  const noVendor =
    vendor.error instanceof ApiError && vendor.error.status === 404;
  const destination = vendor.isSuccess
    ? vendor.data.status === "APPROVED"
      ? "/dashboard"
      : "/onboarding/application"
    : noVendor
      ? "/onboarding/application"
      : null;

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  if (vendor.isError && !noVendor)
    return (
      <main className="page-wrap">
        <EmptyState
          title="Chưa mở được cổng đối tác"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button
                className="primary-button"
                onClick={() => void vendor.refetch()}
              >
                Thử lại
              </button>
              <Link href="/login" className="secondary-button">
                Đăng nhập lại
              </Link>
            </div>
          }
        >
          Kiểm tra kết nối rồi thử lại. Nếu bạn vừa đăng nhập trên trang khách
          hàng, hãy đăng nhập tại cổng đối tác này.
        </EmptyState>
      </main>
    );

  return (
    <main className="page-wrap grid min-h-[50vh] place-items-center">
      <section
        className="panel w-full max-w-lg bg-sun/20 p-8 text-center"
        aria-busy="true"
      >
        <p className="eyebrow">Cổng đối tác GoBookNow</p>
        <h1 className="mt-3 text-2xl" role="status">
          Đang mở khu vực phù hợp với tài khoản…
        </h1>
        <p className="mt-3 text-sm text-muted">
          Đối tác đã duyệt sẽ vào trang quản lý; hồ sơ mới sẽ tiếp tục đăng ký.
        </p>
      </section>
    </main>
  );
}
