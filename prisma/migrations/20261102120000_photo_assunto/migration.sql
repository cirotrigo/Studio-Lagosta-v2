-- F2b: a decisão humana sobre o assunto da foto (tool marcar-assunto).
-- Escrita à mão (regra da casa: db:deploy contra produção, sem shadow DB).
-- Idempotente (IF NOT EXISTS), como o 0_init.

-- PhotoAssunto: uma linha por (projeto, foto), sem FK, como PhotoDestaque.
-- Voltar ao automático é revogadoEm, nunca DELETE.
CREATE TABLE IF NOT EXISTS "PhotoAssunto" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "decisao" TEXT NOT NULL,
    "caixa" JSONB,
    "decididoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogadoEm" TIMESTAMP(3),

    CONSTRAINT "PhotoAssunto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PhotoAssunto_projectId_driveFileId_key"
    ON "PhotoAssunto"("projectId", "driveFileId");
