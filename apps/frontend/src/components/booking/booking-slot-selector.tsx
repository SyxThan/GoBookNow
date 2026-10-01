import type { PublicSlot } from "@/lib/api-client";
import { formatDate, formatMoney, formatTime } from "@/lib/format";

export function BookingSlotSelector({
  slots,
  selectedSlotId,
  onSelect,
}: {
  slots: PublicSlot[];
  selectedSlotId: string | null;
  onSelect: (slot: PublicSlot) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xl font-semibold text-white">Khung giờ khả dụng</legend>
      <p className="mt-2 text-sm text-slate-400">
        Chọn một lịch bắt đầu trong tương lai. Sức chứa hiển thị là mức tối đa,
        không phải số chỗ còn lại.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup">
        {slots.map((slot) => {
          const selected = selectedSlotId === slot.id;
          return (
            <button
              key={slot.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`rounded-2xl border p-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-teal-300 ${
                selected
                  ? "border-teal-300 bg-teal-300/10"
                  : "border-white/10 bg-slate-950 hover:border-slate-600"
              }`}
              onClick={() => onSelect(slot)}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-semibold capitalize text-white">
                    {formatDate(slot.startAt)}
                  </span>
                  <span className="mt-1 block text-sm text-slate-300">
                    {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    selected
                      ? "bg-teal-300 text-slate-950"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {selected ? "Đã chọn" : "Chọn"}
                </span>
              </span>
              <span className="mt-4 flex items-end justify-between gap-3 border-t border-white/10 pt-3">
                <strong className="text-lg text-teal-200">
                  {formatMoney(slot.price.amount, slot.price.currency)}
                </strong>
                <span className="text-xs text-slate-500">
                  Sức chứa tối đa: {slot.capacity}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
