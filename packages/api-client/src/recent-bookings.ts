// References only, never a source of financial or entitlement truth.
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function key() {
  if (typeof window === "undefined") return null;
  try {
    const token = sessionStorage.getItem("gobook.accessToken");
    if (!token) return null;
    const sub: unknown = JSON.parse(
      atob(
        token.split(".")[1]?.replaceAll("-", "+").replaceAll("_", "/") ?? "",
      ),
    ).sub;
    return typeof sub === "string" && idPattern.test(sub)
      ? `gobook.recentBookings.${sub}`
      : null;
  } catch {
    return null;
  }
}
export function recentBookingIds(): string[] {
  const namespace = key();
  if (!namespace) return [];
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem(namespace) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (id): id is string => typeof id === "string" && idPattern.test(id),
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
export function rememberBooking(id: string) {
  const namespace = key();
  if (!namespace || !idPattern.test(id)) return;
  try {
    sessionStorage.setItem(
      namespace,
      JSON.stringify(
        [id, ...recentBookingIds().filter((value) => value !== id)].slice(
          0,
          20,
        ),
      ),
    );
  } catch {
    /* Restricted/full storage must not affect a booking. */
  }
}
