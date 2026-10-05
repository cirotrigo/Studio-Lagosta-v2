# Retomada — vídeo na agenda, movimento e transições (03/10/2026)

Passagem de sessão: a anterior ficou grande demais (o CLAUDE.md de ~820 KB entra
em toda sessão). Tudo o que falta para concluir o plano está aqui.

## O pedido

- Agendar o vídeo direto do editor: gera o MP4 na hora, põe na agenda e deixa a
  página ligada ao post, para a Roberta voltar ao editor, corrigir e SUBSTITUIR
  o vídeo do post.
- Movimento (zoom dinâmico) nas fotos e transições entre clipes, de uso
  intuitivo para a Roberta. **Sem transição no som.**
- Plano aprovado pelo Codex na v3:
  `docs/PLANO-2026-10-03-VIDEO-NA-AGENDA-MOVIMENTO-E-TRANSICOES.md` (commit
  ff1b33cc, presente nos dois branches).
- O Ciro autorizou a migration em produção e o merge ("Pode fazer a migração e
  merge necessários"). Processo combinado: o Codex revisa cada frente até APTO
  (máx. 4 rodadas) → migration em produção → merge → deploy.

## Onde está cada coisa

| Frente | Branch | Worktree | Commits |
|---|---|---|---|
| Fase 1 — vídeo na agenda | `feat/video-agenda-zoom-transicoes` | `/Users/cirotrigo/Documents/Studio-Lagosta-v2/.claude/worktrees/linha-do-tempo` | ff1b33cc (plano), 5bfe5d7d, 22522dbf, 235a6454 (prova) e o WIP desta passagem |
| Fases 2+3 — movimento e transições | `feat/video-movimento-transicoes` | `/Users/cirotrigo/Documents/Studio-Lagosta-v2/.claude/worktrees/movimento-transicoes` | 3e3d8527 (Fase 2), 5bc21260 (Fase 3), d3cf67af (as 8 correções da 1ª revisão do Codex; sem push) |

- A main estava em 832dc075 (#190). Confira se andou antes de integrar.
- `linha-do-tempo` tem `prisma/generated` GERADO localmente (o schema dele tem a
  migration nova) — não é symlink.
- `movimento-transicoes` tem `node_modules` e `prisma/generated` como SYMLINK
  para o repo principal: `unlink` dos dois antes de `git worktree remove`.

## Fase 1 — estado

### O desenho que está no código

- Migration `prisma/migrations/20261003120000_video_na_agenda`:
  `VideoProcessingJob.attempts` e `SocialPost.videoDaPagina` (+ backfill).
  Aplicada só no dev. A contagem somente leitura em produção deu 0 linhas a
  preencher.
- Job arrendado por `startedAt` + `attempts` (compare-and-set); recuperação de
  job travado com prazo de 7 min e teto de tentativas.
- Etapas em ordem: (1) o MP4 sobe e o marcador `mp4ResultUrl` é gravado LOGO
  depois (`etapaDoMp4`, `src/lib/video/etapas-do-video.ts`); (2) cobrança com o
  marcador no mesmo commit (gancho `noMesmoCommit` de
  `deductCreditsForFeature`); (3) Generation COMPLETED; (4) destino: galeria,
  agenda (cria o post) ou substituir; (5) job COMPLETED.
- `Generation.fieldValues.videoDaPagina = { pageId, versao, divergiuNaGravacao,
  destino, esperado?, resultado?, postId?, predecessoras? }`. NUNCA
  `fieldValues.pageId` — esse campo diz "esta é a arte (imagem) da página".
- `SocialPost.videoDaPagina` + o predicado `postDeVideo` em todas as portas.
- Substituição sob trava do post (`SELECT … FOR UPDATE`) + compare-and-set em
  `updatedAt`; cadeia de predecessoras = "o mais novo vence";
  `gravarApontandoPara` só apaga arquivo comprovadamente órfão;
  `finalizarFalhaDoVideo` grava job e Generation FAILED num commit.

### Correções da 1ª revisão do Codex (BLOQUEADO, 10 achados) — escritas, NÃO verificadas

Estão no commit WIP desta passagem. Confira cada uma no diff
(`git -C <wt> show HEAD`):

1. P1 — débito confirmado com resposta perdida virava falha definitiva →
   `process-video-job.ts` + `cobranca-do-video.ts`: reconciliar o marcador de
   cobrança depois de QUALQUER erro ambíguo; sem confirmação, o job fica
   recuperável. Teste: `cobranca-do-video.test.ts`.
2. P1 — o executor podia cancelar um post cujo vídeo acabou de ser recuperado →
   `executor.ts`: `updateMany` condicionado à mídia/revisão lida; aviso só com
   `count > 0`.
3. P2 — o MP4 era apagado em qualquer erro do marcador, e o marcador vinha
   depois de miniatura e Drive → `etapaDoMp4` / `gravarApontandoPara`.
4. P2 — enfileiramentos concorrentes quebravam "o mais novo vence" →
   `enfileirar-video.ts` (`comOPostTravado`, dentro da transação que cria o
   pedido). Teste: `enfileirar-video-concorrente.test.ts`.
5. P2 — escritas na Generation fora do arrendamento; falha gravada em dois
   commits → `comArrendamento` (`process-video-job.ts`) e `finalizarFalhaDoVideo`.
6. P2 — o editor usava o post mais novo da página em vez do `postIdDaAgenda` →
   `video-export-button.tsx`, `template-editor-shell.tsx`, rota
   `agenda-das-paginas`.
7. P2 — a faixa da página não acompanhava a edição →
   `use-agenda-das-paginas.ts`, `use-pages.ts`.
8. P2 — a retomada pulava os efeitos pendentes do agendamento →
   `process-video-job.ts`: retomar os efeitos idempotentes pelo post que já
   existe e marcar a conclusão à parte.
9. P2 — esgotar as tentativas de substituição não gravava `PostLog` → a
   recuperação no laço de jobs travados grava o resultado e
   `registrarRecusaNoHistorico` no mesmo commit.
10. P3 — a arte da página aceitava Generation sem `resultUrl` →
    `arte-da-pagina.ts` (+ teste); a mesma seleção nos três consumidores.

### Opções de transação (pool do Neon com `connection_limit=1`)

Transação interativa precisa de `{ maxWait: 10_000, timeout: 20_000 }`: o
`maxWait` padrão de 2 s estoura com concorrência ("Unable to start a transaction
in the given time"). Já aplicado em `finalizarFalhaDoVideo`, `criarJobDeVideo`,
`comArrendamento` e na recuperação da substituição esgotada. Se a prova ainda
acusar um job cobrado zero vezes, aplicar o mesmo em
`src/lib/credits/deduct.ts` (transações sem opções por volta das linhas 105,
175, 284 e 384). Dentro da transação, só `tx` — nunca `db`.

### Última prova (ANTES dessas opções de transação)

`npx tsx scripts/validar-video-na-agenda.ts [--saida <pasta>]` (recusa produção
pela guarda `destino-da-prova`; roda no branch de dev). Resultado: 103 ok,
2 falhas:

- cenário 8b (dois `substituir` simultâneos no mesmo post): "Unable to start a
  transaction in the given time";
- "cada um dos 15 jobs foi cobrado exatamente uma vez — 1,1,1,1,1,1,1,1,1,0,…"
  (provavelmente consequência da mesma espera).

## Fases 2+3 — estado

- **Os 8 achados estão corrigidos no commit d3cf67af** (worktree limpo, sem
  push). Verificado pelo agente que corrigiu: tsc 0, lint 0, vitest 2998
  passando (244 arquivos), harness 131 checagens OK; desfazer a correção 1 derruba
  5 checagens. Medido: com a camada selecionada e tocando, a escala segue o
  relógio (desvio máx. 0,0015); MP4 da fila com imagem e som; dissolver e
  deslizar com 6 s de som, troca de tom em 2,001 s e 4,001 s, vazamento 0,000%,
  imagem 0,050 s / 0,017 s atrás do som (limite 0,1 s).
- O que cada correção fez: (1) suspensão só durante o gesto (`instalarToque`,
  teste novo `aplicar-quadro.test.ts`); (2) grupo de recorte (máscara ∩ cantos)
  envolve o grupo do movimento e a borda é Shape irmã — no servidor,
  `drawImageEmMovimento`; (3) `raioDoBlurNoCache` compensa o 1,15× e o servidor
  filtra na caixa; (4) a miniatura aplica o quadro 0 antes de capturar; (5)
  `scripts/mcp-server.ts` leva `page.audio`; (6) `quadroZeroEmVideo` entra na
  versão visual e o PATCH invalida quando o áudio muda o quadro 0 — é ISSO que
  explica a mudança em `src/lib/lotes/agendamento.ts` (o lote compara a versão
  com o áudio); (7) harness com `KonvaSelectionTransformer` real,
  `processar-servidor.ts` rodando o `processNextVideoJob` real e tons
  440/880/660 Hz medidos no MP4; (8) WeakMap dos desinstaladores.
- O harness usa `FFMPEG_PATH` = ffmpeg-static (o ffmpeg do sistema recusa
  `-vsync`).
- ⚠️ **Divergência ANTERIOR, fora do escopo**: cantos arredondados diferem ~8 px
  entre servidor (curvas quadráticas) e Konva (arcos) no raio 80.
- ⚠️ **Risco da integração**: `processar-servidor.ts`/`stub-servidor.ts` do
  harness rodam o `processNextVideoJob` real, que a Fase 1 reescreveu
  (arrendamento por SQL, `attempts`, `etapaDoMp4`, cobrança). Depois do merge o
  stub provavelmente precisa acompanhar.
- Os achados (BLOQUEADO; linhas da revisão sobre 5bc21260):
  1. P2 — selecionar a camada desliga o efeito também durante o play
     (`aplicar-quadro.ts:250`) → suspender só durante o gesto.
  2. P2 — o movimento transforma máscara e borda (`konva-layer-factory.tsx:1212`,
     `render-engine.ts:127`) → mover só a imagem interna, nos dois renderizadores.
  3. P2 — a densidade 1,15× do cache muda o raio do desfoque
     (`konva-layer-factory.tsx:957`, `render-engine.ts:1581`) → compensar e
     manter a paridade com o servidor.
  4. P2 — a miniatura grava o movimento suspenso
     (`template-editor-context.tsx:683`) →
     `aplicarQuadro(clone, design, 0, { gravando: true })` antes da captura.
  5. P2 — o `render-story` do MCP perde `page.audio`
     (`scripts/mcp-server.ts:1305` e `:1374`) → levar o áudio nas duas chamadas.
  6. P2 — o áudio muda o quadro inicial, mas não a versão visual nem a
     invalidação (`persist.ts:332`, `revisao/versao.ts:46`,
     `pages/[pageId]/route.ts:193`).
  7. P2 — o harness não prova a aceitação: seleção e Transformer reais; medir a
     imagem e o áudio do MP4 final, com tons identificáveis nos clipes
     (`entrada.tsx:167`, `rodar.mjs:865`).
  8. P3 — listeners globais `pointerup`/`pointercancel` acumulam
     (`aplicar-quadro.ts:199`) → limpar no descarte.
- A 1ª revisão está em
  `/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2/6ffcbb8d-6e89-4aa3-b2f0-4d7c87f47c6a/scratchpad/codex-f23-1.txt`
  (a da Fase 1 em `codex-f1-1.txt`, mesma pasta) — o scratchpad pode ter sido
  limpo; os achados estão transcritos acima.

## Servidor local e teste de interface

- `npm run dev` do worktree `linha-do-tempo` na porta 3005 (pid 61885). O Ciro
  já fez login. Se a sessão anterior for fechada, pode ser preciso subir de novo.
- Usa o branch de dev do Neon, mas Blob, Drive e APIs são os de PRODUÇÃO:
  apagar os uploads de teste no fim.
- Projeto de teste: Lagosta Criativa (id 8).
- Roteiro: estados do diálogo "Depois de gerar"; o rascunho criado na agenda;
  "Editar vídeo" a partir da agenda; o editor aberto com `postId` ("Substituir
  vídeo na agenda", "Salvar sem gerar", a pergunta do "Salvar e Voltar"); o
  aviso de "vídeo desatualizado"; a faixa da página; o celular.
- Não verificado: como o cron de conversão do MP4 roda localmente.
- Movimento e transições só aparecem no local DEPOIS de integrar os dois branches.

## O que falta, em ordem

1. **Fase 1**: `npm run typecheck` no worktree → vitest das 5 suítes
   (`src/lib/credits/__tests__/cobranca-do-video.test.ts`,
   `src/lib/compositor/__tests__/arte-da-pagina.test.ts`,
   `src/lib/posts/__tests__/post-de-video.test.ts`,
   `src/lib/video/__tests__/enfileirar-video-concorrente.test.ts`,
   `src/lib/video/__tests__/etapas-do-video.test.ts`) → a prova em segundo
   plano → conferir os 10 achados no diff → commit → re-revisão do Codex até
   APTO (máx. 4 rodadas).
2. **Fases 2+3**: 2ª revisão do Codex sobre d3cf67af (`feat/video-movimento-transicoes`,
   diff `5bc21260..d3cf67af` + a lista de achados acima) → corrigir o que
   voltar → até APTO (máx. 4 rodadas). Pode rodar em paralelo com o passo 1.
3. **Teste de interface** em localhost:3005 (roteiro acima) e relato ao Ciro.
4. **Integrar**: merge de `feat/video-movimento-transicoes` em
   `feat/video-agenda-zoom-transicoes` (conflitos esperados em
   `scripts/mcp-server.ts`, `persist.ts`, `page-to-design-data` e
   `story-renderer`); trazer a main se ela andou; rodar tudo de novo; revisão
   FINAL do Codex.
5. **Produção**: contagem somente leitura → `npm run db:deploy` (antes do merge:
   o código novo lê as colunas) → PR → `ccd_pr get_status` / `bind_pr` → merge
   → acompanhar o deploy na Vercel.
6. **Documentar**: regras duráveis no CLAUDE.md (seção do vídeo no editor) e a
   memória `project_video_na_agenda_movimento.md`.
7. **Limpeza**: parar o servidor da 3005 e o preview; `unlink` dos symlinks
   antes de `git worktree remove`; apagar os uploads de teste do Blob.

## Como trabalhar

- Commit por worktree, arquivo por arquivo (`git add -- <caminho>`, inclusive os
  não rastreados; caminho com `[id]` exige `GIT_LITERAL_PATHSPECS=1`). Confira
  `git branch --show-current` antes. Nunca `git add -A`.
- O commit WIP desta passagem tem código ainda não verificado: não abra PR antes
  do passo 1.
- Revisão do Codex, em segundo plano:
  `codex exec -s read-only -c model_reasoning_effort=high "<pedido>" < /dev/null > <arquivo>.txt 2> <arquivo>.err`.
- O Fable esgotou: agentes de correção com `model: "opus"`, tarefas pequenas.
- Rodapé de commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  Rodapé de PR: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- O `.env` é PRODUÇÃO; `npm run dev` lê o `.env.development.local` (dev).
  Migration em produção só por `db:deploy`, com a contagem antes.
- Respostas ao Ciro em português.
