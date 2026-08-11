-- Plano de conteúdo (F3) — a fila que o chat consegue escrever.
--
-- ── O QUE ISTO RESOLVE ────────────────────────────────────────────────────
-- A fila da bancada é localStorage puro (`src/stores/bancada-store.ts`, chave
-- `lagosta.bancada`) e NENHUMA rota escreve nela. Consequência prática: o chat
-- não consegue montar uma leva que a bancada enxergue, nem a bancada mostrar o
-- que foi combinado no chat. Estas duas tabelas são o chão comum — a bancada
-- passa a hidratar do servidor e o localStorage vira cache.
--
-- ── O QUE ELAS NÃO FAZEM ──────────────────────────────────────────────────
-- Não geram arte e não cobram crédito. Uma linha aqui é o que se PRETENDE
-- fazer; quem executa (e cobra, com gate de confirmação) é `executar-plano`,
-- da fatia seguinte. É o contrato da casa: sugestão nunca agenda nem gasta
-- sozinha.
--
-- ── POR QUE `planoId` TEM FK E `postId` NÃO ───────────────────────────────
-- A regra "sem FOREIGN KEY" da casa (precedente de
-- `Generation.sourceGenerationId` e `SocialPost.campaignId`) é sobre VÍNCULO
-- FROUXO com entidade apagável: apagar o post, a arte, a página ou a campanha
-- não pode arrastar nem TRAVAR o registro do que aconteceu. Ela não se aplica
-- ao dono da linha.
--
--   * "ItemDePlano"."planoId"  -> FK com ON DELETE CASCADE. Parentesco
--     estrito: item sem plano não significa coisa nenhuma, e um item órfão
--     seria lixo que nenhuma tela sabe mostrar.
--   * "postId", "generationId", "pageId", "campaignId", "sugestaoId" e
--     "sourcePageId" -> SEM FK. O plano é o registro da INTENÇÃO e precisa
--     sobreviver ao que ele produziu; uma FK aqui faria apagar uma arte
--     bloquear (RESTRICT) ou apagar (CASCADE) a memória de tê-la planejado.
--
-- `projectId` fica INTEGER solto, sem relação com "Project", pelo precedente
-- dos dois models mais recentes ("LearningSignal", "GenerationJob"). Também
-- evita alterar a tabela "Project", que está sendo mexida em outra frente.
--
-- ── POR QUE TEXT E NÃO ENUM DO POSTGRES ───────────────────────────────────
-- `status`, `via` e `origem` são TEXT pelo precedente da F1
-- (`LearningSignal.tipo`) e por uma razão operacional: `migrate deploy` roda
-- cada migration numa transação, e `ALTER TYPE … ADD VALUE` não pode ser usado
-- no mesmo bloco em que o tipo é criado — vocabulário que ainda se move ficaria
-- impossível de estender sem uma migration de duas etapas. A validação mora em
-- `src/lib/planos/vocabulario.ts`. `escopo` usa o enum "LearningScope", que já
-- existe desde a F0.2 e é estável.
--
-- Escrita à mão (padrão idempotente do 0_init) porque `migrate dev` pede reset
-- contra o banco com drift — ver CLAUDE.md § Database Management.

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlanoDeConteudo" (
  "id"        TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  -- "Semana de 17 a 23/08", "Festival Italiano" — o nome que a pessoa lê.
  "titulo"    TEXT,

  -- A janela que o plano cobre. Item com horário FORA dela é aviso, nunca
  -- erro: campanha prorrogada e prazo velho da base já ensinaram que recusar
  -- por metadado é pior que aceitar com ressalva.
  "inicio"    TIMESTAMP(3) NOT NULL,
  "fim"       TIMESTAMP(3) NOT NULL,

  -- 'ativo' | 'arquivado'
  "status"    TEXT NOT NULL DEFAULT 'ativo',
  -- Que superfície montou: 'chat' | 'bancada' | 'propor-semana'.
  "origem"    TEXT,
  -- Versão da heurística que montou o plano; sem ela não dá para comparar
  -- safras (mesmo motivo de "LearningSignal"."versao").
  "versao"    TEXT,
  -- User.id INTERNO (cuid), NUNCA o clerkId — a confusão entre os dois espaços
  -- já criou User fantasma neste banco.
  "criadoPor" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- SEM default: `@updatedAt` do Prisma é aplicado pelo cliente, e um default
  -- no banco faz o `migrate diff` acusar divergência entre schema e tabela.
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlanoDeConteudo_pkey" PRIMARY KEY ("id")
);

-- A leitura quente: "o plano ativo deste cliente, o mais recente primeiro"
-- (planoAtivo) e a lista filtrada por situação (listarPlanos). Um índice serve
-- às duas porque `status` é o filtro e `createdAt` é a ordenação.
CREATE INDEX IF NOT EXISTS "PlanoDeConteudo_projectId_status_createdAt_idx"
  ON "PlanoDeConteudo"("projectId", "status", "createdAt");


-- CreateTable
CREATE TABLE IF NOT EXISTS "ItemDePlano" (
  "id"           TEXT NOT NULL,
  "planoId"      TEXT NOT NULL,
  -- Redundante com o projeto do plano de PROPÓSITO: toda leitura e escrita do
  -- serviço filtra por projeto (item de outro cliente é 404, nunca 403 com
  -- vazamento), e sem a coluna isso viraria join em todo caminho.
  "projectId"    INTEGER NOT NULL,
  "ordem"        INTEGER NOT NULL DEFAULT 0,

  -- ── o que se pretende publicar ─────────────────────────────────────────
  -- Em UTC, como todo horário do banco. Nulo enquanto ninguém decidiu quando.
  "quando"       TIMESTAMP(3),
  "tema"         TEXT,
  -- Blocos de texto, como a copy da bancada (headline, apoio, CTA).
  "copyProposta" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "legenda"      TEXT,
  "fotoUrl"      TEXT,
  "fotoDriveId"  TEXT,
  -- 'story' | 'feed' | 'quadrado'
  "formato"      TEXT NOT NULL,
  -- 'template' (padrão, custo de API de imagem ZERO) | 'ia'. A via é do ITEM,
  -- não do plano: uma leva normal mistura as duas.
  "via"          TEXT NOT NULL DEFAULT 'template',
  -- A página-modelo escolhida na via template. Sem FK (ver o cabeçalho).
  "sourcePageId" TEXT,
  -- Por que este horário — a frase que a proposta mostra para quem lê.
  "motivoDoSlot" TEXT,

  -- ── aprendizado ────────────────────────────────────────────────────────
  -- Enum estável desde a F0.2: capturar sempre, marcar por item, filtrar na
  -- agregação.
  "escopo"       "LearningScope" NOT NULL DEFAULT 'ROTINA',
  "campaignId"   TEXT,

  -- ── situação ───────────────────────────────────────────────────────────
  -- 'proposto' | 'editado' | 'aprovado' | 'reprovado' | 'na-fila' | 'gerando'
  -- | 'pronto' | 'erro' | 'agendado'
  "status"           TEXT NOT NULL DEFAULT 'proposto',
  -- Por que foi reprovado: é o que transforma a recusa em sinal em vez de beco
  -- sem saída.
  "motivoReprovacao" TEXT,
  -- Falha da geração, em português (o item continua no plano, retentável).
  "erro"             TEXT,

  -- ── o que o item virou (tudo sem FK) ───────────────────────────────────
  "generationId" TEXT,
  "pageId"       TEXT,
  "postId"       TEXT,
  -- O "LearningSignal" da sugestão de horário que originou este item.
  "sugestaoId"   TEXT,

  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- SEM default, mesma razão da tabela acima.
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ItemDePlano_pkey" PRIMARY KEY ("id")
);

-- Os itens deste plano, na ordem em que a leva foi montada — a leitura de toda
-- tela e de toda tool que mostra o plano.
CREATE INDEX IF NOT EXISTS "ItemDePlano_planoId_ordem_idx"
  ON "ItemDePlano"("planoId", "ordem");

-- "O que ainda está por fazer neste cliente": a varredura por situação que a
-- execução e a hidratação da bancada consultam.
CREATE INDEX IF NOT EXISTS "ItemDePlano_projectId_status_idx"
  ON "ItemDePlano"("projectId", "status");


-- AddForeignKey — em bloco DO idempotente (padrão do 0_init).
-- CASCADE porque item sem plano não significa nada; ver o cabeçalho para a
-- distinção entre este parentesco e os vínculos frouxos, que não têm FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ItemDePlano_planoId_fkey'
  ) THEN
    ALTER TABLE "ItemDePlano"
      ADD CONSTRAINT "ItemDePlano_planoId_fkey"
      FOREIGN KEY ("planoId") REFERENCES "PlanoDeConteudo"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
