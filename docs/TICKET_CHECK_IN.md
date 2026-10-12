# Ticket Check-In

## Implemented flow

```text
Customer QR
  -> /vendor/check-in camera or manual fallback
  -> POST /api/v1/vendor/tickets/validate
  -> safe Ticket / Service / Slot preview
  -> explicit operator confirmation
  -> POST /api/v1/vendor/tickets/check-in
  -> atomic ISSUED -> CHECKED_IN
```

Scanning never performs the mutation automatically. The browser pauses after
the first decoded frame, and repeated camera frames cannot create a burst of
validation or check-in requests. The operator must press `Xác nhận check-in`.
`Quét vé tiếp theo` clears the in-memory credential and resumes the camera.
Credentials are not placed in URLs or persisted to local storage.

The camera implementation uses browser media APIs through ZXing and releases
its scanner controls and media tracks when paused or unmounted. Production
scanner pages require HTTPS; localhost is an acceptable secure context for
local development. Permission denial, missing/busy cameras, and unsupported
browsers leave the manual token input available.

## Command API

```http
POST /api/v1/vendor/tickets/check-in
Authorization: Bearer <vendor-access-token>
Content-Type: application/json

{ "token": "<opaque-ticket-token>" }
```

Only `token` is accepted. Actor, Vendor, timestamp, Ticket status, Booking, and
customer identity are not client-owned input. The endpoint requires a valid
JWT with the `VENDOR` role and a non-deleted `APPROVED` Vendor owned by
`auth.sub`.

Ownership is derived from authoritative rows:

```text
Ticket -> BookingItem -> Booking.vendorId -> Vendor.ownerUserId
```

Cross-Vendor access returns `403` without returning Ticket metadata.

## Transaction and validation

The command verifies the opaque credential through
`TicketTokenService.verifyAndResolveToken()`. It rejects cross-Vendor requests
before lock contention, then starts a transaction and:

1. locks the Ticket with `SELECT ... FOR UPDATE`;
2. verifies the credential again against the locked transaction state;
3. re-reads the complete Ticket/Booking/Service/Slot context;
4. reuses `TicketValidationService` policy with transaction-scoped PostgreSQL
   `NOW()`;
5. conditionally updates only a row still in `ISSUED` status;
6. commits `CHECKED_IN`, `checkedInAt`, and `checkedInByUserId` together.

Required state is an `ISSUED` Ticket, a `CONFIRMED` Booking, matching Vendor
ownership, a non-cancelled Slot, and `slot.startAt <= NOW() < slot.endAt`.
`Slot.CLOSED` means booking availability is closed and does not invalidate an
otherwise active occurrence. `VOIDED`, cancelled/expired/unconfirmed Bookings,
cancelled/future/elapsed Slots, and inconsistent aggregate relations fail with
a stable business code.

The earlier `/validate` response is only a snapshot and is never trusted as
authorization for the mutation.

## Audit fields

- `Ticket.checkedInAt` is the authoritative PostgreSQL transaction timestamp.
- `Ticket.checkedInByUserId` is the authenticated User ID from JWT `auth.sub`.

Neither value is accepted from the request body. The actor foreign key uses
`ON DELETE RESTRICT`, preserving attribution. This release intentionally does
not add a scan history or re-entry table.

## Duplicate and concurrent scans

A Ticket already in `CHECKED_IN` returns `409 ALREADY_CHECKED_IN` with its
original safe `checkedInAt`. It does not rewrite the timestamp or actor. This
makes a retry after a lost success response safe.

Concurrent scanners serialize on the Ticket row. Exactly one request can
perform `ISSUED -> CHECKED_IN`; later contenders observe `CHECKED_IN` and return
the same conflict. The conditional `WHERE id = ? AND status = ISSUED` update is
an additional database-side guard.

After success, the token remains authentic and its nonce/version are unchanged.
Calling `/validate` again therefore reports `ALREADY_CHECKED_IN` instead of
mislabeling the QR as invalid.

## Security and side effects

- opaque credentials are sent only in POST bodies and are never logged;
- raw token, nonce, signature, customer PII, and payment data are absent from
  responses;
- JWT role, approved Vendor, and authoritative ownership are enforced server
  side;
- validation is repeated inside the mutation transaction;
- check-in changes only Ticket status, audit fields, and normal `updatedAt`;
- Booking, Reservation, Payment, Slot capacity, Service, Vendor, and token
  material are not mutated.

## Current limitations

There is no offline check-in, Vendor staff permission model, re-entry, undo,
analytics dashboard, or full scan history in this release.
