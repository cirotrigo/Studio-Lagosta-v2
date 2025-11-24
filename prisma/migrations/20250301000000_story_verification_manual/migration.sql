-- Story verification: manual backfill to align DB with Prisma schema
DO $$
BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'VERIFICATION_FAILED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SocialPost"
  ADD COLUMN IF NOT EXISTS "verificationTag" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'SKIPPED',
  ADD COLUMN IF NOT EXISTS "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nextVerificationAt" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "lastVerificationAt" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "verifiedStoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedPermalink" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedTimestamp" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "verifiedByFallback" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "verificationError" TEXT;

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "instagramUserId" TEXT;

CREATE INDEX IF NOT EXISTS "SocialPost_verification_idx"
  ON "SocialPost"("verificationStatus", "nextVerificationAt");

CREATE INDEX IF NOT EXISTS "SocialPost_verificationTag_idx"
  ON "SocialPost"("verificationTag");
