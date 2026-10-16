# CP5c — contrato técnico do GATE em `agendar-leva` (perfil draft-only) — proposta para revisão, 16/10/2026

**Estado: PROPOSTA (rodada 3 do Codex: coerência página × Generation por `versaoRenderizada` — cache do compositor só quando a arte É da página; inserção de fontes serializada com o gate por trava consultiva própria; guarda de `generationId` antes dos efeitos; prazo dos downloads dentro da transação. Rodada 2: a MEDIÇÃO passa a acontecer DENTRO da transação, sob as travas — a janela entre
medir e escrever deixa de existir; os posts da página são travados antes da página; o que a medição lê é travado
`FOR SHARE`; o registro — APTO ou reprovado — é gravado na mesma transação; os efeitos pós-commit ficam FORA do perímetro
do gate, com a prova de que não dependem dele; retorno em união para recusa medida / sem vínculo / não medida).** Nada
aqui está implementado; este PR é documental. Base: `main` `6e468abc` (CP5b mergeado: contrato #239 → `c7c461b8`,
implementação #240 → `6e468abc`). Fontes: plano-mestre `docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md` § 4.5
(e a tabela de reforços do Dot), contrato do CP5b `docs/PLANO-2026-10-16-CP5B-CONTRATO.md` § 12 (o handoff, itens 1–9),
contrato do CP5a (`gate.ts`), e o código de `src/lib/lotes/agendar-itens.ts` como está na main (citado por função).

## 0. O que o CP5c entrega, em uma frase

No perfil efetivo **draft-only**, `agendar-leva` só cria ou adota um RASCUNHO depois de **medir a página SOB AS TRAVAS da
transação que escreve** e decidir com `decidirEMontarRegistro` (CP5b) — `decisao: 'ok'` E `gate.resultado === 'APTO'` —,
gravando o registro do veredito (APTO ou não) na mesma transação, antes de qualquer post nascer ou ser ligado; todo
outro caso volta `REVISAO_HUMANA_NECESSARIA` com as referências da peça. O fluxo humano continua WARN-ONLY. **O registro
gravado nunca entra na decisão.** `simular: true` mede e decide igual (pelo leitor, sem travas) e não grava nada.

## 1. O que a main tem hoje (o que o contrato muda e o que preserva)

| Ponto | Hoje (`agendar-itens.ts`) | CP5c |
|---|---|---|
| Quem decide o perfil | `compositor.ts` (`agendar-leva`): `apenasRascunho = perfilDoPrincipal(principal) === 'draft-only'` | igual; o gate liga SÓ com `apenasRascunho` |
| Decisão sem trava | `decidirEscrita(ctx.leitor, …)` → `criar` / `adotar` / `recusar` | igual (é a conta barata que evita abrir transação à toa); no draft-only ela NÃO autoriza nada — só a decisão sob trava autoriza |
| Simulação | horário ocupado, `recusaComoImagem`, thumbnail; `concluido` sem gravar | igual + mede e decide pelo `leitor` (§ 3), sem travas: não APTO → `falhou` `REVISAO_HUMANA_NECESSARIA`; nada gravado, nem o registro |
| Transação (20 s) | `pg_advisory_xact_lock(projeto)` → `FOR UPDATE` do item, do item do plano, da página → `decidirEscrita(tx)` → `pedidoDoAgendamento` → `resolverAgendamento` + `criarPostDoAgendamento` (criar) ou adota → CAS da linha → item do plano | igual + (§ 4): trava dos POSTS DA PÁGINA antes da página; `FOR UPDATE` da Generation; `FOR SHARE` do que a medição lê; **a medição e a decisão acontecem aqui**; `gravarGateDaArte(tx, registro)`; não APTO → commit só com o registro, item `falhou`; APTO → segue para criar/ligar |
| Efeitos pós-commit | `executarEfeitos` (catálogo, refilagem, item do plano) | iguais, FORA do perímetro do gate (§ 5): só bookkeeping; prova de que não mudam post nem conteúdo da página |
| Linha já ligada (`reaproveitar`) | roda os efeitos pendentes; no draft-only, post aprovado → devolve sem efeitos | igual: o rascunho já existe; nenhum DRAFT nasce nem é ligado aqui, então o gate não se aplica (§ 5, decisão 8.7) |
| `ItemAgendadoDoLote` | `situacao`, `codigo`, `motivo`, `generationId`, `pageId`, `editUrl`, … | + `achados`, `motivos`, `revisao` (§ 6) |
| Testes | `piloto-portao.test.ts` P11: 8 `hojeViola` | viram `it()` neste PR (regra do CP0) |

**Nada muda para o perfil normal** (humano): `apenasRascunho === false` → nenhuma medição, nenhum registro, nenhuma
trava nova, nenhuma recusa nova. É a regra do H4: o gate fail-closed só vale onde o perfil é draft-only (plano-mestre
§ 4.5, "limite a dizer ao owner": o `clientId` do ChatGPT é compartilhado com humanos; um cliente OAuth novo nasce `normal`).

## 2. Escopo e não-escopo

**Entra**: (a) medição + decisão SOB TRAVA em `agendarItem` para `criar` e `adotar`, só no draft-only; (b) gravação do
registro na mesma transação (APTO e reprovado); (c) travas novas e a ordem comum (§ 4); (d) retorno em união (§ 6);
(e) a política EFETIVA do assunto (decisão 9.12 do CP5b, § 8.1); (f) `agendar-itens.ts` entra na lista de produtores
da regra de lint e do inventário H12; (g) P11 vira `it()`; (h) o inventário comportamental "só `agendar-leva` cria DRAFT
no draft-only, e só depois do registro"; (i) `contextoDaMedicao` e `registerProjectFonts` com parâmetro `cliente`
(leitor/transação), sem mudar o comportamento de hoje; (j) docs (`revisor-da-arte.md` § CP5c, `mcp.md`, manual do Dot).

**Não entra** (dito para não parecer garantia): gate nos EFEITOS pós-commit (§ 5: eles não dependem do veredito);
`ajustar-arte` autônomo e a fronteira da não-piora (CP5d); provas ponta a ponta e o piloto (CP5e); bloco `gate` em
`auditar-operacao` (§ 8.4); oclusão por pixels; qualquer mudança no fluxo humano; `colocar-na-agenda`, `postar-agora`,
`aprovar-rascunhos` (fora da allowlist — continuam fora); migration; mexer em `gate.ts`, `gate-registro.ts`,
`gate-persistido.ts`, `agendar.ts`, `pastas.ts` (consumidos como estão).

## 3. A medição e a decisão (uma função, dois lugares)

```ts
// agendar-itens.ts (novo): medirEDecidir — PURA quanto a travas: lê pelo `cliente` que recebe e devolve a decisão.
async function medirEDecidir(cliente: Cliente, ctx, args: { peca; page: PaginaCompleta; postType: 'STORY' | 'POST'; principal }):
  Promise<
    | { tipo: 'nao-medida'; motivo: string }                                   // recusa ANTES de medir (sem GateDaArte)
    | { tipo: 'sem-vinculo'; motivo: string }                                  // decidirEMontarRegistro recusou o vínculo
    | { tipo: 'medida'; registro: RegistroSelado; gate: GateDaArte; identidade: IdentidadeDaPagina }
  >
  // 1. `recusaComoImagem(page.layers, page.audio)` → 'nao-medida' (vídeo/música: o CP5a manda ao humano).
  // 2. `lerCamadas(page.layers)` ilegível → 'nao-medida' ('camadas ilegíveis').
  // 3. `contextoDaMedicao({ projectId, page, camadas, cliente, sinal, composicaoReaproveitavel })` + `medirCamadasDaPeca(camadas, ctx, { corrigir: false })`
  //    — a MESMA medição do revisor e do executor do CP4 (`corrigir: false`: a peça COMO VAI SER GRAVADA). Toda leitura de
  //    banco passa pelo `cliente` (`contextoDaMedicao` e `registerProjectFonts` ganham o parâmetro, padrão `db`).
  //    Exceção (banco, fontes, download) → 'nao-medida' com o motivo (fail-closed; nunca `ERRO`).
  // 4. decidirEMontarRegistro({ entrada: { medida, identidade: identidadeDaPagina(page) (as 2 versões), politicaDoAssunto:
  //    POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA }, page, vinculo: { projectId, generationId: peca.id, postType }, origem: 'agendar-leva',
  //    principal: { tipo: principal.kind, id }, agora: () => new Date() }) → 'sem-vinculo' | 'medida'.
```

- **Onde roda**: na chamada de verdade, DENTRO da transação de § 4 com `cliente = tx`, depois das travas — a página, a
  Generation, os posts da página e o que a medição lê não mudam até o commit (travas de linha), e por isso NÃO existe
  "identidade medida × identidade relida": é a mesma leitura. Na simulação, com `cliente = ctx.leitor`, sem travas — é
  a conta, e o contrato diz que a conta pode diferir da chamada de verdade se a página mudar no meio (como já diz hoje).
- **A medida nasce da MESMA leitura da página** (§ 12.5 do CP5b): `camadas` = `lerCamadas(page.layers)`,
  `contextoDaMedicao` recebe a mesma `page`, `identidadeDaPagina(page)` idem. Uma medida de outra página é
  `sem-vinculo` por construção (teste C5).
- `vinculo.postType`: `criar` → `pedidoSob.postType` (o pedido montado DA MESMA Generation travada, § 4.5); `adotar` → o
  `postType` do post travado. Como medição, pedido e vínculo saem da mesma transação, "tipo autorizado ≠ tipo criado"
  (Codex R2, achado 4) não tem janela: é a mesma leitura (teste C17 prova que `pedidoSob` e `vinculo.postType` são
  derivados do mesmo `sob.peca`).
- O registro NÃO é consultado: `lerGateDaArte` não é importado por `agendar-itens.ts` (lint do CP5b); um registro
  `APTO`/`coincidente` já gravado não muda nada (C3).
- **Custo e PRAZO** (Codex R3, achado 4: `fetchBuffer` não tem prazo e a transação segura as travas): toda rede da
  medição — fontes do projeto (`registerProjectFonts`), bytes da logo (`cacheDeLogos`), foto do assunto
  (`assuntoDaPeca`) — passa a receber um `AbortSignal` de `ContextoDaMedicao.sinal`: `PRAZO_DA_MEDICAO = 8_000 ms` no
  total e `PRAZO_POR_DOWNLOAD = 4_000 ms` por arquivo (decisão 8.9). `fetchBuffer(url, { signal })` ganha a opção
  (`req.destroy()` no abort e `socket.setTimeout`); sem a opção, comportamento de hoje. Prazo esgotado →
  `nao-medida` ("a medição não coube no prazo; repita"), nenhum post, e a transação commita só com o que já tinha (nada)
  ou volta atrás — as travas são liberadas nos dois casos (C21: um `fetch` que nunca responde). `medirCamadasDaPeca`
  registra fontes uma vez por contexto, mede texto, roda a régua (render em memória) e lê a logo; estimativa 1–4 s por
  item sem rede lenta, DENTRO da transação de 20 s (que hoje já faz `resolverAgendamento`). C18 mede o tempo por item no
  banco falso e no benchmark sintético do CP3. Rede dentro de transação é o custo deliberado de não ter janela (8.8);
  se mesmo assim um item estourar o `timeout` da transação, ela volta atrás e o item volta `falhou`
  `REVISAO_HUMANA_NECESSARIA` (a exceção é mapeada como as outras do gate — § 4.7), nunca com post criado pela metade.

## 4. A transação do draft-only (criar e adotar)

**Ordem COMUM das travas** (Codex R1/R2/R3): `pg_advisory_xact_lock(projeto)` → **`pg_advisory_xact_lock(fontes do
projeto)`** (chave nova `chaveDasFontes(projectId)` em `trava-por-chave.ts`; as rotas `POST`/`DELETE` de
`/api/projects/[projectId]/fonts` passam a criar/apagar `CustomFont` dentro de `comTravaPorChave(chaveDasFontes(…))` —
Codex R3, achado 2: `FOR SHARE` não impede a linha NOVA; a trava consultiva serializa a inserção com o gate, e quem só
toma a das fontes não toma a da agenda, logo sem ciclo) → `ItemDeLote` → `ItemDePlano` →
**`SocialPost` (TODOS os posts da página, `WHERE "pageId" = $1 FOR UPDATE`, como `ajustar-arte` faz)** → **`Page`** →
**`Generation` (a peça)** → **`FOR SHARE`: `Project`, as Generations da página que a medição lê, a página de assinatura e
a página-modelo das referências, as linhas de `CustomFont` do projeto**. Caminhos existentes conferidos: `ajustar-arte`
(`SocialPost` da página → escreve `Page`), `persist.ts` (`Page` → escreve `Generation`), `enfileirar-video`,
`substituir-video-do-post`, `trocar-arte-do-post`, `edicao-semantica` (só `SocialPost`), `reserva.ts` (só `ItemDeLote`),
`voz-service` (só `Project`), `agendarPost` humano e `later-scheduler` (trava consultiva do projeto em volta de
`criarPostDoAgendamento`). Nenhum trava `Page` antes de `SocialPost` nem `Generation` antes de `Page`; o inventário C13 lista
cada `FOR UPDATE`/`FOR SHARE` de `src/lib` com a sua ordem e falha se um novo violar a sequência.

Passos, depois das travas de hoje (projeto, item, item do plano):

1. **Posts da página**: `SELECT id, status, "laterPostId", "postType", "generationId", "projectId" FROM "SocialPost" WHERE
   "pageId" = $1 FOR UPDATE` (o `pageId` da decisão sem trava). Depois `Page FOR UPDATE` (como hoje) e `Generation FOR UPDATE`.
2. `decidirEscrita(tx, …)` relê e decide de novo (como hoje). **Se a ação ou o post mudou em relação à decisão sem trava**
   (`criar` → `adotar`, ou outro `postId`) → `recusado` `LOTE_AGENDAMENTO_CONCORRENTE` ("o item mudou durante o
   agendamento; repita") — Codex R2, achado 1: o post a adotar tem de ser um dos travados no passo 1; um que apareceu
   depois (phantom) não foi travado, e repetir a chamada o trava. Com a trava consultiva do projeto, que `agendarPost`
   humano e o publicador também tomam, isso só acontece com escrita que não passe por elas — dito como limite.
3. **Página COMPLETA relida pelo `tx`** (`lerPaginaCompleta`: os campos de hoje + `name`, `background`, `layers`,
   `copyAutoral`, `audio`, `updatedAt`, `Template.projectId`) e `FOR SHARE` do que a medição vai ler: `Project`
   (`assinatura`), as Generations da página (`fieldValues.pageId = page.id`, as 15 mais recentes — o mesmo filtro de
   `contextoDaMedicao`), a página de assinatura (`composicao.assinatura.pageId` da Generation do compositor) e a
   página-modelo (`sourcePageId`), e `CustomFont WHERE "projectId" = $1`. Com as linhas travadas, nenhuma delas muda até
   o commit — é isso que substitui a "reconferência de entradas mutáveis" (Codex R2, achado 3): não se compara, trava-se.
   **Phantoms ditos** (linhas NOVAS que `FOR SHARE` não impede): `CustomFont` nova — serializada pela trava consultiva
   das fontes (acima; `scripts/` que gravem fontes fora das rotas ficam ditos como fora da garantia); Generation nova
   da página — `persist.ts` (render) trava a `Page` antes de gravá-la e espera o nosso commit; página de
   assinatura/modelo nova apontada por uma Generation nova — idem.
   **Coerência página × Generation** (Codex R3, achado 1): `recompor.ts` grava `Page.layers` (CAS em `updatedAt`) e SÓ
   DEPOIS, fora da mesma transação, mescla `fieldValues` da Generation (`composicao`, `versaoRenderizada`); `persist.ts`
   sem `versaoEsperada` idem. No intervalo, o gate pode travar as duas linhas e ler camadas NOVAS com `composicao` ANTIGA
   (assunto em cache, referências, origem da logo). Regra: a `composicao` de uma Generation só é reaproveitada pela
   medição quando **`fieldValues.versaoRenderizada === versaoDaPagina(page, { audio: page.audio })`** (a arte É desta
   versão da página — a mesma conferência de `thumbnailEhAtual`); senão `contextoDaMedicao` recebe
   `composicaoReaproveitavel: false` e mede SEM o cache do compositor: assunto estimado de novo pela foto (com o
   prazo de § 3), referências só da página de assinatura e da página-modelo, variante da logo pela própria página.
   Coerência por construção, não por trava — e é o que faz a v2 do piloto (página editada, Generation para trás) ser
   MEDIDA de verdade, com achados, em vez de recusada sem medir (C20).
   O que NÃO é protegido fica em § 8.6 (bytes servidos por URL — CP5b § 4.2).
4. **`medirEDecidir(tx, …)`** (§ 3), com `postType` = o do post travado (adotar) ou o de `pedidoSob` (criar, passo 5 —
   o pedido é montado ANTES da medição, da Generation travada; `hashDoAgendamento(pedidoSob)` é o que vai na linha).
5. `pedidoSob = pedidoDoAgendamento(item, { quandoDaSpec: sob.peca.quandoDaSpec, formato: sob.peca.formato ?? sob.pagina.formato })`
   (como hoje, da peça RELIDA sob trava). Em `criar`, `vinculo.postType = pedidoSob.postType`; `decidirEMontarRegistro` já
   recusa `TIPO_DO_POST_POR_FORMATO[formato] !== postType`.
6. **Via `adotar`** (§ 12.3/4a/4b do CP5b): o post escolhido (um dos travados) tem de ter `status === 'DRAFT'`,
   `laterPostId === null`, `projectId === projectId`, `pageId === page.id`, `postType === TIPO_DO_POST_POR_FORMATO[formato]` e
   `generationId === peca.id`. `generationId` nulo ou outro → `REVISAO_HUMANA_NECESSARIA` ("o rascunho desta página aponta
   outra arte; confira na agenda" — decisão 8.5). Nada é escrito no post adotado.
7. **Resultado da medição**:
   - `nao-medida` / `sem-vinculo` / `medida` com `gate.resultado !== 'APTO'` → **grava o registro** (quando há: `medida` e
     `sem-vinculo` não têm registro — só `medida`) com `gravarGateDaArte(tx, registro)` e devolve `recusado`
     `REVISAO_HUMANA_NECESSARIA` SEM lançar: a transação COMMITA só com o registro (auditoria do veredito reprovado,
     serializada pela trava da página e da Generation — Codex R2, achado 5: duas medições da MESMA página são
     sequenciais, e a última a commitar é a última medida; não há "reprovação antiga" sobrescrevendo um APTO novo, porque
     quem mediu depois escreve depois). `gravarGateDaArte` devolve `sem-vinculo` → ainda assim `recusado`, com aviso.
   - `medida` APTO → `gravarGateDaArte(tx, registro)` ANTES de `resolverAgendamento`/`criarPostDoAgendamento` (criar) e
     antes do CAS da linha (adotar). `'sem-vinculo'`/`'sem-proveniencia'` → `RecusaSobTrava` `REVISAO_HUMANA_NECESSARIA`;
     **exceção do banco PROPAGA** → rollback, item `falhou` `REVISAO_HUMANA_NECESSARIA` (o `try/catch` em volta de
     `$transaction` mapeia qualquer exceção nascida em `medirEDecidir`/`gravarGateDaArte`/timeout para esse código, não
     para o `codigo: 'ERRO'` do `catch` externo — C10).
8. Só então o que já existe: `horarioOcupado`, `resolverAgendamento`, `criarPostDoAgendamento`, CAS da linha, item do plano.

**Simulação** (`simular: true`): sem transação, pelo `leitor`: `medirEDecidir(ctx.leitor, …)` com `postType` = o de
`pedido` (criar) ou do post que `antes` adotaria; não APTO → `falhou` `REVISAO_HUMANA_NECESSARIA` com os mesmos campos;
APTO → o `concluido` de hoje + `revisao`. Nada gravado (nem registro).

## 5. Efeitos pós-commit: fora do perímetro do gate, com prova

`executarEfeitos` (catálogo das artes e sinais de aprendizado, legenda, refilagem da página para a pasta da semana,
item do plano → `agendado`) continua como hoje, nas três vias, sem fronteira protegida nem revalidação (Codex R2,
achado 2: as rotinas internas usam o `db` global e abrem transações próprias — propagar um `tx` até elas é refatorar
`agendar.ts`, `pastas.ts`, `artes-do-post.ts` e os sinais, com risco alto e sem ganho de segurança). O contrato toma a
POSIÇÃO (decisão 8.7) de que **nenhum efeito depende do veredito**, e prova:

- Catálogo/sinais/legenda: escrevem `ImageCatalog`/`LearningSignal`/registro da copy — nunca `SocialPost.status`,
  `laterPostId`, `mediaUrls`, `Page.layers`/`copyAutoral`/`tags`/`width`/`height`; leem o post como está.
- Refilagem: escreve só `Page.templateId`, `Page.name`, `Page.order` (pasta e nome); não toca camadas, copy, tags nem
  tamanho. `pageVersion`, `copyVersion` e `formatoDoCompositor` da identidade não mudam; o `formato` do REVISOR lê o nome e
  PODE mudar — o registro passa a `historico` por `formato` em `ver-geracao`: auditoria honesta ("medido com este nome"),
  não defeito, e o DRAFT já nasceu com o formato medido.
- Item do plano → `agendado`: CAS por `status`/`generationId`/`updatedAt` (existente).
- A guarda que JÁ existe no draft-only continua e ganha um campo: post relido não-`DRAFT`, com `laterPostId`, ou com
  **`generationId !== peca.id`** (Codex R3, achado 3: `registrarArtesDoPost` → `ensurePostGeneration` CRIA uma Generation e
  grava `SocialPost.generationId` num post sem vínculo — com a guarda, o catálogo só roda em post que já aponta a peça,
  e `ensurePostGeneration` é no-op por construção) → sem efeitos, com aviso (`responderLigado` devolve como está). Em
  `criar`/`adotar` a mesma releitura é feita antes de `executarEfeitos` (sem trava: é uma guarda, não o gate — dito).
  C6 inclui `SocialPost.generationId` nos campos protegidos e o caso "post sem Generation → efeitos pulados".
- Teste C6: inventário por regex/AST dos módulos de efeito (`agendar.ts` → `artes-do-post.ts`, `ensure-post-generation.ts`,
  sinais, legenda; `pastas.ts`; `levarItemDoPlanoParaAgendado`) — a ÚNICA escrita em `SocialPost` é a de
  `ensurePostGeneration` em `generationId`, barrada pela guarda acima; nenhuma em `status`, `laterPostId`, `mediaUrls`,
  `postType`; em `Page`, só `templateId`/`name`/`order` (refilagem). Mais o teste comportamental com banco falso: depois do
  commit, post aprovado / página editada / post sem Generation → os efeitos não desfazem, não agravam e não ligam nada.
- `reaproveitar` (linha já ligada): o rascunho já existe; nenhum DRAFT nasce ou é ligado → o gate não se aplica. O
  plano-mestre § 4.5 ("as três respostas passam pelo gate") é cumprido onde há decisão de criar/ligar; o § 12.1 do CP5b
  ("decisão fresca em toda via") fica respondido assim, com a prova de C6 de que a via `reaproveitar` não produz efeito
  que o veredito mudaria. Se o owner discordar (8.7), a via passa pela medição sob trava (custo: 1–4 s por item já
  ligado) sem outra mudança de desenho.

## 6. O retorno do item

```ts
// ItemAgendadoDoLote, só no draft-only
achados?: Array<{ regra: string; camadas: string[]; id: string; severidade: string; certeza: string }>  // os do gate ([] fora de 'medida')
motivos?: Array<{ regra: string; codigo: string; motivo: string; camadas: string[] }>                 // idem
revisao?:
  | { tipo: 'medida'; resultado: 'APTO' | 'REVISAO_HUMANA_NECESSARIA'; rulesVersion: string; versaoDoGate: string; medidoEm: string; naoMedidos: Array<{ regra: string; motivo: string; camadas: string[] }> }
  | { tipo: 'sem-vinculo'; motivo: string }
  | { tipo: 'nao-medida'; motivo: string }
```

- `falhou` por `REVISAO_HUMANA_NECESSARIA` traz SEMPRE `generationId`, `pageId`, `editUrl` (template atual) e `revisao`;
  `achados`/`motivos` só no tipo `medida` (nunca fabricados — Codex R2, achado 6). `referenciasQueFaltam` de P11 exige
  achados estruturais: na v1 e na v2 do piloto a medição acontece (tipo `medida`), então os achados existem.
- `concluido` no draft-only: `revisao` tipo `medida` com `resultado: 'APTO'`, `achados: []`, `motivos: []`.
- Fluxo humano: sem os três campos.
- Nenhum parâmetro novo na tool; a descrição de `agendar-leva` ganha o parágrafo do gate (snapshot do validador).
- **Harness de P11**: o banco falso ganha `$executeRaw` (a gravação), `$queryRaw` que aceita os `FOR UPDATE`/`FOR SHARE`,
  a página com `name`, `copyAutoral`, `updatedAt` e `Template.projectId`, `project.findUnique` com `assinatura`,
  `customFont.findMany`; o mock de `@/lib/creatives/agendar` passa a expor `recusaComoImagem` real; a medição roda de
  verdade sobre a fixture (fontes do sistema, régua em memória, logo da fixture) — é isso que faz os achados da v1 serem
  os do serviço.

## 7. Invariantes (os testes provam)

1. Draft-only: nenhum DRAFT nasce ou é adotado sem `decidirEMontarRegistro` → `ok` + `APTO` na MESMA transação que o
   cria/liga; o registro gravado nunca é lido (C3).
2. Registro gravado DENTRO da transação, ANTES do efeito que cria/liga; APTO com falha na gravação → nenhum post (C1, C10);
   reprovado → commit só com o registro (C2).
3. Página, Generation, posts da página e o que a medição lê estão travados da medição ao commit (C13: ordem; C4: edição
   concorrente espera e a chamada seguinte mede a versão nova — nunca "medida velha, escrita nova").
4. `adotar`: post entre os travados, tipo, Generation, projeto, `DRAFT` sem `laterPostId` (C5b); escolha mudou → concorrente (C19).
5. `simular` nunca grava (C8); fluxo humano byte a byte igual (C7).
6. Efeitos não escrevem nada que o veredito proteja (C6).
7. Reforços do Dot (plano-mestre § 4.5): `lembrete: true` em draft-only nunca chama `sendPublishReminder`/WAHA (C11);
   `sendToLater`/Zernio nunca chamados (C11); post aprovado intocável (C12); toda tool da allowlist que cria DRAFT passa
   pelo gate (C9).

## 8. Decisões pendentes do owner

| # | Decisão | Recomendação | Se decidir o contrário |
|---|---|---|---|
| 8.1 | **Política EFETIVA do assunto** (9.12 do CP5b) | `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA = POLITICA_DO_ASSUNTO_RECOMENDADA` (`estimado: 'humano'`, `semAssuntoLocalizavel: 'nao-se-aplica'`) — constante nomeada; `ver-geracao` compara com ela | `estimado: 'comprova'` deixa o assunto estimado reprovar sozinho; `semAssuntoLocalizavel: 'humano'` manda toda foto sem região forte ao humano |
| 8.2 | Código da recusa por concorrência (ação/post mudou entre as duas decisões) | `LOTE_AGENDAMENTO_CONCORRENTE` (já existe; "repita") | `REVISAO_HUMANA_NECESSARIA`: o chat chamaria gente por uma corrida |
| 8.3 | Registro do veredito reprovado | gravar na mesma transação (commit só com ele) | não gravar: `ver-geracao` nunca mostra por que a peça não entrou |
| 8.4 | Bloco `gate` em `auditar-operacao` (9.9 do CP5b) | CP5e, com os números do piloto | agora: PR maior em `posts/auditar-operacao.ts` |
| 8.5 | `adotar` com `post.generationId` nulo (DRAFT humano sem arte ligada) | `REVISAO_HUMANA_NECESSARIA` (não adota) | adotar e ligar: o agente "assume" um rascunho humano |
| 8.6 | Limite da proteção: bytes de assets e fontes servidos por URL | não protegidos (CP5b § 4.2); dito no manual | hash dos bytes a cada medição: + downloads, checkpoint próprio |
| 8.7 | Efeitos pós-commit fora do perímetro do gate (§ 5) | sim, com a prova de C6 | passar `reaproveitar` pela medição sob trava e/ou propagar `tx` até os efeitos (refatoração de 4 módulos) |
| 8.9 | Prazos da rede na medição | `PRAZO_DA_MEDICAO` 8 s total, `PRAZO_POR_DOWNLOAD` 4 s (dentro dos 20 s da transação, com folga para o resto) | valores maiores: mais itens medidos com origem lenta, travas presas por mais tempo |
| 8.8 | Medir DENTRO da transação (rede sob trava) | sim: é o que fecha a janela; orçamento medido em C18 | medir fora e reconferir: volta a janela e a lista de entradas a comparar |

## 9. Matriz de testes (unitários com banco falso que registra a ORDEM das operações; o fluxo humano pelos testes existentes)

| Caso | Entrada | Esperado |
|---|---|---|
| C1 | draft-only, `criar`, peça APTO | ordem: travas (projeto, item, plano, posts da página, página, Generation, FOR SHARE) → leituras da medição pelo `tx` → `UPDATE Generation … gateDaArte` → `INSERT` do post → CAS da linha; `revisao.resultado = 'APTO'` |
| C2 | draft-only, `criar`, peça reprovada (v1 do piloto) | nenhum post; commit só com `UPDATE … gateDaArte`; `falhou` `REVISAO_HUMANA_NECESSARIA` com `generationId`, `pageId`, `editUrl`, `achados` com `servico` |
| C3 | Generation JÁ com `gateDaArte` APTO coincidente; medida nova reprovada | igual a C2; o registro novo substitui o antigo; nenhuma leitura de `gateDaArte` |
| C4 | edição concorrente da página (camadas / copy / nome / tags) | a edição espera a trava (banco falso: a escrita concorrente é enfileirada e só aplica depois do commit) e a chamada SEGUINTE mede a versão nova; nunca post criado com medida da versão velha |
| C5 | medida de OUTRA página passada ao vínculo (unidade de `medirEDecidir`) | `sem-vinculo` → `REVISAO_HUMANA_NECESSARIA`, `revisao.tipo = 'sem-vinculo'`, sem achados |
| C5b | `adotar`: DRAFT `STORY` numa página `feed`; `generationId` nulo/outro; DRAFT que virou `SCHEDULED`; página com música | `REVISAO_HUMANA_NECESSARIA` (ou `POST_APROVADO_INTOCAVEL` como hoje) sem tocar no post |
| C6 | efeitos pós-commit | inventário: a única escrita em `SocialPost` é `generationId` por `ensurePostGeneration`, barrada pela guarda; nenhuma em `status`/`laterPostId`/`mediaUrls`/`postType`; em `Page` só `templateId`/`name`/`order`; comportamental: post aprovado / página editada / post sem Generation após o commit → efeitos não rodam ou não ligam nada |
| C7 | perfil normal, mesmas peças | igual a hoje: v1 vira rascunho RENDERED; sem `revisao`; nenhum `UPDATE … gateDaArte`; nenhuma trava nova |
| C8 | `simular: true`, draft-only, v1 e limpa | mede e decide pelo leitor; nenhuma escrita; `falhou`/`concluido` iguais aos da chamada de verdade |
| C9 | inventário COMPORTAMENTAL: para cada tool MUTANTE de `TOOLS_DRAFT_ONLY` (`compor-leva`, `agendar-leva`, `ajustar-arte`, `revisar-arte`, `conferir-arte`, `medir-copy`, …) o handler roda com um banco falso que registra `socialPost.create` e `UPDATE … gateDaArte` | só `agendar-leva` cria, e só DEPOIS do `gateDaArte`; uma tool nova de controle na allowlist que chame `criarPostDoAgendamento` direto FALHA; `agendar-itens.ts` está nas listas da regra de lint e do H12 |
| C10 | `gravarGateDaArte` lança / timeout da medição dentro da transação | rollback; `falhou` `REVISAO_HUMANA_NECESSARIA` (não `ERRO`); nenhum post |
| C11 | draft-only, `lembrete: true` | DRAFT `REMINDER`; `sendPublishReminder`/WAHA/`sendToLater` nunca chamados |
| C12 | página com post aprovado / `laterPostId` | `POST_APROVADO_INTOCAVEL`, como hoje; o gate nem mede |
| C13 | inventário dos `FOR UPDATE`/`FOR SHARE` de `src/lib` | ordem comum respeitada; as do CP5c idem |
| C14 | duas chamadas sobre a MESMA página (banco falso serializa pela trava): A mede e reprova, B mede e aprova | a ordem de commit define o último registro; nenhuma gravação fora de transação; o DRAFT só nasce na que aprovou |
| C15 | `Project.assinatura`, `CustomFont` (edição/remoção) ou a Generation do compositor mudam durante a medição | escrita concorrente espera a trava (FOR SHARE); a chamada seguinte mede com o novo |
| C15b | inserção de `CustomFont` pela rota DURANTE a transação do gate (depois da última leitura, antes de `criarPostDoAgendamento`) | a rota espera a trava consultiva das fontes; o DRAFT nasce medido com as fontes de antes e a fonte nova só entra depois do commit (a chamada seguinte mede com ela) |
| C20 | intercalação de `recompor`: `Page.layers` novo, `fieldValues.composicao`/`versaoRenderizada` antigos | `composicaoReaproveitavel: false`: assunto estimado de novo, referências sem o cache; a v2 do piloto é MEDIDA (achados presentes) e volta `REVISAO_HUMANA_NECESSARIA` |
| C21 | `fetch` que nunca responde (logo, foto ou fonte) | `nao-medida` no prazo; nenhum post; travas liberadas (a próxima chamada não espera) |
| C17 | `pedidoSob.postType` e `vinculo.postType` | derivados do mesmo `sob.peca`/post travado; `TIPO_DO_POST_POR_FORMATO` divergente → `sem-vinculo` |
| C18 | orçamento: tempo da medição por item (banco falso e benchmark sintético do CP3) | dito no PR; abaixo de 10 s por item no benchmark |
| C19 | a decisão sob trava muda em relação à decisão sem trava (`criar` → `adotar`, outro post) | `LOTE_AGENDAMENTO_CONCORRENTE`, nada escrito |
| P11 | `piloto-portao.test.ts` | os 8 `hojeViola` viram `it()`: v1 e v2 não criam rascunho (simulação e escrita) e voltam `REVISAO_HUMANA_NECESSARIA` com as referências; a peça limpa continua criando |

## 10. Arquivos (os principais)

- `src/lib/lotes/agendar-itens.ts`: `medirEDecidir`, `lerPaginaCompleta`, travas (posts da página, Generation, FOR SHARE),
  `gravarGateDaArte`, mapeamento das exceções do gate, `achados`/`motivos`/`revisao` no item;
- `src/lib/lotes/agendamento.ts` (ou vizinho puro): `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA`, tipos do retorno;
- `src/lib/creatives/revisao/revisar-arte.ts` (`contextoDaMedicao`: parâmetros `cliente`, `sinal`, `composicaoReaproveitavel`;
  `ContextoDaMedicao.sinal` repassado a `cacheDeLogos`/`assuntoDaPeca`), `src/lib/posts/register-project-fonts.ts`
  (`cliente`; `fetchBuffer(url, { signal })`) — opcionais com padrão de hoje; o revisor e o CP4 não mudam;
- `src/lib/trava-por-chave.ts` (`chaveDasFontes`), `src/app/api/projects/[projectId]/fonts/route.ts` e
  `fonts/[fontId]/route.ts` (criar/apagar dentro de `comTravaPorChave(chaveDasFontes(projectId))`);
- `src/lib/mcp/catalogo/compositor.ts` (`agendar-leva`): descrição + `principal` ao serviço; `scripts/validar-registro-mcp.ts`
  (snapshot da descrição);
- `src/lib/mcp/catalogo/ver-geracao-retorno.ts`: a política comparada passa a ser `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA`;
- `eslint.config.mjs` (lista de produtores) e `inventario-gate-da-arte.test.ts` (listas + C9/C13);
- testes: `src/lib/lotes/__tests__/agendar-itens-gate.test.ts` (C1–C19), `piloto-portao.test.ts` (P11 → `it()`);
- docs: `docs/regras/revisor-da-arte.md` § CP5c, `docs/regras/mcp.md`, `docs/regras/dot-lagosta-operacao.md` +
  `operacao-dot.ts` (bump: "agendar-leva no draft-only só cria rascunho com veredito APTO medido na hora").

Fora: `gate.ts`, `gate-registro.ts`, `gate-persistido.ts`, `agendar.ts`, `pastas.ts`, `artes-do-post.ts`,
`ensure-post-generation.ts`, `arte-rapida.ts`, `persist.ts`, `recompor.ts`, schema do Prisma, fluxo humano.

## 11. Gates do PR de implementação

Suíte completa com `MOSTRAR_VIOLACOES=1` (só os 8 `hojeViola` de P11 mudam, para `it()`), `typecheck`, `lint`,
`git diff --check`, `validar-registro-mcp`, `validar-oauth-mcp`, `validar-impressao-digital` (nenhuma impressão muda:
`gate.ts` e `regras.ts` não são tocados); Codex no HEAD exato; CI e Vercel verdes; merge por merge commit com
`--match-head-commit`. Nenhum cliente real, DRAFT real, agenda, publicação, mensagem, webhook ou banco de produção
como teste (ordem do owner).
