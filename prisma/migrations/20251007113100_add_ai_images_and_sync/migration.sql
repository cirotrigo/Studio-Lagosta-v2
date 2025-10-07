-- CreateEnum
CREATE TYPE "AIImageMode" AS ENUM ('GENERATE', 'EDIT', 'OUTPAINT');

-- CreateTable
CREATE TABLE "AIGeneratedImage" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "mode" "AIImageMode" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'replicate',
    "model" TEXT NOT NULL,
    "predictionId" TEXT,
    "sourceImageId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIGeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIGeneratedImage_projectId_idx" ON "AIGeneratedImage"("projectId");

-- CreateIndex
CREATE INDEX "AIGeneratedImage_createdBy_idx" ON "AIGeneratedImage"("createdBy");

-- CreateIndex
CREATE INDEX "AIGeneratedImage_mode_idx" ON "AIGeneratedImage"("mode");

-- CreateIndex
CREATE INDEX "AIGeneratedImage_createdAt_idx" ON "AIGeneratedImage"("createdAt");

-- AddForeignKey
ALTER TABLE "AIGeneratedImage" ADD CONSTRAINT "AIGeneratedImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
