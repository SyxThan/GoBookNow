-- PostgreSQL partial unique index protects the one-active-application
-- invariant even when submissions race across application instances.
CREATE UNIQUE INDEX "vendor_applications_one_pending_per_vendor"
ON "vendor_applications"("vendor_id")
WHERE "status" = 'PENDING';
