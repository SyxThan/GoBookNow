# GoBook Payment API Contract

This document defines the Payment schema, SePay checkout initiation, Payment
Gateway IPN confirmation, and the authoritative payment-result contract.

## Architecture

```text
Booking 1
  └── 0..1 Payment
          └── 1..N PaymentAttempt
                    └── PaymentProvider (currently SEPAY)
```

`Payment` is the provider-agnostic payment obligation for one Booking.
`PaymentAttempt` is one immutable provider execution attempt. A retry creates a
new attempt instead of replacing a failed row or creating another Payment.

The provider belongs to the attempt so future retries may use different
providers while retaining the same Payment aggregate.

## Money and Snapshots

Money is PostgreSQL `BIGINT`, application `bigint`, and an integer decimal
string over HTTP:

```json
{
  "amount": "300000",
  "currency": "VND"
}
```

At Payment creation:

```text
Payment.amount = Booking.totalAmount
Payment.currency = Booking.currency
```

The Payment amount must never be recalculated from current `Service.priceAmount`
or `Slot.priceAmount`. At attempt creation, amount and currency are copied from
Payment. MVP does not support conversion or partial payment.

Zero is schema-valid for free Bookings. SePay initiation rejects a zero-value
Booking; free confirmation is a separate business case.

## Conceptual Payment Response

```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "status": "PENDING",
  "amount": "300000",
  "currency": "VND",
  "createdAt": "2026-09-27T09:00:00.000Z",
  "attempts": []
}
```

## SePay Checkout Initiation

```http
POST /api/v1/payments/sepay
Authorization: Bearer <customer-access-token>
Content-Type: application/json
```

Request:

```json
{
  "bookingId": "uuid"
}
```

The client must not send `amount`, `currency`, `customerId`, status, or
`providerTransactionId`. The backend resolves ownership, status, expiry,
`Booking.totalAmount`, and `Booking.currency`.

Before creating an attempt, the backend uses PostgreSQL time and requires:

```text
Booking.status = PENDING_PAYMENT
Booking.expiresAt > database NOW()
Payment.status = PENDING
all Booking Reservations = HELD and unexpired
Booking.totalAmount > 0
Booking.currency = VND
```

A `SUCCEEDED`, `EXPIRED`, or `CANCELLED` Payment rejects initiation. Attempt
expiry is the Booking hold expiry and therefore never extends the hold:

```text
attempt.expiresAt = min(provider expiry, Booking.expiresAt)
```

Response:

```json
{
  "paymentId": "uuid",
  "attemptId": "uuid",
  "provider": "SEPAY",
  "status": "PENDING",
  "amount": "300000",
  "currency": "VND",
  "merchantReference": "GBK8F2K91AB12CD34EF",
  "paymentUrl": "https://pay-sandbox.sepay.vn/v1/checkout/init",
  "method": "POST",
  "formFields": {
    "merchant": "sandbox-merchant-id",
    "operation": "PURCHASE",
    "payment_method": "BANK_TRANSFER",
    "order_invoice_number": "GBK8F2K91AB12CD34EF",
    "order_amount": "300000",
    "currency": "VND",
    "signature": "signed-checkout-value"
  },
  "expiresAt": "2026-09-27T09:10:00.000Z"
}
```

`paymentUrl` is an HTML form action, not a normal GET redirect. The frontend
must create a form whose method is `POST`, add every `formFields` entry as a
hidden input, append the form to the document, and submit it:

```js
const form = document.createElement("form");
form.method = response.method;
form.action = response.paymentUrl;
for (const [name, value] of Object.entries(response.formFields)) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  form.appendChild(input);
}
document.body.appendChild(form);
form.submit();
```

The integration uses the official `sepay-pg-node` SDK with `PURCHASE` and
`BANK_TRANSFER`. `SEPAY_ENV` defaults to `sandbox`; production is selected only
through configuration. Optional success/error/cancel URLs are browser redirect
callbacks, not the server-to-server IPN URL. The backend appends `paymentId`
and a non-authoritative `return=success|error|cancel` hint to each configured
callback. Configure all three base URLs to the frontend `/payment/result`
route. The result page always reads backend state before rendering an outcome.

```dotenv
SEPAY_ENV=sandbox
SEPAY_MERCHANT_ID=
SEPAY_SECRET_KEY=
SEPAY_IPN_SECRET=
SEPAY_SUCCESS_URL=
SEPAY_ERROR_URL=
SEPAY_CANCEL_URL=
```

Real merchant credentials must stay in local/deployment secrets and must never
be committed.

The SDK currently types `order_amount` as a JavaScript `number`. The adapter
keeps money as `bigint` until the provider boundary and refuses values above
`Number.MAX_SAFE_INTEGER` before converting. Response form values are strings.

## References and Idempotency Foundation

`merchantReference` is a globally unique, server-generated GoBook reference.
It is sent to SePay as `order_invoice_number`:

```text
PaymentAttempt.merchantReference = SePay order_invoice_number
```

`providerTransactionId` is assigned by SePay/provider. The database uniqueness
constraint on `(provider, providerTransactionId)` prevents the same provider
transaction from being applied twice while allowing multiple null values before
a provider ID is known.

The two values are distinct and must never be substituted for each other.

## SePay Payment Gateway IPN

```http
POST /api/v1/webhooks/sepay/ipn
X-Secret-Key: <configured-provider-secret>
Content-Type: application/json
```

This endpoint is public from the Bearer JWT perspective because SePay calls it
server-to-server. It authenticates with the distinct `SEPAY_IPN_SECRET` value.
GoBook hashes the received and configured values with SHA-256 and compares the
fixed-length digests with a timing-safe comparison. Secrets and full payloads
must never be logged.

This is the SePay **Payment Gateway IPN** contract. It must not be confused
with a generic bank-account webhook or its signature/timestamp authentication.

For `ORDER_PAID`, the mapping is:

```text
order.order_invoice_number -> PaymentAttempt.merchantReference
transaction.transaction_id -> PaymentAttempt.providerTransactionId
```

### Strict payment matching

The webhook normalizes provider fields once and delegates identity resolution to
the reusable `PaymentMatchingService`:

```text
SePay Gateway IPN
  -> SePay transaction normalizer
  -> PaymentMatchingService
  -> PaymentAttempt (exact merchantReference)
  -> Payment (Attempt relation)
  -> Booking (Payment relation)
```

The matcher uses the following checks, in order:

1. exact `merchantReference` lookup (no trimming, case folding, substring, or
   prefix/suffix matching);
2. provider equality (`SEPAY`);
3. exact integer amount equality across the incoming transaction,
   `PaymentAttempt`, `Payment`, and immutable Booking total snapshot;
4. exact currency equality across those records (currently `VND` only);
5. consistency with the Attempt's existing `providerTransactionId` and global
   uniqueness of `(provider, providerTransactionId)`;
6. Payment/Attempt state processability.

**Amount alone is never a matching key.** For example, if Booking A has
`GBKA / 250000` and Booking B has `GBKB / 250000`, an incoming
`GBKA / 250000` resolves only to Booking A. An incoming
`UNKNOWN / 250000` is unmatched; GoBook does not guess A or B and does not
fall back to amount, Customer, recency, or Booking timestamps.

An exact identity in an expired, cancelled, failed, or otherwise inconsistent
Payment/Attempt state remains identity-matched but is marked unprocessable.
This prevents reassignment to another Booking. The same transaction ID on the
same already-succeeded aggregate is recognized as an idempotent duplicate. A
different transaction ID on that Attempt, or an ID already attached to another
SePay Attempt, is a `TRANSACTION_ID_CONFLICT` and is never overwritten.

Unknown references, amount/currency mismatches, late payments, invalid states,
and transaction collisions are acknowledged and logged with sanitized local
identifiers as candidates for future manual reconciliation. They are never
auto-attached. The matching service is read-only; state mutation remains in the
transactional IPN processor.

GoBook requires `order_status=CAPTURED`, `transaction_type=PAYMENT`, and
`transaction_status=APPROVED`. Both provider amount fields must exactly match
both the Attempt and Payment snapshots. VND strings such as `250000` and
`250000.00` normalize to integer `bigint`; fractions, signs, whitespace,
scientific notation, and malformed values are rejected. Both provider currency
fields and both local snapshots must be `VND`.

Processing locks and re-checks Booking, Payment, then PaymentAttempt inside one
database transaction. A valid transition writes:

```text
PaymentAttempt PENDING -> SUCCEEDED
Payment PENDING        -> SUCCEEDED
Booking                -> UNCHANGED
Reservation            -> UNCHANGED
```

The same provider transaction on the same successful Attempt is an idempotent
no-op. A different transaction already stored on the Attempt, or the same
SePay transaction assigned to another Attempt, is acknowledged without
confirming the Payment and logged for reconciliation. Terminal expired,
cancelled, or failed state is never resurrected. Unknown references do not
create financial records.

Authenticated semantic events that redelivery cannot fix are acknowledged
with HTTP 200 and sanitized reconciliation logging. Invalid credentials return
401, structurally invalid payloads return 400, and transient internal failures
return 5xx so SePay may retry.

`TRANSACTION_VOID` is authenticated and acknowledged but does not reverse a
successful Payment or Booking. Void/refund modeling and reconciliation are
future work. Complete IPN payloads are not persisted.

## Payment Result Status API

```http
GET /api/v1/payments/:paymentId
Authorization: Bearer <customer-access-token>
```

The Payment must belong to the authenticated Customer through
`Payment -> Booking -> customerId`; another Customer receives 403. The response
contains only result-page fields and never exposes provider transaction IDs or
merchant credentials:

```json
{
  "id": "uuid",
  "status": "PENDING",
  "amount": "250000",
  "currency": "VND",
  "booking": {
    "id": "uuid",
    "status": "PENDING_PAYMENT"
  },
  "expiresAt": "2026-09-29T08:10:00.000Z"
}
```

## Authority Boundary and Result UX

```text
SePay Checkout
  |-- browser callback -> /payment/result
  |                         -> authenticated status query/polling
  |
  `-- IPN -> GoBook backend
              -> X-Secret-Key authentication
              -> merchantReference match
              -> exact money/currency/status validation
              -> PaymentAttempt SUCCEEDED
              -> Payment SUCCEEDED
```

The browser callback only says which browser route SePay returned to. It is
never proof of payment. In particular, manually opening
`/payment/result?paymentId=<valid>&return=success` cannot render a paid state
while the backend Payment is `PENDING`.

The result page polls roughly every 2.5 seconds while Payment is pending. A
successful browser hint with pending backend state renders "Đang xác nhận thanh
toán...". `Payment SUCCEEDED` with `Booking PENDING_PAYMENT` renders that the
payment was received and booking confirmation is still in progress.
`Payment SUCCEEDED` with `Booking CONFIRMED` renders final success. Cancel/error
callbacks still display a successful payment if that is the backend state.

## Current Success Boundary

```text
Booking PENDING_PAYMENT + Reservation HELD
  -> Payment PENDING
  -> PaymentAttempt SEPAY PENDING
  -> customer pays
  -> authenticated and validated SePay Gateway IPN
  -> PaymentAttempt SUCCEEDED
  -> Payment SUCCEEDED
  -> future feat/booking-confirmation
  -> Booking CONFIRMED
  -> Reservation CONFIRMED
```

Until `feat/booking-confirmation`, `Payment SUCCEEDED` with Booking still
`PENDING_PAYMENT` is an explicit temporary consistency window. This IPN handler
must not hide Booking or Reservation confirmation logic.

## IPN Deployment and Sandbox Configuration

Configure SePay Dashboard -> Cổng thanh toán -> Cấu hình -> IPN with:

```text
URL: https://<public-backend>/api/v1/webhooks/sepay/ipn
Authentication: SECRET_KEY
Secret: the deployment's SEPAY_IPN_SECRET value
```

The endpoint must be publicly reachable over HTTPS. `localhost` is not
reachable by SePay. Local development may manually use an external HTTPS
tunnel, but tunnel tooling and temporary URLs do not belong in the repository.
Never commit the real IPN secret. Checkout signing continues to use the
separate `SEPAY_SECRET_KEY` configuration variable.

## Retry and Expiration

```text
Payment PENDING
  -> Attempt #1 FAILED (retained)
  -> customer retries
  -> Attempt #2 PENDING (new row)
```

Payment remains `PENDING` until it succeeds, expires, or is cancelled.

Initiation reuses the newest `SEPAY` attempt whose status is `PENDING` and
whose expiry is later than database `NOW()`. It regenerates signed form fields
from that attempt's stored reference, amount, and currency. A terminal or
expired attempt is never reset to `PENDING`; a retry creates a new row.

Booking-row locking serializes simultaneous initiation requests. Together with
the unique `Payment.bookingId` constraint this prevents duplicate Payments and
lets double-submit requests converge on the same usable attempt.

Checkout-field generation is local. If configuration/signing fails, the
attempt stays `PENDING` and a later request can safely reuse it after the
configuration is fixed. No Payment, Booking, or Reservation is marked
successful during initiation.

Future expiration synchronization:

```text
Booking PENDING_PAYMENT -> EXPIRED
Payment PENDING -> EXPIRED
all related PENDING attempts -> EXPIRED
```

The Booking expiration worker locks the Booking and skips expiration when its
Payment is already `SUCCEEDED`. This closes the payment-first side of the IPN
versus expiry race without confirming Booking or Reservation.

## Concurrency and Consistency

Payment confirmation and Booking expiration may race. The IPN flow locks and
re-checks Booking, Payment, and Attempt, uses database time, and acknowledges
late money without resurrecting an expired/cancelled aggregate. Such events
are logged for manual reconciliation.

Consistency rules include:

- `Booking CONFIRMED` implies `Payment SUCCEEDED`.
- `Booking EXPIRED` prevents a later Payment success transition.
- cancellation before payment moves a pending Payment to `CANCELLED`.

There is no generic Payment status PATCH and no Payment delete endpoint.
Financial records remain available as lifecycle history.
