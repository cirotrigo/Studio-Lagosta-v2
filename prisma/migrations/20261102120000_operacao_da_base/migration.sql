-- A trilha das operações da base pelo MCP (02/11/2026): backup, auditoria e idempotência de `atualizar-dados-entrada-base`.
-- Aditiva e idempotente (IF NOT EXISTS), como o 0_init. Sem FK de propósito: a trilha sobrevive à entrada apagada.

CREATE TABLE IF NOT EXISTS "OperacaoDaBase" (
  "id"            TEXT NOT NULL,
  "projectId"     INTEGER NOT NULL,
  "entryId"       TEXT NOT NULL,
  "operacaoId"    TEXT NOT NULL,
  "hashDoPedido"  TEXT NOT NULL,
  "tipo"          TEXT NOT NULL,
  "status"        TEXT NOT NULL,
  "erroIndexacao" TEXT,
  "autor"         TEXT NOT NULL,
  "ator"          JSONB NOT NULL,
  "pedido"        JSONB NOT NULL,
  "versaoAntes"   TEXT NOT NULL,
  "versaoDepois"  TEXT NOT NULL,
  "antes"         JSONB NOT NULL,
  "depois"        JSONB NOT NULL,
  "diff"          JSONB NOT NULL,
  "criadaEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadaEm"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperacaoDaBase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OperacaoDaBase_projectId_operacaoId_key" ON "OperacaoDaBase"("projectId", "operacaoId");
CREATE INDEX IF NOT EXISTS "OperacaoDaBase_entryId_criadaEm_idx" ON "OperacaoDaBase"("entryId", "criadaEm");
