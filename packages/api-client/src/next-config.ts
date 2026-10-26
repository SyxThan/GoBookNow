import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { fileURLToPath } from "node:url";

export function createPortalConfig(kind: "customer" | "vendor" | "admin") {
  const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1").origin;
  let sentryOrigin = "";
  try { if (process.env.NEXT_PUBLIC_SENTRY_DSN) sentryOrigin = new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin; } catch { /* Optional monitoring. */ }
  const csp = ["default-src 'self'", "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""), "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https://res.cloudinary.com", "font-src 'self' data:", `connect-src 'self' ${apiOrigin} ${sentryOrigin}`, "form-action 'self' https://pay-sandbox.sepay.vn https://pay.sepay.vn", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"].join("; ");
  const config: NextConfig = {
    poweredByHeader: false,
    output: "standalone",
    outputFileTracingRoot: fileURLToPath(new URL("../../../", import.meta.url)),
    transpilePackages: ["@gobook/ui", "@gobook/api-client", "@gobook/auth"],
    env: { NEXT_PUBLIC_PORTAL_KIND: kind },
    async headers() { return [{ source: "/:path*", headers: [
      {key:"X-Content-Type-Options",value:"nosniff"}, {key:"X-Frame-Options",value:"DENY"}, {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
      {key:"Permissions-Policy",value:"camera=(self), microphone=(), geolocation=()"}, {key:"Content-Security-Policy-Report-Only",value:csp},
    ] }]; },
  };
  return withSentryConfig(config, {silent:true,telemetry:false,authToken:process.env.SENTRY_AUTH_TOKEN,org:process.env.SENTRY_ORG,project:process.env.SENTRY_PROJECT,sourcemaps:{disable:!process.env.SENTRY_AUTH_TOKEN,deleteSourcemapsAfterUpload:true}});
}
