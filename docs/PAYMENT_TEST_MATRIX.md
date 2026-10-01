# SePay payment test matrix

Automated IPN tests use synthetic payloads and a provider stub. Database suites require an explicit `DATABASE_URL` with a test database name (`test_` prefix or `_test` segment); they create and remove only their own fixtures. The real SePay Sandbox is outside automated coverage.

## Coverage gap review

| Area | Already covered before this branch | Added on this branch |
| --- | --- | --- |
| Initiation | PostgreSQL concurrent creation, one Payment constraint, unit snapshot and ownership checks | Repeated reuse, failed and expired retries, elapsed hold and terminal Booking rejection, free Booking rejection |
| Matching and webhook | Exact reference, same amount isolation, wrong amount and currency, duplicate event, secret authentication | Malformed nested payloads, HTTP currency and transaction collision cases, void event, concurrent authenticated IPNs |
| Confirmation | Multi-item atomic confirmation, capacity, idempotency, settlement race, unit reconciliation cases | PostgreSQL late, cancelled, expired and released Reservation outcomes |
| Frontend | Fake success hint, cancel hint, polling state helper, provider outage and retry component checks | Browser refresh and staged polling regression |

## Expected state and result

| Scenario | Initial Payment | Initial Booking | Initial Reservation | Incoming Event | Expected Payment | Expected Booking | Expected Reservation | Expected HTTP/result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| New initiation | none | PENDING_PAYMENT | HELD | POST SePay | PENDING, one attempt | PENDING_PAYMENT | HELD | 201 checkout form |
| Repeated or concurrent initiation | PENDING | PENDING_PAYMENT | HELD | POST SePay again | Same Payment and active attempt | PENDING_PAYMENT | HELD | 201 same identity |
| Failed or expired attempt retry | PENDING | PENDING_PAYMENT | HELD | POST SePay | Old attempt retained; new PENDING attempt | PENDING_PAYMENT | HELD | 201 new attempt |
| Elapsed or terminal Booking initiation | none | expired, CONFIRMED, or CANCELLED | any | POST SePay | none | unchanged | unchanged | 409 |
| Free Booking initiation | none | PENDING_PAYMENT | HELD | POST SePay | none | unchanged | unchanged | 409 |
| Valid paid event | PENDING | PENDING_PAYMENT | HELD | Exact reference, amount, currency, new transaction ID | SUCCEEDED | CONFIRMED | CONFIRMED | 200 acknowledgment |
| Multi-item paid event | PENDING | PENDING_PAYMENT | HELD on all items | Valid paid event | SUCCEEDED | CONFIRMED | CONFIRMED on all; Slot capacity unchanged | 200 acknowledgment |
| Duplicate paid event | SUCCEEDED | CONFIRMED | CONFIRMED | Same transaction ID | SUCCEEDED; timestamps unchanged | CONFIRMED; timestamp unchanged | CONFIRMED; timestamps unchanged | 200 acknowledgment |
| Unknown reference, including same amount | PENDING | PENDING_PAYMENT | HELD | Unknown merchant reference | PENDING | PENDING_PAYMENT | HELD | 200 acknowledgment, no match |
| Wrong amount or currency | PENDING | PENDING_PAYMENT | HELD | Correct reference, wrong money data | PENDING | PENDING_PAYMENT | HELD | 200 acknowledgment, mismatch logged |
| Transaction ID replacement or global collision | PENDING or SUCCEEDED | PENDING_PAYMENT or CONFIRMED | HELD or CONFIRMED | Reused or changed provider transaction ID | Unchanged | Unchanged | Unchanged | 200 acknowledgment, conflict logged |
| Invalid secret or malformed payload | PENDING | PENDING_PAYMENT | HELD | Missing/wrong secret or invalid structure | PENDING | PENDING_PAYMENT | HELD | 401 or 400 |
| Unsupported void | SUCCEEDED | CONFIRMED | CONFIRMED | TRANSACTION_VOID | SUCCEEDED | CONFIRMED | CONFIRMED | 200 acknowledgment, no reversal |
| Late paid event | PENDING | EXPIRED | EXPIRED | Valid paid event | SUCCEEDED for reconciliation | EXPIRED | EXPIRED | 200 acknowledgment |
| Cancelled Booking paid event | PENDING | CANCELLED | RELEASED | Valid paid event | SUCCEEDED for reconciliation | CANCELLED | RELEASED | 200 acknowledgment |
| Expired or released Reservation | PENDING | PENDING_PAYMENT | Mixed HELD and EXPIRED/RELEASED | Valid paid event | SUCCEEDED for reconciliation | PENDING_PAYMENT | Unchanged; no partial confirmation | 200 acknowledgment |
| Payment versus expiration | PENDING | PENDING_PAYMENT before or after expiry | HELD before or after expiry | Settlement and sweep concurrently | SUCCEEDED if paid event recorded | CONFIRMED or EXPIRED | Matches Booking terminal state | Internally consistent |
| Browser success or cancel hint | authoritative backend state | authoritative backend state | n/a | Return URL or refresh | Unchanged | Unchanged | Unchanged | UI follows backend; polls until terminal |

`SUCCEEDED` with an unconfirmed Booking is a reconciliation state, not a successful reservation. Refund and reconciliation automation are not part of this test branch.
