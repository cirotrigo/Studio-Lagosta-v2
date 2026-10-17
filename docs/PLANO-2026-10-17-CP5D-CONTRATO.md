# CP5d — contrato técnico do GATE em `ajustar-arte` (perfil draft-only) — proposta para revisão, 17/10/2026

**Estado: PROPOSTA (rodada 4 do Codex: NÃO APTO — 1 BLOCKER, 2 IMPORTANTE, 1 MENOR, endereçados: o fechamento `FAILED` (do `ajustarArte` e do cron) vira UMA instrução atômica condicionada a `PROCESSING` — status, `completedAt` e o patch JSON por `||` na mesma `UPDATE` (`fecharGenerationComoFalha` em `mesclar-field-values.ts`), quem fecha primeiro vence e o segundo não escreve nada, A16 confere qual motivo venceu; o patch do cron preserva `failedAt` e `recuperadaPelaFila`; `travarRecomposicaoDaArte({ alvo })` lê a linha travada e respeita `somenteReRender` já gravado (equivalência testada); o limite da requisição MCP é `maxDuration = 300` s. Rodada 3: NÃO APTO — 2 BLOCKER, 2 IMPORTANTE, 1 MENOR, endereçados: a seleção do alvo da recomposição é a MESMA de `travarRecomposicaoDaArte` (20 mais recentes com `resultUrl`, a primeira aceita por `ehArteDaPagina`), extraída para `alvoDaRecomposicao(client, pageId, projectId)` e usada pelos dois; `marcarGenerationFalha` do cron passa a gravar por MERGE (viola a regra 🔴 do `AGENTS.md` hoje — `{ ...anterior, error }` apaga `gateDaArte`), entra no escopo com A16 cobrindo a corrida; § 3.2 corrigido (`geracaoDeOrigem`); §§ 1, 6 e 7 unificados com a decisão 8.8 (código do CP4 só no perfil normal); § 4.4 corrigido; descrição da tool e A7 cobrem `details.causa`. Rodada 2: NÃO APTO — 2 BLOCKER, 3 IMPORTANTE, endereçados: o alvo REAL de `travarRecomposicaoDaArte` (a Generation com `resultUrl` mais recente, qualquer `source`) é travado junto com a de origem, em ordem de id; o fechamento `FAILED` grava `fieldValues.error` por merge (não existe coluna `errorMessage`) e o cron só SELECIONA órfãs com 10 min, em lotes — não é teto; o exemplo de § 3.3 passa `geracaoDeOrigem`; a galeria NÃO lista `FAILED`; no draft-only a recusa total do CP4 sai como `REVISAO_HUMANA_NECESSARIA` com `details.causa` = código do CP4 (decisão 8.8) — é o que P11 verifica; o custo de contenção da trava da Generation é dito e medido em A13. Rodada 1: NÃO APTO — 2 BLOCKER, 4 IMPORTANTE; endereçados: a Generation de ORIGEM é a do compositor da página, travada `FOR UPDATE` antes das referências e passada ao contexto com `composicaoReaproveitavel: false`; a Generation PROCESSING criada na transação é FECHADA explicitamente como `FAILED` quando o render falha ou a página muda — o cron não a renderiza, só a marca FAILED aos 10 min; `audio` relido sob trava; a ordem das travas inclui a escrita de `travarRecomposicaoDaArte` (Page → Generation do compositor → FOR SHARE, a mesma do CP5c); os leitores (bancada, galeria, `ver-geracao`, `agendar-leva`) ditos na § 4.4; matriz A13–A17 e o harness de P11 com rollback; "os testes provam" rebaixado para "os testes exercitam, com os limites ditos").** Nada aqui está implementado; este PR é documental. Base:
`main` `cc6b01f0` (CP5c mergeado: PR #242; contrato do CP5c em `docs/PLANO-2026-10-16-CP5C-CONTRATO.md`). Fontes:
plano-mestre `docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md` § 4.6, contratos do CP5b (§ 12) e do CP5c
(§ 2 "não entra"), o executor do CP4 (`revisao/ajustar-sem-piorar.ts`, `nao-piora.ts`) e `ajustarArte`
(`creatives/arte-rapida.ts`) como estão na main (citados por função). As decisões da seção 8 são do OWNER; a
implementação, quando autorizada pelo ciclo, usa as recomendações como PROPOSTA nomeada (constante ou `if` trocável
numa linha), nenhuma rotulada aprovada.

## 0. O que o CP5d entrega, em uma frase

No perfil efetivo **draft-only**, `ajustar-arte` só GRAVA a página (e só reabre o render dos rascunhos) depois de a
versão FINAL que seria gravada — a candidata que o executor do CP4 aceitou, com os textos/foto da chamada — ser
MEDIDA sob as travas da transação que escreve e aceita pelo gate (`decidirEMontarRegistro`, `gate.resultado ===
'APTO'`); o veredito é registrado na Generation que o render desta chamada vai fechar; todo outro caso volta
`REVISAO_HUMANA_NECESSARIA` com `ajusteGravado: false`, página intacta, render NÃO reaberto, última versão preservada.
"Não piorou" (CP4) continua necessário e deixa de ser suficiente para o agente escrever. O fluxo humano continua
WARN-ONLY + CP4, byte a byte.

## 1. O que a main tem hoje (o que o contrato muda e o que preserva)

| Ponto | Hoje (`ajustarArte`) | CP5d (só `apenasRascunho`) |
|---|---|---|
| Pré-checagens | formato dos `slotValues`, versão esperada, `CONTEUDO_NAO_PODE_SER_REMOVIDO` (draft-only), foto, bake, reflow, `PAGINA_COM_VIDEO`, autofix da base | iguais |
| Executor do CP4 | `aplicarAjustesSemPiorar` mede N candidatas FORA de transação; todos recusados e nada mais a gravar → `AJUSTE_PIOROU_ARTE`/… (422, nada gravado) | o executor e a ordem não mudam; no draft-only a recusa TOTAL sai como `REVISAO_HUMANA_NECESSARIA` com `details.causa` = o código do CP4 (§ 3.1, decisão 8.8); no perfil normal o código do CP4 continua |
| Transação de escrita (20 s) | draft-only: posts da página `ORDER BY "id" FOR UPDATE` e `POST_APROVADO_INTOCAVEL`; CAS da página (`updatedAt`/`isTemplate`, ou releitura por conteúdo); `travarRecomposicaoDaArte` | igual + (§ 4): travas do que a medição lê; Generation PROCESSING criada na transação; **a medição do gate e a decisão acontecem aqui**, sobre a candidata final; `gravarGateDaArte(tx, registro)`; não APTO → `RecusaSobTrava` → rollback inteiro (nada gravado) |
| Depois do commit | `renderPageAndRegister` (Generation nova, `versaoEsperada`), `invalidateScheduledRenders` (`apenasRascunho` → só DRAFT), aprendizado | `renderPageAndRegister({ generationId })` FECHA a Generation criada na transação; o resto igual. Nenhum efeito roda quando o gate recusou (não há commit) |
| Retorno (`AjustarArteResult`) | `ajustada`, `versao`, `ajustesAplicados/Recusados`, … | + `revisao` (§ 6) no draft-only; a recusa do gate é `CreativeError('REVISAO_HUMANA_NECESSARIA', …, 422, { ajusteGravado: false, revisao, achados, motivos })` |
| Testes | `piloto-ciclo.test.ts` P11 "o ajuste que piora é recusado ANTES de substituir a versão do rascunho" (`hojeViola`) | vira `it()` neste PR (regra do CP0); o `hojeViola` "em até 2 ciclos … apta ou REVISAO_HUMANA_NECESSARIA" (fluxo HUMANO) fica para o CP5e (§ 2) |

**Nada muda para o perfil normal** (humano): `apenasRascunho === false` → nenhuma medição do gate, nenhum registro,
nenhuma trava nova, nenhuma recusa nova. Regra do H4 (plano-mestre § 4.5).

## 2. Escopo e não-escopo

**Entra**: (a) medição + decisão do gate SOB TRAVA na transação de escrita de `ajustarArte`, só no draft-only, sobre a
candidata FINAL (ajustes aceitos + textos/foto/nome da chamada); (b) Generation PROCESSING criada na mesma transação
(é dela o `generationId` do registro) e fechada pelo render (`generationId` já existe em `renderPageAndRegister`);
(c) gravação do registro na mesma transação (APTO; o reprovado NÃO é gravado — § 8.3); (d) `revisao` no retorno e na
recusa; (e) travas novas e a ordem comum (§ 4); (f) `arte-rapida.ts` entra nas listas de produtores (lint do CP5b e
inventário H12); (g) P11 de `piloto-ciclo.test.ts` vira `it()`; (h) docs (`revisor-da-arte.md` § CP5d, `mcp.md`,
manual do Dot: "ajustar-arte no draft-only só grava versão APTA").

**Não entra**: o `hojeViola` humano "em até 2 ciclos" (exige o gate como INFORMAÇÃO no `revisar-arte` humano —
CP5e, § 8.6); provas ponta a ponta e o piloto (CP5e); bloco `gate` em `auditar-operacao` (CP5e); mudar o executor do
CP4 além de expor a medida crua da candidata final (§ 3.2); mexer em `gate.ts`, `gate-registro.ts`,
`gate-persistido.ts`, `agendar-itens.ts`; migration; qualquer mudança no fluxo humano; `melhorar-arte`,
`criar-arte-de-modelo`, `compor-arte` (fora da allowlist — continuam fora).

## 3. A medição e a decisão

### 3.1 Ordem das recusas (nada do CP4 muda de lugar)

1. Pré-checagens de hoje (formato, versão, copy removida, vídeo) — iguais, antes de medir qualquer coisa.
2. Executor do CP4 (fora de transação, como hoje): todos recusados e nada mais a gravar → no fluxo HUMANO a recusa do
   CP4 de hoje (`AJUSTE_PIOROU_ARTE` > `AJUSTE_NAO_MELHOROU_O_ACHADO` > `AJUSTE_NAO_MEDIDO` > `CONTEUDO_NAO_PODE_SER_OCULTADO`
   > `AJUSTE_SEM_EFEITO`), com `ajusteGravado: false`. **No draft-only (decisão 8.8, recomendada)** o código da CHAMADA é
   `REVISAO_HUMANA_NECESSARIA` (422) com `details.causa` = o código do CP4 que teria saído, `details.recusados` (os mesmos
   de hoje), `ajusteGravado: false` e `details.revisao` = `{ tipo: 'nao-medida', motivo: 'nenhuma versão nova para medir:
   a peça ficou como estava' }` — a peça não foi medida pelo gate nesta chamada e nenhum veredito é inventado; a última
   versão fica. É esse código que P11 ("recusado ANTES de substituir") verifica na resposta. A mensagem continua a do CP4,
   terminada em "Revisão humana necessária.".
3. Há o que gravar (candidata final = `revisao.camadas` ou `fixDaBase.layers`, com `dadosDaPagina`) → transação (§ 4).

### 3.2 A medida crua da candidata final

O executor mede cada candidata por `medidaDe(camadas, ctx)` (→ `MedidaComparavel`: relatório + contraste, não a
`MedidaDaPeca`). O gate precisa da `MedidaDaPeca` da candidata FINAL, medida pelo cliente da transação (as linhas que
ela lê estão travadas). Por isso a medição do gate é UMA medida nova, DENTRO da transação, com `contextoDaMedicao({
cliente: tx, sinal, prazoPorDownloadMs, composicaoReaproveitavel: false, generationDaPeca: geracaoDeOrigem })` +
`medirCamadasDaPeca(candidata, ctx, { corrigir: false })` — a mesma medição do CP4 e do CP5c. `generationDaPeca` é a
**Generation de ORIGEM da página** (§ 4.3: a do compositor — `fieldValues.pageId = page.id` e `source: 'compositor'`, a
mais recente —, relida e travada `FOR UPDATE` pela transação ANTES das referências), com `composicaoReaproveitavel:
false` de propósito: a candidata é uma versão NOVA da página, nenhuma arte é dela, então o assunto é estimado de novo
pela foto e a variante da logo vem da página; as referências de corpo e entrelinha vêm da assinatura e da página-modelo
apontadas por essa Generation (`composicao.assinatura.pageId`, `sourcePageId`), travadas `FOR SHARE`. Codex R1: `null`
no contexto significa NENHUMA Generation — sem referência nenhuma —, não "sem cache". **Página SEM Generation do
compositor** (arte livre, arte de modelo): a medição roda sem referências, `texto-pequeno` do título fica não comprovada
e o gate recusa, com o motivo dito ("página sem arte do compositor: o agente não ajusta; peça ao editor") — A18. Custo: +1
medida (~0,4–0,6 s medido no CP5c) dentro dos 20 s; os N renders do CP4 continuam fora. **Não** se reaproveita a última
`medidaAtual` do executor: ela foi medida fora da transação, pelo `db`, antes das travas.

### 3.3 A decisão

```ts
// arte-rapida.ts (novo, dentro da transação): medirEDecidirAjuste(tx, …)
//  1. recusaComoImagem(candidata, paginaTravada.audio) → 'nao-medida' — o `audio` RELIDO sob a trava (Codex R1: `versaoDaPagina` não cobre áudio)
//  2. contextoDaMedicao({ cliente: tx, sinal, prazoPorDownloadMs, composicaoReaproveitavel: false, generationDaPeca: geracaoDeOrigem /* NUNCA null: null = sem Generation = sem referência (Codex R1/R2) */ }) + medirCamadasDaPeca (§ 3.2), com Promise.race(PRAZO_DA_MEDICAO_MS = 8_000) sobre a cadeia inteira
//  3. decidirEMontarRegistro({ entrada: { medida, identidade: identidadeDaPagina(paginaFutura), politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA },
//       page: paginaFutura, vinculo: { projectId, generationId: generationNova.id, postType: TIPO_DO_POST_POR_FORMATO[formato] },
//       origem: 'ajustar-arte', principal, agora })
//  paginaFutura = { id, name: pageName, tags, width, height, background, layers: candidata, copyAutoral: contrato que vai ser gravado }
```

- `paginaFutura` é EXATAMENTE o que `dadosDaPagina` grava (camadas, nome, `copyAutoral` revisado): a identidade do
  registro (`pageVersion`, `copyVersion`) é a da versão que o commit cria — `ver-geracao` a rotula `coincidente`
  enquanto ninguém editar depois. A copy é reconciliada DENTRO de `decidirEMontarRegistro` sobre `paginaFutura`
  (`revisaoDaPaginaComCamadas(copyAutoral, candidata)`): com o contrato revisado pelo próprio ajuste
  (`revisaoDaCopy.copy`), reconcilia `sem-mudanca`; sem contrato → `copy-completa` não comprovada → não APTO (dito: no
  draft-only, página sem contrato de copy não é ajustável pelo agente — o compositor sempre grava o contrato).
- `vinculo.postType`: o da página pelo formato (`TIPO_DO_POST_POR_FORMATO[formatoDaPaginaGravada(page)]`); o ajuste
  não cria post, e `decidirEMontarRegistro` já recusa a divergência entre os dois classificadores (sem-vinculo).
- `vinculo.generationId`: a Generation PROCESSING criada NESTA transação (§ 4.3) — a arte que o render vai fechar. A
  política do assunto é a MESMA constante do CP5c (`POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA`, decisão 8.1 do CP5c): um só
  gate, uma só política.
- `principal`: `{ tipo, id }` repassado pela tool (como no `agendar-leva`).

## 4. A transação do draft-only

**Ordem COMUM das travas** (a do CP5c, sem as do lote): `pg_advisory_xact_lock(agenda do projeto)` →
`pg_advisory_xact_lock(fontes do projeto)` → **posts da página `ORDER BY "id" FOR UPDATE`** (já existe) → `Page FOR
UPDATE` (nova: hoje a escrita é por CAS sem trava de linha; a trava serializa com o gate do `agendar-leva`, que trava
a página depois dos posts — mesma ordem) → **`Generation` `FOR UPDATE`, em ORDEM DE ID, das linhas que esta transação
LÊ ou ESCREVE**: a de ORIGEM da página (a do compositor, § 4.3 — entrada da medição) e o **alvo real de
`travarRecomposicaoDaArte`**. A seleção do alvo é EXATAMENTE a da função (Codex R3): das 20 Generations mais recentes
do projeto com `resultUrl` e `fieldValues.pageId = page.id` (`orderBy createdAt desc`), a PRIMEIRA aceita por
`ehArteDaPagina` (não é export de vídeo, `resultUrl` não é vídeo) — depois de um ajuste bem-sucedido, é a Generation
do ajuste anterior; um vídeo mais recente não é o alvo. Para a linha travada ser a linha escrita, essa seleção sai de
`travarRecomposicaoDaArte` para uma função exportada do mesmo módulo, `alvoDaRecomposicao(client, pageId, { projectId })`
(a MESMA consulta e o MESMO `find`, sem mudar a seleção), usada pela transação do gate para resolver o alvo e por
`travarRecomposicaoDaArte`, que ganha a opção `alvo?: string` (o id já resolvido e travado) — com `alvo`, ela não busca
de novo, mas LÊ a linha travada (`client.generation.findUnique({ where: { id: alvo }, select: { fieldValues } })`) e
mantém a checagem de hoje: `somenteReRender` já gravado → devolve `true` sem reescrever; ausente → merge da marca.
Sem `alvo`, comporta-se exatamente como hoje (o único chamador de produção é o próprio `ajustarArte`). Equivalência
coberta em A17: com e sem `alvo`, mesma marca gravada, mesma recusa de regravar (`recompor.ts` entra no escopo só
nisso). As duas Generations são
travadas numa só instrução (`SELECT id FROM "Generation" WHERE id IN ($1, $2) ORDER BY id FOR UPDATE`); quando coincidem,
uma linha. A escrita da trava entra na posição da ordem comum, Page → Generation → shares, a do CP5c. **Custo dito**: a trava espera o worker da fila que estiver escrevendo essas linhas
(recomposição/re-render) dentro dos `maxWait` 10 s / 20 s da transação; A13 mede a espera. →
`FOR SHARE`: `Project`, página de assinatura e página-modelo apontadas por essa Generation, `CustomFont` do projeto.
A Generation NOVA (PROCESSING) nasce na transação (linha própria, não disputada). Ciclo: `agendar-leva` toma agenda →
fontes → ItemDeLote → ItemDePlano → posts → Page → Generation → shares; `ajustar-arte` toma agenda → fontes → posts →
Page → Generation → shares — subsequência, sem inversão; `persist.ts` (render condicionado) toma Page → escreve
Generation (compatível); `recompor.ts` escreve Page (CAS) e DEPOIS, fora de transação, a Generation (compatível: nunca
segura uma esperando a outra); `later-scheduler` toma agenda → posts; as rotas de fontes só a consultiva das fontes.
Deadlock que escape disso → `AJUSTE_CONCORRENTE` (§ 8.5), nunca `ERRO`. **A trava consultiva da agenda** entra pela
simetria com o `agendar-leva` (decisão 8.4; redundante para o ciclo, custo zero).

Passos (dentro de `db.$transaction`, isolamento `ReadCommitted`, 20 s):

1. Travas acima. `POST_APROVADO_INTOCAVEL` como hoje (post não-DRAFT ou `laterPostId`).
2. **Conferência da versão sob trava**: `tx.page.findUnique` (com `audio`, `copyAutoral`, `templateId`) →
   `versaoDaPagina(atual) === versaoAntes`, mesmo contrato E **mesmo `audio`** (`JSON.stringify` do áudio lido antes;
   Codex R1: `versaoDaPagina` não cobre áudio, e a música decide `recusaComoImagem`) — as conferências que hoje acontecem
   no CAS/releitura passam a ser feitas EXPLICITAMENTE antes de medir, com a página travada: mudou →
   `VERSAO_DIVERGENTE`/`PAGINA_MUDOU_DURANTE_O_AJUSTE` como hoje, sem medir. A candidata foi derivada da página lida
   ANTES das travas; com a página travada, na mesma versão e com o mesmo áudio, a candidata é a versão seguinte dela —
   não há janela entre "o que medi" e "o que gravo". **Limite dito**: as travas de linha não congelam os BYTES remotos
   de foto, logo e fontes servidos por URL (`NAO_CONFERIDO_PELA_IDENTIDADE`, CP5b § 4.2) — a mesma lacuna do CP5c.
2b. **Generations travadas** (§ 3.2 e ordem acima): a de ORIGEM (compositor, mais recente com `fieldValues.pageId =
   page.id` e `source: 'compositor'`) e o alvo da recomposição (`alvoDaRecomposicao(tx, page.id, { projectId })`),
   achadas pela transação e travadas `FOR UPDATE` em ordem de id; a de origem relida com `fieldValues` e `sourcePageId` para as referências. Uma
   Generation inserida DURANTE a transação não entra em nenhuma das duas escolhas (dito, como C22 do CP5c) — se ela for
   a que `travarRecomposicaoDaArte` encontraria, a trava de recomposição cai nela sem trava prévia: janela DITA, igual
   à de hoje, estreita (a inserção teria de acontecer entre a resolução e a escrita, dentro da mesma transação de 20 s)
   e sem efeito no gate. Sem Generation do compositor → medição sem referências → recusa do gate (A18).
3. **Generation PROCESSING** criada pela transação (`tx.generation.create`: `status: 'PROCESSING'`, `projectId`,
   `templateId`, `authorName: 'ajuste-arte'`, `canal`, `createdBy`, `fieldValues: { source: 'ajuste-arte', pageId:
   page.id, sourcePageId: page.id, … os mesmos campos que hoje vão no render }`) — é a linha que o render fecha
   (`renderPageAndRegister({ generationId })`, caminho que já existe para a fila). Se o gate recusar, a transação volta
   atrás e a linha não existe. **Fechamento quando o render NÃO fecha** (Codex R1, BLOCKER 2): o cron de render
   pendente NÃO renderiza uma Generation PROCESSING sem job — só a marca `FAILED` (`generation-queue.ts`, recuperação
   de órfãs: SELECIONA as com 10 min ou mais, em lotes de até 50, quando o cron roda — não é um teto). Por isso
   `ajustarArte` fecha a linha EXPLICITAMENTE: render que lança (Blob, canvas) ou `PAGINA_MUDOU_DURANTE` (a página já
   está na versão seguinte; o PNG foi descartado) → **UMA instrução atômica**, `fecharGenerationComoFalha(client, id,
   patch)` (nova em `mesclar-field-values.ts`): `UPDATE "Generation" SET "status" = 'FAILED', "completedAt" = now(),
   "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = 'object' THEN "fieldValues" ELSE '{}' END) || $patch WHERE
   "id" = $1 AND "status" = 'PROCESSING'` — status, horário e patch JSON (`{ error: <motivo fixo> }`) na MESMA escrita,
   condicionada ao status: quem fechar primeiro vence e o segundo não escreve NADA (nem o motivo) — Codex R4: duas
   instruções (merge e depois `updateMany`) deixavam o segundo sobrescrever o motivo antes de perder o status. Merge
   raso: `gateDaArte` fica (`Generation` NÃO tem coluna de erro; `ver-geracao` lê o motivo de `fieldValues.error`).
   Feito ANTES de relançar o erro. O registro do gate fica (é
   a auditoria de uma versão cuja arte não nasceu; `ver-geracao` mostra `FAILED` + o motivo + bloco `gate`
   `coincidente` enquanto a página não muda). Se o próprio fechamento falhar (banco fora), a órfã fica PROCESSING até
   o cron a selecionar — dito, sem outra promessa. **O cron entra no escopo** (Codex R3): `marcarGenerationFalha`
   (`generation-queue.ts`) hoje lê `fieldValues` e grava `{ ...anterior, error }` — viola a regra 🔴 do `AGENTS.md` e,
   numa corrida com o fechamento explícito (cron lê → `ajustarArte` grava `error`+`FAILED` → cron grava o objeto
   inteiro lido), apagaria `gateDaArte` e `error`. Passa a chamar a MESMA `fecharGenerationComoFalha(db, id, { error:
   <motivo do cron>, failedAt: <ISO>, recuperadaPelaFila: true })` — os dois campos que o cron grava hoje continuam
   (Codex R4); uma instrução atômica condicionada a `PROCESSING`: quem fechar primeiro vence e o segundo não escreve
   nada (A16 confere qual motivo ficou nas duas ordens). Render de ajuste que dure mais de 10 min enquanto o cron
   varre: o render roda na própria requisição MCP (`maxDuration = 300` s em `src/app/api/mcp/route.ts`), abaixo dos
   10 min da seleção — a janela é teórica e fica dita. Estados observáveis da linha: PROCESSING (segundos, entre o commit e
   o render; mais, se o fechamento falhar), COMPLETED (render ok) ou FAILED (render falhou / página mudou).
4. `medirEDecidirAjuste(tx, …)` (§ 3.3).
5. Resultado:
   - `nao-medida` / `sem-vinculo` / `medida` com `gate.resultado !== 'APTO'` → `throw new RecusaDoGate(…)` → **rollback
     inteiro**: nenhuma página, nenhuma Generation, nenhuma trava de recomposição, nenhum render, nenhuma invalidação.
     O `catch` em volta da transação mapeia para `CreativeError('REVISAO_HUMANA_NECESSARIA', 422, { ajusteGravado:
     false, pageId, versao: versaoAntes, editUrl, revisao, achados?, motivos? })`. **O registro reprovado NÃO é
     gravado** (§ 8.3: a Generation não existe fora da transação; gravá-lo na Generation do compositor rotularia a arte
     antiga com um veredito de outra versão).
   - APTO → `gravarGateDaArte(tx, registro)` (vínculo: a Generation nova tem `fieldValues.pageId = page.id` e a página é
     do projeto; `'sem-vinculo'`/`'sem-proveniencia'` → `RecusaDoGate`) → `tx.page.updateMany` (CAS como hoje) →
     `travarRecomposicaoDaArte` (como hoje) → commit.
6. Exceção do banco em `medirEDecidirAjuste` vira `nao-medida` (fail-closed, nunca `ERRO`); exceção em
   `gravarGateDaArte` ou timeout da transação (`P2028`) → rollback → `REVISAO_HUMANA_NECESSARIA`; deadlock (`40P01`,
   `P2034`) → `PAGINA_MUDOU_DURANTE_O_AJUSTE`? Não: código próprio `AJUSTE_CONCORRENTE` ("repita") — **decisão 8.5**.

**Depois do commit** (igual a hoje, com a Generation já existente): `renderPageAndRegister({ …, generationId:
generationNova.id, versaoEsperada: versaoGravada })` fecha a linha (COMPLETED + `resultUrl`, `fieldValues` por merge —
o registro do gate, já gravado, sobrevive ao merge porque `mesclarFieldValuesDaArte` é raso por chave e o render não
escreve `gateDaArte`); render que falha ou `PAGINA_MUDOU_DURANTE` → fechamento explícito como `FAILED` (passo 3) e o
resto como hoje (invalidação com `renderFalhou`, erro relançado); `invalidateScheduledRenders(apenasRascunho)` e
aprendizado como hoje. **A única escrita nova depois do commit** é esse fechamento `FAILED` (inventário C6 do CP5c
ganha a exceção nomeada).

### 4.4 O que cada leitor vê (Codex R1, IMPORTANTE 4)

| Leitor | Hoje | Com o CP5d |
|---|---|---|
| `agendar-leva` (draft-only) | mede a Generation do ITEM do lote (a do compositor), não "a mais recente" | igual: a Generation do ajuste NÃO é a peça do item; o lote relê a página (versão nova), `composicaoReaproveitavel: false` (a `versaoRenderizada` do compositor é a antiga) e grava o SEU registro na Generation do item → dois registros `coincidente`, um por Generation, ambos da mesma `pageVersion` (A9) |
| Bancada / item do plano | `ItemDePlano.generationId` = a do compositor | igual; o ajuste não reaponta o item |
| Galeria (`/api/templates/[id]/creatives`) | lista só COMPLETED e PROCESSING | vê a linha nova PROCESSING por segundos, depois COMPLETED; se o render falhar, a linha vira FAILED e **some da galeria** (a rota não lista FAILED — fora do escopo mudar isso); o motivo fica em `ver-geracao` |
| `ver-geracao` | PROCESSING → "em andamento; consulte de novo"; COMPLETED → arte + bloco `gate` | igual; FAILED → "falhou" + motivo fixo + bloco `gate` (`coincidente` enquanto a página não muda) |
| Catálogo de artes (`registrarArtesDoPost`) | só pelo agendamento/efeitos | nada muda (o ajuste não cataloga) |
| Cron de órfãs (`generation-queue.ts`) | seleciona PROCESSING sem job com 10 min ou mais, em lotes de 50, quando roda, e marca FAILED gravando `fieldValues` inteiro | backstop do fechamento explícito; passa a gravar por merge (passo 3) |

## 5. Política de preservação (a decisão de produto, § 8.2)

O plano-mestre diz "não substituir a última versão boa quando a política exigir preservação". Duas leituras:

- **P1 (recomendada)** — o agente só grava versão APTA. Fail-closed e simples: toda escrita autônoma deixa a página
  numa versão que o gate aceitou; não existe "versão intermediária não apta" gravada pelo agente. Custo: o agente não
  consegue melhorar aos poucos uma peça com vários problemas — ou corrige todos numa chamada (o `revisar-arte` devolve
  todos os ajustes), ou escala. É o laço do manual (≤ 2 ciclos → `REVISAO_HUMANA_NECESSARIA`).
- **P2** — "última versão BOA": grava candidata não apta SE a página ANTES também não era apta (nada bom é substituído)
  e o CP4 provou não-piora; recusa só quando a versão atual é APTA e a candidata não. Permite progresso incremental;
  custa UMA medida a mais (a página atual, sob trava) e deixa o agente gravar versões não aptas — que o `agendar-leva`
  vai recusar depois, de qualquer forma.

O contrato implementa **P1**; P2 fica como alternativa documentada (uma constante `POLITICA_DE_PRESERVACAO`). Codex
R1 sobre P2: exigiria medir a versão ANTERIOR sob as mesmas travas — um registro histórico nunca serve de prova de que
ela era boa.

## 6. O retorno

```ts
// AjustarArteResult, só no draft-only (sucesso = candidata APTA gravada)
revisao: { tipo: 'medida'; resultado: 'APTO'; rulesVersion; versaoDoGate; medidoEm; naoMedidos; generationId }
// CreativeError REVISAO_HUMANA_NECESSARIA (gate recusou), details:
{ ajusteGravado: false, pageId, versao: versaoAntes, editUrl, revisao: RevisaoDoItem (medida reprovada | sem-vinculo | nao-medida), achados?, motivos?, ajustesAplicados?, ajustesRecusados? }
// Recusa TOTAL do CP4 (todos recusados, nada a gravar) no draft-only (decisão 8.8): CreativeError('REVISAO_HUMANA_NECESSARIA', 422,
//   { causa: <código do CP4 que teria saído>, recusados, ajusteGravado: false, revisao: { tipo: 'nao-medida', motivo: 'nenhuma versão nova para medir: a peça ficou como estava' } })
//   — a mensagem é a do CP4 terminada em "Revisão humana necessária."; no perfil NORMAL o código continua o do CP4, como hoje.
```

`RevisaoDoItem` é o tipo já exportado por `agendar-itens.ts` (CP5c § 6); move para `lotes/agendamento.ts` ou módulo puro
compartilhado (`revisao/revisao-do-item.ts`) para `arte-rapida.ts` não importar o serviço do lote. Fluxo humano: sem o
campo. Nenhum parâmetro novo na tool; a descrição de `ajustar-arte` ganha o parágrafo do gate.

## 7. Invariantes (o que os testes EXERCITAM — com os limites ditos na § 9; "provado" só o que o banco falso com travas, fila e rollback consegue provar)

1. Draft-only: nenhuma escrita em `Page` (nem Generation nova, nem trava de recomposição, nem render, nem invalidação)
   sem `decidirEMontarRegistro` → `ok` + `APTO` sobre a candidata FINAL, na MESMA transação (A1, A2, A10).
2. A identidade do registro é a da versão gravada: `pageVersion === versaoDaPagina(página depois do commit)` e
   `copyVersion === copyVersionDe(copyAutoral gravado)` (A3); `ver-geracao` → `coincidente`.
3. Registro gravado na Generation que o render FECHA (mesmo id em `revisao.generationId`, no render e no registro) e
   sobrevive ao merge do render (A4).
4. Recusa do gate → rollback inteiro: página, Generation, trava e render intactos; `invalidateScheduledRenders` NUNCA
   chamado (A2 — é o P11 "render não reaberto").
5. Página (inclusive `audio`), Generation de origem, assinatura/modelo, fontes e projeto travados da medição ao commit
   (A5, A14: edição concorrente espera; a chamada seguinte recusa `VERSAO_DIVERGENTE` ou mede com o novo); ordem comum
   sem inversão com o `agendar-leva`, o render condicionado, `recompor`, `later-scheduler` e as rotas de fontes (A13:
   intercalações no banco falso que controlam a ORDEM de aquisição; I1: inventário).
6. Fluxo humano byte a byte igual (A6: perfil normal, mesmas chamadas, mesmo rastro de escritas e nenhuma trava nova).
7. O executor do CP4 e a sua posição (antes do gate) não mudam; no draft-only a recusa total sai como
   `REVISAO_HUMANA_NECESSARIA` com `details.causa` (A7), no perfil normal com o código do CP4 (A6);
   `CONTEUDO_NAO_PODE_SER_REMOVIDO` antes de tudo (A8).
8. `agendar-leva` sobre a versão gravada pelo ajuste APTO mede de novo e cria o DRAFT (A9 — ponta a ponta mínima do
   CP5d → CP5c, com o mesmo gate e a mesma política).

## 8. Decisões pendentes do owner

| # | Decisão | Recomendação | Se decidir o contrário |
|---|---|---|---|
| 8.1 | Política do assunto no `ajustar-arte` | a MESMA constante do CP5c (`POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA`; renomear para `POLITICA_DO_ASSUNTO_DO_GATE` neste PR, sem mudar o valor) | política própria por tool: dois gates com vereditos diferentes para a mesma peça |
| 8.2 | Preservação (§ 5) | **P1**: o agente só grava versão APTA | **P2**: grava não apta sobre não apta (não-piora), protege só a versão APTA; +1 medida |
| 8.3 | Registro do veredito reprovado no ajuste | NÃO gravar (a Generation da versão recusada não existe; a do compositor é de outra versão) | gravar na Generation do compositor com identidade da candidata: `ver-geracao` mostraria `historico` sempre |
| 8.4 | Trava consultiva da agenda no `ajustar-arte` | tomar (simetria com `agendar-leva`, custo zero) | não tomar (a ordem posts → Page já evita o ciclo) |
| 8.5 | Código da concorrência (deadlock, CAS perdido depois de medir) | `AJUSTE_CONCORRENTE` novo ("repita") | reaproveitar `PAGINA_MUDOU_DURANTE_O_AJUSTE` (que manda NÃO repetir sem olhar — semântica diferente) |
| 8.6 | O `hojeViola` humano "em até 2 ciclos" | CP5e: `revisar-arte` humano devolve o veredito do gate como INFORMAÇÃO (`decidirEMontarRegistro` com origem `revisar-arte`, sem gravar). O CP5d NÃO reivindica essa garantia (Codex R1) | agora: amplia o CP5d ao fluxo humano (warn-only) |
| 8.7 | Prazo da medição do gate no ajuste | `PRAZO_DA_MEDICAO_MS` 8 s / `PRAZO_POR_DOWNLOAD_MS` 4 s (as do CP5c) | valores próprios |
| 8.8 | Código da recusa TOTAL do CP4 no draft-only (§ 3.1) | `REVISAO_HUMANA_NECESSARIA` com `details.causa` = código do CP4 (é o que P11 verifica; o chat escala) | manter o código do CP4 e só acrescentar `details.revisao`: P11 passaria a verificar o código do CP4 |

## 9. Matriz de testes (banco falso com travas de linha e eventos — o harness de `agendar-itens-gate.test.ts`, estendido)

| Caso | Entrada | Esperado |
|---|---|---|
| A1 | draft-only, ajustes aceitos pelo CP4, candidata APTA | ordem: travas → conferência da versão → `INSERT Generation PROCESSING` → medição pela `tx` → `UPDATE Generation … (registro)` → `UPDATE Page` → trava de recomposição → commit → render fecha a MESMA Generation → invalidação; `revisao.resultado = 'APTO'` |
| A2 | draft-only, candidata NÃO apta (v2 do piloto com ajustes que o CP4 aceita mas deixam blocker) | `REVISAO_HUMANA_NECESSARIA` 422, `ajusteGravado: false`, `achados`/`motivos`, `editUrl`; página byte a byte igual; nenhuma Generation; `invalidateScheduledRenders` não chamado; render não chamado |
| A3 | identidade | `registro.identidade.pageVersion === versaoDaPagina(página gravada)`; `copyVersion` do contrato gravado; `ver-geracao` → `coincidente` |
| A4 | render depois do commit | fecha a Generation criada (mesmo id); `gateDaArte` presente depois do merge do render; estados observáveis: PROCESSING (entre commit e render) → COMPLETED; A15/A16 cobrem as falhas |
| A5 | edição concorrente da página / assinatura / fonte / projeto durante a medição | espera a trava; a chamada seguinte recusa `VERSAO_DIVERGENTE` (página) ou mede com o novo |
| A6 | perfil normal, mesmas chamadas | rastro de escritas idêntico ao de hoje; nenhuma trava nova; sem `revisao` |
| A7 | todos os ajustes recusados pelo CP4 (draft-only) | o CÓDIGO da chamada é `REVISAO_HUMANA_NECESSARIA` (asserção explícita, não presença textual) e `details.causa` é o código do CP4 que teria saído (um caso por código: `AJUSTE_PIOROU_ARTE`, `AJUSTE_NAO_MEDIDO`, `CONTEUDO_NAO_PODE_SER_OCULTADO`); `details.recusados` iguais aos de hoje; `details.revisao.tipo = 'nao-medida'`; nada medido pelo gate (0 medidas da `tx`); perfil normal: o código do CP4, como hoje (A6) |
| A8 | `slotValues` que esvaziam texto (draft-only) | `CONTEUDO_NAO_PODE_SER_REMOVIDO` antes de qualquer medida |
| A9 | ajuste APTO gravado → `agendar-leva` draft-only na mesma página | o lote mede de novo a Generation do ITEM (a do compositor; `composicaoReaproveitavel: false`, porque a `versaoRenderizada` dela é a antiga) e cria o DRAFT; dois registros (um por Generation), ambos `coincidente` com a mesma `pageVersion`; `ver-geracao` de cada um diz qual arte é (`source`) e qual URL expõe (a do ajuste = a página atual; a do compositor = a arte antiga, com `thumbnail` da página regravado pelo render do ajuste) |
| A10 | gravação do registro falha / timeout / deadlock | rollback; `REVISAO_HUMANA_NECESSARIA` (ou `AJUSTE_CONCORRENTE` no deadlock); nada gravado |
| A11 | página sem contrato de copy (draft-only) | `copy-completa` não comprovada → recusa do gate, dita no motivo ("página sem contrato de copy: o agente não ajusta") |
| A12 | `nao-medida` por prazo (rede presa na foto da candidata) | recusa no prazo; travas liberadas; nenhuma Generation órfã |
| A13 | intercalações que controlam a ORDEM de aquisição (banco falso com travas e gancho por trava): `agendar-leva` draft-only × `ajustar-arte` draft-only na mesma página (as duas ordens); render condicionado (`persist.ts`: Page FOR UPDATE → Generation) × `ajustar-arte`; `recompor` (Page CAS, depois Generation fora de transação) × `ajustar-arte`; worker da fila SEGURANDO a Generation de origem/alvo × `ajustar-arte` (a espera é MEDIDA à parte, como C18 do CP5c); `later-scheduler` (agenda → posts) × `ajustar-arte`; rota de fontes × `ajustar-arte` | nenhuma espera cruzada; quem chega depois espera o commit; a espera pela Generation aparece separada da medição; deadlock injetado (`40P01`) → `AJUSTE_CONCORRENTE`, nada gravado |
| A14 | música adicionada à página entre a leitura inicial e a transação | a conferência sob trava recusa (`PAGINA_MUDOU_DURANTE_O_AJUSTE`), nada medido, nada gravado; música presente desde o início → `PAGINA_COM_MUSICA`/`nao-medida` antes de medir |
| A15 | a página muda DEPOIS do commit e ANTES de o render fechar (`PAGINA_MUDOU_DURANTE`) | Generation fechada como `FAILED` com o motivo fixo; registro do gate presente; página gravada; invalidação como hoje; `ver-geracao` → FAILED + `gate` `historico` (a página já é outra) |
| A16 | render lança (Blob/canvas) depois do commit; e a CORRIDA com o cron de órfãs nas DUAS ordens (fechamento explícito primeiro / cron primeiro) | Generation `FAILED` por UMA instrução condicionada a `PROCESSING`; `gateDaArte` sobrevive; o `error` que fica é o de QUEM FECHOU PRIMEIRO (asserção do motivo nas duas ordens); o segundo não escreve nada (0 linhas); o patch do cron traz `failedAt` e `recuperadaPelaFila`; fechamento que falha → fica PROCESSING e o cron a fecha preservando `gateDaArte` |
| A17 | referência (assinatura/modelo) editada DURANTE a medição; Generation de origem reescrita por um worker durante a medição; **SEGUNDO ajuste na mesma página** (o alvo da recomposição é a Generation do primeiro ajuste, de `source: 'ajuste-arte'`) | esperam a trava (FOR SHARE / FOR UPDATE); a chamada seguinte mede com o novo; no segundo ajuste as DUAS Generations (origem do compositor e alvo do ajuste anterior) aparecem travadas em ordem de id ANTES dos shares, e `travarRecomposicaoDaArte` escreve a linha já travada |
| A18 | página sem Generation do compositor (arte livre) | medição sem referências → recusa do gate com o motivo dito; nada gravado |
| P11 | `piloto-ciclo.test.ts` "o ajuste que piora é recusado ANTES de substituir…" | vira `it()`: página intacta, render não reaberto, `REVISAO_HUMANA_NECESSARIA` na resposta — **o harness de `piloto-ciclo` ganha rollback de verdade** (foto do banco em memória restaurada quando a transação lança) e espera por trava (`$queryRaw` com fila por chave), senão "página intacta" passaria por acidente (Codex R1) |
| I1 | inventário | `arte-rapida.ts` nas listas do lint e do H12; C13 do CP5c com as travas novas de `arte-rapida.ts` na ordem comum (inclusive a Generation de origem antes dos shares); a escrita de `travarRecomposicaoDaArte` listada como escrita em linha JÁ travada; `revisao-do-item.ts` puro sem `@/lib/db`; C6 do CP5c (zero escritas após o commit) com a exceção nomeada do fechamento `FAILED` |

## 10. Arquivos (os principais)

- `src/lib/creatives/arte-rapida.ts`: travas, Generation PROCESSING na transação, `medirEDecidirAjuste`, `gravarGateDaArte`,
  `RecusaDoGate` e o mapeamento no `catch`, `revisao` no retorno e nas recusas, `renderPageAndRegister({ generationId })`;
- `src/lib/creatives/revisao/revisao-do-item.ts` (novo, puro): `RevisaoDoItem` (movido de `agendar-itens.ts`, que reexporta);
- `src/lib/lotes/agendamento.ts`: `POLITICA_DO_ASSUNTO_DO_GATE` (renome; `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA` reexportado);
- `src/lib/mcp/catalogo/arte-ia.ts` (`ajustar-arte`): descrição (a frase que anuncia o código do CP4 para a recusa total ganha o
  caso draft-only: `REVISAO_HUMANA_NECESSARIA` com `details.causa`) + `principal` ao serviço; `scripts/validar-registro-mcp.ts`
  (snapshot só de schema: não muda);
- `src/lib/compositor/recompor.ts`: só a extração `alvoDaRecomposicao` + opção `alvo` em `travarRecomposicaoDaArte` (seleção igual);
- `src/lib/creatives/mesclar-field-values.ts`: `fecharGenerationComoFalha(client, id, patch)` (uma `UPDATE` atômica condicionada a `PROCESSING`);
- `src/lib/ai/generation-queue.ts`: `marcarGenerationFalha` passa a usá-la (regra 🔴 do `AGENTS.md`), com `error`, `failedAt`, `recuperadaPelaFila`;
- `eslint.config.mjs`, `inventario-gate-da-arte.test.ts`, `inventario-gate-agendar-leva.test.ts` (listas + travas);
- testes: `src/lib/creatives/__tests__/ajustar-arte-gate.test.ts` (A1–A12), `piloto-ciclo.test.ts` (P11 → `it()`);
- docs: `docs/regras/revisor-da-arte.md` § CP5d, `docs/regras/mcp.md`, `docs/regras/dot-lagosta-operacao.md` + `operacao-dot.ts` (v7).

Fora: `gate.ts`, `gate-registro.ts`, `gate-persistido.ts`, `agendar-itens.ts` (só o reexport), `ajustar-sem-piorar.ts`,
`nao-piora.ts`, `persist.ts` (o caminho `generationId` já existe), a rota da galeria, schema do Prisma, fluxo humano.

## 11. Gates do PR de implementação

Os do CP5c § 11: suíte completa com `MOSTRAR_VIOLACOES=1` (só o P11 de `piloto-ciclo` muda para `it()`), `typecheck`,
`lint`, `git diff --check`, os 3 validadores (nenhuma impressão digital muda), Codex no HEAD exato, CI e Vercel verdes,
merge por merge commit com `--match-head-commit` (SHA completo). Nenhum cliente real, DRAFT real, agenda, publicação,
mensagem, webhook ou banco de produção como teste.
