-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'CONFIRMED', 'EXPIRED', 'RELEASED');

-- CreateEnum
CREATE TYPE "PricingSource" AS ENUM ('SERVICE', 'SLOT');

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "booking_code" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "subtotal_amount" BIGINT NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "expired_at" TIMESTAMPTZ(3),
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bookings_subtotal_amount_non_negative_check" CHECK ("subtotal_amount" >= 0),
    CONSTRAINT "bookings_total_amount_non_negative_check" CHECK ("total_amount" >= 0)
);

-- CreateTable
CREATE TABLE "booking_items" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_amount" BIGINT NOT NULL,
    "subtotal_amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "pricing_source" "PricingSource" NOT NULL,
    "service_title_snapshot" VARCHAR(160) NOT NULL,
    "slot_start_at_snapshot" TIMESTAMPTZ(3) NOT NULL,
    "slot_end_at_snapshot" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_items_quantity_positive_check" CHECK ("quantity" > 0),
    CONSTRAINT "booking_items_unit_price_amount_non_negative_check" CHECK ("unit_price_amount" >= 0),
    CONSTRAINT "booking_items_subtotal_amount_non_negative_check" CHECK ("subtotal_amount" >= 0)
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "booking_item_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expires_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservations_quantity_positive_check" CHECK ("quantity" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_code_key" ON "bookings"("booking_code");

-- CreateIndex
CREATE INDEX "bookings_customer_id_created_at_idx" ON "bookings"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_customer_id_status_idx" ON "bookings"("customer_id", "status");

-- CreateIndex
CREATE INDEX "bookings_vendor_id_created_at_idx" ON "bookings"("vendor_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_vendor_id_status_idx" ON "bookings"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_customer_id_idempotency_key_key" ON "bookings"("customer_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "booking_items_booking_id_idx" ON "booking_items"("booking_id");

-- CreateIndex
CREATE INDEX "booking_items_service_id_idx" ON "booking_items"("service_id");

-- CreateIndex
CREATE INDEX "booking_items_slot_id_idx" ON "booking_items"("slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_booking_item_id_key" ON "reservations"("booking_item_id");

-- CreateIndex
CREATE INDEX "reservations_slot_id_idx" ON "reservations"("slot_id");

-- CreateIndex
CREATE INDEX "reservations_slot_id_status_idx" ON "reservations"("slot_id", "status");

-- CreateIndex
CREATE INDEX "reservations_slot_id_status_expires_at_idx" ON "reservations"("slot_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_booking_item_id_fkey" FOREIGN KEY ("booking_item_id") REFERENCES "booking_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
