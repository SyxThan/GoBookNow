"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeading } from "@gobook/ui/primitives";
import {
  ActionFeedback,
  ResourceState,
  useWorkspaceAction,
  useWorkspaceQuery,
} from "@gobook/auth/resource";
import { percentageToBps } from "@gobook/api-client/catalog-management";
import VoucherForm from "./voucher-form";
import type { Voucher } from "./types";
export default function VoucherEditor({ voucherId }: { voucherId?: string }) {
  const creating = !voucherId,
    router = useRouter(),
    cache = useQueryClient();
  const query = useWorkspaceQuery<Voucher>(
    `/admin/vouchers/${voucherId}`,
    ["admin-voucher", voucherId],
    !creating,
  );
  const action = useWorkspaceAction();
  const [selectedType, setType] = useState<"FIXED" | "PERCENTAGE" | null>(null);
  const current = query.data ?? null,
    type = selectedType ?? current?.type ?? "FIXED";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      ...(creating
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
          creating ? "/admin/vouchers" : `/admin/vouchers/${voucherId}`,
          {
            method: creating ? "POST" : "PATCH",
            body: JSON.stringify(payload),
          },
        );
        await cache.invalidateQueries({ queryKey: ["admin-vouchers"] });
      }, "Đã lưu ưu đãi.")
    )
      router.replace("/vouchers");
  }

  return (
    <main className="page-wrap">
      <Link href="/vouchers" className="text-sm font-bold underline">
        ← Danh sách voucher
      </Link>
      <div className="mt-6">
        <PageHeading
          eyebrow="Khuyến mãi"
          title={
            creating
              ? "Tạo ưu đãi mới"
              : `Chỉnh sửa ${current?.code ?? "voucher"}`
          }
        >
          Mã không đổi sau khi tạo. Thời gian theo múi giờ thiết bị; mức phần
          trăm được lưu chính xác bằng basis points.
        </PageHeading>
      </div>
      <ActionFeedback {...action} />
      {!creating && <ResourceState query={query}>{null}</ResourceState>}
      {(creating || current) && (
        <section className="panel max-w-4xl p-6 sm:p-8">
          <VoucherForm
            key={current?.id ?? "new"}
            current={current}
            type={type}
            setType={setType}
            busy={action.busy}
            onSubmit={save}
            onCancel={() => router.push("/vouchers")}
          />
        </section>
      )}
    </main>
  );
}
