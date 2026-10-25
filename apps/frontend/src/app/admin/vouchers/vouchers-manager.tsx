"use client";

import { useState, type FormEvent } from "react";
import { AccessibleDialog } from "@/components/ui/dialog";
import { Button, EmptyState, PageHeading } from "@/components/ui/primitives";
import {
  ActionFeedback,
  ResourceState,
  useWorkspaceAction,
  useWorkspaceQuery,
} from "@/components/workspace/resource";
import { localDateInput, percentageToBps } from "@/lib/catalog-management";
import { formatDateTime, formatMoney } from "@/lib/format";

type Voucher = {
  id: string;
  code: string;
  type: "FIXED" | "PERCENTAGE";
  fixedAmount: string | null;
  percentageBps: number | null;
  minOrderAmount: string;
  maxDiscountAmount: string | null;
  validFrom: string;
  validUntil: string;
  usageLimit: number;
  effectiveUsage: number;
  isActive: boolean;
};

export default function VouchersManager() {
  const query = useWorkspaceQuery<Voucher[]>("/admin/vouchers", [
      "admin-vouchers",
    ]),
    action = useWorkspaceAction();
  const [editor, setEditor] = useState<Voucher | "new" | null>(null),
    [type, setType] = useState<"FIXED" | "PERCENTAGE">("FIXED"),
    [deactivate, setDeactivate] = useState<Voucher | null>(null),
    [search, setSearch] = useState("");
  function open(value: Voucher | "new") {
    setEditor(value);
    setType(value === "new" ? "FIXED" : value.type);
    action.setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget),
      from = new Date(String(form.get("validFrom"))),
      until = new Date(String(form.get("validUntil")));
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(until.getTime()) ||
      until <= from
    ) {
      action.setError("Thời gian kết thúc ưu đãi phải sau thời gian bắt đầu.");
      return;
    }
    let bps: number | null = null;
    try {
      if (type === "PERCENTAGE")
        bps = percentageToBps(String(form.get("percentage")));
    } catch (error) {
      action.setError((error as Error).message);
      return;
    }
    const payload = {
      ...(editor === "new"
        ? { code: String(form.get("code")).trim().toUpperCase() }
        : {}),
      type,
      fixedAmount: type === "FIXED" ? String(form.get("fixedAmount")) : null,
      percentageBps: bps,
      minOrderAmount: String(form.get("minOrderAmount")),
      maxDiscountAmount: String(form.get("maxDiscountAmount")).trim() || null,
      validFrom: from.toISOString(),
      validUntil: until.toISOString(),
      usageLimit: Number(form.get("usageLimit")),
      isActive: form.get("isActive") === "on",
    };
    if (
      await action.act(async () => {
        await query.request(
          editor === "new" ? "/admin/vouchers" : `/admin/vouchers/${editor.id}`,
          {
            method: editor === "new" ? "POST" : "PATCH",
            body: JSON.stringify(payload),
          },
        );
        await query.refetch();
      }, "Đã lưu ưu đãi.")
    )
      setEditor(null);
  }
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
  const current = editor && editor !== "new" ? editor : null;
  return (
    <main className="page-wrap py-10">
      <PageHeading
        eyebrow="Quản trị GoBookNow"
        title="Ưu đãi & mã giảm giá"
        action={<Button onClick={() => open("new")}>+ Tạo ưu đãi</Button>}
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
                  <Button variant="secondary" onClick={() => open(voucher)}>
                    Chỉnh sửa
                  </Button>
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
            action={<Button onClick={() => open("new")}>Tạo mã ưu đãi</Button>}
          >
            Tạo một mã với điều kiện rõ ràng để khách áp dụng khi đặt chỗ.
          </EmptyState>
        )}
      </ResourceState>
      {editor && (
        <AccessibleDialog
          labelledBy="voucher-title"
          busy={action.busy}
          onClose={() => setEditor(null)}
        >
          <h2 id="voucher-title" className="text-2xl">
            {current ? `Chỉnh sửa ${current.code}` : "Tạo ưu đãi mới"}
          </h2>
          <p className="mt-3 text-sm text-muted">
            Mã không đổi sau khi tạo. Thời gian dùng múi giờ trên thiết bị của
            bạn.
          </p>
          <form className="mt-6 grid gap-5" onSubmit={save}>
            {!current && (
              <label className="text-sm font-bold">
                Mã ưu đãi
                <input
                  required
                  name="code"
                  minLength={2}
                  maxLength={32}
                  pattern="[A-Za-z0-9]([A-Za-z0-9_]|-){1,31}"
                  className="input mt-2 uppercase"
                  placeholder="VD: HEVUI2026"
                />
              </label>
            )}
            <label className="text-sm font-bold">
              Cách giảm
              <select
                className="input mt-2"
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
              >
                <option value="FIXED">Số tiền cố định</option>
                <option value="PERCENTAGE">Theo phần trăm</option>
              </select>
            </label>
            {type === "FIXED" ? (
              <MoneyField
                name="fixedAmount"
                label="Số tiền giảm (₫)"
                value={current?.fixedAmount ?? ""}
                positive
              />
            ) : (
              <label className="text-sm font-bold">
                Mức giảm (%)
                <input
                  className="input mt-2"
                  required
                  name="percentage"
                  inputMode="decimal"
                  pattern="[0-9]{1,3}([.][0-9]{1,2})?"
                  defaultValue={
                    current?.percentageBps ? current.percentageBps / 100 : ""
                  }
                  placeholder="VD: 12.5"
                />
                <span className="mt-2 block text-xs font-normal text-muted">
                  Từ 0.01 đến 100%, tối đa hai chữ số thập phân.
                </span>
              </label>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <MoneyField
                name="minOrderAmount"
                label="Giá trị đơn tối thiểu (₫)"
                value={current?.minOrderAmount ?? "0"}
              />
              <MoneyField
                name="maxDiscountAmount"
                label="Giảm tối đa (₫, tùy chọn)"
                value={current?.maxDiscountAmount ?? ""}
                optional
                positive
              />
            </div>
            <label className="text-sm font-bold">
              Số lượt tối đa
              <input
                className="input mt-2"
                name="usageLimit"
                type="number"
                min="1"
                max="2147483647"
                required
                defaultValue={current?.usageLimit ?? 100}
              />
            </label>
            <label className="text-sm font-bold">
              Bắt đầu
              <input
                required
                className="input mt-2"
                name="validFrom"
                type="datetime-local"
                defaultValue={current ? localDateInput(current.validFrom) : ""}
              />
            </label>
            <label className="text-sm font-bold">
              Kết thúc
              <input
                required
                className="input mt-2"
                name="validUntil"
                type="datetime-local"
                defaultValue={current ? localDateInput(current.validUntil) : ""}
              />
            </label>
            <label className="flex items-center gap-3 text-sm font-bold">
              <input
                className="size-5 accent-ink"
                name="isActive"
                type="checkbox"
                defaultChecked={current?.isActive ?? true}
              />
              Bật ưu đãi
            </label>
            <ActionFeedback error={action.error} />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={action.busy}>
                Lưu ưu đãi
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={action.busy}
                onClick={() => setEditor(null)}
              >
                Đóng
              </Button>
            </div>
          </form>
        </AccessibleDialog>
      )}
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

function MoneyField({
  name,
  label,
  value,
  optional = false,
  positive = false,
}: {
  name: string;
  label: string;
  value: string;
  optional?: boolean;
  positive?: boolean;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        className="input mt-2"
        name={name}
        inputMode="numeric"
        required={!optional}
        pattern={positive ? "[1-9][0-9]{0,17}" : "(0|[1-9][0-9]{0,17})"}
        defaultValue={value}
      />
    </label>
  );
}
