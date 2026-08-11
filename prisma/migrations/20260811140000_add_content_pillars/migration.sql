-- Taxonomia FECHADA de pilares de conteúdo por projeto + a classificação do
-- histórico (F2 — destilação).
--
-- ── POR QUE FECHADA ───────────────────────────────────────────────────────
-- Tema em texto livre não deduplica. "Happy hour" e "drinks" viram baldes
-- diferentes, e a semana sai com o mesmo assunto duas vezes sem que nada no
-- sistema perceba. A lista é PROPOSTA por um passe de LLM sobre o histórico do
-- próprio cliente (5 a 8 pilares) e APROVADA por gente na aba Marca; daí em
-- diante o classificador só pode escolher dentro dela.
--
-- ── POR QUE TABELA E NÃO JSON NO BrandDNA ─────────────────────────────────
-- O slug é chave de junção (`SocialPost.pilar`), a lista é ordenada e editada
-- item a item, e a aprovação é por linha. Em Json, toda edição reescreveria o
-- conjunto e a contagem por pilar ficaria sem índice — exatamente a armadilha
-- de `Generation.fieldValues` que os espelhos colunares da F1 vieram corrigir.
--
-- ── DOIS SLUGS RESERVADOS, E A DIFERENÇA IMPORTA ──────────────────────────
-- `outro`     — foi classificado e não coube em pilar nenhum (ou a confiança
--               ficou abaixo do piso). Baixa confiança vai para cá, NUNCA para
--               o rótulo mais provável.
-- `sem-texto` — não havia o que classificar. Medido em 11/08/2026: das 176
--               publicações do Wine Vix em 8 semanas, apenas 26 têm texto
--               legível no banco — o resto é story cuja copy só existe dentro
--               da imagem. Misturar esses dois casos faria "outro" parecer o
--               maior pilar do cliente e envenenaria a linha de base da
--               detecção de campanha.
-- Nenhum dos dois pode ser cadastrado como pilar de projeto (a validação vive
-- em `src/lib/aprendizado/pilares.ts`).
--
-- SEM FOREIGN KEY entre `SocialPost.pilar` e `ContentPillar.slug`, pelo mesmo
-- precedente de `Generation.sourceGenerationId` e `SocialPost.campaignId`:
-- reeditar a taxonomia não pode arrastar nem travar o post que já aconteceu.
--
-- Escrita à mão (padrão idempotente do 0_init) porque `migrate dev` pede reset
-- contra o banco com drift — ver CLAUDE.md § Database Management.

-- CreateTable
CREATE TABLE IF NOT EXISTS "ContentPillar" (
  "id"          TEXT NOT NULL,
  "projectId"   INTEGER NOT NULL,
  -- kebab-case e ESTÁVEL: é o que fica gravado em `SocialPost.pilar`.
  -- Renomear o slug órfã a classificação já feita — o que se muda é o `nome`.
  "slug"        TEXT NOT NULL,
  "nome"        TEXT NOT NULL,
  "descricao"   TEXT,
  -- Palavras que aparecem quando o assunto é este. Entram no prompt do
  -- classificador e explicam o balde para quem lê a lista.
  "exemplos"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  "ordem"       INTEGER NOT NULL DEFAULT 0,
  -- Só pilar aprovado entra na taxonomia do classificador. A proposta do LLM
  -- nasce `false` e espera o olho humano na aba Marca.
  "aprovado"    BOOLEAN NOT NULL DEFAULT false,
  "aprovadoEm"  TIMESTAMP(3),
  -- User.id INTERNO (cuid), NUNCA o clerkId.
  "aprovadoPor" TEXT,
  -- 'llm' | 'humano'
  "origem"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- SEM default: `@updatedAt` é aplicado pelo cliente Prisma, e um default no
  -- banco faz o `migrate diff` acusar divergência entre schema e tabela.
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentPillar_pkey" PRIMARY KEY ("id")
);

-- Um slug por projeto — é o que permite `upsert` por (projeto, slug) na
-- aprovação da lista sem apagar e recriar (o que perderia os ids).
CREATE UNIQUE INDEX IF NOT EXISTS "ContentPillar_projectId_slug_key"
  ON "ContentPillar"("projectId", "slug");

-- A leitura quente: a taxonomia aprovada de um cliente.
CREATE INDEX IF NOT EXISTS "ContentPillar_projectId_aprovado_idx"
  ON "ContentPillar"("projectId", "aprovado");

-- AddForeignKey — aqui a FK é correta e desejada: pilar é configuração do
-- projeto, não registro de fato consumado. Projeto apagado leva a taxonomia
-- junto (o mesmo contrato de BrandDNA e ProjectAnchorImage).
DO $$ BEGIN
  ALTER TABLE "ContentPillar"
    ADD CONSTRAINT "ContentPillar_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ── Classificação do post ─────────────────────────────────────────────────

-- Slug do pilar, ou um dos reservados. NULL = ainda não classificado, que é
-- diferente de `sem-texto` (classificado, não havia o que ler).
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "pilar" TEXT;

-- 0..1 declarada pelo classificador. Guardada porque é o que permite
-- reclassificar só a cauda duvidosa quando a taxonomia mudar.
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "pilarConfianca" DOUBLE PRECISION;

-- Versão da taxonomia + prompt. Sem ela não dá para distinguir safra velha de
-- classificação nova quando a lista de pilares for reeditada.
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "pilarVersao" TEXT;

ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "pilarClassificadoEm" TIMESTAMP(3);

-- Contagem por pilar dentro de um cliente (mineração e detecção de campanha).
CREATE INDEX IF NOT EXISTS "SocialPost_projectId_pilar_idx"
  ON "SocialPost"("projectId", "pilar");
