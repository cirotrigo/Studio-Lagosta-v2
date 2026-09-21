-- PR 11 de "Marca simples, copy melhor" (12/09/2026): identidade durável por
-- cliente, lote e item. A reserva é gravada antes da Generation e do job, e a
-- chave única composta é o que faz a repetição da mesma leva não duplicar.
-- Aditiva e idempotente, como o 0_init; nenhum backfill (lote passado não tinha
-- identidade vinda de quem chamou, e ela não se inventa).
CREATE TABLE IF NOT EXISTS "ItemDeLote" (
  "id"            TEXT NOT NULL,
  "projectId"     INTEGER NOT NULL,
  "loteId"        TEXT NOT NULL,
  "itemId"        TEXT NOT NULL,
  "hashDoPayload" TEXT NOT NULL,
  "payload"       JSONB NOT NULL,
  "situacao"      TEXT NOT NULL DEFAULT 'reservado',
  "generationId"  TEXT,
  "jobId"         TEXT,
  "tentativas"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemDeLote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ItemDeLote_projectId_loteId_itemId_key"
  ON "ItemDeLote"("projectId", "loteId", "itemId");
CREATE INDEX IF NOT EXISTS "ItemDeLote_generationId_idx"
  ON "ItemDeLote"("generationId");
