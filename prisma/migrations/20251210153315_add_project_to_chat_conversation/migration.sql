-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN "projectId" INTEGER;

-- CreateIndex
CREATE INDEX "ChatConversation_projectId_idx" ON "ChatConversation"("projectId");

-- CreateIndex (índice composto já existente no schema)
CREATE INDEX "ChatConversation_projectId_userId_idx" ON "ChatConversation"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
