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

## Future scanner flow

```text
Customer QR
  -> Vendor/staff scanner
  -> decoded opaque credential
  -> secure check-in API
  -> TicketTokenService.verifyAndResolveToken()
  -> authorize Vendor/staff and validate Service ownership
  -> require Ticket ISSUED
  -> atomically ISSUED -> CHECKED_IN and set checkedInAt
  -> reject duplicate scans
```

Scanner UI and check-in mutation are not part of this foundation.
