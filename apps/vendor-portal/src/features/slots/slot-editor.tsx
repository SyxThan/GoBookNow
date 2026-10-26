"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import {
  localDateInput,
  type ManagedService,
  type ManagedSlot,
} from "@gobook/api-client/catalog-management";
import { Button, PageHeading } from "@gobook/ui/primitives";
import {
  ActionFeedback,
  ResourceState,
  useWorkspaceAction,
  useWorkspaceQuery,
} from "@gobook/auth/resource";

export default function SlotEditor({
  serviceId,
  slotId,
}: {
  serviceId: string;
  slotId?: string;
}) {
  const creating = !slotId,
    router = useRouter(),
    cache = useQueryClient();
  const apiPath = `/vendor/services/${serviceId}/slots`;
  const back = `/services/${serviceId}/slots`;
  const service = useWorkspaceQuery<ManagedService>(
    `/vendor/services/${serviceId}`,
    ["vendor", "catalog", serviceId],
  );
  const slot = useWorkspaceQuery<ManagedSlot>(
    `${apiPath}/${slotId}`,
    ["vendor-slot", serviceId, slotId],
    !creating,
  );
  const action = useWorkspaceAction();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const start = new Date(String(data.get("startAt"))),
      end = new Date(String(data.get("endAt")));
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start
    ) {
      action.setError("Giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }
    if (start.getTime() <= Date.now()) {
      action.setError("Giờ bắt đầu phải ở tương lai.");
      return;
    }
    const price = String(data.get("priceAmount")).trim();
    if (
      await action.act(async () => {
        await service.request(creating ? apiPath : `${apiPath}/${slotId}`, {
          method: creating ? "POST" : "PATCH",
          body: JSON.stringify({
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            capacity: Number(data.get("capacity")),
            priceAmount: price || null,
          }),
        });
        await cache.invalidateQueries({
          queryKey: ["vendor-slots", serviceId],
        });
        router.replace(back);
      }, "Đã lưu lịch.")
    )
      action.setError("");
  }
  const archived = service.data?.status === "ARCHIVED";
  return (
    <main className="page-wrap">
      <Link className="text-sm font-bold underline" href={back}>
        ← Danh sách lịch
      </Link>
      <div className="mt-6">
        <PageHeading
          eyebrow={service.data?.title ?? "Lịch dịch vụ"}
          title={creating ? "Tạo lịch mới" : "Chỉnh sửa lịch"}
        >
          Cấu hình thời gian, số chỗ và giá cho một lịch. Thời gian theo múi giờ
          thiết bị.
        </PageHeading>
      </div>
      <ActionFeedback {...action} />
      <ResourceState query={service}>{null}</ResourceState>
      {!creating && <ResourceState query={slot}>{null}</ResourceState>}
      {archived && (
        <p role="status" className="status-note mb-6">
          Dịch vụ đã lưu trữ, không thể thay đổi lịch.
        </p>
      )}
      {service.data && (creating || slot.data) && (
        <form
          key={slot.data?.id ?? "new"}
          onSubmit={save}
          className="panel max-w-4xl p-6 sm:p-8"
        >
          <fieldset
            disabled={
              action.busy || archived || slot.data?.status === "CANCELLED"
            }
            className="grid gap-6 sm:grid-cols-2"
          >
            <legend className="mb-5 text-xl font-extrabold">
              Thời gian & sức chứa
            </legend>
            <label>
              Bắt đầu
              <input
                className="input mt-2"
                required
                type="datetime-local"
                name="startAt"
                defaultValue={
                  slot.data ? localDateInput(slot.data.startAt) : ""
                }
              />
            </label>
            <label>
              Kết thúc
              <input
                className="input mt-2"
                required
                type="datetime-local"
                name="endAt"
                defaultValue={slot.data ? localDateInput(slot.data.endAt) : ""}
              />
            </label>
            {service.data.kind === "SERVICE" &&
              service.data.durationMinutes && (
                <p className="text-sm text-muted sm:col-span-2">
                  Thời lượng lịch phải đúng {service.data.durationMinutes} phút.
                </p>
              )}
            <label>
              Số chỗ
              <input
                className="input mt-2"
                required
                type="number"
                min="1"
                max="100000"
                name="capacity"
                defaultValue={slot.data?.capacity ?? 10}
              />
            </label>
            <label>
              Giá riêng (₫)
              <input
                className="input mt-2"
                inputMode="numeric"
                pattern="(0|[1-9][0-9]{0,18})"
                name="priceAmount"
                defaultValue={slot.data?.priceAmount ?? ""}
                placeholder="Để trống để dùng giá dịch vụ"
              />
            </label>
            <p className="text-sm text-muted sm:col-span-2">
              Không thể giảm sức chứa dưới số chỗ đang được giữ hoặc đã xác
              nhận. Hệ thống kiểm tra lịch trùng trước khi lưu.
            </p>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button type="submit" loading={action.busy}>
                Lưu lịch
              </Button>
              <Link className="secondary-button" href={back}>
                Hủy
              </Link>
            </div>
          </fieldset>
        </form>
      )}
    </main>
  );
}
