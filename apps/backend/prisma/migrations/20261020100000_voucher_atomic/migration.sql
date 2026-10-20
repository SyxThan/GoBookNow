-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE "VoucherClaimStatus" AS ENUM ('RESERVED', 'REDEEMED', 'RELEASED');

-- CreateTable
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "type" "VoucherType" NOT NULL,
    "fixed_amount" BIGINT,
    "percentage_bps" INTEGER,
    "min_order_amount" BIGINT NOT NULL DEFAULT 0,
    "max_discount_amount" BIGINT,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3) NOT NULL,
    "usage_limit" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vouchers_code_normalized" CHECK (
        "code" = upper(btrim("code")) AND "code" ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
    ),
    CONSTRAINT "vouchers_type_config" CHECK (
        ("type" = 'FIXED'::"VoucherType" AND "fixed_amount" IS NOT NULL AND "fixed_amount" > 0 AND "percentage_bps" IS NULL)
        OR ("type" = 'PERCENTAGE'::"VoucherType" AND "fixed_amount" IS NULL AND "percentage_bps" IS NOT NULL AND "percentage_bps" BETWEEN 1 AND 10000)
    ),
    CONSTRAINT "vouchers_amounts_valid" CHECK (
        "min_order_amount" >= 0 AND ("max_discount_amount" IS NULL OR "max_discount_amount" > 0)
    ),
    CONSTRAINT "vouchers_dates_valid" CHECK ("valid_until" > "valid_from"),
    CONSTRAINT "vouchers_usage_limit_valid" CHECK ("usage_limit" > 0)
);

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "voucher_discount_amount" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "voucher_id" UUID,
ADD COLUMN "voucher_snapshot" JSONB;

ALTER TABLE "booking_items" ADD COLUMN "voucher_discount_amount" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_voucher_discount_valid" CHECK (
    "voucher_discount_amount" >= 0 AND "voucher_discount_amount" <= "subtotal_amount"
);
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_voucher_discount_valid" CHECK (
    "voucher_discount_amount" >= 0 AND "voucher_discount_amount" <= "subtotal_amount"
);

-- CreateTable
CREATE TABLE "voucher_claims" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "status" "VoucherClaimStatus" NOT NULL DEFAULT 'RESERVED',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "reserved_at" TIMESTAMPTZ(3) NOT NULL,
    "redeemed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "voucher_claims_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voucher_claims_state_timestamps" CHECK (
        ("status" = 'RESERVED'::"VoucherClaimStatus" AND "redeemed_at" IS NULL AND "released_at" IS NULL)
        OR ("status" = 'REDEEMED'::"VoucherClaimStatus" AND "redeemed_at" IS NOT NULL AND "released_at" IS NULL)
        OR ("status" = 'RELEASED'::"VoucherClaimStatus" AND "redeemed_at" IS NULL AND "released_at" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");
CREATE INDEX "vouchers_is_active_valid_from_valid_until_idx" ON "vouchers"("is_active", "valid_from", "valid_until");
CREATE INDEX "bookings_voucher_id_idx" ON "bookings"("voucher_id");
CREATE UNIQUE INDEX "voucher_claims_booking_id_key" ON "voucher_claims"("booking_id");
CREATE INDEX "voucher_claims_voucher_id_status_expires_at_idx" ON "voucher_claims"("voucher_id", "status", "expires_at");
CREATE INDEX "voucher_claims_status_expires_at_idx" ON "voucher_claims"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voucher_claims" ADD CONSTRAINT "voucher_claims_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voucher_claims" ADD CONSTRAINT "voucher_claims_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
