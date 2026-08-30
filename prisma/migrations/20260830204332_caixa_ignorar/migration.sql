-- Botão Ignorar da Caixa de Respostas (30/08/2026). Aditiva e idempotente,
-- escrita à mão para `prisma migrate deploy` (produção).

ALTER TABLE "AvaliacaoGoogle" ADD COLUMN IF NOT EXISTS "ignoradaEm" TIMESTAMP(3);
ALTER TABLE "AvaliacaoGoogle" ADD COLUMN IF NOT EXISTS "ignoradaPor" TEXT;

CREATE TABLE IF NOT EXISTS "ComentarioIgnorado" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "comentarioId" TEXT NOT NULL,
    "ignoradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ignoradoPor" TEXT,

    CONSTRAINT "ComentarioIgnorado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComentarioIgnorado_comentarioId_key" ON "ComentarioIgnorado"("comentarioId");
CREATE INDEX IF NOT EXISTS "ComentarioIgnorado_projectId_idx" ON "ComentarioIgnorado"("projectId");
