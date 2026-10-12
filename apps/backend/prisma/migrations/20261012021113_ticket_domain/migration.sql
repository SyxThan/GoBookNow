-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ISSUED', 'CHECKED_IN', 'VOIDED');

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "booking_item_id" UUID NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "ticket_code" VARCHAR(40) NOT NULL,
    "token_nonce" VARCHAR(64) NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "status" "TicketStatus" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_at" TIMESTAMPTZ(3),
    "voided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tickets_sequence_no_positive_check" CHECK ("sequence_no" > 0),
    CONSTRAINT "tickets_token_version_positive_check" CHECK ("token_version" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_code_key" ON "tickets"("ticket_code");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_token_nonce_key" ON "tickets"("token_nonce");

-- CreateIndex
CREATE INDEX "tickets_booking_item_id_idx" ON "tickets"("booking_item_id");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_booking_item_id_sequence_no_key" ON "tickets"("booking_item_id", "sequence_no");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_booking_item_id_fkey" FOREIGN KEY ("booking_item_id") REFERENCES "booking_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
