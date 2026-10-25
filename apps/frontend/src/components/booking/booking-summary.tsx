import type { PublicServiceDetail, PublicSlot } from "@/lib/api-client";
import { formatDate, formatMoney, formatTime, locationLabel } from "@/lib/format";

export function BookingSummary({
  service,
  slot,
  quantity,
}: {
  service: PublicServiceDetail;
  slot: PublicSlot;
  quantity: number;
}) {
  const estimatedTotal = (BigInt(slot.price.amount) * BigInt(quantity)).toString();

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="booking-summary-title">
      <p className="eyebrow">Kiểm tra lần cuối</p>
      <h1 id="booking-summary-title" className="mt-3 text-2xl font-bold text-ink">
        Tóm tắt booking
      </h1>
      <dl className="mt-6 space-y-4 text-sm">
        <SummaryRow label="Dịch vụ" value={service.title} />
        <SummaryRow label="Đơn vị cung cấp" value={service.vendor.displayName} />
        <SummaryRow label="Danh mục" value={service.category.name} />
        <SummaryRow
          label="Địa điểm"
          value={locationLabel(service.vendor.district, service.vendor.province)}
        />
        <SummaryRow label="Ngày" value={formatDate(slot.startAt)} />
        <SummaryRow
          label="Thời gian"
          value={`${formatTime(slot.startAt)} – ${formatTime(slot.endAt)}`}
        />
        <SummaryRow label="Số lượng" value={String(quantity)} />
        <SummaryRow
          label="Đơn giá"
          value={`${formatMoney(slot.price.amount, slot.price.currency)} × ${quantity}`}
        />
      </dl>
      <div className="mt-6 border-t border-line/10 pt-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Tổng dự kiến</p>
            <p className="mt-1 text-xs text-muted">
              Giá và ưu đãi được xác nhận khi giữ chỗ.
            </p>
          </div>
          <strong className="text-2xl text-info">
            {formatMoney(estimatedTotal, slot.price.currency)}
          </strong>
        </div>
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-line/5 pb-3 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
