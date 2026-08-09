-- Anchor sheet do projeto: fotos-âncora canônicas por tipo de cena para a
-- geração de arte por IA. Escrita à mão (padrão idempotente do 0_init) porque
-- `migrate dev` contra o branch com drift pede reset — ver CLAUDE.md
-- § Database Management.

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectAnchorImage" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sceneTag" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "driveFileId" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAnchorImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectAnchorImage_projectId_sceneTag_idx" ON "ProjectAnchorImage"("projectId", "sceneTag");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ProjectAnchorImage" ADD CONSTRAINT "ProjectAnchorImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
