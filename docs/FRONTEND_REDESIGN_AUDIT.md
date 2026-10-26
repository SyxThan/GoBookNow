# GoBookNow frontend redesign

Branch: `feat/frontend-neo-brutalism`. Initial audit: 2026-10-26.

## Baseline architecture and defects

Next 16.3.5 App Router, React 19, Tailwind 4, TanStack Query. No existing Radix,
shadcn, icon, animation or form library. All 18 current routes use a dark slate /
teal theme with Arial. The home page is a developer-oriented set of links rather
than a customer discovery experience. Headers, login panels, status styling and
operation navigation are duplicated. There is no global product navigation or
designed 404. Dense forms/tables need mobile review. Existing business logic
already protects payment authority, idempotency, QR Blob fetching and refunds;
those contracts are preserved.

## Existing route inventory (before changes)

| Route | Role | Component / API | Current UX issue | Planned redesign / verification | Status |
| --- | --- | --- | --- | --- | --- |
| `/` | PUBLIC | Home | Vendor/developer links dominate; no discovery story | Customer hero, search, category links, how it works; keyboard/mobile/browser | Implemented; verified below |
| `/services` | PUBLIC | ServicesSearch; services/categories APIs | Dark cards, buried filters, generic image fallback | Search hierarchy, active filters, usable mobile filters, expressive cards; filter/reset/empty tests | Implemented; verified below |
| `/services/[slug]` | PUBLIC | ServiceDetailClient; detail/slots/reviews | Weak gallery/booking hierarchy | Clear service and vendor information, slot choice and booking panel; availability tests | Implemented; verified below |
| `/register` | AUTH | CustomerAuthForm; auth/register | Plain isolated form | Friendly split layout, visibility controls, labels/errors/success; real registration | Implemented; verified below |
| `/login` | AUTH | CustomerAuthForm; auth/login | No shared shell or password visibility | Same auth system, preserved session behavior; real login | Implemented; verified below |
| `/bookings/checkout` | CUSTOMER | BookingCheckoutClient; hold/voucher/payment | Dense stateful page, dark totals | Calm checkout progression, financial hierarchy, timer/expiry; voucher/hold/POST payment regression | Implemented; verified below |
| `/payment/result` | CUSTOMER | PaymentResultClient; payment polling | Weak state distinctions | Pending/confirmed/expired/late refund presentation; forged returns and delayed IPN | Implemented; verified below |
| `/bookings/[bookingId]` | CUSTOMER | BookingTicketsClient; QR/review/cancellation APIs | Long mixed actions, no ticket identity | Admission cards, scannable QR, clear cancellation/refund/review; dialog/mobile tests | Implemented; verified below |
| `/vendor/profile` | VENDOR | VendorProfileClient; vendors/me | Huge ungrouped legal/profile form | Workspace shell, grouped readable forms/status; edit/error/mobile | Implemented; verified below |
| `/vendor/application` | VENDOR | VendorApplicationClient; applications | Long application/document flow | Onboarding hierarchy, clear progress and feedback; existing API ownership | Implemented; verified below |
| `/vendor/dashboard` | VENDOR | VendorDashboardClient; overview | Same-weight cards, weak data hierarchy | Clear KPIs and actual trend/period; financial assertions | Implemented; verified below |
| `/vendor/bookings` | VENDOR | VendorBookingsClient; bookings/services | Ad hoc tabs/filter/card navigation | Cohesive workspace, practical filters and records; empty/filter/detail | Implemented; verified below |
| `/vendor/bookings/[bookingId]` | VENDOR | VendorBookingDetailClient | Dense money and ticket counts | Readable operational detail, aligned finance; protected detail | Implemented; verified below |
| `/vendor/check-in` | VENDOR | VendorCheckInClient; validate/check-in | Dense scanner/token/result flow | Fast scanner surface and distinct validation/result; camera/manual/duplicate safeguards | Implemented; verified below |
| `/admin/vendor-applications` | ADMIN | AdminVendorApplicationsClient | Dense approval detail and confirmation | Neutral workspace, clear review decisions and documents; dialog keyboard/mobile | Implemented; verified below |
| `/admin/categories` | ADMIN | AdminCategoriesClient | Dense CRUD and duplicated login | Consistent forms/list/actions and explicit deletion; CRUD/mobile | Implemented; verified below |
| `/admin/transactions` | ADMIN | AdminTransactionsClient; list/summary | 900px table and many equal filters | Intentional table scroll, readable filters and totals; sorting/pagination/overflow | Implemented; verified below |
| `/admin/transactions/[paymentId]` | ADMIN | TransactionDetailClient | Raw dense investigation blocks | Structured payment/refund timeline and financial truth; detail privacy/mobile | Implemented; verified below |

## Feature gaps to resolve against real APIs

Vendor service/slot management and Admin voucher management have real backend
endpoints but no dedicated frontend route. Their DTOs are being used directly.
Closer controller inspection shows no customer booking-history GET endpoint;
the unused list DTO is not evidence of an API. A customer lookup/recent-reference
page can verify known booking IDs through the existing owned-ticket endpoint,
but must label its device-local scope and never pretend to be full account history.
Vendor detail is currently embedded in
the service detail; password recovery and customer profile editing must not be
invented without backend support. Review CRUD/cancellation/QR already live in
booking detail and must remain available there. Add coherent 404/error/loading
states instead of dead-end links.

## Design and delivery plan

1. Capture the existing rendered UI before editing application components.
2. Establish cream/ink/yellow/coral/mint/lavender semantic tokens, Vietnamese-safe
   self-hosted type, hard shadows, spacing, touch targets and focus/motion rules.
3. Build product/workspace navigation and meaningful shared controls, dialog,
   status, feedback and table treatments.
4. Redesign public/auth, customer finance/tickets, then Vendor/Admin, preserving
   API contracts and authoritative backend totals.
5. Open and inspect every final route on desktop/mobile. Record screenshots,
   overflow, font readiness, accessible names, modal containment, button states
   and financial CTA visibility. Refine actual observed defects.
6. Run component, real customer E2E, operational, visual and accessibility suites;
   preserve backend integration/payment regressions. Measure representative
   browser performance without inventing Lighthouse scores.

Reviewed synthetic screenshot baselines are versioned under `apps/frontend/e2e/visual/baselines`. Raw reports, exploratory captures and real-journey artifacts stay ignored.
Native computer-use initialization currently fails with a missing runtime asset;
headed Chromium through Playwright plus direct screenshot inspection is the
fallback for real rendered visual review. Mock data is restricted to isolated
browser test fixtures, never production UI.


## Final route verification matrix

All 23 App Router page patterns have intentional UI. The visual fixture exercises 24 application URLs (including both `new` and existing service IDs), plus 404. Every URL was opened in Chromium at desktop/mobile sizes, its screenshot inspected, and its geometry checked at 768px/1280px. The initial native computer-use runtime could not initialize; headed Playwright Chromium and direct PNG inspection supplied the actual rendered review.

`V` = reviewed desktop/mobile screenshots + axe + font/overflow checks in `e2e/visual/routes.spec.ts`.
`S` = interactive, keyboard, form/error and modal checks in `e2e/visual/states.spec.ts`.
`C` = real Customer journey, isolated Nest/PostgreSQL, in `e2e/journey/customer-booking-journey.e2e.spec.ts`.
`O` = real Vendor/Admin operations in `e2e/journey/operator-workspaces.e2e.spec.ts`.
`U` = existing mocked UI behavior in the three top-level `e2e/*.spec.ts` files. These tests verify presentation and request behavior, not financial settlement.

| Route / feature | Final design and functional verification | Responsive result | Evidence |
| --- | --- | --- | --- |
| `/` | Original SVG hero, real catalog/category data, search, actual destination links | Stacked hero; no clipped panel shadows | V, C |
| `/services` | Search, categories/type/location/time/price filters, removable filters, reset, empty/error recovery | Collapsible phone filters, responsive catalog | V, S, C |
| `/services/[slug]` | Service/vendor information, gallery, slot selection, quantity, reviews and continuation | Stacked summary and mobile bottom continuation | V, C; slot keyboard unit test |
| `/register` | Customer registration, confirm-password validation, visibility controls and success | Phone form and full Vietnamese labels | V, C |
| `/login` | Customer/operator login, busy and error state, shared navigation | Phone form without overflow | V, C, O |
| `/bookings/checkout` | Authoritative held totals, voucher, countdown, expiry and real SePay POST | Payment action reachable on phones | V, C, U |
| `/payment/result` | Distinct pending/confirmed/expired/late-payment outcomes; backend polling | Readable amount/status/actions | V, S, C, U |
| `/bookings/[bookingId]` | Owned tickets, Blob QR/download, cancellation preview/refund and review CRUD | Ticket cards; QR/cancellation fit 320px with internal scroll | V, S, C, U |
| `/bookings` (new) | Owned backend verification of device-session UUID references and link lookup | Stacked lookup and recent-reference cards | V; account-isolation unit tests |
| `/vendor/profile` | Readable organization/legal/contact/address groups, existing create/edit API | Stacked fields; edit button no longer stretches vertically | V, S; existing API behavior preserved |
| `/vendor/application` | Submission/status/document/history workflow and accessible upload fields | Forms and document actions fit phone width | V, S; protected upload/download API preserved |
| `/vendor/dashboard` | Existing period/KPI/revenue data, paid/retained/pending/estimated amounts distinguished | Chart bars move below values on phones | V, O, U |
| `/vendor/bookings` | Existing tabs/search/date/service filters, sorting and pagination | Rows become labelled phone records with visible detail CTA | V, O, U |
| `/vendor/bookings/[bookingId]` | Protected operational detail, tickets and original financial allocation | Readable stacked sections | V, U |
| `/vendor/check-in` | Camera/manual validation, explicit check-in, success/already-used states | Phone scanner and accessible manual fallback | V, C; existing scanner unit tests |
| `/vendor/services` (new) | Real service list/search/status/pagination and editor links | Responsive cards | V, O |
| `/vendor/services/[serviceId]` (new) | Draft/create/edit/publish/hide/archive/delete and image API controls | Stacked form, wrapped lifecycle actions, explicit destructive confirmation | V, O (draft/create/publish); image endpoints retain backend validation |
| `/vendor/services/[serviceId]/slots` (new) | Real slot CRUD/open/close/cancel, capacity and inherited/override pricing | Cards; editor and confirmation fit 320px | V, S, O (create/close) |
| `/admin/vendor-applications` | Review detail, protected documents/audit history and explicit decisions | Single-column detail and fully visible navigation | V, S, O (approve + role preservation) |
| `/admin/categories` | Existing CRUD, hide/activate and filtering, Vietnamese form/actions | Labelled phone records keep actions visible | V, O (create) |
| `/admin/vouchers` (new) | Real create/edit/deactivate, usage/date/discount conditions; exact basis points | Cards; long editor scrolls within 320px dialog | V, S, O |
| `/admin/transactions` | Existing search/filters/sort/pagination/summary; financial data remains read-only | Labelled phone records, contained tablet table | V, O, U |
| `/admin/transactions/[paymentId]` | Payment/attempt/refund/timeline detail, valid definition-list semantics | Readable stacked investigation panels | V, U |
| Loading / error / 404 | Matching skeletons, recovery and real links | Reviewed 404, network error and empty states | V, S |

The matrix distinguishes executed real actions from presentation checks. It does not claim that every image-storage, document-upload, every CRUD transition or every hardware-camera path was newly exercised end to end. Financial regression evidence is the 101-test backend integration suite plus the real Customer journeys.
