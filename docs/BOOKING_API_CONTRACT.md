# GoBook Booking API Contract

This document defines the Booking API contract. `POST /api/v1/bookings/hold`
is implemented as the first runtime Booking endpoint.

## Scope

This contract covers:

- `POST /api/v1/bookings`
- `POST /api/v1/bookings/hold`
- `GET /api/v1/bookings/me`
- `GET /api/v1/bookings/:id`
- `POST /api/v1/bookings/:id/cancel`
- customer and vendor ownership rules
- idempotency
- money representation
- Booking and Reservation state rules

The hold endpoint implements PostgreSQL-backed reservation locking and capacity
enforcement. Payment, refund, ticketing, expiration finalization workers, and
cancellation policy execution remain future tasks.

## Money

All monetary fields are stored in PostgreSQL as `BIGINT`, handled in
application code as `bigint`, and serialized over HTTP as decimal integer
strings.

Correct:

```json
{
  "unitPriceAmount": "150000",
  "subtotalAmount": "300000"
}
```

Incorrect:

```json
{
  "unitPriceAmount": 150000
}
```

MVP currency is `VND`. `Booking.currency` and each `BookingItem.currency` must
match. No currency conversion is part of MVP.

## Create Booking Hold

```http
POST /api/v1/bookings/hold
Authorization: Bearer <customer-access-token>
Idempotency-Key: <unique-client-request-key>
Content-Type: application/json
```

Only authenticated users with the `CUSTOMER` role can create holds. A user with
both `CUSTOMER` and `VENDOR` can still create a customer hold. `customerId` is
always derived from the JWT, never from the body.

Request body:

```json
{
  "items": [
    {
      "slotId": "550e8400-e29b-41d4-a716-446655440000",
      "quantity": 2
    }
  ]
}
```

Rules:

- `Idempotency-Key` is required, trimmed, and limited to 100 characters.
- `items.length` must be 1..10.
- duplicate `slotId` values are rejected.
- `quantity` must be an integer from 1..1000.
- client-supplied price, customer, vendor, service, total, currency, status, or
  expiration fields are rejected.

Successful new hold response: `201 Created`.

Idempotent replay response: `200 OK`.

```json
{
  "id": "uuid",
  "bookingCode": "GBK-20260926-ABC123",
  "status": "PENDING_PAYMENT",
  "currency": "VND",
  "subtotalAmount": "300000",
  "totalAmount": "300000",
  "expiresAt": "2026-09-26T10:10:00.000Z",
  "items": [
    {
      "id": "uuid",
      "serviceId": "uuid",
      "slotId": "uuid",
      "serviceTitle": "Workshop Python",
      "startAt": "2026-10-01T02:00:00.000Z",
      "endAt": "2026-10-01T04:00:00.000Z",
      "quantity": 2,
      "unitPriceAmount": "150000",
      "subtotalAmount": "300000",
      "pricingSource": "SLOT",
      "reservation": {
        "id": "uuid",
        "status": "HELD",
        "expiresAt": "2026-09-26T10:10:00.000Z"
      }
    }
  ]
}
```

The endpoint:

- reads one transaction timestamp from PostgreSQL with `NOW()`.
- locks requested Slot rows in sorted UUID order with `SELECT ... FOR UPDATE`.
- locks related Service rows in sorted UUID order before price snapshot.
- validates public bookability: future `OPEN` Slot, `PUBLISHED` Service,
  `APPROVED` Vendor, active Category, and no soft deletes.
- enforces same Vendor and same currency across all items.
- calculates capacity from active Reservation rows.
- creates Booking, BookingItems, and Reservations in one transaction.
- sets `Booking.expiresAt` and every `Reservation.expiresAt` to the same
  timestamp.

Capacity errors return `409` with code `INSUFFICIENT_CAPACITY`. A reused
idempotency key with a different normalized payload returns `409` with code
`IDEMPOTENCY_CONFLICT`.

An idempotency key that points to an expired hold still returns the existing
idempotent result; clients must use a new key for a new hold attempt.

## Future Create Booking Alias

```http
POST /api/v1/bookings
Authorization: Bearer <customer-access-token>
Idempotency-Key: <unique-client-request-key>
Content-Type: application/json
```

Only authenticated customers can create bookings. `customerId` is always derived
from `request.user.sub`.

Request body:

```json
{
  "items": [
    {
      "slotId": "550e8400-e29b-41d4-a716-446655440000",
      "quantity": 2
    }
  ]
}
```

The request must not accept:

- `customerId`
- `vendorId`
- `serviceId`
- `price`
- `subtotal`
- `total`
- `currency`
- `status`

The server resolves `Slot -> Service -> Vendor -> effective price`. Client price
is never authoritative.

The conceptual response matches the implemented hold response:

```json
{
  "id": "uuid",
  "bookingCode": "GBK-20260926-ABC123",
  "status": "PENDING_PAYMENT",
  "currency": "VND",
  "subtotalAmount": "300000",
  "totalAmount": "300000",
  "expiresAt": "2026-09-26T10:10:00.000Z",
  "items": [
    {
      "id": "uuid",
      "serviceId": "uuid",
      "slotId": "uuid",
      "serviceTitle": "Workshop Python",
      "startAt": "2026-10-01T02:00:00.000Z",
      "endAt": "2026-10-01T04:00:00.000Z",
      "quantity": 2,
      "unitPriceAmount": "150000",
      "subtotalAmount": "300000",
      "pricingSource": "SLOT",
      "reservation": {
        "id": "uuid",
        "status": "HELD",
        "expiresAt": "2026-09-26T10:10:00.000Z"
      }
    }
  ]
}
```

Future creation transaction must guarantee:

- all items belong to one Vendor
- all items use one currency
- every `BookingItem` has exactly one `Reservation`
- every `Reservation.quantity` equals its `BookingItem.quantity`
- `Reservation.expiresAt` equals `Booking.expiresAt` in MVP
- price snapshot is captured before returning the booking
- either all item reservations are held or booking creation fails

## Idempotency

`Idempotency-Key` provides safe retries for hold creation.

Same authenticated customer plus same non-null key must represent the same
create request. The schema enforces uniqueness on `(customer_id,
idempotency_key)`.

- same normalized payload and same key returns the existing booking
- different payload and same key returns `409`
- different customers may reuse the same key
- multiple null keys remain allowed by PostgreSQL uniqueness semantics

Do not derive the key from the request body.

## List Customer Bookings

```http
GET /api/v1/bookings/me?status=PENDING_PAYMENT&page=1&limit=20
Authorization: Bearer <customer-access-token>
```

Returns only bookings where `Booking.customerId` equals the authenticated user.
Future pagination defaults: `page = 1`, `limit = 20`, max `limit = 100`.

Responses must use `BookingItem` snapshot fields for historical display.

## Customer Booking Detail

```http
GET /api/v1/bookings/:id
Authorization: Bearer <customer-access-token>
```

The authenticated customer can read only their own booking. Other customer
access returns `403` or `404` according to the ownership convention active in the
route implementation.

The response must show:

- `Booking.bookingCode`
- `Booking.status`
- `Booking.currency`
- `Booking.subtotalAmount`
- `Booking.totalAmount`
- `BookingItem.serviceTitleSnapshot`
- `BookingItem.slotStartAtSnapshot`
- `BookingItem.slotEndAtSnapshot`
- `Reservation.status`
- `Reservation.expiresAt`

## Vendor Booking Contract

Future vendor routes:

```http
GET /api/v1/vendor/bookings
GET /api/v1/vendor/bookings/:id
```

Vendor access is limited to `Booking.vendorId = currentVendor.id`.

MVP intentionally supports one Vendor per Booking. Multi-vendor checkout is out
of scope.

## Cancel Contract

```http
POST /api/v1/bookings/:id/cancel
Authorization: Bearer <customer-access-token>
```

Cancellation business behavior is not implemented in this schema task. Future
rules depend on Booking state, slot start time, payment/refund state, and
cancellation policy.

No `DELETE /bookings/:id` route should exist. Booking history is a business and
audit record; cancellation changes state instead of deleting rows.

## Status Codes

Future route semantics:

- `400`: invalid request
- `401`: not authenticated
- `403`: not owner or role denied
- `404`: Slot or Booking not found
- `409`: capacity conflict, invalid state, expired hold, idempotency conflict

Use `422` only if the project adopts it consistently.

## Booking State Machine

Allowed transitions:

```text
PENDING_PAYMENT
├── CONFIRMED
├── EXPIRED
└── CANCELLED

CONFIRMED
└── CANCELLED
```

Terminal in the current domain:

```text
EXPIRED
CANCELLED
```

Disallowed examples:

- `EXPIRED -> CONFIRMED`
- `CANCELLED -> CONFIRMED`
- `CONFIRMED -> PENDING_PAYMENT`

Generic PATCH must never set `Booking.status` arbitrarily.

## Reservation State Machine

Allowed transitions:

```text
HELD
├── CONFIRMED
├── EXPIRED
└── RELEASED

CONFIRMED
└── RELEASED
```

Terminal:

```text
EXPIRED
RELEASED
```

Disallowed examples:

- `EXPIRED -> CONFIRMED`
- `RELEASED -> HELD`
- `CONFIRMED -> HELD`

## Capacity Contract

Reservation is the capacity allocation source of truth. `Slot.capacity` is not
decremented and `Slot.remainingCapacity` is not stored.

Future capacity formula:

```text
consumedCapacity =
SUM(quantity)
FROM reservations
WHERE slot_id = target
AND (
  status = 'CONFIRMED'
  OR (status = 'HELD' AND expires_at > now())
)

available = slots.capacity - consumedCapacity
```

A `HELD` reservation with `expiresAt <= now` must not count as active capacity,
even if cleanup has not yet moved it to `EXPIRED`.

## Out Of Scope

- Redis TTL
- payment gateway
- VNPay
- payment IPN
- QR ticket
- refund
- voucher
- commission
- cancellation policy execution
