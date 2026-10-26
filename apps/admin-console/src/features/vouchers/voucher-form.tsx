"use client";
import type { Dispatch, SetStateAction, FormEvent } from "react";
import { Button } from "@gobook/ui/primitives";
import { localDateInput } from "@gobook/api-client/catalog-management";
import type { Voucher } from "./types";
export default function VoucherForm({
  current,
  type,
  setType,
  busy,
  onSubmit,
  onCancel,
}: {
  current: Voucher | null;
  type: "FIXED" | "PERCENTAGE";
  setType: Dispatch<SetStateAction<"FIXED" | "PERCENTAGE" | null>>;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form className="mt-6 grid gap-5" onSubmit={onSubmit}>
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
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy}>
          Lưu ưu đãi
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Hủy
        </Button>
      </div>
    </form>
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
