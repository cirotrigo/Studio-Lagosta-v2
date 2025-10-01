-- Add Google Drive metadata support on projects and generations
ALTER TABLE "Project"
  ADD COLUMN "googleDriveFolderName" TEXT;

ALTER TABLE "Generation"
  ADD COLUMN "googleDriveFileId" TEXT,
  ADD COLUMN "googleDriveBackupUrl" TEXT;
