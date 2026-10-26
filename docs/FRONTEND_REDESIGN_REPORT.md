# GoBookNow frontend redesign delivery

Date: 2026-10-26. Branch: `feat/frontend-neo-brutalism`.

## Summary

The frontend now uses a bright neo-brutalist system across **all 23 application route patterns**, including five new management/access routes backed by existing APIs. Customer registration, discovery, checkout, payment results, tickets, cancellation, reviews, Vendor operations and Admin operations share a coherent shell and typography. The implementation was opened in headed Chromium and screenshots were actually inspected at desktop and phone sizes, including the later fixes.

No backend production service, financial algorithm, migration, database schema or authorization guard changed. Backend modifications are confined to the isolated browser-test application and fixture harness. No push, merge or deployment was performed.

## Design Vision and Design System

Cream canvas, dark outlines, sun-yellow actions, mint/coral/lavender accents and original ticket/SVG graphics replace the generic dark slate/teal presentation. Hard shadows and short press feedback give controls a consistent tactile feel. Public discovery is expressive; financial and operational surfaces remain explicit and readable.

See [the design system](FRONTEND_DESIGN_SYSTEM.md) for exact tokens, typography, components, responsive rules and screenshot reproduction. Be Vietnam Pro is self-hosted under OFL 1.1. All 134 sampled Vietnamese characters were found in each of the four chosen weights; the rendered WOFF2 font was also checked in Chromium.

## Route Coverage

See [the complete route audit and verification matrix](FRONTEND_REDESIGN_AUDIT.md). It records the original problems, resulting UI, responsive behavior and the actual test evidence for each route. There are 24 application URL cases because `new` and an existing service ID exercise different states of one dynamic route, plus the 404 screen.

## Customer Experience

The homepage leads with discovery and real category/catalog data. Service detail explains the experience, vendor, price and slot options; keyboard navigation and quantity controls remain functional. Registration/login have Vietnamese labels and password visibility controls. Checkout distinguishes estimates from persisted totals and makes voucher, deadline and SePay actions explicit.

Payment status always comes from the backend. A forged success return never confirms a booking. Pending/delayed IPN, expiry and late-payment refund obligations retain their existing semantics. Tickets use authenticated Blob QR delivery, per-ticket state and explicit cancellation/refund previews. Reviews retain their eligibility and one-review rules.

The new `/bookings` page deliberately labels its scope: recent references on the current device session, verified through owned-ticket APIs, plus a link/UUID lookup. The backend has no Customer booking-history GET endpoint; the UI does not invent a complete account history.

## Vendor Experience

A consistent workspace connects profile, application, dashboard, bookings, check-in and new catalog/slot management. Service creation/editing/publish/hide/archive/delete and image controls use the existing ownership-protected endpoints. Slot management exposes times, capacity and inherited/override prices. Financial KPIs continue to distinguish paid revenue, retained revenue, pending refunds and estimated earnings.

On phones, all workspace destinations are visible and booking rows become labelled records with an immediately available detail action. Camera/manual validation, explicit check-in and duplicate-use prevention are preserved.

## Admin Experience

Applications, categories, transactions and new voucher management share the same operational shell. Selected application details and document/audit regions remain protected. Real approval testing checks the database transition and preserves `CUSTOMER` while adding `VENDOR`. Voucher percentages convert exactly to basis points without floating-point rounding. Transactions remain read-only; attempts/refunds/timeline preserve original data and financial distinctions.

## Responsive Design and Accessibility

Reviewed screenshots cover 375×812 and 1440×1000. Every URL is also checked at 768px and 1280px. QR, cancellation, slot and voucher dialogs are tested at 320×640 with contained scrolling; their final actions remain reachable. No document-level overflow hiding was introduced to conceal layout defects.

Radix dialogs trap focus, support Escape, restore the trigger and lock background scrolling. Busy financial actions resist accidental dismissal. Explicit labels, semantic definition lists, native review radios, keyboard slot selection, focus rings, skip navigation, disabled/loading states and live feedback were checked. Automated axe rules cover WCAG 2 A/AA, 2.1 AA and 2.2 AA tags in the rendered route/state cases. Passing axe is not a certification of every assistive technology or physical device.

## Animations

Buttons use brief transform/shadow feedback; skeletons and pending indicators communicate loading. There is no heavy animation library. `prefers-reduced-motion` disables nonessential animation and transitions while preserving state information.

## Performance

Homepage measured on the local production build in Chromium, with loopback transport, a synthetic API catalog, a fresh context per sample, no CPU/network throttling, three samples per viewport. These are **not Lighthouse scores or field Core Web Vitals**, and no before/after speedup is claimed.

| First production measurement | Desktop 1440px | Phone-width 375px |
| --- | --- | --- |
| LCP samples | 200 / 132 / 140ms | 408 / 116 / 116ms |
| Median LCP | 140ms | 116ms |
| CLS | 0.01675 | 0 |
| Encoded JavaScript bodies | 260,420 bytes | 242,871 bytes |
| Encoded font bodies | 136,252 bytes | 136,252 bytes |

Original SVG illustrations and fixed image aspect ratios avoid unnecessary assets/layout shifts. Existing remote vendor-image delivery remains; representative real-image and throttled-device measurements are a follow-up, not an invented optimization result.

## Functional Regression Tests

| Executed check | Result |
| --- | --- |
| Frontend unit suite | **103 passed**, 22 files |
| Mocked UI regression suite, including operator session errors/retry | **12 passed** |
| Real Customer/Vendor/Admin journeys | **10 passed**, desktop + phone |
| Expanded Vendor/Admin actions (category creation and approval) | **4 passed**, both sizes |
| Backend integration suite | **101 passed**, 10 files |
| Frontend TypeScript and ESLint | Passed |
| Backend browser-harness TypeScript and type-aware lint | Passed |
| Frontend production build | Passed |
| Secret scan and Git whitespace check | Passed |

The 4 expanded operational tests are a later run of the operational subset, not 4 additional unique journeys. The older 322-unit/290-HTTP-E2E baseline results are not presented as newly executed in this redesign pass.

## Visual Regression Tests

**66 tests** cover populated route screenshots, state/dialog behavior, accessibility, tablet/laptop geometry and performance attachments. The suite was run against production with screenshot comparisons and no snapshot updates after intentional baseline review. **72 synthetic PNG baselines** are versioned; only a 100-pixel difference budget is allowed, so small status changes on long pages are not hidden by a generous percentage threshold. Countdown content is explicitly masked.

Real journey traces/reports and exploratory screenshots remain ignored. Initial native computer-use initialization failed because its runtime assets were missing; headed Playwright Chromium plus direct image inspection was the working fallback. Each route's desktop and phone screenshot was viewed, and changed layouts/dialogs were viewed again.

## Playwright E2E and Payment Boundary

The frontend and real Nest modules run against guarded `gobook_test_e2e` PostgreSQL. Customer registration/login, catalog queries, holds, voucher validation, payment initiation/polling, ticket issuance and check-in are real application calls. Only the external hosted SePay checkout is intercepted: the browser submits the real signed POST form, the test checks invoice/amount/currency, and an authenticated synthetic IPN reaches the real webhook. No real payment is made or provider secret sent externally.

The actual authenticated QR PNG shown to the customer is decoded at native pixel size with jsQR. The decoded credential is then used through the real Vendor check-in UI. The test verifies one ticket becomes `CHECKED_IN`, its timestamp is set, and a repeated scan cannot check it in again. Credentials stay in synthetic test memory; the committed visual QR is explicitly invalid test data. External production file uploads are disabled in the browser harness.

## Production Bugs Fixed

| Finding | Fix | Regression evidence |
| --- | --- | --- |
| Voucher HTML `pattern` rejected by Chromium's Unicode-sets regex syntax | Compatible literal-hyphen alternative | Real Admin voucher journey; browser-console failure detection |
| Small text lacked contrast on lavender | Darker shared muted foreground | Route/state axe checks |
| Document upload/select lacked accessible names | Programmatic Vietnamese labels | Application axe checks |
| Transaction definition terms were outside a definition list | Correct `dl` structure | Transaction-detail axe checks |
| Phone workspace navigation clipped destinations and shadows | Visible grid navigation | Reviewed phone snapshots and geometry matrix |
| Vendor/Admin tables put actions and amounts outside the phone view | Labelled responsive records | Reviewed snapshots, geometry and existing filter/detail UI tests |
| Revenue chart fixed columns exceeded narrow content width | Responsive value/bar layout | Dashboard snapshots and geometry matrix |
| Financial dialogs lacked complete keyboard/focus/scroll behavior | Shared accessible dialog and constrained viewport sizing | QR/cancellation/editor/menu keyboard and 320px tests |
| Logout helper treated HTTP failure as acknowledged logout | Check server response, retain data on failure and clear private checkout snapshots on success | Two logout acknowledgement unit tests; operator session UI regression |
| Slot radios had no arrow-key selection | Roving tab stop and arrow/Home/End support | Component keyboard regression test |

Inline operator/customer login now synchronizes shared navigation and clears cached queries; operator logout errors use live feedback and remain retryable. The operator session UI regression exercises failed logout, acknowledged logout and inline login on both legacy Vendor forms.

One test-infrastructure issue was also fixed: database cleanup no longer truncates while the previous browser context can still prefetch, avoiding a teardown deadlock. This was not a production financial-service change.

## CI and Git

Quality and real-journey workflows now include the feature branch. The new Windows Chromium workflow compares the reviewed screenshots and runs accessibility checks; Linux continues to run the real Nest/PostgreSQL journeys on desktop and phone. Diagnostics retain the existing short artifact lifetime. **Remote CI has not been observed**, because this branch has not been pushed.

Changes are split into local commits for the design/public surfaces, customer experience, Vendor/Admin workspaces, tests/CI, session-state consistency, and documentation. The history below was captured after the code/test commits and before the documentation-only commit. The final clean-state check is performed after committing these documents. No historical migration was edited and the developer database/Redis were not used for testing.

## Remaining Issues and Final Quality Assessment

The redesign's existing core routes and critical tested journeys are complete. It is ready for review on this branch. Production release readiness still depends on observing remote CI and deployment-environment behavior.

Physical cameras, iOS Safari, screen-reader combinations, real Cloudinary uploads/document storage and a live SePay sandbox/provider exchange were not all manually tested here. The controlled provider boundary and isolated fixtures are intentional. Full Customer account booking history, password recovery and Customer profile editing need backend contracts; no dead-end links or fake implementations were added. Free checkout remains the existing explicitly unsupported flow.

Brand identity is now consistent; customer decisions and financial states are clearer; Vendor/Admin controls are usable on phones; Vietnamese typography, dialog geometry and automated accessibility have concrete evidence. This assessment does not claim zero possible defects or measured field performance.

## Roadmap Completion

**Frontend Neo-Brutalism Redesign: DONE** for the implemented application scope, with the external/manual coverage limits above. Route coverage and critical local test gates are complete; remote CI and deployment are pending review.


### Git history captured before the documentation commit

```text
0f1e7dd fix(frontend): keep session navigation and checkout data consistent
1e45a26 test(frontend): verify visual accessibility and real booking journeys
01445ce feat(frontend): complete vendor and admin management workspaces
9d12985 feat(frontend): refine checkout tickets and customer booking access
b7e2265 feat(frontend): establish neo-brutalist discovery and design system
3ec32b6 Merge pull request #47 from SyxThan/chore/security-observability
d6a7c46 fix(ci): generate Next route types before frontend typecheck
ea3293b ci: provision integration Redis and enforce security checks
35f5d99 test(observability): verify tracing and sensitive-data redaction
cffaa4d test(security): cover authorization and protection controls
```

Local run/setup instructions are now in the root [README](../README.md), including environment-file creation without overwriting existing values, database migrations/seed, ports and provider configuration.
