-- Captura de sinais de uso (F1) — o núcleo.
--
-- Um SINAL é a unidade do aprendizado por uso: "isto foi proposto, aquilo foi
-- escolhido". As duas metades moram na MESMA linha e qualquer uma pode estar
-- vazia:
--   * sugeridoEm preenchido + desfecho NULL  -> proposta em aberto;
--   * sugeridoEm NULL + desfecho 'escolha-propria' -> ESCOLHA ABSOLUTA, a
--     pessoa decidiu sem que nada tivesse sido proposto.
--
-- UMA tabela e não duas (sugestão + desfecho):
--  1. a decisão SEM sugestão é o caso COMUM nas primeiras semanas — com duas
--     tabelas ela vira linha de desfecho com FK nula, o caso especial torto
--     que o desenho tinha de evitar; aqui é linha inteira com a metade de cima
--     vazia;
--  2. a relação é 1:1 por construção (uma leva de 5 slots são 5 propostas);
--  3. o KPI (aceitas / emitidas) vira agregação de tabela única;
--  4. a idempotência do desfecho é compare-and-set na própria linha.
-- O precedente do GenerationJob (tabela à parte) não se aplica: lá separou-se
-- COMO o trabalho roda de O QUE o usuário vê; aqui as duas metades são o mesmo
-- fato e são lidas juntas.
--
-- `tipo`, `desfecho` e `superficie` são TEXT e não enum do Postgres, pelo
-- precedente da F0.2 (`SocialPost.origem`) e por uma razão operacional: as
-- migrations da casa são aplicadas com `migrate deploy`, que roda cada uma
-- numa transação, e `ALTER TYPE … ADD VALUE` não pode ser usado no mesmo bloco
-- em que o tipo é criado. Vocabulário que ainda cresce na F2 fica em TEXT; a
-- validação vive em `src/lib/aprendizado/vocabulario.ts`.
--
-- SEM FOREIGN KEY em nenhum vínculo, pelo precedente de
-- `Generation.sourceGenerationId` e `SocialPost.campaignId`: apagar o post, a
-- arte, a página ou a campanha não pode arrastar nem travar o registro do que
-- aconteceu.
--
-- Escrita à mão (padrão idempotente do 0_init) porque `migrate dev` pede reset
-- contra o banco com drift — ver CLAUDE.md § Database Management.

-- CreateTable
CREATE TABLE IF NOT EXISTS "LearningSignal" (
  "id"           TEXT NOT NULL,
  "projectId"    INTEGER NOT NULL,
  -- 'slot' | 'copy' | 'foto' | 'modelo'
  "tipo"         TEXT NOT NULL,

  -- ── metade SUGESTÃO (nula na escolha absoluta) ─────────────────────────
  "sugerido"     JSONB,
  -- Quando a proposta foi EMITIDA — não quando foi aceita. É o denominador do
  -- KPI de aceitação: sem esta linha, a proposta ignorada some e a taxa vira
  -- 100%.
  "sugeridoEm"   TIMESTAMP(3),
  -- PROVENIÊNCIA: qual serviço emitiu ('sugerir-posts', 'prepare-creative'…).
  "servico"      TEXT,
  -- Versão da heurística/prompt; sem ela não dá para comparar safras.
  "versao"       TEXT,

  -- ── metade DESFECHO (nula enquanto ninguém decidiu) ────────────────────
  -- 'aceita-como-veio' | 'editada' | 'trocada' | 'descartada' | 'expirada' |
  -- 'escolha-propria' (este só em linha SEM sugestão).
  "desfecho"     TEXT,
  "escolhido"    JSONB,
  -- Diff estruturado da copy, quando faz sentido.
  "diff"         JSONB,
  "decididoEm"   TIMESTAMP(3),
  -- User.id INTERNO (cuid), NUNCA o clerkId — a confusão entre os dois
  -- espaços já criou User fantasma no banco.
  "decididoPor"  TEXT,
  -- 'bancada' | 'chat' | 'editor' | 'agenda' | 'sistema'
  "superficie"   TEXT,

  -- ── vínculos frouxos (sem FK, ver o cabeçalho) ─────────────────────────
  "postId"       TEXT,
  "generationId" TEXT,
  "pageId"       TEXT,
  "campaignId"   TEXT,

  -- Idempotência do chamador: o mesmo registro gravado duas vezes (retry de
  -- rota, repetição de tool no chat) não duplica. NULL é permitido e repetido
  -- à vontade — no Postgres, UNIQUE não colide entre NULLs.
  "chave"        TEXT,

  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- SEM default: `@updatedAt` do Prisma é aplicado pelo cliente, e um default
  -- no banco faz o `migrate diff` acusar divergência entre schema e tabela.
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LearningSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LearningSignal_chave_key" ON "LearningSignal"("chave");

-- O corpus de um cliente, por tipo de sinal, em ordem de tempo.
CREATE INDEX IF NOT EXISTS "LearningSignal_projectId_tipo_createdAt_idx"
  ON "LearningSignal"("projectId", "tipo", "createdAt");

-- O KPI de aceitação por cliente.
CREATE INDEX IF NOT EXISTS "LearningSignal_projectId_desfecho_idx"
  ON "LearningSignal"("projectId", "desfecho");

-- A varredura que expira proposta sem desfecho (`desfecho IS NULL`).
CREATE INDEX IF NOT EXISTS "LearningSignal_desfecho_sugeridoEm_idx"
  ON "LearningSignal"("desfecho", "sugeridoEm");

-- Voltar do post para o sinal que o originou.
CREATE INDEX IF NOT EXISTS "LearningSignal_postId_idx" ON "LearningSignal"("postId");


-- ── Espelhos colunares ────────────────────────────────────────────────────
--
-- O que estas três colunas resolvem: hoje "qual modelo este cliente mais usa"
-- só existe dentro de `Generation.fieldValues`, que é JSONB SEM índice —
-- minerar exige varrer a tabela de artes inteira por path. Foi o que a
-- curadoria de modelos (F0.4) teve de fazer na mão em 10/08.
--
-- Precedente idêntico: `Generation.styleRefAt` / `styleRefUsedAt`, criadas
-- para o rodízio de referências de estilo.
--
-- ⚠️ As colunas nascem SEM ninguém escrevendo nelas — ligar a contagem nos
-- pontos de criação é da tarefa seguinte. O helper de incremento é
-- `registrarUsoDeModelo` em `src/lib/aprendizado/uso-de-modelo.ts`.

ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "usedCount" INTEGER NOT NULL DEFAULT 0;

-- NULL = nunca usada. 🔴 Em Postgres `ORDER BY … ASC` é NULLS LAST: num
-- rodízio por "menos usado", sem `nulls: 'first'` explícito o modelo JÁ USADO
-- vem antes do nunca usado. Foi esse defeito que fez a mesma referência de
-- estilo sair cinco vezes seguidas em 10/08.
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Page_isTemplate_lastUsedAt_idx" ON "Page"("isTemplate", "lastUsedAt");

-- Espelho de `Generation.fieldValues->>'sourcePageId'`. Coluna solta, sem FK,
-- como a linhagem `sourceGenerationId`: apagar a página não pode arrastar a
-- arte que já existe.
ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "sourcePageId" TEXT;

CREATE INDEX IF NOT EXISTS "Generation_sourcePageId_idx" ON "Generation"("sourcePageId");
