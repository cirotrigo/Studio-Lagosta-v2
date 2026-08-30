-- Avaliações do Google Meu Negócio via Windsor.ai (30/08/2026).
-- Escrita à mão para `prisma migrate deploy` (produção) — aditiva e
-- idempotente, no molde do 0_init.

CREATE TABLE IF NOT EXISTS "AvaliacaoGoogle" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "locationId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "autor" TEXT,
    "estrelas" INTEGER NOT NULL,
    "texto" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL,
    "atualizadaEm" TIMESTAMP(3),
    "textoResposta" TEXT,
    "respondidaEm" TIMESTAMP(3),
    "respostaSugerida" TEXT,
    "sugestaoGeradaEm" TIMESTAMP(3),
    "avisadaEm" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvaliacaoGoogle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AvaliacaoGoogle_reviewId_key" ON "AvaliacaoGoogle"("reviewId");
CREATE INDEX IF NOT EXISTS "AvaliacaoGoogle_projectId_idx" ON "AvaliacaoGoogle"("projectId");
CREATE INDEX IF NOT EXISTS "AvaliacaoGoogle_criadaEm_idx" ON "AvaliacaoGoogle"("criadaEm");
CREATE INDEX IF NOT EXISTS "AvaliacaoGoogle_estrelas_idx" ON "AvaliacaoGoogle"("estrelas");
CREATE INDEX IF NOT EXISTS "AvaliacaoGoogle_projectId_respondidaEm_idx" ON "AvaliacaoGoogle"("projectId", "respondidaEm");

DO $$ BEGIN
    ALTER TABLE "AvaliacaoGoogle"
        ADD CONSTRAINT "AvaliacaoGoogle_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
