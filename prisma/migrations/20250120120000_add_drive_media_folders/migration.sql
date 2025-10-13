-- Add dedicated Google Drive folders for images and videos on projects
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "googleDriveImagesFolderId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleDriveImagesFolderName" TEXT,
  ADD COLUMN IF NOT EXISTS "googleDriveVideosFolderId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleDriveVideosFolderName" TEXT;

-- Align VideoProcessingJob table with current Prisma schema
ALTER TABLE "VideoProcessingJob"
  DROP COLUMN IF EXISTS "lastRetryAt",
  DROP COLUMN IF EXISTS "maxRetries",
  DROP COLUMN IF EXISTS "retryCount";
