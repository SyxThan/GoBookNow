-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "checked_in_by_user_id" UUID;

-- CreateIndex
CREATE INDEX "tickets_checked_in_by_user_id_idx" ON "tickets"("checked_in_by_user_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_user_id_fkey" FOREIGN KEY ("checked_in_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
