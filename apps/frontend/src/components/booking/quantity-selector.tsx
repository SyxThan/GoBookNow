"use client";

import { useState } from "react";

export function QuantitySelector({
  value,
  max,
  disabled = false,
  onChange,
}: {
  value: number;
  max?: number;
  disabled?: boolean;
  onChange: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue = draft ?? String(value);

  const commit = (raw: string) => {
    if (!/^\d+$/.test(raw)) {
      setDraft(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      setDraft(null);
      return;
    }
    const next = max ? Math.min(parsed, max) : parsed;
    setDraft(null);
    onChange(next);
  };

  return (
    <div>
      <span id="quantity-label" className="section-label">
        Số lượng
      </span>
      <div className="mt-2 inline-flex items-center rounded-xl border border-slate-700 bg-slate-950 p-1">
        <button
          type="button"
          className="grid size-10 place-items-center rounded-lg text-xl text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Giảm số lượng"
          disabled={disabled || value <= 1}
          onClick={() => {
            setDraft(null);
            onChange(Math.max(1, value - 1));
          }}
        >
          −
        </button>
        <input
          aria-labelledby="quantity-label"
          className="h-10 w-16 bg-transparent text-center font-semibold text-white outline-none"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          disabled={disabled}
          value={displayedValue}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === "" || /^\d+$/.test(raw)) setDraft(raw);
          }}
          onBlur={() => commit(displayedValue)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(displayedValue);
          }}
        />
        <button
          type="button"
          className="grid size-10 place-items-center rounded-lg text-xl text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Tăng số lượng"
          disabled={disabled || (max !== undefined && value >= max)}
          onClick={() => {
            setDraft(null);
            onChange(max ? Math.min(max, value + 1) : value + 1);
          }}
        >
          +
        </button>
      </div>
      {max !== undefined && (
        <p className="mt-2 text-xs text-slate-500">Tối đa theo cấu hình Slot: {max}</p>
      )}
    </div>
  );
}
