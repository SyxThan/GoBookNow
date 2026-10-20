-- Nullable additions preserve historical bookings whose commission terms are unknown.
ALTER TABLE "bookings"
  ADD COLUMN "commission_bps" INTEGER,
  ADD COLUMN "platform_fee_amount" BIGINT,
  ADD COLUMN "vendor_amount" BIGINT,
  ADD COLUMN "commission_snapshot" JSONB;

ALTER TABLE "booking_items"
  ADD COLUMN "platform_fee_amount" BIGINT,
  ADD COLUMN "vendor_amount" BIGINT;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_commission_bps_check" CHECK ("commission_bps" IS NULL OR "commission_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "bookings_commission_amounts_check" CHECK (
    ("commission_bps" IS NULL AND "platform_fee_amount" IS NULL AND "vendor_amount" IS NULL AND "commission_snapshot" IS NULL)
    OR ("commission_bps" IS NOT NULL AND "platform_fee_amount" IS NOT NULL AND "vendor_amount" IS NOT NULL
      AND "platform_fee_amount" >= 0 AND "vendor_amount" >= 0
      AND "platform_fee_amount" + "vendor_amount" = "total_amount" AND "commission_snapshot" IS NOT NULL)
  );

ALTER TABLE "booking_items"
  ADD CONSTRAINT "booking_items_commission_amounts_check" CHECK (
    ("platform_fee_amount" IS NULL AND "vendor_amount" IS NULL)
    OR ("platform_fee_amount" IS NOT NULL AND "vendor_amount" IS NOT NULL
      AND "platform_fee_amount" >= 0 AND "vendor_amount" >= 0
      AND "platform_fee_amount" + "vendor_amount" = "subtotal_amount" - "voucher_discount_amount")
  );

CREATE INDEX "payments_status_succeeded_at_idx" ON "payments"("status", "succeeded_at");
