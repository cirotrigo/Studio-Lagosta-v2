-- Foto enviada pelo celular via link de um toque (pedir-foto do conector).
-- Aditivo e idempotente, no padrão do 0_init.
CREATE TABLE IF NOT EXISTS "ChatUpload" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "blobUrl" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatUpload_projectId_idx" ON "ChatUpload"("projectId");

DO $$ BEGIN
    ALTER TABLE "ChatUpload" ADD CONSTRAINT "ChatUpload_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
