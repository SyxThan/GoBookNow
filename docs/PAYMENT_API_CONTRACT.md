# GoBook Payment Domain and Future API Contract

This document defines the Payment schema foundation and the contract expected
by future SePay initiation and webhook tasks. No Payment HTTP endpoint, QR
generation, provider call, or webhook is implemented in this schema task.

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

Zero is schema-valid for free Bookings. Future SePay initiation must not create
a bank transfer attempt for a zero-value Booking; free confirmation is a
separate business case.

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

## Future SePay Initiation

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

Before creating an attempt, the backend must use database time and require:

```text
Booking.status = PENDING_PAYMENT
Booking.expiresAt > database NOW()
Payment.status = PENDING
```

A `SUCCEEDED` Payment returns its existing state without a new attempt.
`EXPIRED` and `CANCELLED` Payments reject initiation. Attempt expiry must be no
later than Booking expiry:

```text
attempt.expiresAt = min(provider expiry, Booking.expiresAt)
```

Conceptual response:

```json
{
  "paymentId": "uuid",
  "attemptId": "uuid",
  "provider": "SEPAY",
  "status": "PENDING",
  "amount": "300000",
  "currency": "VND",
  "merchantReference": "GBK8F2K91",
  "qrCodeUrl": "https://provider.example/qr/...",
  "expiresAt": "2026-09-27T09:10:00.000Z"
}
```

QR fields are not persisted or implemented by this task.

## References and Idempotency Foundation

`merchantReference` is a globally unique, server-generated GoBook reference
used to match an incoming bank transfer to an attempt.

`providerTransactionId` is assigned by SePay/provider. The database uniqueness
constraint on `(provider, providerTransactionId)` prevents the same provider
transaction from being applied twice while allowing multiple null values before
a provider ID is known.

The two values are distinct and must never be substituted for each other.

## Future Webhook Mapping

```text
SePay webhook
  -> merchant/payment reference
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
