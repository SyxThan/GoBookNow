# Ticket QR Contract

## Architecture

```text
Ticket
  -> TicketTokenService.generateToken()
  -> opaque signed credential
  -> TicketQrService.generatePng()
  -> PNG

Authenticated Customer API
  -> QR Blob
  -> display or download
```

QR images are generated on demand. They are not stored in PostgreSQL, local
uploads, Cloudinary, or object storage. Rendering the QR is read-only: it does
not rotate the nonce, change Ticket status, update timestamps, or mutate the
Booking, Payment, Reservation, or Slot.

## Payload security

The QR payload is exactly the opaque string returned by `TicketTokenService`.
Client applications and scanners must not parse or reconstruct it. The QR does
not contain JSON, Ticket code, customer name, email, phone, Booking details,
service or slot details, amount, payment data, address, or Vendor legal data.

The credential never appears in a URL or metadata JSON response. The frontend
requests an authenticated image by Ticket UUID and treats the returned PNG as a
Blob. Complete credentials, nonces, and signing secrets must not be logged.

## Customer endpoints

```text
GET /api/v1/bookings/:bookingId/tickets
GET /api/v1/tickets/:ticketId/qr
GET /api/v1/tickets/:ticketId/qr?download=true
```

All endpoints require a CUSTOMER Bearer access token. Authorization is derived
only from:

```text
Ticket -> BookingItem -> Booking.customerId == auth.sub
```

The metadata endpoint returns Ticket ID/code/sequence/status/timestamps plus
safe BookingItem snapshots. It never returns `tokenNonce`, `tokenVersion`, a
signed token, or server secrets.

The QR endpoint returns `image/png`. The default disposition is `inline`; the
download mode uses `attachment` and a server-generated safe filename. Responses
use `Cache-Control: private, no-store` and must not be cached by shared proxies.

## Status policy

- `ISSUED`: display and download are allowed.
- `CHECKED_IN`: metadata clearly says already checked in; QR remains available
  as history, while a future scanner must reject duplicate redemption.
- `VOIDED`: metadata remains visible, but display/download is disabled and the
  backend returns `409 TICKET_VOIDED`.
- A Ticket whose Booking is no longer `CONFIRMED` cannot render a QR; the
  backend returns `409 BOOKING_NOT_CONFIRMED`.

## Vendor validation API

```text
POST /api/v1/vendor/tickets/validate
Authorization: Bearer <Vendor access token>
Body: { "token": "<opaque-ticket-token>" }
```

Only a user with the `VENDOR` role and a non-deleted `APPROVED` Vendor profile
may call this endpoint. The token is accepted only in the request body; it is
never accepted in a URL, logged, or echoed in the response. Cryptographic
parsing, HMAC verification, nonce checks, and token version checks remain the
exclusive responsibility of `TicketTokenService.verifyAndResolveToken()`.

Vendor ownership is derived from the authoritative relation:

```text
Ticket -> BookingItem -> Booking.vendorId -> Vendor.ownerUserId
```

Cross-Vendor validation returns `403` before Ticket context is disclosed. The
response contains only safe Ticket, Booking, Service/Event, and Slot context.
It does not contain customer PII, payment data, the credential, nonce,
signature, signing secret, or Vendor legal data. The booked title and booked
times come from BookingItem snapshots; current Slot state and current Slot
times remain authoritative for validation.

Completed validation decisions return HTTP `200`, including expected negative
results such as `INVALID_TOKEN`, `TICKET_VOIDED`, `ALREADY_CHECKED_IN`,
`SLOT_EXPIRED`, and `SLOT_NOT_STARTED`. Authentication, role, approval, and
cross-Vendor failures remain HTTP `401`/`403`; malformed request DTOs return
HTTP `400`.

The result separates three concepts:

- `authentic`: the opaque credential passed cryptographic and stored identity
  checks.
- `valid`: the Ticket entitlement remains valid.
- `checkInEligible`: a future check-in operation may proceed now.
- `reason`: a stable scanner-facing validation decision.

An `ISSUED` Ticket in an active Slot is `VALID`. A future Slot is authentic and
valid but returns `SLOT_NOT_STARTED`; an elapsed Slot returns `SLOT_EXPIRED`.
`CANCELLED` rejects the Ticket, while `CLOSED` only closes booking availability
and does not invalidate attendance by itself. Slot time comparisons use
PostgreSQL `NOW()`, never the scanner device clock.

Validation is strictly read-only. It does not change Ticket status,
`checkedInAt`, nonce/version, Booking, Reservation, Payment, Slot, or capacity.

## Scanner and check-in flow

```text
Customer QR
  -> Vendor/staff scanner
  -> decoded opaque credential
  -> POST /vendor/tickets/validate
  -> TicketTokenService.verifyAndResolveToken()
  -> TicketValidationService
  -> green/yellow/red validation result

POST /vendor/tickets/check-in
  -> revalidate inside its own database transaction
  -> authorize Vendor/staff
  -> require Ticket ISSUED
  -> atomically ISSUED -> CHECKED_IN
  -> set checkedInAt from DB time and checkedInByUserId from auth.sub
  -> reject duplicate/concurrent scans
```

The validation response is a snapshot and has a time-of-check/time-of-use gap.
Check-in does not trust an earlier `VALID` response: it locks the Ticket and
revalidates inside the mutation transaction. The mobile-first scanner lives at
`/vendor/check-in`, pauses after one decoded frame, requires explicit operator
confirmation, and retains a manual token fallback. See `TICKET_CHECK_IN.md`.
