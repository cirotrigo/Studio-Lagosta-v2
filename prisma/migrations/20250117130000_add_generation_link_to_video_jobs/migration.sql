DO $$
BEGIN
  CREATE TYPE "VideoProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VideoProcessingJob" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "clerkUserId" TEXT NOT NULL,
  "templateId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  "status" "VideoProcessingStatus" NOT NULL DEFAULT 'PENDING',
  "webmBlobUrl" TEXT NOT NULL,
  "webmFileSize" INTEGER NOT NULL,
  "mp4ResultUrl" TEXT,
  "thumbnailUrl" TEXT,
  "videoName" TEXT NOT NULL,
  "videoDuration" DOUBLE PRECISION NOT NULL,
  "videoWidth" INTEGER NOT NULL,
  "videoHeight" INTEGER NOT NULL,
  "designData" JSONB NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP WITH TIME ZONE,
  "completedAt" TIMESTAMP WITH TIME ZONE,
  "creditsDeducted" BOOLEAN NOT NULL DEFAULT FALSE,
  "creditsUsed" INTEGER NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS "VideoProcessingJob_userId_idx" ON "VideoProcessingJob" ("userId");
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_clerkUserId_idx" ON "VideoProcessingJob" ("clerkUserId");
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_status_idx" ON "VideoProcessingJob" ("status");
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_createdAt_idx" ON "VideoProcessingJob" ("createdAt");
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_templateId_idx" ON "VideoProcessingJob" ("templateId");
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_projectId_idx" ON "VideoProcessingJob" ("projectId");

-- Link video processing jobs to the creative generated entry
DO $$
BEGIN
  ALTER TABLE "VideoProcessingJob" ADD COLUMN "generationId" TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "VideoProcessingJob_generationId_key"
  ON "VideoProcessingJob"("generationId");

DO $$
BEGIN
  ALTER TABLE "VideoProcessingJob"
    ADD CONSTRAINT "VideoProcessingJob_generationId_fkey"
    FOREIGN KEY ("generationId") REFERENCES "Generation"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
