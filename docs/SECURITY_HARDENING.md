# Security hardening audit

Audit before implementation, 2026-10-25. Branch: chore/security-observability.

| Control | Before / risk | Required change | Coverage / final result |
| --- | --- | --- | --- |
| JWT / roles | Signature, expiry, ACTIVE user checked; roles overwritten from JWT after DB lookup | Use authoritative current roles; test revoked permissions | PASS: real HTTP revoked-role / anonymous / invalid / expired JWT |
| Refresh | HttpOnly, scoped path, hashed tokens, rotation/revocation; Secure defaults false | Production secure-cookie validation and explicit browser Origin protection for cookie writes | PASS: cross-site POST rejection; production configuration tests |
| Ownership | Customer/vendor relation checks in business services; admin roles on controllers | Audit routes, real HTTP IDOR/RBAC tests, preserve 401/403/404 semantics | PASS: customer booking/payment/QR/review/cancel and vendor booking/service/slot/check-in |
| Rate limiting | None; Redis exists only as local infrastructure, no deployment topology guarantee | Configurable read/write/auth groups, independent IP/subject quotas; shared Redis option; explicit single-instance memory limitation | PASS: 429/reset, subject isolation, two-store atomic Redis quota |
| Proxy | Express default no trust; no deployed proxy configuration | Retain no trust by default, allow only explicit trusted CIDR/address configuration; forged XFF tests | PASS: forged XFF cannot bypass; unsafe ranges rejected |
| CORS | One FRONTEND_ORIGIN, implicit methods/headers | Validated explicit allowlist, credentials, preflight and correlation headers | PASS: allowed preflight/credentials; denied origin gets no allow header |
| Headers / CSP | No Helmet; Next headers absent | API Helmet; separate frontend headers; documented CSP Report-Only with Blob QR/hosted POST support | PASS: real API headers and Chromium frontend headers/checkout/QR |
| Validation | Strict ValidationPipe, nested DTOs, server money snapshots, bounded upload checks | Reuse pipeline, explicit JSON/webhook limits; unknown financial fields/query/UUID regressions | PASS: spoofed money/identity, invalid UUID/quantity and oversized JSON rejected without writes |
| Secrets | Environment-driven keys, example placeholders; production startup not comprehensively validated | Reject missing/placeholder production secrets, no client exposure; scanning | PASS: production configuration tests and offline scanner; deployment secrets still required |
| Webhook | Constant-time secret, exact matching, idempotency/uniqueness | Preserve valid retries; authenticated webhook separate from low generic limits | PASS: 25 authenticated duplicate callbacks; existing edge cases remain green |
| Logs | Nest text logs, some domain objects and error stacks; no context | One privacy-safe JSON logger, request context and committed domain events | PASS: redaction, sink failure, concurrent ALS and real HTTP context tests |
| Errors / monitoring | Default Nest 500 response; placeholder Observe integration; no Sentry | Safe correlated error filter, official optional Sentry SDKs, sanitized transport tests, no duplicate reporting | PASS: real SDK transport, safe 500, frontend boundary and failing Sentry during settlement |

Deployment domains/topology are not inferred from developer defaults. Production
must supply explicit origins, HTTPS cookie settings, secrets and rate-limit store.
No business schema or historical migration changes are planned.

## Authentication and route ownership audit

The JWT guard verifies signature, expiry and access-token shape, then loads the
current ACTIVE, non-deleted user. Roles now come from that database lookup.
Previously, an unexpired JWT could retain revoked roles. Refresh tokens remain
hashed, rotating and revocable; no refresh token is returned in a public JSON
response. Cookies are HttpOnly, scoped to `/api/v1/auth`, with configurable
SameSite (default Lax). `SameSite=None` already requires Secure. Production now
requires Secure and TLS on the public ingress.

| Route family | Authentication / roles | Object boundary |
| --- | --- | --- |
| `/bookings`, cancellation and booking review | JWT + CUSTOMER | customerId relation; cancel/review eligibility in service |
| `/payments`, `/tickets`, booking tickets/QR | JWT + CUSTOMER | owning booking customer; QR credentials never public |
| `/vendor/services`, nested slots/images | JWT + VENDOR, approved/owner checks | owning vendor/service; image controller also OwnershipGuard |
| `/vendor/bookings`, `/vendor/dashboard` | JWT + VENDOR | approved vendor selected by authenticated owner; vendor relation filters |
| `/vendor/tickets/validate`, `/check-in` | JWT + VENDOR | approved vendor + owning service before lock and under transaction |
| `/admin/transactions`, refunds, `/admin/vouchers`, vendor approvals | JWT + ADMIN | existing admin policy and state-transition rules |
| `/vendors`, vendor applications | method-specific CUSTOMER/VENDOR/ADMIN + OwnershipGuard/service | owner, applicant or administrative review according to existing endpoint |
| `/vouchers` validation, `/reviews` customer writes | JWT + CUSTOMER | customer booking/review relation |
| Public services, slots, categories, vendor reviews | public | public projections; no payment/QR/private customer fields |
| `/webhooks/sepay/ipn` | independent constant-time shared-secret guard | persisted merchant reference + financial reconciliation/idempotency |
| `/health` | public | connectivity only, no credentials |

Anonymous/bad/expired tokens get 401. Wrong role gets 403. Cross-owner cases keep
their existing 403 or deliberately concealed 404 policy. Admin alone does not
implicitly gain Vendor privileges. Authorization is enforced server-side.
Tests snapshot financial/ticket aggregates to ensure rejected IDOR writes do
not mutate capacity, refunds, reviews or ticket state.

## Rate-limit policy

`RateLimitGuard` applies globally before controller guards. Defaults per 60-second
window (override `RATE_LIMIT_WINDOW_MS` and the named environment settings):

| Group | Routes | IP quota | Additional authenticated subject quota |
| --- | --- | ---: | ---: |
| AUTH | login/register | 20 | 10 |
| REFRESH | refresh/logout | 120 | 120 when access token supplied |
| WRITE | other mutation routes, including hold/pay/check-in | 600 | 120 |
| READ | other GET/HEAD routes | 1200 | 300 |
| WEBHOOK | invalid/unauthenticated SePay callbacks | 120 | not used |

AUTH additionally limits each normalized email account hash to 10/window, shared
across source IPs. No email or IP is written to logs. Storage keys are hashed in
Redis. Only cryptographically verified access-token subjects add a subject
quota; request metadata never establishes identity. IP quota still applies.
OPTIONS/health are exempt. 429 includes `RATE_LIMIT_EXCEEDED`, `Retry-After`
seconds and the canonical request ID. There is no permanent account lockout.

Development defaults to official Throttler memory storage: process-local,
rolling expiry. Redis uses one atomic Lua INCR/PEXPIRE/PTTL fixed window across
instances. Concurrent requests await connection readiness; two independent
stores are tested together. Redis outage fails closed with 503, without falling
back to isolated memory. Deployment must monitor Redis availability and tune
quotas for polling/NAT traffic. Neither store is an edge DDoS protection system.

Production must configure `RATE_LIMIT_STORAGE=redis` and a deployment Redis URL,
or explicitly set `RATE_LIMIT_SINGLE_INSTANCE=true` only for a guaranteed single
process. Memory mode is unsuitable for replicas/Node cluster. Production Redis
needs deployment-managed authentication, TLS/private networking and capacity.

Legitimate SePay callbacks with a valid constant-time secret bypass the generic
limiter, preserving provider retries/duplicates even during bursts. They still
pass the independent webhook auth guard, strict DTO/body-size limits and all
financial/idempotency checks. Invalid secrets have their own quota. Apply an
ingress body/connection budget if needed; do not invent provider IP allowlists.

`TRUST_PROXY_CIDRS` defaults empty/false. Configure only actual trusted ingress
addresses or CIDR ranges. Blanket true, numeric hop counts and /0 are rejected.
Untrusted X-Forwarded-For never chooses a new rate-limit identity. The reverse
proxy must replace forwarded headers and direct public access to the API must
be blocked when ingress trust is enabled. No production topology was assumed.

## Headers, CORS and cookie CSRF

Helmet protects the API with nosniff, frame SAMEORIGIN, no-referrer and the other
default security headers; X-Powered-By is removed. Production HSTS is 180 days,
without includeSubDomains/preload. Terminate TLS at the real deployment ingress.
API CSP is disabled because the API serves JSON and optional development Swagger.

`CORS_ORIGINS` is an exact comma-separated origin allowlist, falling back to
legacy `FRONTEND_ORIGIN`. Production requires explicit HTTPS origins. Wildcards,
paths, credentials, `null` and malformed origins are rejected. Credentials are
enabled for refresh cookies. Allowed methods and headers are explicit, including
Authorization, Content-Type, Idempotency-Key, X-Request-Id and the SDK's
sentry-trace/baggage headers; X-Request-Id/Retry-After are exposed. Server clients
without Origin are allowed, including SePay.

CORS is not CSRF protection by itself. Cookie-auth POSTs login/register/refresh/
logout reject unapproved Origin and Origin-less `Sec-Fetch-Site: cross-site`.
Browser requests normally supply Origin; Origin-less server clients retain their
contract. Other protected writes require a bearer token. SameSite Lax/Secure is
an additional boundary. Do not deploy a permissive ingress that strips Origin
from cross-site browser requests.

Next sends nosniff, frame DENY, referrer and camera/microphone/geolocation
permissions policies. Camera remains self-only for Vendor QR scanning. CSP is
**Report-Only**, not enforced: it permits configured API/Sentry origins,
Cloudinary images, data/blob QR previews/downloads, self assets and hosted SePay
sandbox/production form POST. Inline scripts/styles remain allowed for current
Next rendering. No remote report collector is configured; review browser console
reports in staging, add a privacy-reviewed collector if needed, implement
nonces/hashes, then enforce after checkout/scanner/QR regression. This is not a
claim of strict XSS prevention through CSP today.

## Input and secret hygiene

Production and new real HTTP tests share the same strict global ValidationPipe:
whitelist, forbid unknown fields and DTO transformation. Existing nested DTO,
UUID, date, pagination, quantity, text and image-size constraints remain in
effect. Prisma parameterization and fixed raw SQL templates remain unchanged;
no unsafe raw query interpolation was added. Server snapshots remain authoritative
for price, commission, discount and payment amount. Clients cannot assign
customerId, totalAmount, commission, platformFee or discount fields to holds.
JSON limits: normal 256 KiB, webhook 64 KiB; URL-encoded 64 KiB. Multipart upload
uses its existing separate limits. Oversized/invalid JSON returns 413/400 safely.

Production startup rejects missing/short (<32-byte)/known-placeholder JWT,
SePay and ticket secrets, missing CORS, insecure refresh-cookie settings and
unacknowledged process-local limits. Generate independent secrets in the
deployment secret store. Do not put real values into examples, Git, logs, shell
history or NEXT_PUBLIC variables. Only the public Sentry DSN may reach browser
configuration; the Sentry upload auth token is build-only. Runtime `.env` files,
private keys, dumps, traces and generated artifacts remain ignored.

`node scripts/check-secrets.mjs` scans tracked and new unignored source offline,
with self-checks for real-token patterns, private keys, accidental runtime env
files and literal secret assignments. Results report only rule/path/line, never
matched values. Known synthetic fixtures/examples are distinguished; this small
guard is not comprehensive entropy scanning or history remediation. Use your
Git provider's secret scanning as an additional deployment/repository control.

## Verification and rollout

New coverage lives in backend `src/security/security.spec.ts`,
`test/integration/security.int-spec.ts`, `security-redis.int-spec.ts`,
`observability.int-spec.ts`, and frontend monitoring/API tests. Full normal unit
and integration suites include them. Focused aliases are `test:security` and
`test:observability`. Docker integration Redis uses localhost 6380; tests never
flush development Redis. The guarded PostgreSQL suites use dedicated test DBs.

Observed locally (2026-10-26): backend unit **322/322**, frontend unit **89/89**,
full integration **101/101**, backend build/lint and frontend typecheck/lint PASS.
Production Next build PASS; existing HTTP E2E **290/290**; real Chromium journeys
**3/3**, including registration, production frontend headers, hosted form POST
and QR. Financial edge cases (wrong amount, duplicate,
late success, refund reservation, rollback and concurrent settlement) are included
in the full integration pass. No historical migrations or financial schemas changed.

`pnpm --filter backend typecheck` checks all production source through the
existing build tsconfig and all new security/observability specs through
`tsconfig.security.json`; both PASS. Frontend application and journey fixture
typechecks PASS. A separate exploratory `tsc --noEmit` using the legacy backend
root tsconfig still reports typing errors in older specs (Vitest matcher types,
fixture literal narrowing and `supertest/types` imports). Those old test typing
issues are outside this change; runtime suites pass. New tests have no typecheck
errors, no suppression comments and no weakened assertions.

CI `.github/workflows/ci.yml` retains existing unit/build/HTTP suites, adds secret
scanning and dedicated Redis to the full integration job. Security/observability
tests are included rather than duplicated as separate jobs. Existing shuffled
integration run remains. `.github/workflows/e2e.yml` continues real Chromium
customer journeys and adds this branch to push triggers. Workflows have been
edited locally. The user supplied a failing CI log; a successful remote run of
the fixed workflow has not yet been observed. The agent does not push changes.

CI failure reported during implementation: the committed integration job had
PostgreSQL only. Redis in the separate quality job is not shared across jobs,
and uses port 6379, whereas security integration requires dedicated port 6380.
The workflow now provisions `jobs.integration.services.redis-security`, maps
6380:6379, waits for its health check, sets `SECURITY_TEST_REDIS_URL` explicitly,
and verifies PING through the runner's mapped port before the suite. No test is
skipped and Redis failure never falls back to memory.
The exact readiness script passes locally against the dedicated Redis and fails
with the intended diagnostic against an unavailable loopback port. The full
suite also passes **101/101** with CI's shuffle seed **20261022** after this fix.

Before production: configure actual origins/ingress CIDRs, TLS/Secure cookie,
deployment secrets, rate-limit storage, optional Sentry and release. Exercise
staging login/refresh, denied Origin, NAT/polling thresholds, hosted checkout,
IPN retries, QR/scanner and safe 500 correlation. Remote Sentry verification and
CSP enforcement rollout are deployment tasks, not locally verified outcomes.

See [OBSERVABILITY.md](OBSERVABILITY.md) for privacy and troubleshooting details.

### Frontend typecheck on a clean checkout

The frontend uses Next's generated global `LayoutProps<"/">`. Plain `tsc` does
not generate that helper. CI checks types before the build, so a fresh checkout
previously failed with TS2304, while local checks passed using `.next` types
left by an earlier build. The frontend `typecheck` script now runs
`next typegen && tsc --noEmit`, as supported by the installed Next.js version.
Generated `.next` types and `next-env.d.ts` remain untracked; no hand-written
replacement or type-check suppression is needed.
Verification used an isolated copy of tracked frontend source with no `.next`,
`next-env.d.ts` or TypeScript build cache: plain `tsc` reproduced TS2304; the new
`pnpm --filter frontend typecheck` passed with CI's `NODE_ENV=test`.
