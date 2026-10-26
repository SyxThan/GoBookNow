# GoBookNow portal migration verification

Run date: 2026-10-26. Local Windows, Node 22.18.0, pnpm 11.24.0, installed-lockfile Chromium. All accounts, payments, documents and QR fixtures in automation are synthetic. Development data and the existing SePay sandbox tunnel were left intact.

## Summary

The completed Neo-Brutalism website has been separated into independently built Customer, Vendor and Admin applications over the existing Nest API. Shared UI/API/session implementations live in workspace packages. This is an information-architecture migration, not a new visual design.

## Branch

`feat/frontend-neo-brutalism`, continuing baseline `c640f40`. Existing history and upstream relationship are preserved. No new branch, merge, rebase, force reset or push.

## Changes to Existing Design

Preserved cream/pastel palette, Be Vietnam Pro Latin/Vietnamese font subsets, dark outlines, offset shadows, Radix dialogs, Tailwind 4, customer discovery/booking/payment/ticket behavior. Vendor uses mint operational emphasis; Admin uses lavender and restrained shadows. Customer retains the playful marketing shell. Vendor/Admin have focused shells without marketing footers.

## New Monorepo Architecture

```text
apps/frontend       Customer :3000
apps/vendor-portal  Vendor   :3002
apps/admin-console  Admin    :3003
apps/backend        Nest API :3001
packages/ui         Shared tokens, fonts and visual primitives
packages/api-client Shared HTTP, contracts, domain helpers and monitoring
packages/auth       Shared sessions, cache, guards and auth forms
```

All three Next apps emit separate standalone artifacts. Actual production startup was checked independently on ports 3300/3302/3303: login returned 200 and all referenced CSS/JS/preload assets returned 200 (Customer 17, Vendor 14, Admin 14). Journey/visual runners now use each app's real `pnpm start` script with isolated named test ports.

## Customer Website

Retained `/`, `/services`, `/services/[slug]`, `/register`, `/login`, `/bookings`, `/bookings/checkout`, `/bookings/[bookingId]`, `/payment/result` and the customer 404. Account navigation stays in bookings. Partner links use the configured Vendor onboarding origin. No Vendor/Admin feature implementation or operational sidebar remains in Customer; only bounded legacy redirect handlers remain. `/bookings` still honestly lists references saved on this device and reloads their authorized state from the API; it does not claim to provide full account history.

## Vendor Portal

Dashboard; booking list/detail; service list/create/overview/edit; slot list/create/edit; QR check-in; legal/contact profile; onboarding application and review status. Resource forms have dedicated pages and contextual return links. Service images/lifecycle remain on the resource overview. Short status/destructive decisions retain confirmations.

Fixed an actual service-edit contract defect found by real E2E: the API returns `category.id`, so the form now selects that value and preserves typed input while options load. Onboarding refresh reloads backend status and invalidates the cached auth result; a newly approved applicant can enter operations without copying tokens or signing in again. Category/slot/voucher/business restrictions remain backend controlled.

## Admin Console

Application queue and dedicated detail/review page; category CRUD; voucher list/create/edit; transaction list and dedicated read-only investigation. Approval explicitly confirms the selected partner; rejection requires a reason. Application documents and audit history use the existing authenticated APIs. Category records use labeled cards with readable actions after screenshot review revealed compressed table buttons on tablet. Financial investigation has no mutation controls.

## Shared Design System

One implementation of fonts/tokens/global styles, button variants, panels, status badges, empty/loading states, icons/bursts, accessible dialogs, portal frame, mobile drawer and breadcrumbs. One API client owns refresh, privacy-filtered error handling, request correlation and money/booking contracts. Feature code belongs to its owning app; local re-exports are compatibility wrappers, not copied implementations. Camera decoding is a Vendor dependency, not a Customer dependency.

## Authentication and Security

Backend `/auth/me` and live Nest role/ownership guards are authoritative. CUSTOMER applicants can access Vendor profile/onboarding, while operations require VENDOR plus APPROVED status. Admin requires ADMIN. Wrong roles never mount protected feature content.

Refresh cookies are isolated by portal (`gobook_refresh_token`, `_vendor`, `_admin`, or the configured base name). `X-Portal` must match the configured browser Origin. Credentialed CORS is explicit. Access tokens stay in each origin's sessionStorage. Query caches clear on identity changes/logout, and refresh/logout act on the current portal credential. No JWT, refresh token or QR credential is transported in redirects.

Tests verify simultaneous identities in three browser origins, forced refresh, Vendor-only logout, Customer/Admin continuity, applicant access, approval becoming effective and identity/cache switching. Backend tests also verify forged portal headers, cross-customer/cross-vendor access and rejected registration before writes.

## Route Migration Map

The exact 23-route inventory, API/role ownership and mapping are in [PORTAL_MIGRATION_PLAN.md](PORTAL_MIGRATION_PLAN.md).

| Customer legacy URL | Destination |
| --- | --- |
| `/vendor` | Vendor `/dashboard` |
| `/vendor/application` | Vendor `/onboarding/application` |
| `/vendor/dashboard`, `/vendor/profile`, `/vendor/check-in` | Corresponding Vendor root routes |
| `/vendor/bookings` and `/vendor/bookings/[bookingId]` | Vendor `/bookings` and `/bookings/[bookingId]` |
| `/vendor/services[/new]`, `/vendor/services/[serviceId]`, `/vendor/services/[serviceId]/slots` | Corresponding Vendor `/services/*` routes |
| `/admin` | Admin `/vendor-applications` |
| `/admin/categories`, `/admin/vendor-applications`, `/admin/vouchers` | Corresponding Admin root routes |
| `/admin/transactions` and `/admin/transactions/[paymentId]` | Admin `/transactions` and `/transactions/[paymentId]` |

Redirects are 307/no-store, validate known paths/UUID segments, preserve IDs and bounded harmless filters, discard credentials/unrecognized query keys, and return 404 for unknown paths. Replacement features were committed and passed their gates before legacy deletion.

## Responsive and Accessibility

Viewport matrix: 375×812, 768×1024, 1280×800, 1440×900. Extra 320×640 checks cover QR/cancellation dialogs and dedicated forms. Automated checks cover viewport overflow, loaded Vietnamese glyphs/font family, labels, contrast, headings/landmarks, reduced motion, focus trapping, Escape/focus restore, drawer navigation and reachable actions.

Headed Chromium was actually opened for the route matrix; full-page PNGs were visually inspected through contact sheets for every route at all four sizes, plus individual complex/dialog screens. Detected and fixed: duplicate service schedule link, invalid intermediate breadcrumbs causing prefetch 404s, compressed Admin actions, empty login menu, scrollbar layout instability, dialog viewport sizing with a reserved scrollbar gutter, and intrinsic form-field/header sizing at 320px.

## Functional Testing

| Command / suite | Observed result |
| --- | --- |
| `pnpm install --offline --frozen-lockfile --ignore-scripts` | PASS |
| `pnpm peers check` | No peer dependency issues |
| `pnpm typecheck` | PASS: backend + all three Next apps |
| `pnpm lint` | PASS: all four apps, no lint warnings |
| `pnpm test` | PASS: backend 349, Customer 103, Vendor 12, Admin 3 |
| `pnpm --filter backend test:e2e` | PASS: 290 tests / 25 files |
| `pnpm --filter backend test:integration` | PASS: 104 tests / 12 files |
| `pnpm test:e2e` | PASS: 14 real browser journeys, desktop + mobile |
| `pnpm build` | PASS: Nest + three independent Next builds |
| Final visual comparison | PASS: 184 tests, no failures, retries/flaky results or skipped tests |

Customer journeys use real registration/auth, search, slot/quantity, hold, persisted totals, hosted form submission, delayed authenticated synthetic IPN, ticket PNG decoding, duplicate-safe check-in, expiry and late-payment refund. Only the external hosted provider page is intercepted; domain state comes from Nest/PostgreSQL. Vendor journeys create/edit a real service and slot, publish/close availability and inspect owned bookings. Admin journeys create/edit/deactivate a fractional voucher, create a category, approve an application and investigate a real successful payment.

## Financial Regression

Booking snapshots/capacity/idempotency/concurrency, atomic voucher claims/redemption, exact percentage basis points, authoritative payment amounts, duplicate/delayed/late IPNs, rollback recovery, refund obligation/status, stable ticket issuance/QR/check-in and commission snapshots all passed. The 104-test integration run includes 35 payment-edge cases, 12 payment-confirmation cases, concurrency/rollback and expiration tests. The separate 290-test API suite covers the wider domain, including refunds, cancellation, reviews, services/slots and private files. All 23 database migrations are unchanged.

## Visual Regression

36 route screens × four viewport projects, plus 40 state/accessibility/performance tests. Canonical CI snapshots use the installed Windows headless Chromium, loaded fonts, reset page scroll and masked dynamic countdowns; headed Chromium was separately used for actual UI inspection. Baselines are reviewed, not silently accepted by the final comparison command. Final non-update comparison passed all 184 tests in 4.2 minutes, with zero skipped/flaky results and no accessibility violations in the tested matrix. All 200 canonical PNG baselines are committed. The additional form test checks each control stays within its label and header actions do not overlap at 320px.

Screens include all retained Customer screens; every Vendor resource/list/form/check-in/profile/onboarding/login/404; every Admin list/editor/application/transaction/login/404. Additional states include QR/cancellation, mobile drawers, permission denied, network recovery, empty results and pending/expired payments. Committed QR screenshots encode only an invalid synthetic fixture.

Production browser performance: 36 fresh-context samples (three per application per viewport). Medians below cover Customer home, Vendor dashboard and Admin transactions, using synthetic API responses, loopback networking, two test workers and no CPU/network throttle. Encoded JS is the resources loaded by that landing route, not the total application bundle. These are local measurements, not Lighthouse scores or field CWV.

| Application | LCP (ms) | CLS | JS encoded (KiB) | Fonts encoded (KiB) |
| --- | ---: | ---: | ---: | ---: |
| Customer | 386 | 0.010 | 249.5 | 133.1 |
| Vendor | 222 | 0.000 | 235.3 | 133.1 |
| Admin | 216 | 0.008 | 230.9 | 133.1 |

## CI

`ci.yml` now lints/tests/typechecks/builds all apps; the build step explicitly uses production mode. `e2e.yml` builds and starts three isolated portal origins plus the real backend over the existing test PostgreSQL. `frontend-visual.yml` builds all three apps and runs the four-viewport Windows matrix. Existing PostgreSQL/Redis integration infrastructure is reused; no real SePay or Sentry credentials are required.

Root scripts use named pnpm workspace filters compatible with Windows CMD. Production route validation excludes stale `.next/dev` validators while validating generated production route types. Frontend Node types align with Node 22; Vite's native tsconfig path support replaces the obsolete peer dependency.

Remote GitHub Actions has not been run/observed in this task: no push was requested or performed. The results above are local observations.

## Git

Logical commits remain on the existing branch, in this order:

1. `edf08e1` docs(portals): inventory routes and define migration safeguards
2. `67f7b3c` refactor(frontend): extract shared portal UI and API foundations
3. `d0490a6` feat(auth): isolate portal refresh sessions and validate browser origins
4. `cbbc2e9` refactor(vendor): create independent portal and dedicated service workflows
5. `d331c7c` refactor(admin): create console with dedicated reviews and voucher editors
6. `e928585` refactor(frontend): finalize portal navigation and safe legacy redirects
7. `6b9cc03` test(portals): verify real journeys and cross-origin role isolation
8. `1eaf251` ci(frontend): build independent portals and align workspace dependencies
9. `6de3b7e` test(portals): verify responsive dialogs and reviewed visual baselines
10. Final documentation commit: `docs(portals): document architecture and verified migration results` (contains this report).

Secret scanning passed before commits; `.env`, generated clients, DB dumps, credentials and private test output are not staged. Final branch, commit count and clean-tree checks are reported with task completion. No push was performed.

## Remaining Limitations

The API still has no full Customer booking-history listing; the existing device-reference behavior is preserved. No production deployment or new live SePay transfer was performed. Hosted checkout is controlled in browser tests and authenticated synthetic IPN exercises the real backend. Camera logic/fallback and QR decoding are automated; physical-device camera hardware and live Cloudinary uploads were not exercised. Performance measurements are local production-browser samples without CPU/network throttling, not Lighthouse or field Core Web Vitals. Remote CI status is unobserved.

## Final Status

| Area | Status |
| --- | --- |
| Customer Website | DONE |
| Vendor Portal | DONE |
| Admin Console | DONE |
| Shared Design System | DONE |
| Full Regression | DONE — local automated scope described above |
