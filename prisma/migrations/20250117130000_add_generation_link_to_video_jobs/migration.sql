-- Link video processing jobs to the creative generated entry
ALTER TABLE "VideoProcessingJob" ADD COLUMN "generationId" TEXT;

CREATE UNIQUE INDEX "VideoProcessingJob_generationId_key"
  ON "VideoProcessingJob"("generationId");

ALTER TABLE "VideoProcessingJob"
  ADD CONSTRAINT "VideoProcessingJob_generationId_fkey"
  FOREIGN KEY ("generationId") REFERENCES "Generation"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
