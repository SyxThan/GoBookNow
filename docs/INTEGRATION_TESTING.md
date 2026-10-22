# PostgreSQL lifecycle integration tests

**Never point these commands at `gobook`, `gobook_dev_clean`, shared development,
or production. The dedicated test database is truncated before and after every
test.** Normal backend health only checks connectivity; this suite also verifies
committed migrations, all current model tables and scalar columns.

## Prerequisites and isolated local database

Use the repository's Node 22 and pnpm version from `packageManager`, installed
workspace dependencies, and Docker with PostgreSQL 17 support. Commands below run
from the repository root unless otherwise indicated.

```sh
pnpm install --frozen-lockfile
docker compose -f docker-compose.integration.yml up -d --wait
```

This starts a separate PostgreSQL server bound to `127.0.0.1:5433`, with synthetic
`test:test` credentials and database `gobook_test`. It has an ephemeral tmpfs data
directory and does not mount the development database volume. Do not add
`--remove-orphans`, `down -v`, or production secrets.

Copy `apps/backend/.env.test.example` to `apps/backend/.env.test`. Keep the copy
untracked. The runner loads only `.env.test`; exported environment variables take
precedence. It never obtains the integration database target from `.env`.

```sh
pnpm --filter backend test:integration:prepare
pnpm --filter backend test:integration
pnpm --filter backend test:integration --sequence.shuffle --sequence.seed=20261022
```

The prepare command checks safety **before** invoking Prisma, then runs Prisma
validate, generate, migrate deploy and migrate status using the committed config
and migrations. It works from a completely empty schema, without seed scripts.
Never use migrate reset, db push, or modify old migrations to prepare tests.
The test command does not silently migrate an unexpected database: global setup
requires each committed migration with its original checksum.

After local testing, stop/remove only this dedicated service:

```sh
docker compose -f docker-compose.integration.yml stop postgres-integration
docker compose -f docker-compose.integration.yml rm -f postgres-integration
```

Removing that disposable test container discards its tmpfs data. Running `up`
again provides a fresh server/schema; run prepare again. This does not remove
`gobook-postgres`, Redis, or development volumes.

## Safety and isolation

Both the runner and Vitest config require all of:

- Explicit `NODE_ENV=test` and `DATABASE_URL`.
- `postgresql`/`postgres` URL, host `127.0.0.1`, `localhost`, `::1`, or CI service
  alias `postgres`; remote hosts are rejected even if the database has a test name.
- Database `gobook_test` or `gobook_test_<lowercase alphanumeric suffix>`.
- Public schema; additional connection URL options are rejected.
- Explicit `INTEGRATION_TEST_ALLOW_CLEANUP=1`.

Failures never echo the URL or credentials. Cleanup rechecks the guard and the
actual `current_database()` before truncating only tables generated from the
current Prisma model list; `_prisma_migrations` is preserved. A session advisory
lock rejects a second integration suite on the same database. Files and tests run
sequentially; requests inside race tests use separate genuine transactions.
Do not run unrelated E2E processes against this database at the same time. Use a
second isolated server or approved test database suffix for another process.

Each test gets fresh synthetic roles and a new fixture factory. It creates its own
customers, approved vendors, categories, published services, slots, holds,
payments, attempts and vouchers. There are no fixture IDs, passwords, or seed data
from a personal database. Slots use DB clock plus a future offset; expiration
fixtures use DB clock minus an offset, without waiting for wall time to elapse.
Nest apps and Prisma connections close after each file. PostgreSQL constraint
injection is removed in `finally` blocks, including when an assertion fails.

## Fixtures and application scope

`test/integration/helpers/test-app.ts` boots the real Auth, Prisma, Bookings and
Payments Nest modules with the same API prefix and validation pipe as the app.
JWTs use the real JWT module and role guards with synthetic local identities.
The background scheduler is disabled so tests control when to invoke the real
`BookingExpirationService`. The full AppModule is intentionally avoided because
it initializes unrelated external storage and telemetry.

`FixtureFactory` provides customer/admin/vendor/service/slot factories,
`createBookingHoldFixture`, `createPaymentFixture`,
`createPaymentAttemptFixture`, `createConfirmedReservationFixture`, a DB-time
backdating helper, effective availability and authentic IPN payloads. Holds and
payments are created through real business services, preserving voucher,
commission, pricing and time snapshots.

Only `PAYMENT_CHECKOUT_PROVIDER` is replaced: it returns a deterministic synthetic
POST form using the actual requested reference/amount/currency. IPN guard,
normalization, matching, settlement, Prisma and PostgreSQL stay real. No SePay,
Cloudinary, email or Redis connection is required. Supported IPN authentication
is `X-Secret-Key`, not a substituted webhook signature scheme.

## Coverage and transaction evidence

- Booking API: single/multiple slots, snapshots, commission reconciliation,
  immutable pricing/time after price changes, invalid DTO/quantities, unavailable
  and unknown slots, insufficient capacity, idempotent replay/conflicts.
- Capacity: stored `Slot.capacity` never decrements. Consumption comes from
  CONFIRMED reservations plus HELD reservations with `expires_at > DB NOW()`.
  Tests assert both stored capacity and calculated availability.
- Expiration: multi-slot finalization, idempotent state/timestamps, active and
  confirmed protection, stale reservation and voucher usage before cleanup,
  voucher release, concurrent worker execution.
- Payments: initiation/reuse, discounted authoritative amount, exact invoice
  matching for equal amounts, provider mismatch, wrong secret/missing secret,
  wrong amount/currency/reference/status, full IPN settlement and voucher
  redemption, duplicate events, transaction ID collisions, fake browser return,
  ownership, late payments without resurrecting expired bookings.
- Rollback: temporary real CHECK constraints fail the final voucher claim write
  after nested hold writes; reservation confirmation after PaymentAttempt,
  Payment and Booking writes; and booking expiration after reservation writes.
  Tests reload the entire aggregate and assert no partial committed state,
  unchanged availability and a successful idempotent retry after fault removal.
  No production fault flags or mocked Prisma methods are used.
- Concurrency: capacity contenders and duplicate hold/IPN requests are released
  from a real row lock only after PostgreSQL reports every contender blocked.
  This proves requests overlap; no arbitrary sleep establishes correctness.
  The barrier follows the full blocking tree, including queued waiters described
  by PostgreSQL's [lock functions](https://www.postgresql.org/docs/17/functions-info.html).
  Repeated payment/expiration races cover both active and expired multi-slot
  voucher bookings, asserting coherent final states and capacity every cycle.

SePay mismatches intentionally return HTTP 200 acknowledgement without business
mutation. Late valid payments record SUCCEEDED payment facts while the booking
and reservations stay EXPIRED; automated refunds are outside this suite's scope.
Only SePay exists in the current provider enum, so an unsupported provider is
tested through the real matching service, not an invented HTTP gateway.

## CI and diagnostics

The `integration` job in `.github/workflows/ci.yml` runs on PRs to develop/main
and pushes to develop/main/test/integration. It starts its own PostgreSQL 17
service from empty storage, uses synthetic credentials, installs with a frozen
lockfile, runs guarded prepare, then runs the suite twice (second run shuffled).
Unit and existing E2E patterns do not include `.int-spec.ts`, so those jobs do not
run this suite again. JUnit output is uploaded even on failure from
`apps/backend/test-results/integration.xml` (ignored locally).

Local verification does not prove GitHub Actions passed. Remote CI remains
unverified until the branch is pushed by a human and its workflow is observed.
This task does not push or merge.

Troubleshooting:

- Safety failure: inspect the target yourself and set the explicit test-only
  values; never relax the guard to use development or production.
- Connection timeout: confirm the dedicated test container is healthy and port
  5433 is free; on Windows use IPv4 `127.0.0.1`.
- Missing tables/columns or migration checksum failure: run prepare on the
  dedicated empty test server. Investigate changed history; do not rewrite
  historical migrations or reset the development database.
- Advisory lock failure: another suite still owns this test DB. Wait for it to
  finish or use another dedicated test database.
- A race never reaches the barrier: the failure reports actual waiter count;
  inspect the HTTP/domain failure rather than adding sleeps or weakening the
  assertion.

Useful checks:

```sh
pnpm --filter backend test:integration
pnpm --filter backend test:integration --sequence.shuffle --sequence.seed=20261022
pnpm --filter backend test:integration concurrency.int-spec.ts
pnpm --filter backend lint
pnpm --filter backend test
pnpm --filter backend build
```

## Local verification record (2026-10-22)

- Recreated only the disposable integration container; all 22 committed
  migrations deployed successfully from an empty schema. Prisma validate,
  generate and migrate status passed.
- Complete integration run: 6 files, 50 tests passed. Repeated run with shuffled
  order and seed `20261022`: the same 50 tests passed. No skipped tests.
- Separate concurrency verification also passed; the complete runs repeat the
  capacity, duplicate IPN and payment/expiration races internally.
- Backend unit suite: 32 files, 290 tests passed. Backend lint and build passed.
- Read-only inspection after both integration runs: 25 business tables, zero
  remaining fixture rows; all 22 migration history records preserved.
- Workflow/Compose YAML parsed and required pipeline settings were checked;
  Prettier and git whitespace checks passed. GitHub Actions was not executed.
- An additional full `tsc --noEmit --incremental false` check still reports
  existing typing errors in older unit/E2E test files (including
  `supertest/types` imports). The new integration files have no reported type
  errors; the production build passes. Unrelated older test typings were not
  changed as part of this task.

Integration implementation and local repeatability are verified. The roadmap
criterion requiring an observed clean GitHub Actions run remains **NOT DONE**
until remote CI is run and its result is checked; this branch has not been pushed.
