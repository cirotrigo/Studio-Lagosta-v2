-- Curadoria explícita do acervo ("prata da casa") + candidatas de foto no card.
-- Escrita à mão (regra da casa: db:deploy contra produção, sem shadow DB).
-- Idempotente (IF NOT EXISTS), como o 0_init.

-- PhotoDestaque: uma linha por (projeto, foto), sem FK — apagar a foto do
-- Drive não arrasta o registro. Despromover é revogadoEm, nunca DELETE.
CREATE TABLE IF NOT EXISTS "PhotoDestaque" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "decididoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogadoEm" TIMESTAMP(3),

    CONSTRAINT "PhotoDestaque_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PhotoDestaque_projectId_driveFileId_key"
    ON "PhotoDestaque"("projectId", "driveFileId");

-- Top-3 candidatas de foto gravadas na emissão da proposta (payload do card;
-- a verdade do que foi oferecido mora no LearningSignal).
ALTER TABLE "ItemDePlano" ADD COLUMN IF NOT EXISTS "fotoCandidatas" JSONB;
