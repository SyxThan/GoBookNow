-- CreateTable
CREATE TABLE "service_images" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "original_name" VARCHAR(255),
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_images_storage_key_key" ON "service_images"("storage_key");

-- CreateIndex
CREATE INDEX "service_images_service_id_idx" ON "service_images"("service_id");

-- CreateIndex
CREATE INDEX "service_images_service_id_sort_order_idx" ON "service_images"("service_id", "sort_order");

-- AddForeignKey
ALTER TABLE "service_images" ADD CONSTRAINT "service_images_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
