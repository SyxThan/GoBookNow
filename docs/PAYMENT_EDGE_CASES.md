# Payment edge cases: coverage audit and hardening

Branch: `test/payment-edge-cases`. Audit before implementation, 2026-10-22.
Reuse `test/integration` and its guarded PostgreSQL, real Prisma, Nest app,
fixtures, cleanup and lock barriers. No real SePay calls or personal seed data.

## Coverage audit (before changes)

Paths below are relative to `apps/backend` except explicitly marked frontend.

| Scenario | Existing test file | Covered? | Missing assertion | Required action |
| --- | --- | --- | --- | --- |
| Sequential duplicate IPN | test/integration/payment-confirmation.int-spec.ts | PARTIAL | 10 deliveries, ticket identities/tokens, immutable financial snapshots | Extend with real ticket issuance |
| Concurrent duplicate IPN | test/integration/concurrency.int-spec.ts | PARTIAL | Ticket count and recovery | Extend assertions; reuse barrier |
| Provider transaction collision | test/integration/payment-confirmation.int-spec.ts | YES | Durable exceptional incoming fact | Add reconciliation regression |
| Missing/wrong secret | test/integration/payment-confirmation.int-spec.ts | YES | Ticket/exception count | Reuse; add malformed header cases |
| Unknown reference | test/integration/payment-confirmation.int-spec.ts | PARTIAL | Durable normalized successful incoming payment | Add persistence regression |
| Under/overpayment | test/integration/payment-confirmation.int-spec.ts | PARTIAL | Both amounts, immutable expected money, durable exception | Add real DB regression |
| Wrong currency | test/integration/payment-confirmation.int-spec.ts | PARTIAL | Durable exception, zero tickets | Extend |
| Missing/malformed fields | test/sepay-ipn.e2e-spec.ts; src/payments/sepay-transaction.normalizer.spec.ts | PARTIAL | Real PostgreSQL no-mutation assertions, zero/oversized amounts | Add cases using existing fixtures |
| Late success | test/payment-settlement.e2e-spec.ts; test/integration/payment-confirmation.int-spec.ts | PARTIAL | Durable full refund, duplicates, capacity reassigned, zero tickets | Add failing regression first |
| Initiation response loss | Payment initiation E2E/unit; test/integration/concurrency.int-spec.ts | PARTIAL | Fault after Payment/Attempt commit, same reference on retry | Inject only checkout provider failure |
| Delayed webhook | frontend src/lib/payment-result-state.test.ts | PARTIAL | Actual repeated GET reads followed by IPN | Add DB/API test |
| Frontend refresh | frontend payment result tests and browser E2E | PARTIAL | No automatic initiation; bounded polling cleanup | Extend existing component tests |
| Payment/expiration race | test/integration/concurrency.int-spec.ts | PARTIAL | Tickets and refund/exception invariants for both outcomes | Extend existing race |
| Return URL manipulation / ownership | test/integration/payment-confirmation.int-spec.ts; frontend payment-result-client.test.tsx | YES | All three hints, late-paid UI | Reuse and extend |
| Ticket exactly-once | TicketService/schema tests | PARTIAL | No production IPN call to issuance; failure/retry boundary | Test real service via IPN orchestration |
| Confirmation rollback | test/integration/transaction-rollback.int-spec.ts | YES | Late obligation failure and ticket post-commit failure | Add recovery regressions |

## Policy found during audit

Existing payment docs describe late successful payment facts and sanitized logs,
with durable refund/reconciliation deferred. Logging alone does not meet this
task's explicit received-money policy. RefundService already accepts an existing
transaction, reserves refundable balance and supports stable idempotency keys.
TicketService already issues missing ticket sequences under a Booking row lock,
but no production caller currently invokes issuance after payment confirmation.

The regressions below must demonstrate these gaps before production changes.

## Implemented rules and state boundaries

Authentication is SePay Gateway `X-Secret-Key` against `SEPAY_IPN_SECRET`, using
the existing constant-time comparison. It is independent of the hosted form's
signing secret. Structural invalidity returns 400; unauthorized requests return
401. Unsupported/void/declined events never confirm a Booking. Amounts must be
positive exact integers within PostgreSQL BIGINT bounds; both provider amount
and currency fields must agree. Malformed claims are never coerced into money.

Exact `merchantReference` matching remains authoritative. No amount/customer/slot
fallback exists. `PaymentAttempt(provider, providerTransactionId)` remains the
one authoritative successful association; a collision never redirects payment
to another Booking or changes expected money, discount or commission snapshots.

`payment_reconciliations` is a durable operations queue for authenticated,
normalized successful payment assertions that cannot be normally fulfilled.
It stores provider identity, exact reference, received integer amount/currency,
reason, optional Payment correlation and DB timestamp. `resolved_at IS NULL`
means pending review. It stores no raw payload, JWT/IPN secrets or card/customer
data. Native unique-key `ON CONFLICT DO NOTHING` deduplicates identical events,
including concurrent deliveries. Conflicting assertions for the same provider
transaction remain reviewable and must not be summed as independent transfers.
Only PaymentAttempt establishes the authoritative settled association.

For exactly matched late payment, settlement records the successful Payment and
Attempt, leaves Booking/Reservations EXPIRED and VoucherClaim RELEASED, and
creates a full Refund obligation via the existing RefundService **in the same
transaction**, using `late-payment:<attemptId>`. Refund amount equals verified
received money after the original discount; current price and voluntary
cancellation tiers are irrelevant. RefundService's balance and idempotency
guards remain active. No actual provider/bank refund is performed.

| Payment | Booking | Entitlement / handling |
| --- | --- | --- |
| PENDING | PENDING_PAYMENT | Await authoritative IPN; no tickets |
| SUCCEEDED | CONFIRMED | Reservations confirmed; ticket issuance completes idempotently |
| SUCCEEDED | EXPIRED | Zero tickets; durable review plus PENDING full refund |
| PENDING | EXPIRED | No entitlement; future verified money follows late policy |

Under/overpayments, wrong-currency, unknown reference and invalid-state incoming
assertions enter durable review without rewriting expected Payment.amount or
confirming Booking/Reservations. They are not automatically refunded through an
aggregate whose expected amount does not represent those actual funds.
If provider order and transaction fields disagree, an interpretable positive
APPROVED transaction is still saved with a `PROVIDER_*` reason. This preserves
the incoming assertion for review without authorizing fulfillment. An invalid
transaction amount itself is never coerced into a money fact.
Persistence failures return 5xx rather than acknowledging a fact that was not
saved. Normalized late-settlement/obligation failures roll back together; the
same authenticated event can safely retry. Refund processing and a new operator
UI for the durable queue are outside this task.

## Tickets, locking and failure recovery

After CONFIRMED or ALREADY_CONFIRMED settlement, IPN calls the existing
`TicketService.issueTicketsForBooking`. Issuance is a **separate post-commit
transaction**, not an imaginary rollback of payment confirmation. It locks the
Booking, validates confirmed Reservations, creates only missing
`(bookingItemId, sequenceNo)` rows, and preserves existing ticket nonces, versions,
codes and issuance timestamps. Concurrent retries converge to the sum of item
quantities. The IPN acknowledges only after issuance completes.

If database issuance fails, the committed Payment/Booking remain successful but IPN returns
5xx. Redelivery runs idempotent settlement and repairs tickets; the existing
issuance service is also the explicit operational recovery entrypoint after a
process crash. An expiry never triggers issuance. Confirmation uses the existing
Booking -> Payment -> Attempt -> Reservations -> VoucherClaim lock order; refund
creation reuses the already locked Payment in that transaction. Expiration and
issuance both serialize on Booking, with no new external side effect in a DB
transaction.

## Hosted checkout, timeout and result UX

The provider builds a signed hosted POST form; no server-to-server charge call is
invented. Payment/Attempt commit precedes form generation/HTTP delivery. A lost
or failed response leaves the eligible pending attempt reusable with the same
reference and authoritative amount. Existing frontend checkout tests cover
ambiguous network failure/retry with the same Booking; the PostgreSQL regression
forces failure at the checkout provider boundary after DB commit.

Result refresh/polling performs customer-owned GET reads only. Return values
`success`, `error`, `cancel` are hints and cannot confirm payment or create tickets.
Bounded polling and unmount cleanup remain in the existing query/timer lifecycle;
deadline expiry does not mark anything FAILED. Received payment plus expired
Booking explicitly displays pending refund handling, never booking success or a
completed transfer. Ownership errors hide financial details.

## Running and CI

Use the existing dedicated PostgreSQL and `.env.test` guard documented in
[INTEGRATION_TESTING.md](INTEGRATION_TESTING.md). Never target a developer DB.

```sh
pnpm --filter backend test:integration:prepare
pnpm --filter backend test:payment-edge-cases
pnpm --filter backend test:integration
pnpm --filter backend test:integration --sequence.shuffle --sequence.seed=20261022
```

The focused command selects payment-edge-cases, existing payment-confirmation,
concurrency and rollback specs. The current integration CI job already includes
all of them through `*.int-spec.ts`; it does not run the focused selection again.
The workflow also triggers for `test/payment-edge-cases`. All provider responses
are synthetic. Historical migrations are unchanged; one additive migration is
required for the durable queue. Deploy it before using the changed payment code.

## Final verification and scenario matrix (2026-10-22)

The first PostgreSQL regression run failed in four expected places: zero tickets
instead of five, zero late refund obligations, and no table for under/overpayment
facts. A further focused regression proved APPROVED transaction/order mismatches
were only logged. These failures were fixed, not skipped or weakened.

| Scenario / tests reused or added | File(s) | Result | Critical state verified |
| --- | --- | --- | --- |
| 10 sequential IPNs; concurrent duplicates | payment-edge-cases.int-spec.ts; concurrency.int-spec.ts | PASS | One settlement; exactly required tickets; stable tokens/timestamps |
| Missing, wrong, malformed authentication | Existing payment-confirmation plus new edge cases | PASS | 401; no aggregate/ticket/exception mutation |
| Unknown/wrong reference and transaction collision | Existing payment-confirmation plus edge cases | PASS | No fallback match or second Booking confirmation; durable review |
| Under/overpayment and currency mismatch | payment-edge-cases.int-spec.ts | PASS | Original expected money unchanged; received assertion persisted once |
| Disagreeing provider fields | New unit regression plus payment-edge-cases.int-spec.ts | PASS | Positive approved transaction preserved; no fulfillment |
| Missing/malformed/zero/overflow amounts | Existing normalization/E2E plus edge cases | PASS | No 500, false success or coerced money |
| Late success, duplicates, reassigned capacity | payment-edge-cases.int-spec.ts | PASS | EXPIRED stays expired; B keeps capacity; one full PENDING refund; no A tickets |
| Initiation timeout and retries | Edge cases; existing checkout component/browser tests | PASS | Same persisted Payment/Attempt/reference; no automatic FAILED state |
| Delayed IPN, refresh and return hints | Real status API tests; frontend result/checkout/state tests; existing Chromium tests | PASS | Reads do not mutate/initialize; backend remains authoritative |
| Wrong customer | Existing PostgreSQL payment test; new result component test | PASS | 403; financial details hidden |
| Payment/expiration races | Extended concurrency.int-spec.ts | PASS | Coherent Booking/Reservation/Voucher, exact ticket/refund counts |
| Confirmation/hold rollback | Existing transaction-rollback.int-spec.ts | PASS | No partial financial, voucher or reservation writes |
| Late refund persistence failure | payment-edge-cases.int-spec.ts | PASS | Payment/Attempt/review/refund rollback; same event safely retries |
| Post-commit ticket failure | payment-edge-cases.int-spec.ts | PASS | Confirmation retained; issuance unit rolls back; retry creates exactly five tickets |

Backend test paths in this table are relative to `apps/backend/test/integration`
unless an existing unit/E2E suite is explicitly mentioned.

| Command / check | Actual result |
| --- | --- |
| `test:integration:prepare` on recreated empty PostgreSQL server | PASS: validate, generate, all 23 migrations, status up to date |
| Final `test:integration` | 85/85 PASS, 7 files, 172.35s |
| Final shuffled repeat, seed 20261022 | 85/85 PASS, 7 files, 174.94s |
| `test:payment-edge-cases` | 55/55 PASS, 4 files, 129.21s |
| Backend unit suite | 291/291 PASS, 32 files, 15.54s |
| Backend `test:e2e`, explicitly targeting isolated DB with synthetic environment | 290/290 PASS, 25 files, 471.23s |
| Targeted frontend Vitest (one threads worker) | 24/24 PASS, 3 files, 98.80s |
| Chromium `e2e/payment-checkout.spec.ts` | 7/7 PASS, 1.6m |
| Backend lint/build; frontend changed-file lint and full TypeScript | PASS |
| Workflow YAML/trigger/suite selection | PASS; no redundant focused CI execution |

All final test runs above have zero failures and zero skipped critical tests.
Remote GitHub Actions has not been run or observed for this unpushed branch.
The new migration is additive and historical migration files were not edited.
Final guarded cleanup after E2E verified 26 business tables with zero remaining
fixture rows. The test migration history is preserved.
