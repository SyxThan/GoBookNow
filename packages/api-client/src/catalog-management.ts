import type { ServiceKind } from "./api-client";
export type ManagedService = {
  id: string;
  title: string;
  slug: string;
  kind: ServiceKind;
  categoryId?: string;
  category?: { id: string; name: string };
  summary: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  priceAmount: string;
  currency: string;
  durationMinutes: number | null;
  status: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
};
export type ManagedSlot = {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  priceAmount: string | null;
  effectivePrice: {
    amount: string;
    currency: string;
    source: "SERVICE" | "SLOT";
  };
};
export type ManagedImage = {
  id: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
};
export function localDateInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function percentageToBps(value: string) {
  const parts = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value);
  if (!parts) throw new Error("Phần trăm chỉ nhận tối đa 2 chữ số thập phân.");
  const bps = Number(parts[1]) * 100 + Number((parts[2] ?? "").padEnd(2, "0"));
  if (bps < 1 || bps > 10000)
    throw new Error("Mức giảm phải lớn hơn 0 và không quá 100%.");
  return bps;
}
