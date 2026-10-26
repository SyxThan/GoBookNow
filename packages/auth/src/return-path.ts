const allowedQuery = new Set(["page", "status", "search", "sort", "from", "to", "serviceId"]);

export function safeReturnPath(value: string | null | undefined, fallback: string) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const url = new URL(value, "https://portal.invalid");
    if (url.origin !== "https://portal.invalid" || url.pathname === "/login") return fallback;
    for (const key of [...url.searchParams.keys()]) if (!allowedQuery.has(key)) url.searchParams.delete(key);
    return url.pathname + url.search;
  } catch { return fallback; }
}
