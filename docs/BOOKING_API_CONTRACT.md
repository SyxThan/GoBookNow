# GoBook Booking API Contract

This document defines the future Booking API contract prepared by the
`booking_schema` foundation. Runtime endpoints are intentionally not implemented
in this task.

## Scope

This contract covers:

- `POST /api/v1/bookings`
- `GET /api/v1/bookings/me`
- `GET /api/v1/bookings/:id`
- `POST /api/v1/bookings/:id/cancel`
- customer and vendor ownership rules
- idempotency
- money representation
- Booking and Reservation state rules

This task does not implement reservation locking, capacity enforcement, Redis
TTL, payment, refund, ticketing, or cancellation policy execution.

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

## Create Booking

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

Successful conceptual response:

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

`Idempotency-Key` prepares safe retries for `POST /bookings`.

Same authenticated customer plus same non-null key must represent the same
create request. The schema enforces uniqueness on `(customer_id,
idempotency_key)`.

Future behavior:

- same payload and same key returns the existing booking
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

- reservation locking
- `SELECT FOR UPDATE` capacity enforcement
- concurrent hold algorithm
- Redis TTL
- payment gateway
- VNPay
- payment IPN
- QR ticket
- refund
- voucher
- commission
- cancellation policy execution
