-- Fila durável da geração de arte por IA (F0.3).
--
-- Até aqui a geração rodava no `after()` da MESMA invocação que a pediu. Uma
-- arte chega a ~290s no pior caso e o teto da rota é 300s: uma leva de 5-7
-- peças, ou um batch JSON-RPC do MCP (confirmar-estilo-carrossel dispara até 6
-- `after()` sob o MESMO teto), estourava o limite e a Generation ficava em
-- PROCESSING para sempre — não havia recuperação nenhuma.
--
-- "after() encadeado" foi avaliado e RISCADO no plano: after() morre com a
-- invocação, que é exatamente o cenário de falha. O que sobra é registro
-- pendente no banco + varredura por cron, no padrão do render-stories.
--
-- Por que tabela nova e não colunas na Generation:
--  * o payload é ARGUMENTO DE EXECUÇÃO, não metadado da arte. Em
--    `fieldValues` (Json sem índice) a varredura viraria scan por path, e
--    fieldValues é o registro de auditoria que galeria, MCP e QA já leem;
--  * os dois runners têm shapes de argumento diferentes — o discriminador
--    `kind` + payload mantém arte e melhoria independentes;
--  * o índice (status, nextAttemptAt) fica pequeno e quente; na Generation
--    varreria a tabela de artes inteira, que só cresce;
--  * precedente da casa: VideoProcessingJob e PostRetry são tabelas de job
--    apontando para a entidade — a Generation é o livro-caixa da arte.
--
-- Sem FOREIGN KEY, pelo mesmo precedente de `Generation.sourceGenerationId` e
-- `SocialPost.campaignId`: apagar a arte não pode travar nem arrastar a linha
-- de fila.
--
-- Escrita à mão (padrão idempotente do 0_init) porque `migrate dev` pede reset
-- contra o banco com drift — ver CLAUDE.md § Database Management.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "GenerationJobKind" AS ENUM ('ARTE', 'MELHORIA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "GenerationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "GenerationJob" (
  "id"             TEXT NOT NULL,
  -- A Generation PROCESSING que este job produz. O UNIQUE abaixo é o que faz
  -- enfileirar ser idempotente: retry do chamador não cria job duplicado.
  "generationId"   TEXT NOT NULL,
  "kind"           "GenerationJobKind" NOT NULL,
  "status"         "GenerationJobStatus" NOT NULL DEFAULT 'PENDING',
  -- Argumentos do runner, serializados. É o que permite executar em OUTRA
  -- invocação — inclusive a segunda tentativa, que nunca roda na primeira.
  "payload"        JSONB NOT NULL,
  "projectId"      INTEGER NOT NULL,
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  -- Uma tentativa = uma chamada PAGA do modelo (~US$0,10-0,19). 2 é o teto que
  -- MAX_GENERATION_ATTEMPTS já prometia nos dois runners — a fila não pode
  -- transformar durabilidade em cobrança extra.
  "maxAttempts"    INTEGER NOT NULL DEFAULT 2,
  -- Portão de tempo. Mora NA QUERY de quem varre, nunca dentro da reserva —
  -- regra da casa do renderPostArt: chamador que esquece os portões queima as
  -- tentativas em minutos e marca falha terminal.
  "nextAttemptAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Fim do arrendamento. RUNNING com lease vencido = invocação que morreu.
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- SEM default: `@updatedAt` do Prisma é aplicado pelo cliente, e um default
  -- no banco faz o `migrate diff` acusar divergência entre schema e tabela.
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "startedAt"      TIMESTAMP(3),
  "finishedAt"     TIMESTAMP(3),

  CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GenerationJob_generationId_key" ON "GenerationJob"("generationId");

-- A fila propriamente dita: PENDING vencido, na ordem de chegada.
CREATE INDEX IF NOT EXISTS "GenerationJob_status_nextAttemptAt_idx" ON "GenerationJob"("status", "nextAttemptAt");

-- A varredura de órfãos: RUNNING com arrendamento vencido.
CREATE INDEX IF NOT EXISTS "GenerationJob_status_leaseExpiresAt_idx" ON "GenerationJob"("status", "leaseExpiresAt");

CREATE INDEX IF NOT EXISTS "GenerationJob_projectId_idx" ON "GenerationJob"("projectId");
CREATE INDEX IF NOT EXISTS "GenerationJob_createdAt_idx" ON "GenerationJob"("createdAt");
