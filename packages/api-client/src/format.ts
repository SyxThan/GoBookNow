export function formatMoney(amount: string, currency = "VND"): string {
  const value = BigInt(amount);
  if (currency === "VND") {
    return `${new Intl.NumberFormat("vi-VN").format(value)} ₫`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(value)} ${currency}`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function locationLabel(
  district: string | null,
  province: string | null,
): string {
  return [district, province].filter(Boolean).join(", ") || "Địa điểm đang cập nhật";
}
