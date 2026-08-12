-- Uso de foto do acervo (B5). Até aqui NINGUÉM escrevia o `usageHistory` do
-- `_image-catalog.json` — só o gerador CLI antigo —, então `ultimoUso`
-- respondia "nunca" para toda foto e a ordenação "menos usadas primeiro" era
-- um no-op sobre campo constante. A regra do DNA de não repetir foto na semana
-- nunca teve como ser cumprida.
--
-- No banco, e não no JSON do Drive: read-modify-write concorrente perderia
-- registro, e regerar o catálogo zera `usageHistory`.
CREATE TABLE IF NOT EXISTS "PhotoUsage" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem" TEXT NOT NULL,
    "tema" TEXT,
    "generationId" TEXT,

    CONSTRAINT "PhotoUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PhotoUsage_projectId_driveFileId_idx" ON "PhotoUsage"("projectId", "driveFileId");
CREATE INDEX IF NOT EXISTS "PhotoUsage_projectId_usedAt_idx" ON "PhotoUsage"("projectId", "usedAt");
