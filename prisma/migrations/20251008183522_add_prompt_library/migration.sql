-- CreateTable
CREATE TABLE "PromptLibrary" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "category" TEXT,
    "projectId" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromptLibrary_projectId_idx" ON "PromptLibrary"("projectId");

-- CreateIndex
CREATE INDEX "PromptLibrary_createdBy_idx" ON "PromptLibrary"("createdBy");

-- AddForeignKey
ALTER TABLE "PromptLibrary" ADD CONSTRAINT "PromptLibrary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
