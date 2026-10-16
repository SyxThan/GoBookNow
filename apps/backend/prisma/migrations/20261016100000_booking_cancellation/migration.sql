-- CreateEnum
CREATE TYPE "BookingCancellationReason" AS ENUM ('CUSTOMER_REQUEST');

-- CreateTable
CREATE TABLE "booking_cancellations" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "refund_id" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "reason_code" "BookingCancellationReason" NOT NULL,
    "reason_note" VARCHAR(500),
    "original_amount" BIGINT NOT NULL,
    "refund_amount" BIGINT NOT NULL,
    "cancellation_fee_amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "policy_result_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_cancellations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_cancellations_amounts_non_negative" CHECK (
        "original_amount" >= 0
        AND "refund_amount" >= 0
        AND "cancellation_fee_amount" >= 0
    ),
    CONSTRAINT "booking_cancellations_amounts_reconcile" CHECK (
        "refund_amount" + "cancellation_fee_amount" = "original_amount"
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_cancellations_booking_id_key" ON "booking_cancellations"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_cancellations_idempotency_key_key" ON "booking_cancellations"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "booking_cancellations_refund_id_key" ON "booking_cancellations"("refund_id");

-- CreateIndex
CREATE INDEX "booking_cancellations_requested_by_user_id_requested_at_idx" ON "booking_cancellations"("requested_by_user_id", "requested_at");

-- CreateIndex
CREATE INDEX "booking_cancellations_requested_at_idx" ON "booking_cancellations"("requested_at");

-- AddForeignKey
ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
