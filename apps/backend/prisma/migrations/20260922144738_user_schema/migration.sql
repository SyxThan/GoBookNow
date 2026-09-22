-- Abort without changing data when an existing value cannot fit the new limits.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "users" WHERE char_length("email") > 320) THEN
        RAISE EXCEPTION 'Cannot migrate users.email: value exceeds 320 characters';
    END IF;

    IF EXISTS (SELECT 1 FROM "users" WHERE char_length("password_hash") > 255) THEN
        RAISE EXCEPTION 'Cannot migrate users.password_hash: value exceeds 255 characters';
    END IF;

    IF EXISTS (SELECT 1 FROM "users" WHERE char_length("full_name") > 120) THEN
        RAISE EXCEPTION 'Cannot migrate users.full_name: value exceeds 120 characters';
    END IF;

    IF EXISTS (SELECT 1 FROM "users" WHERE char_length("phone") > 20) THEN
        RAISE EXCEPTION 'Cannot migrate users.phone: value exceeds 20 characters';
    END IF;
END $$;

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20),
    "avatar_url" VARCHAR(500),
    "locale" VARCHAR(16) NOT NULL DEFAULT 'vi-VN',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "email_verified_at" TIMESTAMP(3),
ADD COLUMN "last_login_at" TIMESTAMP(3),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(320),
ALTER COLUMN "password_hash" DROP NOT NULL,
ALTER COLUMN "password_hash" SET DATA TYPE VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve profile data from the original users table.
INSERT INTO "user_profiles" (
    "id",
    "user_id",
    "full_name",
    "phone",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    "id",
    "full_name",
    "phone",
    "created_at",
    "updated_at"
FROM "users";

-- Refuse to remove the source columns unless every user has a profile.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "users" AS u
        LEFT JOIN "user_profiles" AS p ON p."user_id" = u."id"
        WHERE p."user_id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot remove profile columns: not every user was migrated';
    END IF;
END $$;

-- AlterTable
ALTER TABLE "users"
DROP COLUMN "full_name",
DROP COLUMN "phone";
