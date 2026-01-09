-- Add processingStartedAt column to SocialPost table
ALTER TABLE "SocialPost"
ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS "SocialPost_processingStartedAt_idx"
ON "SocialPost"("processingStartedAt");