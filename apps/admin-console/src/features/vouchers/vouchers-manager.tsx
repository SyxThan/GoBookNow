"use client";

import Link from "next/link";
import { useState } from "react";
import { AccessibleDialog } from "@/components/ui/dialog";
import { Button, EmptyState, PageHeading } from "@/components/ui/primitives";
import {
  ActionFeedback,
  ResourceState,
  useWorkspaceAction,
  useWorkspaceQuery,
} from "@/components/workspace/resource";
import { formatDateTime, formatMoney } from "@/lib/format";

import type { Voucher } from "./types";

export default function VouchersManager() {
  const query = useWorkspaceQuery<Voucher[]>("/admin/vouchers", [
      "admin-vouchers",
    ]),
    action = useWorkspaceAction();
  const [deactivate, setDeactivate] = useState<Voucher | null>(null),
    [search, setSearch] = useState("");
  async function confirmDeactivate() {
    if (!deactivate) return;
    if (
      await action.act(async () => {
        await query.request(`/admin/vouchers/${deactivate.id}`, {
          method: "DELETE",
        });
        await query.refetch();
      }, "Đã ngừng áp dụng mã cho lượt sử dụng mới.")
    )
      setDeactivate(null);
  }
  const items = query.data?.filter((item) =>
    item.code.toLowerCase().includes(search.toLowerCase().trim()),
  );
  return (
    <main className="page-wrap py-10">
      <PageHeading
        eyebrow="Quản trị GoBookNow"
        title="Ưu đãi & mã giảm giá"
        action={
          <Link className="primary-button" href="/vouchers/new">
            + Tạo ưu đãi
          </Link>
        }
      >
        Quản lý điều kiện, hạn dùng và số lượt. Số lượt sử dụng bao gồm lượt giữ
        chỗ còn hiệu lực.
      </PageHeading>
      <ActionFeedback error={action.error} notice={action.notice} />
      <label className="mb-6 block max-w-sm text-sm font-bold">
        Tìm theo mã
        <input
          type="search"
          className="input mt-2"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nhập mã ưu đãi"
        />
      </label>
      <ResourceState query={query}>
        {items?.length ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {items.map((voucher) => (
              <article className="panel p-5 sm:p-6" key={voucher.id}>
                <div className="flex flex-wrap justify-between gap-3">
                  <h2 className="break-all text-xl">{voucher.code}</h2>
                  <span
                    className={`badge ${voucher.isActive ? "bg-mint" : "bg-soft"}`}
                  >
                    {voucher.isActive ? "Đang bật" : "Đã ngừng"}
                  </span>
                </div>
                <p className="my-5 text-3xl font-extrabold">
                  {voucher.type === "FIXED"
                    ? formatMoney(voucher.fixedAmount ?? "0")
                    : `${(voucher.percentageBps ?? 0) / 100}%`}
                </p>
                <dl className="grid gap-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-muted">Đơn tối thiểu</dt>
                    <dd className="font-bold">
                      {formatMoney(voucher.minOrderAmount)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-muted">Giảm tối đa</dt>
                    <dd className="font-bold">
                      {voucher.maxDiscountAmount
                        ? formatMoney(voucher.maxDiscountAmount)
                        : "Theo mức giảm"}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-muted">Lượt đang sử dụng</dt>
                    <dd className="font-bold">
                      {voucher.effectiveUsage} / {voucher.usageLimit}
                    </dd>
                  </div>
                </dl>
                <p className="mt-5 border-t-2 border-line/15 pt-4 text-xs text-muted">
                  {formatDateTime(voucher.validFrom)} →{" "}
                  {formatDateTime(voucher.validUntil)}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Mã chỉ hợp lệ khi đang bật, trong thời hạn và còn lượt sử
                  dụng.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    className="secondary-button"
                    href={`/vouchers/${voucher.id}/edit`}
                  >
                    Chỉnh sửa
                  </Link>
                  {voucher.isActive && (
                    <Button
                      variant="ghost"
                      disabled={action.busy}
                      onClick={() => setDeactivate(voucher)}
                    >
                      Ngừng áp dụng
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Chưa có ưu đãi phù hợp"
            action={
              <Link className="primary-button" href="/vouchers/new">
                Tạo mã ưu đãi
              </Link>
            }
          >
            Tạo một mã với điều kiện rõ ràng để khách áp dụng khi đặt chỗ.
          </EmptyState>
        )}
      </ResourceState>
      {deactivate && (
        <AccessibleDialog
          labelledBy="deactivate-title"
          busy={action.busy}
          onClose={() => setDeactivate(null)}
        >
          <h2 id="deactivate-title" className="text-2xl">
            Ngừng áp dụng {deactivate.code}?
          </h2>
          <p className="my-5 text-sm text-muted">
            Khách sẽ không thể áp dụng mã cho lượt giữ chỗ mới. Các khoản giảm
            đã được xác nhận vẫn giữ nguyên theo đặt chỗ.
          </p>
          <ActionFeedback error={action.error} />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              loading={action.busy}
              onClick={confirmDeactivate}
            >
              Xác nhận ngừng áp dụng
            </Button>
            <Button
              variant="secondary"
              disabled={action.busy}
              onClick={() => setDeactivate(null)}
            >
              Quay lại
            </Button>
          </div>
        </AccessibleDialog>
      )}
    </main>
  );
}
