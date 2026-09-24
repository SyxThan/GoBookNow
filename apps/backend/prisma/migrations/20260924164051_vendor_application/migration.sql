-- CreateEnum
CREATE TYPE "VendorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VendorDocumentType" AS ENUM ('BUSINESS_REGISTRATION', 'TAX_DOCUMENT', 'REPRESENTATIVE_ID', 'OTHER');

-- CreateTable
CREATE TABLE "vendor_applications" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "status" "VendorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "review_note" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_application_documents" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "document_type" "VendorDocumentType" NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_application_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_status" "VendorApplicationStatus",
    "to_status" "VendorApplicationStatus" NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_application_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_applications_vendor_id_idx" ON "vendor_applications"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_applications_status_idx" ON "vendor_applications"("status");

-- CreateIndex
CREATE INDEX "vendor_applications_submitted_at_idx" ON "vendor_applications"("submitted_at");

-- CreateIndex
CREATE INDEX "vendor_application_documents_application_id_idx" ON "vendor_application_documents"("application_id");

-- CreateIndex
CREATE INDEX "vendor_application_history_application_id_idx" ON "vendor_application_history"("application_id");

-- CreateIndex
CREATE INDEX "vendor_application_history_changed_by_user_id_idx" ON "vendor_application_history"("changed_by_user_id");

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_application_documents" ADD CONSTRAINT "vendor_application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "vendor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_application_history" ADD CONSTRAINT "vendor_application_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "vendor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_application_history" ADD CONSTRAINT "vendor_application_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
