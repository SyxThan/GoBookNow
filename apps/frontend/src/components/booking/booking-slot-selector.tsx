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
      <legend className="text-xl font-bold text-ink">Khung giờ khả dụng</legend>
      <p className="mt-2 text-sm text-muted">
        Chọn một lịch bắt đầu trong tương lai. Sức chứa hiển thị là mức tối đa,
        không phải số chỗ còn lại.
      </p>
      <div
        className="mt-5 grid gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Khung giờ khả dụng"
      >
        {slots.map((slot, index) => {
          const selected = selectedSlotId === slot.id;
          return (
            <button
              key={slot.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!selectedSlotId && index === 0) ? 0 : -1}
              onKeyDown={(event) => {
                const offset = ["ArrowRight", "ArrowDown"].includes(event.key)
                  ? 1
                  : ["ArrowLeft", "ArrowUp"].includes(event.key)
                    ? -1
                    : 0;
                if (!offset && event.key !== "Home" && event.key !== "End")
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? slots.length - 1
                      : (index + offset + slots.length) % slots.length;
                onSelect(slots[next]);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>("button")
                  [next]?.focus();
              }}
              className={`rounded-2xl border p-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-focus ${
                selected
                  ? "border-line bg-sun/30"
                  : "border-line/10 bg-canvas hover:border-line"
              }`}
              onClick={() => onSelect(slot)}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-bold capitalize text-ink">
                    {formatDate(slot.startAt)}
                  </span>
                  <span className="mt-1 block text-sm text-ink">
                    {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    selected ? "bg-sun text-ink" : "bg-soft text-ink"
                  }`}
                >
                  {selected ? "Đã chọn" : "Chọn"}
                </span>
              </span>
              <span className="mt-4 flex items-end justify-between gap-3 border-t border-line/10 pt-3">
                <strong className="text-lg text-info">
                  {formatMoney(slot.price.amount, slot.price.currency)}
                </strong>
                <span className="text-xs text-muted">
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
