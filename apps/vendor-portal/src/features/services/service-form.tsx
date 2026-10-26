"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@gobook/ui/primitives";
import type { PublicCategory } from "@gobook/api-client";
import type { ManagedService } from "@gobook/api-client/catalog-management";
export function ServiceForm({
  data,
  creating,
  busy,
  categories,
  categoriesLoading,
  categoriesError,
  onRefetchCategories,
  onSubmit,
}: {
  data: ManagedService | undefined;
  creating: boolean;
  busy: boolean;
  categories: PublicCategory[] | undefined;
  categoriesLoading: boolean;
  categoriesError: boolean;
  onRefetchCategories: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [kind, setKind] = useState("");
  const [categoryId, setCategoryId] = useState(
    data?.category?.id ?? data?.categoryId ?? "",
  );
  const selectedKind = kind || data?.kind || "SERVICE";
  return (
    <form
      key={data?.id ?? "new"}
      onSubmit={onSubmit}
      className="panel p-6 sm:p-8"
    >
      <fieldset
        disabled={busy || categoriesLoading || data?.status === "ARCHIVED"}
        className="grid gap-5 sm:grid-cols-2"
      >
        <legend className="mb-6 text-xl font-extrabold">
          Thông tin trải nghiệm
        </legend>
        <label className="sm:col-span-2">
          <span>Tên dịch vụ *</span>
          <input
            name="title"
            className="input mt-2"
            required
            minLength={3}
            maxLength={160}
            defaultValue={data?.title}
            placeholder="Một cái tên rõ ràng, dễ nhớ"
          />
        </label>
        <label>
          <span>Loại trải nghiệm *</span>
          <select
            name="kind"
            className="input mt-2"
            defaultValue={data?.kind ?? "SERVICE"}
            onChange={(e) => {
              setKind(e.target.value);
              setCategoryId("");
            }}
          >
            <option value="SERVICE">Dịch vụ</option>
            <option value="EVENT">Sự kiện</option>
          </select>
        </label>
        <label>
          <span>Danh mục *</span>
          <select
            key={selectedKind}
            name="categoryId"
            className="input mt-2"
            required
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Chọn danh mục phù hợp</option>
            {categories
              ?.filter((category) => category.scope === selectedKind)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
          {categoriesError && (
            <span className="mt-2 block text-xs text-danger">
              Không tải được danh mục.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => onRefetchCategories()}
              >
                Thử lại
              </button>
            </span>
          )}
        </label>
        <label>
          <span>Giá dịch vụ (VND) *</span>
          <input
            name="priceAmount"
            inputMode="numeric"
            pattern="(0|[1-9][0-9]{0,18})"
            maxLength={19}
            className="input mt-2"
            required
            defaultValue={data?.priceAmount}
            placeholder="250000"
          />
          <span className="mt-2 block text-xs text-muted">
            Giá theo người/lượt. Lịch riêng có thể đặt mức giá khác.
          </span>
        </label>
        <label>
          <span>Thời lượng (phút)</span>
          <input
            name="durationMinutes"
            type="number"
            min={1}
            max={10080}
            className="input mt-2"
            defaultValue={data?.durationMinutes ?? ""}
          />
        </label>
        <label className="sm:col-span-2">
          <span>Giới thiệu ngắn</span>
          <textarea
            name="summary"
            className="input mt-2"
            rows={2}
            maxLength={300}
            defaultValue={data?.summary ?? ""}
          />
        </label>
        <label className="sm:col-span-2">
          <span>Nội dung chi tiết</span>
          <textarea
            name="description"
            className="input mt-2"
            rows={7}
            maxLength={10000}
            defaultValue={data?.description ?? ""}
            placeholder="Khách sẽ trải nghiệm điều gì? Cần chuẩn bị gì trước khi đến?"
          />
        </label>
        <div className="flex flex-wrap items-center gap-4 border-t border-line/15 pt-5 sm:col-span-2">
          <Button loading={busy} type="submit">
            {creating ? "Lưu bản nháp" : "Lưu thay đổi"}
          </Button>
          <Link
            href={creating ? "/services" : `/services/${data?.id}`}
            className="secondary-button"
          >
            Hủy
          </Link>
          <span className="text-xs text-muted">* Thông tin bắt buộc</span>
        </div>
      </fieldset>
    </form>
  );
}
