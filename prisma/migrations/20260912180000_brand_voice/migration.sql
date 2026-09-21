-- F2/F5 de "Marca simples, copy melhor" (PR 7, 12/09/2026): a voz compacta da
-- marca, versionada, com a data de migração e o DNA de texto arquivado.
-- Aditiva e idempotente; NENHUM conteúdo é migrado aqui — a migração da voz de
-- cada cliente é o PR 13, por manifesto e com aprovação.
CREATE TABLE IF NOT EXISTS "BrandVoice" (
  "id" SERIAL NOT NULL,
  "projectId" INTEGER NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  "voz" JSONB NOT NULL,
  "migradaEm" TIMESTAMP(3),
  "dnaArquivado" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandVoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandVoice_projectId_key" ON "BrandVoice"("projectId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BrandVoice_projectId_fkey'
  ) THEN
    ALTER TABLE "BrandVoice"
      ADD CONSTRAINT "BrandVoice_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
