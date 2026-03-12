-- Add brand-related fields to Project table
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "brandStyleDescription" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "brandVisualElements" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "brandReferenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "cuisineType" TEXT;
