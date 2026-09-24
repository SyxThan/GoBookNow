-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('INDIVIDUAL', 'HOUSEHOLD_BUSINESS', 'COMPANY', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "description" VARCHAR(1000),
    "logo_url" VARCHAR(500),
    "legal_name" VARCHAR(200),
    "vendor_type" "VendorType",
    "tax_code" VARCHAR(50),
    "business_registration_number" VARCHAR(100),
    "legal_representative_name" VARCHAR(150),
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(30),
    "address_line" VARCHAR(255),
    "ward" VARCHAR(100),
    "district" VARCHAR(100),
    "province" VARCHAR(100),
    "country_code" VARCHAR(2) NOT NULL DEFAULT 'VN',
    "status" "VendorStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_owner_user_id_key" ON "vendors"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_slug_key" ON "vendors"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_tax_code_key" ON "vendors"("tax_code");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_business_registration_number_key" ON "vendors"("business_registration_number");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- CreateIndex
CREATE INDEX "vendors_display_name_idx" ON "vendors"("display_name");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
