# GoBook Payment API Contract

This document defines the Payment schema and the implemented SePay checkout
initiation contract. Payment confirmation and webhook processing remain future
work.

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
callbacks, not the future server-to-server IPN URL. Configured callbacks must
be publicly reachable.

```dotenv
SEPAY_ENV=sandbox
SEPAY_MERCHANT_ID=
SEPAY_SECRET_KEY=
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

## Future Webhook Mapping

```text
SePay IPN order.order_invoice_number
  -> PaymentAttempt.merchantReference
  -> provider transaction ID
  -> exact amount
  -> PaymentAttempt
  -> Payment
  -> Booking
```

Signature verification, webhook authentication, matching logic, sanitized
audit storage, and transactional processing belong to `feat/sepay-webhook`.
The schema does not store raw webhook payloads.

## Future Success Flow

```text
Booking PENDING_PAYMENT + Reservation HELD
  -> Payment PENDING
  -> PaymentAttempt SEPAY PENDING
  -> display VietQR
  -> customer transfers money
  -> verified SePay webhook
  -> PaymentAttempt SUCCEEDED
  -> Payment SUCCEEDED
  -> Booking CONFIRMED
  -> Reservation CONFIRMED
```

The final four writes must happen transactionally after locking and re-checking
Payment and Booking.

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

The current Booking expiration worker is not changed by this schema task.

## Concurrency and Consistency

Payment confirmation and Booking expiration may race. Both flows must lock and
re-check state so only one valid conditional transition wins. Expiration must
not overwrite `SUCCEEDED`/`CONFIRMED`.

Future consistency rules include:

- `Booking CONFIRMED` implies `Payment SUCCEEDED`.
- `Booking EXPIRED` prevents a later Payment success transition.
- cancellation before payment moves a pending Payment to `CANCELLED`.

There is no generic Payment status PATCH and no Payment delete endpoint.
Financial records remain available as lifecycle history.
