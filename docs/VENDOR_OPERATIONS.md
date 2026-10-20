# Vendor operations (MVP)

## Setup and migration

Set `PLATFORM_COMMISSION_BPS` explicitly in the backend environment before
creating new Booking Holds. It is an integer from 0 to 10000; for example,
`1000` means 10% of the post-voucher net amount. Missing/invalid configuration
rejects creation rather than inventing a rate. Apply the new additive Prisma
migration `20261020120000_vendor_commission_snapshot`. Nullable fields preserve
old Bookings with unknown commission terms; there is no backfill or repricing.

## API access

All routes require a JWT with `VENDOR` role and an approved, non-deleted Vendor
profile. Scope is resolved from the JWT owner through `Vendor.id` and
`Booking.vendorId`, never from a client-supplied `vendorId`. `ADMIN` and
`CUSTOMER` roles do not implicitly inherit Vendor access.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/vendor/bookings` | Server-paginated list, `status=UPCOMING\|COMPLETED\|CANCELLED\|ALL`, `search`, `serviceId`, `page`, `limit` (1–100), `sort=asc\|desc`, `from`, `to` |
| `GET /api/v1/vendor/bookings/:bookingId` | Owned Booking detail, item snapshots, Ticket status counts, original commission and retained estimates |
| `GET /api/v1/vendor/dashboard/overview` | Booking counts, payment-cohort finance, occupancy, daily paid-revenue trend |
| `GET /api/v1/vendor/dashboard/revenue` | Financial part of overview and trend |
| `GET /api/v1/vendor/dashboard/occupancy` | Occupancy part of overview |

`from` is inclusive; `to` is exclusive. Send ISO-8601 instants with `Z` or an
explicit offset. Dashboard defaults to the last 30 days and limits a selected
range to 366 days. Booking list `from/to` uses `Booking.createdAt`; dashboard
finance uses `Payment.succeededAt`, counts use `Booking.createdAt`, occupancy
uses `Slot.startAt`. The frontend converts Vietnamese calendar days to
Asia/Ho_Chi_Minh midnight boundaries.

## Financial interpretation

`Booking.subtotalAmount` is gross, `voucherDiscountAmount` is discount, and
`totalAmount` is net after discount. Platform fee is
`floor(net * snapshottedBps / 10000)` and Vendor amount is the difference.
The customer Payment still equals net; no extra fee is charged. Multi-item
Booking fee allocation is deterministic and reconciles to the Booking fee.

Dashboard paid revenue includes only successful Payments in the selected
payment cohort. Successful Refunds for those Payments are deducted as of query
time; pending Refunds are shown separately and are not yet deducted. Retained
platform/Vendor shares use the original Booking rate against paid minus
succeeded Refunds. Thus a late Refund can change the retained estimate for an
earlier payment cohort. This is **not** transaction-date cash flow. Null legacy
commission snapshots are counted as unknown and excluded from fee/earnings
estimates, not silently assigned today's rate.

`UPCOMING` and `COMPLETED` are derived from confirmed Booking item end-time
snapshots and database `NOW()`, not persisted statuses or check-in outcomes.
Cancelled Bookings are in the cancelled group even if their Slots are future.
Occupancy is confirmed Reservation quantity divided by eligible Slot capacity;
active Holds are separate, and Ticket check-in is attendance, not occupancy.

`vendorAmount` and retained Vendor earnings are estimates of economic share.
Vendor payout, settlement, real bank transfer, and a historical cash-flow
ledger are outside this release.
