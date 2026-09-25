-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "slots" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "slots_pkey" PRIMARY KEY ("id")
);

-- Domain invariants that Prisma cannot currently express in the schema.
ALTER TABLE "slots"
ADD CONSTRAINT "slots_time_order_check" CHECK ("start_at" < "end_at"),
ADD CONSTRAINT "slots_capacity_check" CHECK ("capacity" BETWEEN 1 AND 100000);

-- CreateIndex
CREATE INDEX "slots_service_id_idx" ON "slots"("service_id");

-- CreateIndex
CREATE INDEX "slots_service_id_start_at_idx" ON "slots"("service_id", "start_at");

-- CreateIndex
CREATE INDEX "slots_status_idx" ON "slots"("status");

-- CreateIndex
CREATE INDEX "slots_start_at_idx" ON "slots"("start_at");

-- CreateIndex
CREATE INDEX "slots_service_id_status_start_at_idx" ON "slots"("service_id", "status", "start_at");

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
