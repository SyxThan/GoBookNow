# Logging and Sentry

## Runtime architecture

NestJS 12 uses one `JsonLogger` implementation for Nest framework/domain logs
and explicit application events. `main.ts` supplies it before dependency
initialization. No second Pino/Winston/Observe pipeline runs. stdout contains
one JSON object per line; the log collector owns rotation, access and retention.
Free-text Nest messages become stable `application.*` events instead of exposing
arbitrary strings or raw Prisma exceptions. Production debug logs are disabled.

`AsyncLocalStorage` scopes each request. The API always generates its canonical
UUID `requestId` and returns `X-Request-Id`, including errors. A valid incoming
UUID is retained separately as `clientCorrelationId`; it cannot replace the
canonical identifier. Invalid incoming identifiers are discarded. Logs use the
matched route template, never the URL query. Unmatched routes use `/unmatched`.

`userId` is bound only after JWT verification and current ACTIVE-user lookup,
or successful login. Booking/payment identifiers are bound after authorized
lookup or committed writes, never from untrusted body/query/header fields.
Concurrent request context is isolated; completion events retain their context.
The expiration worker creates `jobType=booking.expiration` and a fresh `jobId`.
A scheduled job has no invented HTTP request or user. Invocations originating
inside a request retain its correlation context.

Example (synthetic UUIDs):

```json
{"timestamp":"2026-10-26T00:00:00.000Z","level":"info","service":"gobook-backend","environment":"production","message":"payment.initiated","event":"payment.initiated","requestId":"11111111-1111-4111-8111-111111111111","userId":"22222222-2222-4222-8222-222222222222","bookingId":"33333333-3333-4333-8333-333333333333","paymentId":"44444444-4444-4444-8444-444444444444","amount":"500000","currency":"VND"}
```

Events include `http.completed`, `http.unexpected_error`, `auth.login.failed`,
`auth.login.succeeded`, `booking.hold.created`, `booking.expiration.started`,
`booking.expiration.completed`, `booking.expiration.failed`, `payment.initiated`,
`payment.webhook.received`, `payment.webhook.rejected`, `payment.succeeded`,
`payment.late_success`, `payment.reconciliation_required`,
`ticket.issuance.completed`, `ticket.checked_in`, and the existing stable
`refund_obligation_created`, `refund_succeeded`, `refund_cancelled` events.
Repeated ticket repair can emit issuance completion for existing tickets; it
does not mean additional tickets were created. Transaction commit precedes
success events. Financial amounts are decimal strings, never floating point.

## Privacy contract

Logger metadata is an allowlist: UUID identifiers, operational numeric counts,
normalized route/method/status, stable reason/event/error names, currency and
string amount. Nested objects, request/response bodies, arbitrary error messages
and stacks are excluded. No Authorization, cookies, JWTs, refresh tokens,
passwords, email/name/phone, IP addresses, database URLs, SQL, SePay secrets,
signed checkout form fields, provider raw payloads, bank data, QR credentials,
ticket nonce/signature, session storage, or idempotency keys are logged.

Amounts and internal UUIDs are operationally sensitive: restrict collector and
Sentry project access and define retention according to deployment policy.
This implementation deliberately sacrifices raw error text/stack variables for
privacy. Error types, source filenames/line numbers and correlated events remain
available for diagnosis. Do not pass untrusted values as trusted event/reason
metadata or add raw payload breadcrumbs.

## Official SDKs and configuration

Installed `@sentry/nestjs` and `@sentry/nextjs`: **11.9.0**, compatible with the
installed NestJS 12 / Next.js 16.3.5 / Node 22 runtime. SDK 11 uses explicit
`dataCollection`; older `sendDefaultPii` recipes are not applicable. All sensitive
collection categories are disabled, including headers, bodies, cookies, user
information, SQL, URL queries, variables, frame source, queues, GraphQL and AI/MCP
content. Breadcrumbs, Sentry logs and metrics are dropped. No Session Replay is
installed. Streamed spans have generic names and empty attributes/links.

Backend `src/instrument.ts` initializes before AppModule. Production script
preloads `dist/instrument.js` with Node `--import` before `dist/main.js`. Supply
runtime monitoring environment through the process/container before startup;
do not rely on late ConfigModule dotenv loading for this early initializer.
Nest's global exception filter owns HTTP capture; no additional global Sentry
exception filter is registered. Expected 4xx/domain errors are not captured;
the SDK filter also excludes manually captured Nest 4xx. An unexpected HTTP 5xx
returns a generic Vietnamese message, code and requestId. Job failures are
captured at their service boundary. SDK identity deduplication avoids reporting
the same Error object repeatedly.

Frontend uses `src/instrumentation-client.ts` before hydration,
`src/instrumentation.ts` for Node server startup/request errors,
`sentry.server.config.ts`, and App Router `error.tsx` / `global-error.tsx`.
Boundaries render a safe retry UI. API 5xx errors carry the backend requestId and
are reported once; expected 400/403/409/429 responses are not reported. 429 gets
a retry message. No global Sentry user is retained between customer sessions.

Error events are reconstructed using an allowlist: safe environment/release,
service, validated application IDs, generic exception text/type, filename/line
number. Raw request/user/extra/breadcrumb/context payloads are dropped. Filenames
lose hosts, query strings, variables and full filesystem prefixes. Do not put
personal data in environment or release names.

Backend runtime: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`,
`SENTRY_TRACES_SAMPLE_RATE` (0..1, default **0**). Missing DSN disables sending;
invalid optional monitoring configuration and transport failures cannot change
business responses. SDK work is asynchronous; handlers do not await flush.

Frontend browser equivalents use `NEXT_PUBLIC_SENTRY_*`; these values are public
and compiled at build time. Server runtime variables remain `SENTRY_*`.
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` are build-only values supplied
by CI secret storage. Never prefix an auth token with `NEXT_PUBLIC_`. Source map
upload is disabled without a token; uploaded maps are deleted from build output.
Use an identical release identifier on frontend/backend/build to join releases.
Start with tracing zero; tune deliberately after staging privacy review.

## Troubleshooting and verification

1. Customer reports the displayed **Mã hỗ trợ** UUID on an API error.
2. Search backend JSON logs by canonical `requestId`; inspect route/status and
   trusted userId/bookingId/paymentId. Never ask the customer for a QR or token.
3. Search Sentry `contexts.application.requestId` for matching unexpected errors.
   A frontend API error and its backend event share this identifier. Frontend
   outgoing correlation ID remains separately searchable in backend logs.
4. Check related safe domain events and release; preserve financial truth from
   the database, not browser return hints or monitoring data.

Tests use the **real SDK with an in-memory transport**, synthetic DSNs and
controlled exceptions. They verify one capture, 4xx exclusion, privacy, React
boundary rendering, request correlation, concurrent ALS isolation and failing
monitoring transport during real Hold/Payment/IPN settlement. Fixture routes
exist only in test modules. No production diagnostic route is exposed.

To verify an actual remote project: configure staging DSNs and release using
deployment secrets, temporarily capture a controlled synthetic Error in a
non-public staging test harness, confirm exactly one event and matching UUID,
inspect all event/span fields for excluded data, then remove the harness. Check
source map resolution and denied frontend Origins. Never intentionally fail a
real customer payment. **Remote delivery, dashboards, alerts, source map upload
and staging privacy have not been verified locally.** No live Sentry account or
DSN is required to run this repository's tests.

## Commands and automation

```powershell
pnpm --filter backend test
pnpm --filter frontend test
pnpm --filter backend typecheck
pnpm --filter frontend typecheck
pnpm --filter backend test:security
pnpm --filter backend test:observability
pnpm --filter backend test:integration
pnpm --filter backend test:payment-edge-cases
pnpm test:e2e:prepare
pnpm test:e2e
```

The focused scripts select integration subsets; unit/privacy tests are already
included in normal unit suites. CI executes the full suites instead of repeating
focused aliases. Redis security tests use dedicated local port **6380**, while
integration PostgreSQL and browser PostgreSQL remain guarded separate databases.
See `SECURITY_HARDENING.md`, `INTEGRATION_TESTING.md` and `E2E_TESTING.md`.

Local Windows installations with a separate frontend pnpm workspace may trigger
pnpm dependency validation before scripts. Synchronize that lockfile if needed;
direct equivalent Node entrypoints are suitable for diagnosis. This does not
require changes to the production dependency verification policy.
