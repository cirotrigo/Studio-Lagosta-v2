-- Memória do que o app já respondeu (30/08/2026): o Windsor serve cache e a
-- pergunta respondida voltava para a fila. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "ComentarioRespondido" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "comentarioId" TEXT NOT NULL,
    "respostaId" TEXT,
    "respondidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoPor" TEXT,

    CONSTRAINT "ComentarioRespondido_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComentarioRespondido_comentarioId_key" ON "ComentarioRespondido"("comentarioId");
CREATE INDEX IF NOT EXISTS "ComentarioRespondido_projectId_idx" ON "ComentarioRespondido"("projectId");
