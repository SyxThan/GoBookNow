const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const vendorRoutes = [
  /^\/(dashboard|profile|application|check-in|bookings|services)$/,
  /^\/services\/new$/,
  new RegExp(`^/bookings/${uuid}$`),
  new RegExp(`^/services/${uuid}(?:/edit|/slots(?:/new|/${uuid}/edit)?)?$`),
];
const adminRoutes = [
  /^\/(vendor-applications|categories|vouchers|transactions)$/,
  /^\/vouchers\/new$/,
  new RegExp(`^/(transactions|vendor-applications)/${uuid}$`),
  new RegExp(`^/vouchers/${uuid}/edit$`),
];
const queryKeys = new Set([
  "page",
  "status",
  "search",
  "sort",
  "from",
  "to",
  "serviceId",
]);

/** Only known resource routes and harmless list filters survive the origin change. */
export function legacyPortalTarget(
  portal: "vendor" | "admin",
  segments: string[],
  query: URLSearchParams,
  configuredOrigin: string,
): URL | null {
  const origin = new URL(configuredOrigin);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("Portal URL must be an HTTP(S) origin");
  let path = segments.length
    ? `/${segments.join("/")}`
    : portal === "vendor"
      ? "/dashboard"
      : "/vendor-applications";
  if (
    !(portal === "vendor" ? vendorRoutes : adminRoutes).some((pattern) =>
      pattern.test(path),
    )
  )
    return null;
  if (portal === "vendor" && path === "/application")
    path = "/onboarding/application";
  const target = new URL(path, origin);
  for (const [key, value] of query)
    if (
      queryKeys.has(key) &&
      value.length <= 200 &&
      !target.searchParams.has(key)
    )
      target.searchParams.set(key, value);
  return target;
}
