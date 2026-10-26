"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button, PageHeading, StatusBadge } from "@gobook/ui/primitives";
import { ResourceState, useWorkspaceQuery } from "@gobook/auth/resource";
export default function OnboardingStatus() {
  const cache = useQueryClient();
  const vendor = useWorkspaceQuery<{
    id: string;
    displayName: string;
    status: string;
  }>("/vendors/me", ["vendor-onboarding-status"]);
  return (
    <main className="page-wrap">
      <PageHeading
        eyebrow="Hành trình đối tác"
        title="Trạng thái xét duyệt"
        action={
          <Button
            variant="secondary"
            loading={vendor.isFetching}
            onClick={() =>
              void Promise.all([
                vendor.refetch(),
                cache.invalidateQueries({ queryKey: ["portal-session"] }),
              ])
            }
          >
            Kiểm tra cập nhật
          </Button>
        }
      >
        Theo dõi hồ sơ và hoàn thiện thông tin để bắt đầu kinh doanh.
      </PageHeading>
      {vendor.isError ? (
        <section className="panel p-6">
          <h2 className="text-xl">Bắt đầu hồ sơ đối tác</h2>
          <p className="mt-3 text-muted">
            Nếu chưa có hồ sơ, hãy tạo thông tin đối tác trước. Nếu đã tạo, kiểm
            tra kết nối và thử lại.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="primary-button" href="/profile">
              Tạo / cập nhật hồ sơ
            </Link>
            <button
              className="secondary-button"
              onClick={() => void vendor.refetch()}
            >
              Thử lại
            </button>
          </div>
        </section>
      ) : (
        <ResourceState query={vendor}>
          {vendor.data && (
            <section className="panel p-6">
              <h2 className="text-xl">{vendor.data.displayName}</h2>
              <div className="mt-4">
                <StatusBadge status={vendor.data.status} />
              </div>
              <p className="mt-4 text-sm text-muted">
                Quyền vận hành được mở sau khi hồ sơ được phê duyệt.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="primary-button" href="/onboarding/application">
                  Xem / hoàn thiện đơn đăng ký
                </Link>
                <Link className="secondary-button" href="/profile">
                  Hồ sơ đối tác
                </Link>
                {vendor.data.status === "APPROVED" && (
                  <Link className="secondary-button" href="/dashboard">
                    Vào tổng quan
                  </Link>
                )}
              </div>
            </section>
          )}
        </ResourceState>
      )}
    </main>
  );
}
