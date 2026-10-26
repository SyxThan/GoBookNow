# Vendor Portal

Application: `apps/vendor-portal`, default `http://localhost:3002`. Start with `pnpm dev:vendor`; build with `pnpm --filter vendor-portal build`.

| Route | Responsibility |
| --- | --- |
| `/login` | Dedicated login, safe local return path |
| `/dashboard` | Real booking, financial, refund and occupancy metrics |
| `/bookings` | Filters, search, pagination, booking list |
| `/bookings/[bookingId]` | One owned booking and its ticket/financial context |
| `/check-in` | Camera or manual token, validate then explicit check-in |
| `/services` | Vendor catalog and lifecycle status |
| `/services/new` | Create draft with existing category/price validation |
| `/services/[serviceId]` | Resource overview, images, publishing and lifecycle confirmations |
| `/services/[serviceId]/edit` | Service fields only; cancel returns to overview |
| `/services/[serviceId]/slots` | Filtered schedule list and explicit status confirmations |
| `/services/[serviceId]/slots/new` | Time, capacity and optional price override for one new slot |
| `/services/[serviceId]/slots/[slotId]/edit` | Edit one owned slot |
| `/profile` | Create/update legal and contact profile |
| `/onboarding/application` | Application documents, submission and history |
| `/onboarding/status` | Vendor review status and next actions |

The Vendor shell uses grouped operations navigation, breadcrumbs and a mobile Radix drawer. It has no marketing footer. Mint marks the portal while shared typography/outlines preserve GoBookNow identity. Resource forms replace nested editing modals; short destructive decisions retain accessible confirmations.

Onboarding/profile allow authenticated CUSTOMER applicants. Operations require backend-confirmed VENDOR and APPROVED status. Backend ownership and lifecycle errors remain visible with support request IDs. Archived services are read-only for schedule mutation; soft deletion preserves booking history. Slot overlap, duration, booked-capacity limits, prices and ticket eligibility remain backend rules. Camera denial has manual entry fallback; validation never itself performs check-in.
