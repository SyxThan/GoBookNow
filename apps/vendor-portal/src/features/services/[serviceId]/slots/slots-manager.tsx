"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AccessibleDialog } from "@/components/ui/dialog";
import {
  Button,
  EmptyState,
  PageHeading,
  StatusBadge,
} from "@/components/ui/primitives";
import {
  ActionFeedback,
  ResourceState,
  useWorkspaceAction,
  useWorkspaceQuery,
  type PageResult,
} from "@/components/workspace/resource";
import {
  type ManagedService,
  type ManagedSlot,
} from "@/lib/catalog-management";
import { formatDateTime, formatMoney } from "@/lib/format";

export default function SlotsManager({ serviceId }: { serviceId: string }) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("");
  const [confirmation, setConfirmation] = useState<{
    slot: ManagedSlot;
    action: "close" | "open" | "cancel" | "delete";
  } | null>(null);
  const path = `/vendor/services/${serviceId}/slots`;
  const query = useWorkspaceQuery<PageResult<ManagedSlot>>(
    `${path}?page=${page}&limit=12${status ? `&status=${status}` : ""}`,
    ["vendor-slots", serviceId, page, status],
  );
  const service = useWorkspaceQuery<ManagedService>(
    `/vendor/services/${serviceId}`,
    ["vendor", "catalog", serviceId],
  );
  const archived = service.data?.status === "ARCHIVED";
  const action = useWorkspaceAction(),
    cache = useQueryClient();
  async function changed() {
    await cache.invalidateQueries({ queryKey: ["vendor-slots", serviceId] });
  }
  async function confirm() {
    if (!confirmation) return;
    const { slot, action: operation } = confirmation;
    if (
      await action.act(async () => {
        await query.request(
          `${path}/${slot.id}${operation === "delete" ? "" : `/${operation}`}`,
          { method: operation === "delete" ? "DELETE" : "POST" },
        );
        await changed();
      }, "Đã cập nhật trạng thái lịch.")
    )
      setConfirmation(null);
  }
  return (
    <main className="page-wrap py-10">
      <Link
        className="text-sm font-bold underline underline-offset-4"
        href={`/services/${serviceId}`}
      >
        ← Chi tiết dịch vụ
      </Link>
      <div className="mt-6">
        <PageHeading
          eyebrow="Không gian đối tác"
          title="Lịch & sức chứa"
          action={
            !archived && service.data ? (
              <Link
                className="primary-button"
                href={`/services/${serviceId}/slots/new`}
              >
                + Thêm lịch
              </Link>
            ) : undefined
          }
        >
          Đặt giờ, số chỗ và mức giá riêng cho từng lịch. Thời gian hiển thị
          theo múi giờ trên thiết bị của bạn.
        </PageHeading>
      </div>
      <ActionFeedback error={action.error} notice={action.notice} />
      {archived && (
        <p role="status" className="status-note mb-6">
          Dịch vụ đã lưu trữ. Lịch hiện có chỉ để tra cứu.
        </p>
      )}
      <label className="mb-6 block max-w-xs text-sm font-bold">
        Trạng thái lịch
        <select
          className="input mt-2"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="OPEN">Đang mở</option>
          <option value="CLOSED">Đã đóng</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
      </label>
      <ResourceState query={query}>
        {query.data?.items.length ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {query.data.items.map((slot) => (
              <article className="panel p-5 sm:p-6" key={slot.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="max-w-sm text-lg">
                    {formatDateTime(slot.startAt)}
                  </h2>
                  <StatusBadge status={slot.status} />
                </div>
                <p className="mt-2 text-sm text-muted">
                  Kết thúc: {formatDateTime(slot.endAt)}
                </p>
                <dl className="my-5 grid grid-cols-2 gap-3 border-y-2 border-line/15 py-4">
                  <div>
                    <dt className="text-xs text-muted">Sức chứa</dt>
                    <dd className="mt-1 font-extrabold">{slot.capacity} chỗ</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Giá mỗi chỗ</dt>
                    <dd className="mt-1 font-extrabold">
                      {formatMoney(
                        slot.effectivePrice.amount,
                        slot.effectivePrice.currency,
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="mb-5 text-xs text-muted">
                  {slot.effectivePrice.source === "SERVICE"
                    ? "Đang dùng giá mặc định của dịch vụ."
                    : "Đang dùng giá riêng của lịch này."}
                </p>
                <div className="flex flex-wrap gap-3">
                  {!archived && slot.status !== "CANCELLED" && (
                    <Link
                      className="secondary-button"
                      href={`/services/${serviceId}/slots/${slot.id}/edit`}
                    >
                      Chỉnh sửa
                    </Link>
                  )}
                  {slot.status !== "CANCELLED" && (
                    <Button
                      variant="secondary"
                      disabled={action.busy || archived}
                      onClick={() =>
                        setConfirmation({
                          slot,
                          action: slot.status === "OPEN" ? "close" : "open",
                        })
                      }
                    >
                      {slot.status === "OPEN" ? "Đóng lịch" : "Mở lại"}
                    </Button>
                  )}
                  {slot.status !== "CANCELLED" && (
                    <Button
                      variant="ghost"
                      disabled={action.busy || archived}
                      onClick={() =>
                        setConfirmation({ slot, action: "cancel" })
                      }
                    >
                      Hủy lịch
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={action.busy || archived}
                    onClick={() => setConfirmation({ slot, action: "delete" })}
                  >
                    Xóa lịch
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Chưa có lịch phù hợp"
            action={
              !archived && service.data ? (
                <Link
                  className="primary-button"
                  href={`/services/${serviceId}/slots/new`}
                >
                  Tạo lịch đầu tiên
                </Link>
              ) : undefined
            }
          >
            Lịch mở trong tương lai sẽ xuất hiện để khách chọn trên trang dịch
            vụ.
          </EmptyState>
        )}
      </ResourceState>
      {!!query.data?.totalPages && (
        <nav
          aria-label="Phân trang lịch"
          className="mt-8 flex flex-wrap items-center gap-4"
        >
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Trang trước
          </Button>
          <span className="text-sm">
            Trang {page} / {query.data.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= query.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </Button>
        </nav>
      )}
      {confirmation && (
        <AccessibleDialog
          labelledBy="slot-confirm"
          busy={action.busy}
          onClose={() => setConfirmation(null)}
        >
          <h2 id="slot-confirm" className="text-2xl">
            Xác nhận thay đổi lịch
          </h2>
          <p className="mt-4">{formatDateTime(confirmation.slot.startAt)}</p>
          <p className="mt-3 text-sm text-muted">
            {confirmation.action === "open"
              ? "Khách có thể đặt lịch này nếu lịch còn ở tương lai và đáp ứng điều kiện."
              : "Lịch sẽ ngừng nhận đặt chỗ mới. Các đặt chỗ hiện có được kiểm tra theo quy định của dịch vụ."}
          </p>
          <ActionFeedback error={action.error} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant={confirmation.action === "open" ? "primary" : "danger"}
              loading={action.busy}
              onClick={confirm}
            >
              Xác nhận{" "}
              {
                {
                  close: "đóng lịch",
                  open: "mở lại",
                  cancel: "hủy lịch",
                  delete: "xóa lịch",
                }[confirmation.action]
              }
            </Button>
            <Button
              variant="secondary"
              disabled={action.busy || archived}
              onClick={() => setConfirmation(null)}
            >
              Quay lại
            </Button>
          </div>
        </AccessibleDialog>
      )}
    </main>
  );
}
