"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listPublicCategories } from "@/lib/api-client";
import type { ManagedService, ManagedImage } from "@/lib/catalog-management";
import {
  useWorkspaceRequest,
  useWorkspaceAction,
  ActionFeedback,
  ResourceState,
} from "@/components/workspace/resource";
import { AccessibleDialog } from "@/components/ui/dialog";
import { PageHeading, Button, StatusBadge } from "@/components/ui/primitives";
import { ServiceForm } from "../service-form";
import { formatMoney } from "@/lib/format";
import { Icon } from "@/components/ui/icon";

export function ServiceEditor({
  serviceId,
  mode = "edit",
}: {
  serviceId: string;
  mode?: "overview" | "edit";
}) {
  const creating = serviceId === "new",
    router = useRouter(),
    cache = useQueryClient();
  const { ready, request } = useWorkspaceRequest();
  const action = useWorkspaceAction();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const service = useQuery({
    queryKey: ["vendor", "catalog", serviceId],
    enabled: ready && !creating,
    queryFn: ({ signal }) =>
      request<ManagedService>(`/vendor/services/${serviceId}`, { signal }),
  });
  const categories = useQuery({
    queryKey: ["public", "categories"],
    enabled: creating || mode === "edit",
    queryFn: ({ signal }) => listPublicCategories(signal),
  });
  const images = useQuery({
    queryKey: ["vendor", "images", serviceId],
    enabled: ready && !creating && mode === "overview",
    queryFn: ({ signal }) =>
      request<ManagedImage[]>(`/vendor/services/${serviceId}/images`, {
        signal,
      }),
  });
  const data = service.data;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const payload = {
      title: String(fields.get("title")).trim(),
      kind: fields.get("kind"),
      categoryId: fields.get("categoryId"),
      summary: String(fields.get("summary") ?? "").trim() || null,
      description: String(fields.get("description") ?? "").trim() || null,
      priceAmount: String(fields.get("priceAmount")),
      durationMinutes: fields.get("durationMinutes")
        ? Number(fields.get("durationMinutes"))
        : null,
    };
    await action.act(async () => {
      const saved = await request<ManagedService>(
        creating ? "/vendor/services" : `/vendor/services/${serviceId}`,
        { method: creating ? "POST" : "PATCH", body: JSON.stringify(payload) },
      );
      await cache.invalidateQueries({ queryKey: ["vendor", "catalog"] });
      router.replace(`/services/${saved.id}`);
    }, "Đã lưu nội dung dịch vụ.");
  }
  async function transition(
    operation: "publish" | "hide" | "archive" | "delete",
  ) {
    const ok = await action.act(
      async () => {
        await request(
          operation === "delete"
            ? `/vendor/services/${serviceId}`
            : `/vendor/services/${serviceId}/${operation}`,
          { method: operation === "delete" ? "DELETE" : "POST" },
        );
        await cache.invalidateQueries({ queryKey: ["vendor", "catalog"] });
        if (operation === "delete") router.replace("/services");
      },
      operation === "publish"
        ? "Dịch vụ đã được xuất bản."
        : "Đã cập nhật trạng thái dịch vụ.",
    );
    if (ok) setConfirm(null);
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const file = body.get("image");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      action.setError("Chọn ảnh JPEG, PNG hoặc WebP không quá 5 MB.");
      return;
    }
    if (
      await action.act(async () => {
        await request(`/vendor/services/${serviceId}/images`, {
          method: "POST",
          body,
        });
        await images.refetch();
      }, "Đã tải ảnh lên.")
    )
      form.reset();
  }
  return (
    <main className="page-wrap">
      <PageHeading
        eyebrow="Chăm chút từng trải nghiệm"
        title={
          creating
            ? "Tạo dịch vụ mới"
            : mode === "edit"
              ? "Chỉnh sửa dịch vụ"
              : (data?.title ?? "Chi tiết dịch vụ")
        }
        action={
          <Link href="/services" className="secondary-button">
            Danh sách dịch vụ
          </Link>
        }
      >
        Lưu bản nháp trước, thêm ảnh và lịch trống, rồi xuất bản khi mọi thứ sẵn
        sàng.
      </PageHeading>
      <ActionFeedback {...action} />
      {!creating && <ResourceState query={service}>{null}</ResourceState>}
      {(creating || data) && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {data && <StatusBadge status={data.status} />}
            {!creating && mode === "overview" && (
              <Link
                className="secondary-button"
                href={`/services/${serviceId}/slots`}
              >
                <Icon name="calendar" />
                Quản lý lịch trống
              </Link>
            )}
            {data &&
              mode === "overview" &&
              ["DRAFT", "HIDDEN"].includes(data.status) && (
                <Button
                  loading={action.busy}
                  onClick={() => transition("publish")}
                >
                  Xuất bản dịch vụ
                </Button>
              )}
            {mode === "overview" && data?.status === "PUBLISHED" && (
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() => transition("hide")}
              >
                Ẩn khỏi khám phá
              </Button>
            )}
          </div>
          {creating || mode === "edit" ? (
            <ServiceForm
              data={data}
              creating={creating}
              busy={action.busy}
              categories={categories.data}
              categoriesLoading={categories.isPending}
              categoriesError={categories.isError}
              onRefetchCategories={() => void categories.refetch()}
              onSubmit={save}
            />
          ) : (
            data && (
              <section className="panel p-6 sm:p-8">
                <h2 className="text-xl">Thông tin dịch vụ</h2>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <dt className="section-label">Tên dịch vụ</dt>
                    <dd className="mt-1 font-bold">{data.title}</dd>
                  </div>
                  <div>
                    <dt className="section-label">Giá mặc định</dt>
                    <dd className="mt-1 font-bold">
                      {formatMoney(data.priceAmount, data.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="section-label">Loại trải nghiệm</dt>
                    <dd>{data.kind === "EVENT" ? "Sự kiện" : "Dịch vụ"}</dd>
                  </div>
                  <div>
                    <dt className="section-label">Thời lượng</dt>
                    <dd>
                      {data.durationMinutes
                        ? `${data.durationMinutes} phút`
                        : "Theo lịch"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-5 whitespace-pre-line text-sm text-muted">
                  {data.summary || data.description || "Chưa có mô tả."}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {data.status !== "ARCHIVED" && (
                    <Link
                      className="primary-button"
                      href={`/services/${serviceId}/edit`}
                    >
                      Chỉnh sửa dịch vụ
                    </Link>
                  )}
                </div>
              </section>
            )
          )}

          {!creating && mode === "overview" && (
            <section className="panel mt-8 p-6 sm:p-8">
              <h2 className="text-xl">Hình ảnh dịch vụ</h2>
              <p className="mt-2 text-sm text-muted">
                JPEG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh. Chọn ảnh rõ nét, đúng
                với trải nghiệm của bạn.
              </p>
              <form
                onSubmit={upload}
                className="mt-5 flex flex-col items-start gap-3 sm:flex-row"
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Chọn ảnh dịch vụ</span>
                  <input
                    className="input"
                    name="image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                  />
                </label>
                <Button variant="secondary" type="submit" loading={action.busy}>
                  Tải ảnh lên
                </Button>
              </form>
              {images.isError && (
                <p role="alert" className="mt-4 text-sm text-danger">
                  Không tải được hình ảnh.{" "}
                  <button
                    className="underline"
                    onClick={() => images.refetch()}
                  >
                    Thử lại
                  </button>
                </p>
              )}
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {images.data?.map((image) => (
                  <article
                    className="overflow-hidden rounded-xl border border-line"
                    key={image.id}
                  >
                    <Image
                      src={image.url}
                      alt="Ảnh dịch vụ"
                      width={400}
                      height={260}
                      unoptimized
                      className="aspect-[3/2] w-full object-cover"
                    />
                    <div className="space-y-3 p-3">
                      {image.isPrimary ? (
                        <span className="badge bg-mint">Ảnh đại diện</span>
                      ) : (
                        <button
                          className="secondary-button w-full"
                          disabled={action.busy}
                          onClick={() =>
                            action.act(async () => {
                              await request(
                                `/vendor/services/${serviceId}/images/${image.id}/primary`,
                                { method: "PATCH" },
                              );
                              await images.refetch();
                            }, "Đã đổi ảnh đại diện.")
                          }
                        >
                          Đặt làm ảnh đại diện
                        </button>
                      )}
                      <button
                        className="ghost-button w-full text-danger"
                        disabled={action.busy}
                        onClick={() => setImageToDelete(image.id)}
                      >
                        Xóa ảnh
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {images.data?.length === 0 && (
                <p className="mt-5 rounded-xl bg-soft p-5 text-sm text-muted">
                  Chưa có ảnh. Một hình ảnh tốt giúp khách hiểu trải nghiệm
                  nhanh hơn.
                </p>
              )}
            </section>
          )}
          {!creating && mode === "overview" && (
            <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-danger/40 p-5">
              <div>
                <h2 className="text-base">Quản lý vòng đời dịch vụ</h2>
                <p className="mt-1 text-xs text-muted">
                  {data?.status === "PUBLISHED"
                    ? "Hãy ẩn dịch vụ đang mở bán trước khi lưu trữ hoặc xóa."
                    : "Có thể xóa dịch vụ nháp, đã ẩn hoặc đã lưu trữ. Lịch sử đặt chỗ vẫn được giữ nguyên."}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {data?.status !== "ARCHIVED" && (
                  <Button
                    variant="secondary"
                    disabled={action.busy || data?.status === "PUBLISHED"}
                    onClick={() => setConfirm("archive")}
                  >
                    Lưu trữ
                  </Button>
                )}
                <Button
                  variant="danger"
                  disabled={action.busy || data?.status === "PUBLISHED"}
                  onClick={() => setConfirm("delete")}
                >
                  Xóa dịch vụ
                </Button>
              </div>
            </section>
          )}
        </>
      )}
      {confirm && (
        <AccessibleDialog
          labelledBy="service-confirm"
          onClose={() => setConfirm(null)}
          busy={action.busy}
        >
          <h2 id="service-confirm" className="text-2xl">
            {confirm === "delete" ? "Xóa dịch vụ này?" : "Lưu trữ dịch vụ?"}
          </h2>
          <p className="mt-4 text-sm text-muted">
            {confirm === "delete"
              ? "Dịch vụ sẽ được gỡ khỏi danh sách quản lý. Lịch sử đặt chỗ, vé và thanh toán vẫn được giữ nguyên."
              : "Dịch vụ đã lưu trữ không thể chỉnh sửa, thêm lịch hoặc xuất bản lại. Bạn vẫn có thể xóa dịch vụ khỏi danh sách quản lý."}
          </p>
          <ActionFeedback error={action.error} />
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              disabled={action.busy}
              onClick={() => setConfirm(null)}
            >
              Quay lại
            </Button>
            <Button
              variant="danger"
              loading={action.busy}
              onClick={() => transition(confirm)}
            >
              Xác nhận {confirm === "delete" ? "xóa" : "lưu trữ"}
            </Button>
          </div>
        </AccessibleDialog>
      )}
      {imageToDelete && (
        <AccessibleDialog
          labelledBy="image-confirm"
          onClose={() => setImageToDelete(null)}
          busy={action.busy}
        >
          <h2 id="image-confirm" className="text-2xl">
            Xóa hình ảnh này?
          </h2>
          <p className="my-4 text-sm text-muted">
            Ảnh sẽ được gỡ khỏi dịch vụ. Bạn có thể tải lên ảnh mới sau đó.
          </p>
          <ActionFeedback error={action.error} />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              loading={action.busy}
              onClick={async () => {
                if (
                  await action.act(async () => {
                    await request(
                      `/vendor/services/${serviceId}/images/${imageToDelete}`,
                      { method: "DELETE" },
                    );
                    await images.refetch();
                  }, "Đã xóa ảnh.")
                )
                  setImageToDelete(null);
              }}
            >
              Xác nhận xóa ảnh
            </Button>
            <Button
              variant="secondary"
              disabled={action.busy}
              onClick={() => setImageToDelete(null)}
            >
              Quay lại
            </Button>
          </div>
        </AccessibleDialog>
      )}
    </main>
  );
}
