CREATE TABLE "reviews" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" VARCHAR(2000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "reviews_booking_id_key" ON "reviews"("booking_id");
CREATE INDEX "reviews_deleted_at_created_at_idx" ON "reviews"("deleted_at", "created_at");

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
