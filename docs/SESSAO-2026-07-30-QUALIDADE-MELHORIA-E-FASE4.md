# Sessão 2026-07-30 — qualidade da melhoria com IA, linhagem e Fase 4

Execução do plano `PLANO-2026-07-30-QUALIDADE-MELHORIA-E-FASE4.md` (commit
0ba4e9f), aprovado pelo Ciro em 30/07. Contexto anterior:
`SESSAO-2026-07-29-MELHORIA-IA-CRIATIVOS.md` e CLAUDE.md § "DNA da Marca".

Commits da sessão (em ordem): `8cf4d64` e `b2bb14f` (lint), `ee1f3b3` (A2),
`a424410` (A1), `5238a1d` (dedução não-fatal), `f5fe426` (B), `43d4d5c` (C),
`7c3a505` (D1).

---

## 1. A2 — resolução nativa no gpt-image-2 (`ee1f3b3`)

O gpt-image-2 gerava em `1024x1792` e o Sharp **esticava** para 1080x1920 —
upscale que borrava justamente o texto pequeno, o ponto mais frágil da
melhoria. Agora os três formatos geram ACIMA da saída final e o resize vira
downscale leve:

| Formato | Antes | Agora | Crop residual |
|---|---|---|---|
| STORY | 1024x1792 | **1088x1936** | ~2px (9:16 ≈ 0.5620 vs 0.5625) |
| FEED_PORTRAIT | 1024x1280 | **1088x1360** | zero (4:5 exato) |
| SQUARE | 1024x1024 | **1088x1088** | zero |

Regras que ficaram:

- **`FORMAT_TO_INPUT_SIZE` em `cost-estimates.ts` é LEGADO CONGELADO** — serve
  só às linhas de uso antigas, que não gravavam `inputSize` nos details. Não
  acompanha o `creative-improvement-format.ts`: a dedução grava `inputSize`
  desde esta sessão, então linha nova nunca cai no mapping.
- Preço dos tamanhos novos assumido igual ao bucket vizinho da tabela oficial
  (1088x1936 → preço de 1024x1792 etc.) até a tabela discriminar.
- Confirmado no E2E: log `gpt-image-2 1088x1936 concluído em 112.7s` — o
  tamanho novo não estourou o perfil de tempo (30–100s típico continua).

## 2. A1 — verificação de texto pós-melhoria (`a424410`)

A melhoria redesenha cada letra e, aplicada a post APROVADO
(`applyToPostId`), vai ao ar **sem re-revisão humana**. Erro de grafia em
preço/horário/nome é o modo de falha nº 1 do gpt-image. O pipeline agora
fecha o ciclo em três pontos:

1. **Prompt**: os textos da Generation original viram a seção
   `[TEXTO EXATO — VERBATIM]`, montada por `buildPromptSections` (origin
   `system`) e posicionada por ÚLTIMO no prompt — vence inclusive o pedido do
   cliente. A prévia da aba Marca acompanha sozinha (mesma função) e ganhou
   uma `runtimeNote` explicando a seção.
2. **Pós-geração**: `gpt-4o-mini` transcreve a arte
   (`src/lib/ai/creative-text-verification.ts`) e cada texto esperado precisa
   aparecer na transcrição, comparado normalizado (uppercase, sem acento,
   espaços colapsados, aspas/traços tipográficos → ASCII). **Pontuação é
   MANTIDA** — "R$ 49,90" com vírgula perdida não passa.
3. **Decisão**: divergiu → regenera (2 gerações no total). Persistiu →
   Generation **FAILED** com `fieldValues.error` claro ("texto divergente:
   …") e o post **fica com a arte original**. Créditos só são cobrados no
   sucesso.

De onde saem os textos esperados (`extractExpectedTexts`):

- `fieldValues.slotValues` (arte-rápida/MCP; chaves `_`-prefixadas puladas,
  valores string ou `{content}`) ou `fieldValues.texts` (gerar-criativo).
- Re-melhoria sobe a cadeia `originalGenerationId` (até 5 níveis) atrás da
  Generation raiz — melhoria de melhoria confere contra o texto original.
- **Sem texto esperado → `textCheck: 'skipped'`**, nunca inventado: upload
  externo e export do editor (konva_editor não guarda textos) não são
  verificados.

Decisões de projeto que valem para mudanças futuras:

- **Verificador fora do ar não derruba a melhoria**: erro na chamada de visão
  → `textCheck: 'skipped'` com o motivo, e a arte segue. Indisponibilidade de
  infra ≠ texto errado.
- **Orçamento de tempo medido, não chutado**: o teto da function é 300s; o
  loop mede o restante a cada rodada (`BACKGROUND_BUDGET_MS` 290s −
  `FINALIZE_RESERVE_MS` 35s) e PULA a retentativa quando não sobra
  `MIN_RETRY_BUDGET_MS` (45s). Tempos reais do E2E: download 2.8s, geração
  112.7s, checagem 5.2s.
- **Auditoria em `fieldValues`**: `textCheck`
  (`passed`/`skipped`/`failed`), `textCheckAttempts` (tempos e diffs por
  tentativa), `textCheckExtracted` (transcrição, nas falhas),
  `textCheckReason` (nos skips).
- **O pipeline saiu da rota**: `processImprovementInBackground` vive em
  `src/lib/ai/creative-improvement-runner.ts`; a rota improve só valida,
  cria a Generation PROCESSING e dispara `after()`. Foi o que permitiu o E2E
  rodar o MESMO código sem sessão Clerk.

## 3. Dedução de créditos não-fatal (`5238a1d`)

Achado do E2E: com a arte já gerada, verificada e no Blob, a dedução estourou
o timeout de transação (5s, latência local→Neon) e o catch geral virava a
Generation COMPLETED em **FAILED**, pulando a aplicação ao post — arte boa
descartada por soluço de cobrança. Agora a dedução falhando **loga alto**,
grava `fieldValues.creditDeductionError` para acerto manual e a melhoria
segue valendo. Racional: dar uma melhoria de graça é erro pequeno; jogar fora
uma arte verificada e mentir "falhou" é erro grande.

## 4. E2E em produção (protocolo do plano)

Script temporário `scripts/.tmp-test-improve-e2e.ts` (untracked): cria uma
arte-rápida real no projeto 8 com 3 textos armadilha ("ALMOÇO EXECUTIVO DA
LAGOSTA", "Terça a sexta, 11h30 às 14h", "R$ 49,90 por pessoa"), agenda um
post `publishType: REMINDER` +7 dias (o executor ignora REMINDER em todas as
filas — nada chega ao Zernio), roda o runner de verdade e limpa TUDO no
`finally` (post + generations + page + blobs de teste).

Resultado: `textCheck: passed` na 1ª tentativa, 25 créditos deduzidos pelo
caminho real, arte aplicada ao post, cleanup completo. Custo da sessão: 2
chamadas reais ao gpt-image-2 (a 1ª revelou o bug da dedução) + 25 créditos
(a 1ª não chegou a deduzir).

Armadilha registrada: **`Project.userId` é o id INTERNO do User, não o
clerkId** — a dedução recebe clerkId (`user_…`). Existe inclusive um User
fantasma antigo com `clerkId = cmgh24…` criado por essa mesma confusão em
outubro/2025. Script que simule o fluxo precisa do clerkId real.

## 5. B — linhagem e comparação (`f5fe426`)

- **`Generation.sourceGenerationId`** (migration à mão
  `20260730170000_add_generation_source_generation_id`, `IF NOT EXISTS` +
  index, aplicada com `migrate deploy`). **Sem FK de propósito**: apagar a
  origem não pode arrastar a melhoria. `fieldValues.originalGenerationId`
  continua sendo gravado por compatibilidade.
- Backfill: as **500** melhorias antigas (o "são poucas" do plano subestimou)
  ganharam a coluna a partir do próprio fieldValues — 0 restantes.
- UI na galeria de criativos: badge "✨ melhorada" no card
  (`sourceGenerationId` presente), dialog **antes/depois** lado a lado
  (`compare-improvement-dialog.tsx`; original apagada degrada para aviso) e
  **"Melhorar de novo"** — reabre o `ImproveCreativeModal` com o
  `userRequest` anterior pré-preenchido (só na abertura; digitação não é
  sobrescrita).

## 6. C — Fase 4, limpeza criteriosa (`43d4d5c`)

- **C1**: `floating-zoom-controls.tsx` removido (nunca importado),
  `_containerRef` morto removido do `konva-editor-stage`. O `handleWheel`
  no-op FICA — documenta a decisão de não dar zoom por scroll. A
  `BrandIdentity` órfã já não existia.
- **C2 (dois tempos — NÃO apagar)**: `brand-style`, `design-system` e
  `art-templates` ganharam `@deprecated` + `console.warn('[deprecated] …')`
  por handler. O `generate-art` ainda lê o que elas escrevem. **Remoção real
  só depois de 2+ semanas sem o warn nos logs de produção — decisão futura do
  Ciro, não desta sessão.**
- **C3**: TOM_DE_VOZ marcado como legado na página `/knowledge` (selector
  "(legado)" + aviso âmbar no formulário e nos cards), espelhando o que a
  tool `criar-entrada-base` já avisa. A categoria fica no enum: entradas
  antigas existem.

## 7. D1 — CI mínimo (`7c3a505`)

`.github/workflows/ci.yml`: `npm ci` + `prisma generate` + `typecheck` +
`lint` em push/PR na main. Sem testes (não existem), sem deploy (Vercel).
Pré-requisito descoberto na sessão: a main tinha **4 erros de lint**
(`prefer-const`) que fariam o CI nascer vermelho — corrigidos em `8cf4d64` e
`b2bb14f`.

## 8. D2 — banco de desenvolvimento (aprovado e executado no fim da sessão)

Aprovado pelo Ciro em chat depois da proposta. O `.env` e o fluxo de produção
**não foram alterados**: continuam apontando para produção, porque scripts,
MCP e `db:studio` são ferramentas de operação e dependem disso.

O que entrou:

- **`scripts/dev-db.ts`** — runner que executa um comando com as URLs do
  `.env.development.local` por cima do `.env` e **recusa rodar** se o banco
  resolvido for o de produção.
- **`scripts/setup-dev-db.ts`** — cria/reaproveita o branch `dev` no Neon
  (automático com `NEON_API_KEY`, senão imprime o passo a passo do console) e
  escreve o `.env.development.local`. `--recriar` refaz do estado de hoje.
- **package.json**: `db:migrate`, `db:push` e `db:reset` passam pelo runner
  (dev); `db:deploy` nasce como o caminho explícito de produção;
  `db:studio:dev`, `db:dev:setup` e `db:dev:status` são novos.

### O desenho ingênuo do plano era inseguro

O plano dizia "`dotenv -e` nos scripts". Testado antes de implementar:
`dotenv-cli -e .env.INEXISTENTE -e .env` **cai em silêncio no `.env`**. Como o
`.env` é produção, um `.env.development.local` apagado faria
`npm run db:migrate` (= `prisma migrate dev`, que propõe **resetar o banco**)
rodar contra PRODUÇÃO. Por isso o runner próprio em vez do dotenv-cli.

O guard compara o **compute** do Neon (primeiro rótulo do host, sem
`-pooler`), não o host inteiro — senão a URL *direta* de produção colada no
`DATABASE_URL` de dev passaria. Seis testes rodados: arquivo ausente (aborta),
`db:migrate` com arquivo ausente (aborta), URL pooled de produção (aborta),
URL direta de produção disfarçada (aborta), endpoint diferente (passa e
repassa o env ao filho), `--status` (relatório correto).

### Limpeza junto

O `.env.local` tinha `DATABASE_URL`/`DIRECT_URL` **byte a byte idênticos** aos
do `.env` — duplicata da URL de produção em dois arquivos, a mesma armadilha
do refresh token do Drive (editar um, esquecer o outro, a camada de cima vence
calada). Comentadas, com a resolução verificada antes e depois: produção
continua resolvendo pelo `.env`.

### O branch chamado `dev` era a PRODUÇÃO

Com a `NEON_API_KEY` no `.env`, o setup automático revelou o que o console
escondia: no projeto `studio-lagosta`, o compute `ep-fragrant-term-adnufsao`
— o do `.env` **e** o do env de produção da Vercel, conferido com
`vercel env pull` — pertence ao branch **chamado `dev`**
(`br-fancy-boat-adl32qyg`, criado em 31/12/2025). O branch chamado
`production` (`br-dawn-heart-adi76dh9`, o `default` do projeto) está
abandonado, com o compute `ep-restless-silence-adjepguy` idle.

Consequência imediata: a primeira versão do `setup-dev-db.ts` criava/apagava
um branch chamado `dev` — ou seja, o `--recriar` **apagaria a produção**. O
script foi corrigido antes de qualquer execução destrutiva (ele recusou
sozinho, porque o branch já existia):

- a produção passou a ser identificada pelo **dono do compute do `.env`**,
  nunca pelo nome nem pelo flag `default`;
- o branch de dev virou **`dev-local`** (`ep-holy-flower-ada0j66v`), criado a
  partir do branch de produção real;
- `--recriar` tem trava dura: recusa apagar o branch que serve a produção.

Também corrigidos no caminho: a chave era procurada só em `process.env` e
`.env.local` (o Ciro pôs no `.env`), e o `GET /projects` do Neon exige
`org_id` desde que as contas viraram organizações — o script descobre a org
via `/users/me/organizations`.

### Verificações finais

`dev-local` nasceu com os dados da produção (`projects=11`,
`generations=4227`, `socialPosts=7659` — idênticos) e o isolamento foi
provado na prática: um registro escrito no dev **não** apareceu na produção, e
foi removido em seguida.

### Os branches foram renomeados (ainda em 30/07)

A pedido do Ciro, já nesta sessão. Renomear é seguro porque a string de
conexão vem do **endpoint** (`ep-…`), não do nome do branch; antes de escrever
foi conferido que nenhum código referencia nome/id de branch e que as env vars
da Vercel são valores manuais, sem integração do Neon que ressincronizasse.

Ordem obrigatória (nomes são únicos no projeto):

1. `production` (`br-dawn-heart-adi76dh9`, o abandonado) →
   **`abandonado-producao-2025`**, liberando o nome;
2. `dev` (`br-fancy-boat-adl32qyg`, a produção real) → **`production`**.

O script de rename só escreve depois de afirmar que o dono do compute do
`.env` é mesmo o branch chamado `dev` e que o `production` de então é outro.

Verificação pós-rename: ids, computes e o mapeamento endpoint→branch
intactos; produção respondendo (e **crescendo**: `socialPosts` foi de 7659
para 7666 durante a sessão, tráfego real) enquanto o `dev-local` seguiu em
7659 — liveness e isolamento na mesma medida.

### O que ficou faltando na topologia

**O flag `default` continua no branch abandonado.** No Neon o branch `default`
é o único protegido contra exclusão: hoje o lixo está protegido e a produção
não. Mover o `default` para o `production` fecharia isso, mas pode alterar
configuração de compute/autoscaling de um banco vivo — não foi feito por não
ter sido pedido e por ter efeito colateral não óbvio. Decisão do Ciro.
