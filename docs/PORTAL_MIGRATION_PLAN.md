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
| `/admin/categories` | Admin | `/categories` | AdminCategoriesClient | Existing `/admin/*` APIs | ADMIN | Pending migration and rerun |
| `/admin/transactions/[paymentId]` | Admin | `/transactions/[paymentId]` | TransactionDetailClient | Existing `/admin/*` APIs | ADMIN | Pending migration and rerun |
| `/admin/transactions` | Admin | `/transactions` | AdminTransactionsClient | Existing `/admin/*` APIs | ADMIN | Pending migration and rerun |
| `/admin/vendor-applications` | Admin | `/vendor-applications` | AdminVendorApplicationsClient | Existing `/admin/*` APIs | ADMIN | Pending migration and rerun |
| `/admin/vouchers` | Admin | `/vouchers` | VouchersManager | Existing `/admin/*` APIs | ADMIN | Pending migration and rerun |
| `/bookings/[bookingId]` | Customer | `/bookings/[bookingId]` | BookingTicketsClient | Existing public/auth/booking/payment/ticket APIs | CUSTOMER owner | Pending migration and rerun |
| `/bookings/checkout` | Customer | `/bookings/checkout` | Suspense, BookingCheckoutClient | Existing public/auth/booking/payment/ticket APIs | CUSTOMER owner | Pending migration and rerun |
| `/bookings` | Customer | `/bookings` | BookingsHub | Existing public/auth/booking/payment/ticket APIs | CUSTOMER owner | Pending migration and rerun |
| `/login` | Customer | `/login` | CustomerAuthForm | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Pending migration and rerun |
| `/` | Customer | `/` | Link, Burst, HomeCatalog | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Pending migration and rerun |
| `/payment/result` | Customer | `/payment/result` | Suspense, PaymentResultClient | Existing public/auth/booking/payment/ticket APIs | CUSTOMER owner | Pending migration and rerun |
| `/register` | Customer | `/register` | CustomerAuthForm | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Pending migration and rerun |
| `/services/[slug]` | Customer | `/services/[slug]` | ServiceDetailClient | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Pending migration and rerun |
| `/services` | Customer | `/services` | Suspense, ServicesSearch | Existing public/auth/booking/payment/ticket APIs | PUBLIC | Pending migration and rerun |
| `/vendor/application` | Vendor | `/onboarding/application` | VendorApplicationClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | CUSTOMER or VENDOR applicant | Pending migration and rerun |
| `/vendor/bookings/[bookingId]` | Vendor | `/bookings/[bookingId]` | VendorBookingDetailClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Pending migration and rerun |
| `/vendor/bookings` | Vendor | `/bookings` | VendorBookingsClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Pending migration and rerun |
| `/vendor/check-in` | Vendor | `/check-in` | VendorCheckInClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Pending migration and rerun |
| `/vendor/dashboard` | Vendor | `/dashboard` | VendorDashboardClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Pending migration and rerun |
| `/vendor/profile` | Vendor | `/profile` | VendorProfileClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | CUSTOMER or VENDOR owner | Pending migration and rerun |
| `/vendor/services/[serviceId]` | Vendor | `/services/[serviceId]` | ServiceEditor | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Pending migration and rerun |
| `/vendor/services/[serviceId]/slots` | Vendor | `/services/[serviceId]/slots` | SlotsManager | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Pending migration and rerun |
| `/vendor/services` | Vendor | `/services` | VendorServicesClient | Existing `/vendors`, `/vendor/*`, `/vendor-applications/me` APIs | VENDOR / approved owner | Pending migration and rerun |

## Dedicated resource routes to add

Vendor: `/login`, `/services/new`, `/services/[serviceId]/edit`, `/services/[serviceId]/slots/new`, `/services/[serviceId]/slots/[slotId]/edit`, `/onboarding/status`.
Admin: `/login`, `/vendor-applications/[applicationId]`, `/vouchers/new`, `/vouchers/[voucherId]/edit`.
Service overview, images and lifecycle remain resource context; editing fields and slot/voucher forms become dedicated tasks. Category quick-edit dialogs remain appropriate.

## Verification gates

1. Shared package resolution and Customer unit regression.
2. Vendor routes/auth/layout and real service/slot/booking/check-in/profile journeys.
3. Admin routes/auth/layout and real approval/category/voucher/transaction journeys.
4. Legacy redirects and independent builds.
5. Cross-origin cookie/cache isolation and backend RBAC/tenant checks.
6. Customer financial/ticket journeys, integration/payment edge cases.
7. Reviewed browser screenshots, four viewports, accessibility and performance measurements.
8. CI/deployment documentation; logical commits on the existing branch.

Historical reports are evidence of the prior implementation only, not results for this migration. Results below will be updated after execution.
