# Verified Reviews and Admin Transactions

## Verified Booking Reviews

- Customer routes: `GET /api/v1/bookings/:bookingId/review/eligibility`,
  `POST /api/v1/bookings/:bookingId/review`, `GET /api/v1/bookings/:bookingId/review`,
  `GET /api/v1/reviews/me`, `PATCH /api/v1/reviews/:reviewId`, and
  `DELETE /api/v1/reviews/:reviewId` (idempotent soft delete).
- Public route: `GET /api/v1/vendors/:vendorId/reviews?page=1&limit=20` returns
  review count, average, rating distribution, and anonymized paginated cards.
- Rating is integer 1–5; trimmed optional comment is at most 2,000 characters.
  The server derives Customer and Vendor from Booking, uses database time and
  Booking-row locking during create, then enforces `UNIQUE(booking_id)`.
- A completed Booking is `CONFIRMED`, nonempty, and all BookingItem end
  snapshots have passed. This is a derived view, not a persisted Booking status.
  Review creation cannot be repeated after soft deletion.
- Customer UI is on `/bookings/[bookingId]`; public Vendor aggregate/cards appear
  on service detail. The frontend eligibility display never substitutes for the
  server's authorization and transactional check.

## Admin Transactions

- ADMIN-only, JWT-protected read routes:
  `GET /api/v1/admin/transactions`, `/summary`, and `/:paymentId`.
  CUSTOMER/VENDOR receive 403, unauthenticated requests 401.
- List and summary filters: `search` (Payment/Attempt UUID, merchant reference,
  provider transaction ID), `bookingCode`, `bookingId`, `userId`, `userEmail`,
  `paymentStatus`, `attemptStatus`, `provider`, and `from`/`to`.
  List additionally accepts `page` (default 1), `limit` (default 20, max 100),
  and `sort=newest|oldest`. `from` is inclusive, `to` exclusive; both filter
  `Payment.createdAt`. Default is the last 30 days; maximum span is 366 days.
- List pagination and summary aggregation are Payment-grain. List shows latest
  Attempt and derived Refund state. Summary uses Payment and Refund aggregates
  separately, so multiple Attempts/Refunds cannot multiply Payment totals.
- Detail lists every Attempt, Refund, and actual timestamped event. It exposes
  safe Customer email for Admin investigation, but no credentials, Ticket QR,
  provider payloads, or failure messages. No financial mutation endpoint exists.
- Frontend routes: `/admin/transactions` and
  `/admin/transactions/[paymentId]`. The UI distinguishes Payment status,
  Attempt status, and succeeded versus pending Refund amounts.
