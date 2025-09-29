-- Ensure Plan.sortOrder column exists and matches Prisma schema expectations
ALTER TABLE "public"."Plan" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER;

UPDATE "public"."Plan"
SET "sortOrder" = 0
WHERE "sortOrder" IS NULL;

ALTER TABLE "public"."Plan" ALTER COLUMN "sortOrder" SET DEFAULT 0;
ALTER TABLE "public"."Plan" ALTER COLUMN "sortOrder" SET NOT NULL;
