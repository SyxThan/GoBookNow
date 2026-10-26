# Three-portal architecture

This migration continues `feat/frontend-neo-brutalism`; no merge/rebase or automatic push is part of it. The existing brand, Be Vietnam Pro (including Vietnamese subsets), Tailwind 4, Radix dialogs and business APIs are retained.

```text
apps/
  frontend/       Customer website :3000
  vendor-portal/  Vendor operations :3002
  admin-console/  Admin console    :3003
  backend/        Common Nest API  :3001
packages/
  ui/             Tokens, fonts, CSS, buttons, badges, dialogs, icons, portal frame
  api-client/     HTTP/refresh/error handling, domain contracts, monitoring, Next config
  auth/           Session subscription, cache reset, login/logout, backend-verified guards
```

Each Next application owns its root layout, navigation, routes, features, environment, build, instrumentation and not-found page. Shared code is imported through workspace packages and transpiled by Next. Thin local re-exports preserve import compatibility; feature implementations are not shared across portals. Customer contains only bounded legacy redirect handlers for Vendor/Admin; their feature implementations live in the owning portals.

## Configuration and local startup

From repository root, use PowerShell:

```powershell
pnpm install --frozen-lockfile
foreach ($portalName in @('frontend', 'vendor-portal', 'admin-console')) {
  if (-not (Test-Path "apps/$portalName/.env.local")) {
    Copy-Item "apps/$portalName/.env.example" "apps/$portalName/.env.local"
  }
}
# Configure apps/backend/.env from its example without replacing existing secrets.
docker compose up -d
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend exec prisma db seed
pnpm dev
```

`pnpm dev` runs all four applications using pnpm rather than the Turbo native runner. Individual commands: `pnpm dev:customer`, `pnpm dev:vendor`, `pnpm dev:admin`, `pnpm dev:backend`. Named port overrides are `CUSTOMER_PORT`, `VENDOR_PORT`, `ADMIN_PORT`, and backend `PORT`. If ports change, update public URLs and API allowed origins to match.

Each frontend needs `NEXT_PUBLIC_API_URL` and the configured `NEXT_PUBLIC_CUSTOMER_URL`, `NEXT_PUBLIC_VENDOR_URL`, `NEXT_PUBLIC_ADMIN_URL`. Public values are compiled into browser bundles: rebuild on changes. Backend uses `FRONTEND_ORIGIN`, `VENDOR_ORIGIN`, `ADMIN_ORIGIN`; when `CORS_ORIGINS` is explicitly set it must include every intended origin. Never put credentials in public variables.

## Authentication and isolation

All portals use the existing `/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout` API. `X-Portal` identifies the application; a browser Origin must match that application's configured backend origin before login/registration writes occur. The backend refresh cookie names are the configured customer base name, base + `_vendor`, and base + `_admin`. Cookie attributes remain HttpOnly, Secure/SameSite from existing backend configuration. Cookies are host scoped, not port scoped: separate cookie names are required even on localhost.

Bearer access tokens stay in the current origin's sessionStorage. No token, signed form or QR credential is transported in redirects. QueryClient is per app instance and cleared when identity changes/logout completes. Token rotation for the same identity retains cache. Logout waits for server acknowledgement and only revokes that refresh family/cookie. Customer and Admin sessions remain usable when Vendor logs out.

The backend's `/auth/me` result controls operational rendering. JWT decoding only helps identify cache changes; it never grants a role. Nest guards and ownership checks remain authoritative for every mutation. Customer applicants may visit Vendor `/profile` and `/onboarding/*`; Vendor operations require VENDOR plus an APPROVED vendor profile. Admin requires ADMIN. Wrong roles receive an explicit permission state with no protected feature rendering.

SePay return URLs continue to point to Customer `/payment/result`. Confirmation, refunds, commissions and ticket generation remain backend/IPN controlled. The IPN sandbox proxy and ticket signing secret are unaffected.

## Independent build/deployment

```powershell
pnpm --filter frontend build
pnpm --filter vendor-portal build
pnpm --filter admin-console build
pnpm build:frontends
pnpm --filter frontend start
pnpm --filter vendor-portal start
pnpm --filter admin-console start
```

Build each application in the workspace context after a frozen install. Shared packages are source dependencies, not separately deployed HTTP services. Each build emits its own `.next/standalone` artifact with the monorepo tracing root. Deploy only the chosen artifact and its `.next/static`/`public` assets at that app's nested `apps/<name>` directory. Start the emitted `server.js` with the intended `PORT` and `HOSTNAME`. Keep runtime secrets server-side. Deploying one UI must not change financial API behavior.

Production requires explicit portal origins and matching HTTPS cookie/CORS configuration. Sites on unrelated registrable domains may require `SameSite=None; Secure` and remain subject to browser third-party-cookie policies; prefer same-site subdomains for the shared API. No production domains or SSO provider are assumed by the repository.

## Observability and validation

Production type checks validate generated production routes; stale `.next/dev` validators are excluded so a running/previous dev session cannot reference removed legacy pages during a production build.

Each app has its own Sentry initialization and `app` tag. Existing privacy scrubbing/request correlation is retained. Synthetic browser fixtures are for layout/a11y only. Real journey tests run the actual Nest modules and isolated PostgreSQL, intercepting only the external hosted checkout; backend payment and authorization suites run separately against test-only PostgreSQL/Redis.

See [migration map](PORTAL_MIGRATION_PLAN.md), [Vendor workflows](VENDOR_PORTAL.md), [Admin workflows](ADMIN_CONSOLE.md), and [verification report](PORTAL_VERIFICATION_REPORT.md).
