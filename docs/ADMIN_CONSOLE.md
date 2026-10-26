# Admin Console

Application: `apps/admin-console`, default `http://localhost:3003`. Start with `pnpm dev:admin`; build with `pnpm --filter admin-console build`. Every operational page requires backend-confirmed ADMIN.

| Route | Responsibility |
| --- | --- |
| `/login` | Dedicated login and safe internal return |
| `/vendor-applications` | Review queue, status filters and pagination |
| `/vendor-applications/[applicationId]` | Organization, private documents, review/audit history and approve/reject decision |
| `/categories` | Existing category create/update/active controls |
| `/vouchers` | Search/list and deactivate confirmation |
| `/vouchers/new` | Dedicated create form |
| `/vouchers/[voucherId]/edit` | Dedicated edit; immutable code |
| `/transactions` | Real summary, filters and investigation list |
| `/transactions/[paymentId]` | Payment attempts, booking, refund and timeline evidence |

Lavender and reduced shadow emphasis distinguish the console. Navigation groups operations, promotions and finance. Full resource forms and application investigation have their own URLs. Short confirmations remain dialogs; approval explicitly confirms the selected partner, rejection requires a reason. Private downloads still pass through the authenticated backend API.

Money remains decimal strings and percentage input maps exactly to basis points. Frontend edits do not calculate financial truth, change settlement state or claim a refund has completed. Existing read-only transaction investigation and backend audit/ownership rules remain intact. Responsive records prevent broad Admin tables from forcing viewport scrolling.
