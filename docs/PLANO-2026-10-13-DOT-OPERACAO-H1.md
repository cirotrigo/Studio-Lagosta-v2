# Dot Lagosta como gerente operacional: H1 (mapa, gaps e arquitetura)

13/10/2026, sobre `origin/main` `cb1ae688` (o PR #217 incluído). Só leitura: seis subagentes
(A–F) leram o código num worktree isolado, e eu integrei os relatórios. Nenhum código foi
alterado. Os achados críticos foram conferidos no código: `render-stories`, `sugerir-posts`
grava sinal e as annotations da agenda.

## 1. O que já existe

**Catálogo:** 61 tools em PT, todas com registro único (`src/lib/mcp/registro/`) e porta única
(`porta.ts`). O stdio local acrescenta **24 tools em inglês fora da porta** (`scripts/mcp-server.ts`,
sem annotations e sem gate de projeto). O `docs/regras/mcp.md` ainda fala em 48/72 tools:
está desatualizado.

| Fase | Tools que o Dot usaria | Estado |
|---|---|---|
| OBSERVAR | listar-clientes, ver-agenda, ver-geracao, ver-plano | ✅ por cliente; ❌ visão da carteira |
| PLANEJAR | consultar-dna/voz/base, sugerir-posts, buscar-fotos, ver-assinatura | ✅ (sugerir-posts **grava LearningSignal**, então não serve para auditar) |
| PRODUZIR | compor-leva (fila COMPOR, idempotente por `ItemDeLote`) | ✅ sem crédito |
| REVISAR | revisar-arte → ajustar-arte (2 rodadas), conferir-arte | ✅ |
| AGENDAR | agendar-leva (só DRAFT, idempotente, `simular`) | ✅ falta guarda de horário ocupado |
| PUBLICAR | aprovar-rascunhos, postar-agora | humanas; **gate só textual** |
| CORRIGIR | retry, avisos e stuck: tudo **automático** por crons | o Dot não deve duplicar |
| APRENDER | ver-feedback-das-artes | ✅ |

**O que já é automático e o Dot não deve duplicar:**
- retry de publicação (3 tentativas) e aviso no WhatsApp na 2ª falha (`failure-handler.ts`);
- `check-stuck-posts`, `status-sync`, `verify-stories` e `render-stories` (este com 3 tentativas
  e depois `RENDER_FAILED`);
- arquivamento de campanha vencida;
- lembrete do post manual.

## 2. O fluxo canônico possível hoje (até rascunho, sem tool nova de produção)

```
listar-clientes
→ [por cliente] sugerir-posts(inicio,fim)   ← N chamadas + sinais indevidos (gap 1)
→ consultar-dna / consultar-voz / consultar-base(em=data)
→ buscar-fotos(excluir…)
→ compor-leva(loteId determinístico, itemId determinístico por slot, quando)
→ agendar-leva(simular:true)  [polling até não haver pendente]
→ revisar-arte(generationId) → ajustar-arte (≤2 rodadas)
→ agendar-leva(simular:false) → DRAFT
→ PARA. Relata.
```

Chave determinística: `loteId = dot-<projectId>-<AAAA>-S<semana ISO>`,
`itemId = <AAAA-MM-DD>T<HH:MM>-<story|feed>`. Duas rodadas do Dot sobre o mesmo buraco caem
no mesmo `ItemDeLote` (reaproveitado ou em conflito, nunca duplicado).

**Fora do loop autônomo:**
- `executar-plano`: gate humano de duas chamadas, não cria rascunho, compõe sem `ItemDeLote`;
- `propor-semana`: grava, não aceita janela e quem escreve a copy é o Studio;
- `colocar-na-agenda`: não é idempotente, cria direto;
- `melhorar-arte` e `gerar-imagem*`: gastam;
- `pedir-foto`: o link vale 30 min, então falta de material vai para o relatório;
- toda a camada inglesa.

## 3. Gaps reais

1. **Não há visão da carteira.** "Quem não tem 2 dias cobertos?" custa 1+N chamadas, e
   `sugerir-posts` registra sinal de sugestão que ninguém viu (contamina o KPI). `ver-agenda`
   não sabe o que era ESPERADO.
2. **A expectativa existe, mas está enterrada.** A fonte de verdade é calculada dentro de
   `sugerirPosts` (`src/lib/posts/sugerir-posts.ts:245-347`): a grade aprovada da base
   ("Padrões de Postagem", que só cobre story), fundida com a cadência dos POSTED de 56 dias
   (`calcularCadencia` + `fundirGradeComCadencia` + `formatoDoBloco`), com tolerância de 45 min
   por formato. **Não é preciso heurística nova, só extrair essa função.** `InstagramGoalSettings`
   não dá horário e não serve.
3. **A ocupação é frouxa.** `sugerir-posts` conta como ocupado um DRAFT sem arte e um post de
   campanha vencida. FAILED já fica de fora.
4. **Diagnóstico de falha invisível.** `ver-agenda` não devolve `errorMessage`, `renderStatus`,
   `renderError`, `verificationStatus` nem "já está no Zernio".
5. **Nenhum gate humano no servidor.** `aprovar-rascunhos`, `postar-agora` e `cancelar-post`
   dependem só do texto da descrição. DRAFT→SCHEDULED **é** publicar, porque o cron entrega 5 min
   antes. `aprovar-rascunhos` tem `destructiveHint:false`.
6. **Duplicação por outra origem.** `ItemDeLote` protege Dot×Dot, mas nada impede o Dot de criar
   um rascunho num horário que uma pessoa ou outra sessão preencheu depois da auditoria
   (cenário 9).
7. **O `sugestaoId` se perde no caminho da leva** (`agendar-leva` não o carrega), e com ele o
   aprendizado de aceitação do slot.
8. **FAILED não tem conserto pelo remoto.** `reagendar-post` e `voltar-para-rascunho` recusam.
   O retry é automático, e o "tentar de novo" manual fica na UI.

## 4. Tools que realmente faltam

- **`auditar-operacao`**: ver a proposta abaixo. **É a única tool nova da V1.**
- **`planejar-cobertura`: NÃO.** Os buracos já vêm prontos da auditoria, e o
  `compor-leva`/`agendar-leva` com chave determinística já é o registro durável: o rascunho na
  agenda fecha o buraco na próxima auditoria. Um plano intermediário criaria um 4º caminho
  paralelo. `criar-plano` com `anexarAoAtivo` fica para quando alguém pedir a bancada.
- **`ler-manual-de-operacao`** (H3): a Constituição precisa ser entregue a clientes diferentes
  (Claude, conector do ChatGPT, Claudinho). Prompt MCP não é portátil, e colar 900 palavras em
  `instrucoes.ts` poluiria toda conversa humana. A alternativa preguiçosa é um campo `manual` na
  própria saída de `auditar-operacao`, que já é a primeira chamada da rodada. **Recomendo esse
  campo e nenhuma tool a mais.**

## 5. Proposta de `auditar-operacao`

- **Leitura pura** (`readOnlyHint`, `idempotentHint`), sem LearningSignal, `acesso: autenticado`
  e escopo por `projetosVisiveis`.
- **Módulo puro novo:** `src/lib/posts/cobertura.ts`, sem `@/lib/db`.
  - `expectativaDoProjeto(...)`: o trecho extraído de `sugerirPosts`. `sugerirPosts` passa a
    chamá-la, então as duas leituras não divergem.
  - `coberturaDoProjeto(...)`: classifica cada slot esperado.
    - **coberto:** SCHEDULED, POSTING ou POSTED, ou DRAFT com arte (`mediaUrls` ou `pageId`),
      fora de campanha vencida;
    - **pendente:** só há ocupante inválido (DRAFT sem arte, campanha vencida, FAILED), e a ação
      é consertar, não criar;
    - **vazio:** não há ocupante.
  - `export const TARGET_DAYS_AHEAD = 2`, num lugar só.
- **5 queries fixas para a carteira inteira** (não N por cliente):
  - projetos ativos;
  - POSTED de 56 dias (select enxuto);
  - posts da janela;
  - entradas de grade;
  - campanhas por id.
- **Saída por cliente**, ordenada pelo pior primeiro, sem textos nem capas:

```json
{ "alvoDias": 2, "agora": "13/10 09:12 BRT",
  "resumo": { "total": 11, "ok": 7, "abaixoDoAlvo": 3, "semRotina": 1 },
  "clientes": [{
    "projectId": 12, "nome": "Bacana",
    "hoje": "coberto", "amanha": "coberto", "depoisDeAmanha": "falta 1 story",
    "diasAdiantados": 1, "fonte": "grade|cadencia|sem-rotina",
    "buracos": [{ "data": "2026-10-15", "hora": "18:00", "formato": "story",
                  "estado": "vazio|pendente", "motivo": "…", "postId": null }],
    "rascunhos": 2, "agendados": 5,
    "falhas": [{ "postId": 991, "quando": "…", "motivo": "errorMessage/renderError curto" }],
    "avisosDeCampanha": 0,
    "assinatura": true,
    "acao": "compor story 15/10 18:00 | pedir material | consertar post 991 | nenhuma"
  }],
  "manual": "…Constituição do Dot (H3)…" }
```

- **Material:** não entra na V1 como checagem (custaria uma busca por cliente). `assinatura: false`
  ou falta de foto aparecem na produção e vão para o relatório.
  `ponytail: materialStatus fica para quando a auditoria precisar dele antes da produção.`
- **Cliente sem grade e sem histórico** sai como `sem-rotina`, **nunca** como coberto.

## 6. Desenho do Dot (Constituição v0, que será o H3)

**Missão:** manter todo cliente ativo com ≥2 dias em rascunho. Chamar Ciro ou Roberta só por
falta de material, de aprovação ou de decisão.

**Limites:** vai até rascunho. Nunca aprova, publica, posta agora, cancela ou reagenda post
agendado. Não grava DNA, voz, base nem regra. Não gasta crédito. Não inventa fato (preço,
horário e promoção vêm de `consultar-base` na data). Recusa do servidor não se contorna: o Dot
relata.

**Ordem de trabalho:**
1. `auditar-operacao`.
2. Falhas de hoje: relatar. O retry é automático.
3. Buracos de amanhã.
4. Buracos de depois de amanhã.
5. Pendentes (rascunho sem arte ou campanha vencida): relatar ou consertar se for rascunho.
6. Campanhas próximas: relatar.
7. Cobertura futura só se sobrar teto.

**Quando agir:** o buraco vem da grade ou da cadência, o cliente tem assinatura, há foto adequada
e não usada em 14 dias, e os fatos são válidos na data.

**Quando NÃO agir:** `sem-rotina`, sem assinatura, DNA e base em conflito, preço ou promoção fora
da base, `POST_REMOVIDO` (a equipe apagou), `conflitos` ou `superadas` no lote.

**Quando parar:** o mesmo erro duas vezes no mesmo cliente; o teto da rodada; serviço fora do ar;
`revisar-arte` ainda com problema depois de 2 ajustes (aí deixa o rascunho e relata a pendência).

**Estado:** a agenda mais o `ItemDeLote` **são** o estado, e o Dot não guarda memória própria. Cada
rodada começa com a auditoria.

**Revalidação antes de cada escrita:** `agendar-leva(simular:true)` imediatamente antes, mais a
guarda `HORARIO_OCUPADO` no servidor.

**Relatório:**
```
Carteira: 7 clientes cobertos por 2+ dias. 2 precisam de ação.
Bacana: rascunho criado qui 18h (story), aguardando aprovação.
Tero: sem foto adequada para qua 12h. Preciso de material.
```
Se a carteira estiver saudável, só a primeira linha.

## 7. Riscos de concorrência

| Risco | Cobertura |
|---|---|
| Duas rodadas do Dot no mesmo buraco | Chave determinística + `@@unique([projectId, loteId, itemId])`. Já existe. |
| Pessoa ou outra sessão preenche o horário depois da auditoria (cenário 9) | **Guarda nova `HORARIO_OCUPADO`** em `agendar-itens.ts`, sob a trava `FOR UPDATE` que já existe: recusar quando o mesmo projeto, formato e horário (±45 min, a tolerância do `slotOcupado`) já tem post válido fora deste `ItemDeLote`. Nada de lock global. |
| Pessoa apaga o rascunho do Dot | `POST_REMOVIDO` já existe. O Dot não recria. |
| Auditoria velha | Ela informa, nunca autoriza. A escrita sempre revalida no servidor. |
| Dot edita página com post SCHEDULED | `invalidateScheduledRenders` re-renderiza a publicação aprovada. Na V1, o Dot só edita peça própria em rascunho (instrução); a recusa no servidor fica para a V1.1. |

## 8. Dívidas classificadas

| Dívida | Classe | Por quê |
|---|---|---|
| Camada inglesa local sem gate | **BLOCKER_DOT_V1** | `create-post SCHEDULED`, `update-post`, `delete-posts` por faixa e `recover-stuck-post publish` contornam qualquer gate da porta. Conserto: com `STUDIO_SO_RASCUNHO=1`, o stdio não registra as escritas EN, ou o Dot roda só no conector remoto. |
| Sem gate de publicação no servidor | **BLOCKER_DOT_V1** (novo) | Denylist na porta para o principal do Dot (`clientId` OAuth dedicado em env), mais filtro do `tools/list`. Inclui recusa por argumento (`colocar-na-agenda situacao=agendado`, `executar-plano confirmar`, `virar-regra confirmado`). |
| Guarda `HORARIO_OCUPADO` | **BLOCKER_DOT_V1** (novo) | Cenário 9. |
| L1 `render-stories` sem `laterPostId:null` em `restantes` | **BLOCKER_DOT_V1** | Conferido em `src/app/api/cron/render-stories/route.ts:57-62`. Post congelado com PENDING ocupa vaga para sempre e pode travar o render dos rascunhos do Dot. Conserto de uma linha. |
| Falhas sem diagnóstico | **BLOCKER_DOT_V1**, resolvido dentro do H2 | Vai na saída de `auditar-operacao` (`falhas[].motivo`). Sem mexer no `ver-agenda`. |
| Vitest fora do CI | IMPORTANT | Os testes de gate e cobertura do H5 não protegem nada se o CI não roda. Proponho entrar no H5. |
| `generationId` A→B | IMPORTANT | O Dot confere a peça pelo `generationId` da própria leva, nunca por `postId`. Contornado por regra. |
| URL arbitrária / allowlist do Blob | IMPORTANT | O Dot só usa `generationId`/`pageId`, nunca URL. |
| `sugestaoId` perdido na leva | IMPORTANT | Aprendizado da grade. Um campo a mais no item de `agendar-leva`. |
| `aprovar-rascunhos` com `destructiveHint:false` | IMPORTANT | Trivial. Entra junto com o gate. |
| `sugerir-posts` frouxo (rascunho sem arte, campanha vencida) | IMPORTANT | Some quando ele passar a usar `cobertura.ts`. |
| Testes do `ver-agenda` dependem de `DATABASE_URL` | LATER | |
| 3 layouts | LATER | |
| rich-text #209 | LATER | Quarentena já ativa. |
| 403 fora do `nonRetryableReason` | LATER | |
| `mcp.md` com contagem velha | LATER | Corrigido de passagem no H2. |

**MCP "excelente" (critérios 1–10):** os pontos mais fracos são o 1 (camada EN), o 4 (authz da
camada EN e principal `service` com escopo total), o 7 (`ver-agenda` devolve textos completos e
pesa) e o 9 (Vitest fora do CI). Os pontos 2, 3, 5, 6 e 10 estão bons no catálogo PT.

## 9. Arquivos que seriam alterados

- **H2:** `src/lib/posts/cobertura.ts` (novo, puro); `src/lib/posts/sugerir-posts.ts` (passa a
  chamar a expectativa extraída); `src/lib/mcp/catalogo/agenda.ts` (tool `auditar-operacao`);
  `src/lib/posts/__tests__/cobertura.test.ts`; `docs/regras/mcp.md`.
- **H3:** `src/lib/mcp/operacao-dot.ts` (texto, conferido pelo `validar-registro-mcp`);
  `docs/regras/dot-lagosta-operacao.md` (ponteiro e porquês); 1 linha em `instrucoes.ts`;
  1 linha no índice do `AGENTS.md`.
- **H4:** `src/lib/mcp/registro/porta.ts` + `tipos.ts` (perfil só-rascunho por `clientId`);
  `catalogo/integracao.ts` (`tools/list` filtrado); `scripts/mcp-server.ts` (flag que não
  registra as escritas EN); `src/lib/lotes/agendar-itens.ts` (`HORARIO_OCUPADO` + `sugestaoId`);
  `src/app/api/cron/render-stories/route.ts` (L1); annotation de `aprovar-rascunhos`.
- **H5:** testes dos 10 cenários (funções puras + porta + guarda); Vitest no workflow do CI;
  um ensaio manual audit → leva → rascunho no branch `dev-local` do Neon.
- **H6:** só documento (o heartbeat de manhã e de tarde, sem notificação se saudável).

## 10. Estimativa

| Checkpoint | Tamanho | Observação |
|---|---|---|
| H2 auditar-operacao | médio (~350 linhas + testes) | Codex revisa no fim |
| H3 Constituição | pequeno | |
| H4 DRAFT_ONLY + guardas | médio | parte sensível; Codex adversarial obrigatório |
| H5 cenários + CI | médio | |
| H6 heartbeat | pequeno (documento) | |

## 11. Decisões que são do owner

1. **"Dois dias":** proponho que amanhã e depois de amanhã estejam completos, com o resto de hoje
   reportado à parte.
2. **Post FAILED (cenário 5):** o retry já é automático. Na V1 o Dot relata e não cria post novo
   no lugar (isso duplicaria se o retry der certo).
3. **Cliente sem assinatura:** o Dot pula e relata, porque não há caminho sem crédito e
   idempotente.
4. **Onde o Dot roda e com que identidade:** precisa de um cliente OAuth próprio, nunca a chave
   de serviço nem o stdio com camada EN.
