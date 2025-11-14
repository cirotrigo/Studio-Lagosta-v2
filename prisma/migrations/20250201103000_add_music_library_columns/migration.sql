-- Ensure percussion/thumbnail columns exist on MusicLibrary
ALTER TABLE "MusicLibrary"
  ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "percussionUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "percussionSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "hasPercussionStem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stemsProcessedAt" TIMESTAMP(3);
