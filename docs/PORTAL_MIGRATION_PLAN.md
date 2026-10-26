# Portal migration plan

Branch: `feat/frontend-neo-brutalism`. Baseline commit: `c640f40`. Working tree was clean; tracking ref was aligned (0 ahead / 0 behind). No branch creation, merge, rebase or push.

## Architecture decisions

- Preserve Customer on 3000 and backend on its existing 3001; Vendor defaults to 3002, Admin to 3003. All origins are configuration.
- Extract shared visual foundations, API utilities and session utilities; feature implementations belong to their owning application.
- Keep all financial, ticket and ownership semantics authoritative in NestJS.
- Isolate refresh cookies per portal as well as sessionStorage/query cache; ports do not isolate cookies.
- Gate operational content on a backend `/auth/me` response. CUSTOMER applicants retain access to profile/application/status without operational VENDOR access.
- Verify replacement routes before converting legacy routes to redirects. Only validated route segments and allowlisted query fields survive redirects; tokens never do.

## Existing route inventory / migration map

| Old route | New application | New route | Main component | API dependency | Role | Status / functional tests |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin/categories` | Admin | `/categories` | AdminCategoriesClient | Existing `/admin/*` APIs | ADMIN | Migrated; independent build, real journeys and four-viewport QA |
| `/admin/transactions/[paymentId]` | Admin | `/transactions/[paymentId]` | TransactionDetailClient | Existing `/admin/*` APIs | ADMIN | Migrated; independent build, real journeys and four-viewport QA |
| `/admin/transactions` | Admin | `/transactions` | AdminTransactionsClient | Existing `/admin/*` APIs | ADMIN | Migrated; independent build, real journeys and four-viewport QA |
| `/admin/vendor-applications` | Admin | `/vendor-applications` | AdminVendorApplicationsClient | Existing `/admin/*` APIs | ADMIN | Migrated; independent build, real journeys and four-viewport QA |
| `/admin/vouchers` | Admin | `/vouchers` | VouchersManager | Existing `/admin/*` APIs | ADMIN | Migrated; independent build, real journeys and four-viewport QA |
| `/bookings/[bookingId]` | Customer | `/bookings/[bookingId]` | BookingTicketsClient | Existing public/auth/booking/payment/ticket APIs | CUSTOMER owner | Migrated; independent build, real journeys and four-viewport QA |
| `/bookings/checkout` | Customer | `/bookings/checkout` | Suspense, BookingCheckoutClient | Existing public/auth/booking/payment/ticket APIs | CUSTOMER owner | Migrated; independent build, real journeys and four-viewport QA |
| `/bookings` | Customer | `/bookings` | BookingsHub | Existing public/auth/booking/payment/ticket APIs | CUSTOMER owner | Migrated; independent build, real journeys and four-viewport QA |
| `/login` | Customer | `/login` | CustomerAuthForm | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Migrated; independent build, real journeys and four-viewport QA |
| `/` | Customer | `/` | Link, Burst, HomeCatalog | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Migrated; independent build, real journeys and four-viewport QA |
| `/payment/result` | Customer | `/payment/result` | Suspense, PaymentResultClient | Existing public/auth/booking/payment/ticket APIs | CUSTOMER owner | Migrated; independent build, real journeys and four-viewport QA |
| `/register` | Customer | `/register` | CustomerAuthForm | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Migrated; independent build, real journeys and four-viewport QA |
| `/services/[slug]` | Customer | `/services/[slug]` | ServiceDetailClient | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Migrated; independent build, real journeys and four-viewport QA |
| `/services` | Customer | `/services` | Suspense, ServicesSearch | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Migrated; independent build, real journeys and four-viewport QA |
| `/vendor/application` | Vendor | `/onboarding/application` | VendorApplicationClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | CUSTOMER or VENDOR applicant | Migrated; independent build, real journeys and four-viewport QA |
| `/vendor/bookings/[bookingId]` | Vendor | `/bookings/[bookingId]` | VendorBookingDetailClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Migrated; independent build, real journeys and four-viewport QA |
| `/vendor/bookings` | Vendor | `/bookings` | VendorBookingsClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Migrated; independent build, real journeys and four-viewport QA |
| `/vendor/check-in` | Vendor | `/check-in` | VendorCheckInClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Migrated; independent build, real journeys and four-viewport QA |
| `/vendor/dashboard` | Vendor | `/dashboard` | VendorDashboardClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Migrated; independent build, real journeys and four-viewport QA |
| `/vendor/profile` | Vendor | `/profile` | VendorProfileClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | CUSTOMER or VENDOR owner | Migrated; independent build, real journeys and four-viewport QA |
| `/vendor/services/[serviceId]` | Vendor | `/services/[serviceId]` | ServiceEditor | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Migrated; independent build, real journeys and four-viewport QA |
| `/vendor/services/[serviceId]/slots` | Vendor | `/services/[serviceId]/slots` | SlotsManager | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Migrated; independent build, real journeys and four-viewport QA |
| `/vendor/services` | Vendor | `/services` | VendorServicesClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Migrated; independent build, real journeys and four-viewport QA |

## Dedicated resource routes implemented

Vendor: `/login`, `/services/new`, `/services/[serviceId]/edit`, `/services/[serviceId]/slots/new`, `/services/[serviceId]/slots/[slotId]/edit`, `/onboarding/status`.
Admin: `/login`, `/vendor-applications/[applicationId]`, `/vouchers/new`, `/vouchers/[voucherId]/edit`.
Service overview, images and lifecycle remain resource context; editing fields and slot/voucher forms are dedicated tasks. Category management retains its structured inline form and short confirmations.

## Verification gates

1. Shared package resolution and Customer unit regression.
2. Vendor routes/auth/layout and real service/slot/booking/check-in/profile journeys.
3. Admin routes/auth/layout and real approval/category/voucher/transaction journeys.
4. Legacy redirects and independent builds.
5. Cross-origin cookie/cache isolation and backend RBAC/tenant checks.
6. Customer financial/ticket journeys, integration/payment edge cases.
7. Reviewed browser screenshots, four viewports, accessibility and performance measurements.
8. CI/deployment documentation; logical commits on the existing branch.

Historical reports describe the prior implementation. Current evidence and limitations are recorded in [PORTAL_VERIFICATION_REPORT.md](PORTAL_VERIFICATION_REPORT.md).

## Legacy redirect behavior

`/vendor` redirects to Vendor `/dashboard`; `/admin` redirects to Admin `/vendor-applications`. Known `/vendor/*` and `/admin/*` routes in the table use temporary HTTP 307 with `Cache-Control: no-store`. `/vendor/application` maps to `/onboarding/application`; all dynamic resource IDs remain intact. Unknown paths return 404. Only `page`, `status`, `search`, `sort`, `from`, `to`, `serviceId` are retained, with bounded length and one value per key. Access tokens, refresh tokens, signed forms, QR payloads, `next` and unrecognized query keys are discarded. No session is copied to another origin.

All Customer routes in the inventory retain their URLs and behavior. Dedicated new pages are described in [Vendor](VENDOR_PORTAL.md) and [Admin](ADMIN_CONSOLE.md). Customer marketing/account navigation now points to bookings and the configured Vendor onboarding origin; it contains no operational sidebar or Admin entry.

## Migration safeguards completed

Replacement features were committed before removing legacy implementations. Removal was deferred until recorded real operator journeys, browser session isolation, full visual/a11y matrix and targeted follow-up checks passed. Legacy trees had no uncommitted changes. Existing financial/ticket rules and all 23 database migrations were preserved.
