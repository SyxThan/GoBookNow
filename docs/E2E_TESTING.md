# Customer journey E2E

The release-blocking Chromium suite exercises the real Next.js frontend, NestJS
HTTP controllers/guards/services and PostgreSQL transactions. The existing
frontend `e2e/*.spec.ts` API-mocked browser suites remain separate. Deep payment
races stay in `test/integration`; this suite checks a small set of customer flows.

## Environment and startup

Requirements: repository-pinned pnpm/Node, Docker, PostgreSQL 17 and installed
Playwright Chromium. Redis is not used by these application modules. Auth does
not currently require email verification or SMTP delivery: the real registration
API creates an ACTIVE CUSTOMER and a refresh-cookie session.

From the repository root:

```powershell
Copy-Item apps/backend/.env.e2e.example apps/backend/.env.e2e
docker compose -f docker-compose.e2e.yml up -d --wait postgres-e2e
pnpm --filter frontend exec playwright install chromium
pnpm test:e2e:prepare
pnpm test:e2e
```

On Linux CI, use `playwright install --with-deps chromium`. Never run
`docker compose down -v`, Prisma reset or db push. To stop only this disposable
service: `docker compose -f docker-compose.e2e.yml stop postgres-e2e`.

`.env.e2e` is ignored. Required configuration:

| Variable | Local value / policy |
| --- | --- |
| `NODE_ENV` | `test`, checked before any database operation |
| `DATABASE_URL` | `postgresql://test:test@127.0.0.1:5434/gobook_test_e2e?schema=public` |
| `INTEGRATION_TEST_ALLOW_CLEANUP` | explicit `1` |
| `E2E_BASE_URL` | `http://127.0.0.1:3100`, full suite accepts loopback only |
| `BACKEND_BASE_URL` | `http://127.0.0.1:3101`, full suite accepts loopback only |
| `NEXT_PUBLIC_API_URL` / `FRONTEND_ORIGIN` | derived from the above origins |
| JWT access/IPN/ticket/form signing secrets | synthetic `e2e-only-*` values assigned in the Node runner, never real credentials |
| `SEPAY_ENV` / merchant ID | sandbox / synthetic merchant; real hosted-form signer |
| hold TTL / expiration interval | 10 minutes / 3600 seconds; expiration tests invoke the real service directly |

The runner loads only `.env.e2e`, never the developer `.env`. It reuses the
integration database guard and additionally requires a separate
`gobook_test_e2e[_suffix]` database. Cleanup verifies `current_database()` again.
The existing migration checksum verification and database advisory lock prevent
two suites from concurrently owning/cleaning the same database. Tests use one
worker with guarded cleanup before/after each test and worker teardown. No
historical migration changes or new business migrations are needed.

`test:e2e:prepare` validates/generates Prisma, deploys committed migrations, checks
status, compiles the test-only Nest entrypoint with decorator metadata and builds
Next.js in production mode. `test:e2e` runs the dedicated
`apps/frontend/playwright.journey.config.mts`. Its webServer entries start both
HTTP servers, wait for database health and `/register`, reject reused servers
and terminate processes after completion. No manual application startup needed.

The test Nest entrypoint imports the actual Auth, Bookings, Payments, Tickets,
Services, Slots, Categories, Reviews, Health and Prisma modules, uses the same
cookie parser/CORS/global prefix/validation settings and exposes no test API.
It omits unrelated admin/vendor/Observe modules and blocks external storage.
Payment business logic is not overridden. Config does not read developer files.

## Fixtures and customer flows

Setup reuses `FixtureFactory`, creates system roles, an approved vendor,
published searchable event and future slot relative to database time. Each run
uses unique synthetic customers/service titles/references/transaction IDs. No
local seed accounts or fabricated Customer JWTs are used.

The primary test drives **all Customer actions through UI**:

1. Home -> `/register`: name, unique email, password and confirmation.
2. `/login`: credentials of that same registered account -> `/services`.
3. Search for the unique event; open the real search result.
4. Select its future slot and quantity two -> checkout -> create hold.
5. Compare displayed quantity/total and countdown with persisted snapshots.
6. Initiate payment via the real checkout button and hosted form submission.
7. Return through a controlled provider page, deliver authenticated IPN from Node.
8. Wait for authoritative success, reload, click “Xem vé điện tử”.
9. View the authenticated Blob QR, reload and view the same ticket again.

Trusted Node helpers only provision/clean fixtures, read DB invariants, change a
live fixture price, simulate IPN and control expiration. They never set payment,
booking confirmation or ticket status directly.

Money assertions use BigInt: slot override price 275000 VND * quantity 2 = 550000,
gross minus discount = total, sum of net item snapshots = total, platform fee +
vendor amount = total, Payment equals original Booking total even after live
price changes. Capacity remains 5; effective available capacity becomes 3 while
held/confirmed, and returns to 5 after expiration. Countdown uses backend
`expiresAt` with 5-second tolerance, decreases under eventual assertions and
does not reset on reload. Browser timezone is Asia/Ho_Chi_Minh.

Additional cases cover pending payments, all three forged return hints,
refresh without additional attempts/tickets, automatic delayed-IPN confirmation,
expiration idempotency and late-success PENDING full refund with no entitlement.
The expiration helper backdates only the current fixture's deadlines and invokes
the actual expiration service twice. Browser clock advances past the original
hold deadline for checkout expiry UI; no 10-minute sleep or session-state edit.

The pending/delayed-IPN case applies a real fixture voucher through checkout UI:
550000 gross - 10000 discount = 540000 payable, with VoucherClaim moving from
RESERVED to REDEEMED only after authenticated settlement. The current Customer
UI selects one slot per Booking; multi-slot domain coverage remains in the
existing PostgreSQL integration suite.

QR assertions verify the exact ticket association, successful PNG response,
PNG magic bytes, loaded Blob image and ISSUED state. They do not decode/log the
ticket token or perform check-in. Replay IPN and QR reload do not create tickets
or change the existing logical ticket identities.

## Payment simulation boundary

**Real:** PaymentService/Attempt, exact amount/reference matching, X-Secret-Key
authentication, settlement, Booking/Reservation confirmation, TicketService and
PostgreSQL transactions. The real SePay SDK creates signed hosted form fields
with synthetic signing credentials.

**Simulated:** external checkout and provider delivery. Browser routing catches
the outgoing POST to `https://pay-sandbox.sepay.vn`, never forwards it, and serves
a minimal page linking to the local callback. All unexpected external browser
requests are blocked and fail the test. All frontend/backend API requests remain
real. No SePay money transfer occurs.

The Node-only helper finds the actual browser-created PaymentAttempt, derives
its merchantReference/amount, constructs the existing ORDER_PAID payload and
posts to `/api/v1/webhooks/sepay/ipn`. The synthetic IPN secret is never part of
NEXT_PUBLIC configuration, browser JavaScript or test attachment text.

## Diagnostics and debugging

```powershell
pnpm test:e2e --headed
pnpm test:e2e --debug
pnpm test:e2e --grep "Customer can register"
pnpm --filter frontend exec tsc -p tsconfig.journey.json
pnpm --filter frontend exec playwright show-report playwright-report/journey
pnpm --filter frontend exec playwright show-trace <path-to-trace.zip>
```

For local visual review, set `E2E_REVIEW_SCREENSHOTS=1` and run with `--headed`.
It saves synthetic register/login/service/hold/result/QR review PNGs in each
test's ignored output directory. Never publish the QR review image.

Screenshots are captured only on failure by default; traces are retained on failure even on
the first local attempt. HTML report: `apps/frontend/playwright-report/journey`;
JUnit: `apps/frontend/test-results/journey.xml`; per-test attachments/screenshots/
traces: `apps/frontend/test-results/journey`. Artifacts are gitignored. Videos are
disabled to avoid additional recording of QR credentials. Critical uncaught page
exceptions and unexpected external calls fail the test. Diagnostic attachments
contain only error classifications and HTTP status/path, never request/response
bodies, cookies, auth headers, signed fields or raw exception messages.

Traces/screenshots can contain synthetic sessions, passwords and QR images.
Treat them as sensitive, restrict access via repository permissions, keep them
for seven days and never upload them to public third-party trace viewers.

Local retries are zero. CI permits one retry with retained diagnostics; persistent
failures fail the job. Never regard a flaky retry as proof of stability. To test
repeatability, execute `pnpm test:e2e` again with fresh per-test fixtures.

Frontend journey tests have a separate TypeScript config because they reference
compiled Nest test helpers. Normal frontend builds do not require those generated
files. The existing frontend `pnpm --filter frontend test:e2e` command remains the
API-mocked browser suite; root `pnpm test:e2e` is the real customer journey.

## CI and staging

`.github/workflows/e2e.yml` provisions isolated PostgreSQL 17, installs frozen
dependencies and matching Chromium, prepares/builds applications, runs the real
suite and uploads report/test-results with `if: always()` and seven-day retention.
Existing quality/integration workflows remain responsible for deeper backend
regressions. No continue-on-error or real provider calls are used.
The existing CI workflow also triggers on `test/e2e` pushes so these regression
suites continue to run alongside the new browser job.

Day 53 acceptance uses local/CI isolated applications. Day 57 staging acceptance
is separate and must be observed after staging exists. A safe read-only smoke
command is available without DB/helpers/server startup:

```powershell
$env:E2E_BASE_URL='https://your-staging-frontend.example'
pnpm test:e2e:smoke
```

It checks registration/discovery availability only. The full fixture/IPN suite
intentionally rejects remote origins. For later authenticated staging smoke,
use dedicated approved synthetic accounts and scoped data ownership. Registration,
hold and pending-payment writes require an approved staging data plan. Payment
success requires an isolated sandbox/test provider channel; never send synthetic
IPN to production or globally truncate staging. Staging has not been verified by
this implementation.

## Troubleshooting

- Unsafe target: use the E2E example and dedicated DB; do not loosen the guard.
- Migration drift: inspect committed migrations; never rewrite checksums/history.
- Port occupied: stop the process you own or choose new explicit loopback origins,
  then rerun prepare to rebuild the public API URL. Existing dev servers are never
  reused by this suite.
- API/DB startup: inspect webServer output and Docker health. Tests wait on the
  real health endpoint rather than a fixed sleep.
- Missing Chromium: install the repository's Playwright version using the command
  above. CI also installs OS dependencies.
- Changed sources/configuration: rerun prepare before the suite; production
  frontend assets and emitted backend helpers must reflect current source.

## Verification record

Local verification on 2026-10-25:

| Check | Actual result |
| --- | --- |
| Final main real journey + pending/voucher/recovery + expiry/late refund, headless | 3 passed, 0 failed/skipped/retried/flaky, 61.96 seconds including startup |
| Independent repeat, headed Chromium with review PNGs | 3 passed, 0 failed/skipped/retried/flaky, 63.07 seconds including startup |
| Backend unit tests including 13 browser-target guard cases | 304/304 passed, 33 files, 9.37 seconds |
| PostgreSQL integration including all payment edge/concurrency/rollback cases | 85/85 passed, 7 files, 86.02 seconds |
| Frontend unit/component tests including 4 new Customer auth cases | 80/80 passed, 18 files, 136.18 seconds |
| Prisma validate/generate/deploy/status | PASS; 23 committed migrations applied to empty E2E DB; status current |
| Backend lint and production build | PASS |
| Full frontend lint, normal and journey TypeScript checks, production build | PASS |
| CI/Compose YAML parsing; old browser-suite separation | PASS; existing default config still lists only its original 11 tests |
| Cleanup / process ownership | 26 business tables, zero remaining fixture rows, 23 migration records; ports 3100/3101 no longer listening |

All final suites have zero failed or skipped tests. No Customer/Payment/Ticket
business service was mocked. The new Customer register/login UI was explicitly
authorized after the original audit found registration unavailable. Its tests
cover API submission/session storage, password confirmation, duplicate email and
login navigation; the real journey verifies persisted CUSTOMER identity and
authenticated hold/QR access.

Initial implementation runs exposed test-harness defects: missing UTF-8 metadata
on the synthetic provider page, an undersized synthetic ticket key, an incorrect
voucher enum expectation and Chromium's missing binary network-inspector body.
These were corrected without relaxing production validation. PNG magic bytes are
now verified from the actual authenticated Blob rendered by the UI. Failure runs
also confirmed screenshots, trace ZIPs, HTML/JUnit and sanitized HTTP diagnostics
were produced. No financial production defect or schema change was required.

Headed review inspected register/login/service selection/held checkout/result/QR
screens. Review artifacts use only synthetic data and remain ignored. Remote
GitHub Actions has not been observed because this branch is not pushed. Staging
has not been run: Day 53 local implementation/CI configuration is complete;
Day 57 staging verification remains pending.
