# CP5e — provas de autonomia: o gate como INFORMAÇÃO no `revisar-arte`, o bloco `gate` em `auditar-operacao` e a prova ponta a ponta sintética (contrato)

**Estado: PROPOSTA, em revisão do Codex (rodada 2). Rodada 1: NÃO APTO — 3 BLOQUEADOR, 5 IMPORTANTE, 2 MENOR, endereçados
abaixo (§ 1.2 medida fiel `corrigir: false`; § 1.4 saídas tipadas; § 3 caso E0 com o compositor real; § 1.2 item 2 a seleção da
Generation unificada com `contextoDaMedicao`; § 2 identidade completa de `validadeDoGate`, rótulo `coincidente` com `naoConferido`,
teto de posts, módulo puro novo; matriz E1/E2/E7 corrigidas; § 3.1 contrato de extração do banco falso e o que NÃO se prova; I2 e
o envelhecimento durante os `await`s). Nada aqui está implementado; este PR é documental.** Base: `main` `a13ad938`
(CP5d mergeado, PR #244). Plano-mestre: `docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md` § 4.7 (CP5e) e § 4.8 (o
piloto sintético que vem DEPOIS, fora deste contrato). Herda do CP5d (`docs/PLANO-2026-10-17-CP5D-CONTRATO.md`) a decisão 8.6
("o `hojeViola` humano 'em até 2 ciclos' é do CP5e: `revisar-arte` devolve o veredito do gate como INFORMAÇÃO, sem gravar") e a
lista "Não entra" (provas ponta a ponta e o piloto; bloco `gate` em `auditar-operacao`).

## 0. O que o CP5e É e o que NÃO é

**É**: (a) o `revisar-arte` (tool consultiva, `readOnlyHint: true`, qualquer perfil) passa a devolver um bloco `gate` com o
veredito que o gate daria à página COMO ESTÁ — **informação**, nunca autorização, nunca gravado; (b) o `hojeViola` "em até 2
ciclos com os ajustes do próprio revisor, a peça termina apta ou com REVISAO_HUMANA_NECESSARIA" (`piloto-ciclo.test.ts`) vira
`it()`; (c) `auditar-operacao` ganha um bloco `gate` por cliente: quantos posts da janela têm veredito gravado, qual, e se o
registro é da versão atual da página (rótulo `atual`/`historico`/`ilegivel`); (d) a prova PONTA A PONTA sintética do fluxo
autônomo (compor → revisar → ajustar → revisar → agendar DRAFT) nos seis casos do plano-mestre § 4.7; (e) manual do Dot v8 e docs.

**NÃO é**: o piloto sintético de autonomia (§ 4.8: lote representativo, taxas, custo, repetibilidade — é o checkpoint SEGUINTE e
consome as provas daqui); MCP-M; editor; canvas; allowlist; publicação; lembrete; webhook; gravar registro do gate a partir de
`revisar-arte` ou de `auditar-operacao` (os dois são só leitura — § 1.3); mudar a DECISÃO do gate (`gate.ts`, `gate-registro.ts`
além do que a § 1.2 lista); mudar o CP4; mudar a transação do CP5c/CP5d; `melhorar-arte`, `criar-arte-de-modelo`, `compor-arte`
continuam fora da allowlist.

## 1. O gate como INFORMAÇÃO no `revisar-arte`

### 1.1 Hoje (main a13ad938)

`revisarArte` (`src/lib/creatives/revisao/revisar-arte.ts:572`) lê a página, monta o contexto (`contextoDaMedicao`), mede
(`medirCamadasDaPeca`, linha 616) e avalia (`avaliarPeca`, linha 689) → `RevisaoDaArte { relatorio, versao, aplicavel, … }`. A tool
`revisar-arte` (`src/lib/mcp/catalogo/compositor.ts:370`) devolve `achados`, `ajustes`, `cobertura`, `visao`, `comoAplicar`. **Nenhum
veredito do gate aparece**: o chat humano só vê achados; a única escalada que existe é texto do manual. O `hojeViola` de
`piloto-ciclo.test.ts:798` espera que, depois de até 2 ciclos revisar → ajustar, a peça esteja apta OU que
`REVISAO_HUMANA_NECESSARIA` apareça na última revisão ou no último ajuste — no fluxo HUMANO (`ajustarArte` sem `apenasRascunho`).
`ORIGENS_DO_GATE` já contém `'revisar-arte'` (CP5b, decisão 9.8) sem nenhum produtor.

### 1.2 O que muda

1. **`revisarArte` calcula a decisão do gate sobre uma medida FIEL da página como está** — e aqui mora a diferença que a
   rodada 1 do Codex apontou: o revisor mede com `corrigir: true` (`medirCamadasDaPeca`, `revisar-arte.ts:471-480`): a régua
   aplica EM MEMÓRIA a força de gradiente que proporia e devolve `p98ComHalo`/`ok` pós-correção (`regua.ts:509-517`; o estado
   anterior fica só no resumo do GRUPO, `antesDaCorrecao`, não por texto — e o gate lê `textos[]`, `gate.ts:777-782`). Os
   produtores medem com `corrigir: false` (`agendar-itens.ts:611`, `arte-rapida.ts:1220`). Um gate sobre a medida corrigida
   diria APTO para uma hipótese. Então: `revisarArte` chama `medirCamadasDaPeca(camadas, ctx, { corrigir: false })` uma SEGUNDA
   vez, com o MESMO `ctx` (contexto, downloads, assunto e referências reaproveitados) — **custo dito: +1 passada da régua (um
   render do fundo + leitura dos textos) por chamada de `revisar-arte`, nenhum download a mais** — e passa ESSA medida a
   `decidirEMontarRegistro` (`gate-registro.ts:119`) com `origem: 'revisar-arte'`, `principal` ausente. O relatório do revisor
   continua saindo da medida corrigida (os ajustes `gradiente` precisam de `tintaCorrigida`). Teste E-div (§ 3): a fixture do
   piloto, em que a régua corrige (serviço sem leitura com força no piso): o revisor propõe `gradiente`, o gate informativo diz
   `REVISAO_HUMANA_NECESSARIA` por `texto-sem-leitura` — e a medida do gate é igual (`JSON` do `contraste`) à de
   `agendar-leva` sobre a mesma página. Alternativa (decisão 5.5): a régua passar a guardar `antesDaCorrecao` POR TEXTO e o
   gate ler uma transformação pura da medida única — muda `regua.ts` (compositor), por isso não é a proposta deste CP.
   O bloco vai em `RevisaoDaArte.gate`:
   - `{ tipo: 'medida', resultado, rulesVersion, versaoDoGate, medidoEm, motivos, naoMedidos, pageVersion, copyVersion,
     informacao: FRASE_FIXA }` quando há vínculo;
   - `{ tipo: 'sem-vinculo', motivo, informacao: FRASE_FIXA }` quando `decidirEMontarRegistro` devolve `sem-vinculo` (página-modelo,
     formato que os classificadores não acordam, sem Generation da peça — § 1.4);
   - `{ tipo: 'nao-medida', motivo, informacao: FRASE_FIXA }` quando a decisão lança (fail-closed; a revisão humana continua
     saindo normalmente — o gate é informação, não pode derrubar o `revisar-arte`).
   `FRASE_FIXA` = "informação do gate sobre a página como está agora: não autoriza, não grava e não vale para a agenda — o veredito
   que vale é o medido na hora por agendar-leva/ajustar-arte". É a mesma ideia da frase fixa do bloco `gate` de `ver-geracao`
   (CP5b § 6), com a diferença dita: lá é REGISTRO (passado), aqui é MEDIDA DE AGORA sem registro.
2. **Vínculo e UMA seleção da Generation** (`vinculo.generationId`, exigido por `decidirEMontarRegistro`, que NÃO consulta a
   linha — confere medida e identidade, `gate-registro.ts:119-150`). Hoje `contextoDaMedicao` faz a própria busca (15 mais
   recentes da página, primeira `source: 'compositor'`, `revisar-arte.ts:423-441`) e reaproveita a composição por padrão.
   Passa a valer, em `revisarArte`, UMA seleção, feita ANTES do contexto e passada como `generationDaPeca` (como CP5c/CP5d):
   (i) `input.generationId` quando o chamador o deu — a Generation pedida, se `fieldValues.pageId` for a página (senão a
   recusa de hoje, `GERACAO_NAO_ENCONTRADA`/página divergente); (ii) senão a Generation de ORIGEM da página, a mesma seleção do
   CP5d (`source: 'compositor'`, `fieldValues.pageId = page.id`, a mais recente, sem o `take: 15`); (iii) senão a última arte
   da página (`alvoDaRecomposicao`, `recompor.ts:778`); (iv) nenhuma → `generationDaPeca: null` (contexto sem referências, como
   hoje nesse caso) e `gate: sem-vinculo` ("a página não tem arte: o gate só decide sobre arte"). `composicaoReaproveitavel` =
   `fieldValues.versaoRenderizada === versaoDaPagina(page)` (a regra do CP5c) — **efeito dito no revisor**: numa página editada
   depois da arte, o assunto deixa de vir do cache e é estimado de novo (mais fiel; `assuntoOrigem: 'estimado'` segue a
   política). Em (ii) a escolha coincide com a de hoje sempre que a arte do compositor está entre as 15 mais recentes; fora
   disso a nova é a correta. `ver-geracao` segue lendo a Generation pedida pelo id (`arte-ia.ts:641`), não esta seleção — dito
   no bloco (`vinculo.generationId`). O `postType` do vínculo = `TIPO_DO_POST_POR_FORMATO[formato]` da página.
3. **Política do assunto**: `POLITICA_DO_ASSUNTO_DO_GATE` (`lotes/agendamento.ts`) — a mesma dos produtores; o bloco diz qual
   (`politicaDoAssunto`), para a pessoa saber que a informação segue a proposta 8.1 ainda não decidida.
4. **Sem transação, sem trava, sem gravação.** A leitura de `revisar-arte` é sem `FOR UPDATE`, e a página pode mudar
   DURANTE a chamada (entre a leitura e os `await`s de contexto, medida e visão — `revisar-arte.ts:597-643`) e depois dela; o
   bloco carrega `pageVersion`/`copyVersion` DA LEITURA (é sobre essa versão que a informação vale, e `ajustar-arte` recusa
   `VERSAO_DIVERGENTE` se ela envelheceu), e `ajustar-arte`/`agendar-leva` medem de novo sob trava. Dito no bloco e no manual:
   "o veredito de revisar-arte é da versão lida e pode envelhecer; o que vale é o medido na hora, sob trava".
5. **A tool `revisar-arte` repassa `gate` no corpo** (depois de `cobertura`), e `comoAplicar` ganha a frase: se `gate.resultado`
   for `REVISAO_HUMANA_NECESSARIA` e não houver `ajustes`, "leve à pessoa: o gate não aprovaria esta versão e o revisor não tem
   ajuste a propor". `revisar-arte` continua `readOnlyHint: true` e no perfil draft-only como hoje.
6. **Barreira de lint e inventário**: `revisar-arte.ts` entra na lista dos consumidores (pode importar `decidirEMontarRegistro`,
   nunca `gateDaMedida`); o inventário H12 (`inventario-gate-da-arte.test.ts`) ganha o arquivo e o caso "revisar-arte não chama
   gateDaMedida nem gravarGateDaArte".

### 1.3 Invariantes (os testes exercitam)

- I1 `revisar-arte` não escreve em `Generation` nem em `Page` (nenhum `update`/`$executeRaw` no banco falso; `gravarGateDaArte` não
  é importada em `revisar-arte.ts` — inventário).
- I2 Relação entre o relatório e o gate (as duas medidas saem do MESMO `ctx`, camadas e canvas): todo achado `problema` do
  relatório numa regra crítica do gate (`REGRAS_DE_TEXTO` e as demais de `gate.ts:47`) que NÃO seja o efeito da correção da
  régua ⇒ `gate.resultado = REVISAO_HUMANA_NECESSARIA` com motivo `ACHADO_CRITICO` nessa regra; e as conferências próprias do
  gate (`copy-completa`, `piso-de-interface`, `oclusao`, `identidade`, `gate.ts:50`) podem aparecer em `gate.motivos` sem
  achado correspondente no relatório — o teste lista as duas famílias e confere cada motivo contra uma delas.
- I3 Falha ao decidir (exceção) ⇒ `gate.tipo = 'nao-medida'` e o resto da revisão igual ao de hoje (snapshot do corpo sem `gate`).
- I4 `pageVersion` do bloco = `versao` da revisão (`RevisaoDaArte.versao` já é `versaoDaPagina`).
- I5 O bloco NUNCA vem com `resultado: 'APTO'` quando `naoMedidos` não está vazio (invariante 2.3 do CP5a, herdada).

### 1.4 O `hojeViola` "em até 2 ciclos" vira `it()`

O teste deixa de procurar texto em JSON e passa a ler campos TIPADOS, e as duas saídas ficam estritas:
- **apta** ⇔ a ÚLTIMA revisão traz `gate.tipo === 'medida' && gate.resultado === 'APTO'` **e** as `REGRAS_DURAS` mediram
  (`regraMediu`) **e** não há `problema` aberto fora de `fonte-nao-carregada` (artefato do ambiente, dito no cabeçalho do teste);
- **escalada** ⇔ a ÚLTIMA revisão traz `gate.tipo === 'medida' && gate.resultado === 'REVISAO_HUMANA_NECESSARIA'` com
  `motivos` não vazios, **ou** o último `ajustarArte` lançou `CreativeError` com `code === 'REVISAO_HUMANA_NECESSARIA'` e
  `details.revisao` tipado — e, nos dois casos, o texto da tool (`comoAplicar`/manual) instrui a levar à pessoa;
- `gate.tipo` `sem-vinculo` ou `nao-medida` na última revisão ⇒ o teste FALHA (a fixture tem vínculo; `nao-medida` seria defeito
  do harness, não desfecho).
Informação exibida não prova que o chat escalou: o que o teste prova é que o fluxo humano TERMINA numa das duas saídas tipadas
em ≤ 2 ciclos. Se o owner responder 5.4 pela alternativa (o `ajustar-arte` humano também devolve `revisao`), o teste lê a
escalada também dali — a estrutura não muda. **Dois casos**: (a) a fixture do piloto, que hoje termina em escalada (o serviço sem
leitura não tem correção executável — CP2, `hojeViola` que fica); (b) "termina APTA em ≤ 2 ciclos": a peça limpa
(`suporte/peca-limpa.ts`) com um defeito corrigível pelo revisor (apoio dentro do piso de interface do story — `fora-da-area-segura`/
`piso-de-interface` → ajuste `mover` → apta). Harness de `piloto-ciclo`: `generation.findFirst` já honra o where do compositor
(CP5d); entra a peça limpa com defeito.

## 2. Bloco `gate` em `auditar-operacao`

### 2.1 Hoje

`auditarOperacao` (`src/lib/posts/auditar-operacao.ts:35`) lê, por cliente ativo visível, os posts da janela (hoje → depois de
amanhã, com tolerância) com `id, status, pageId, renderStatus, …` — **sem `generationId`** — e devolve a cobertura por dia; a tool
(`catalogo/agenda.ts:667`) junta `manual` e `seguranca.perfilEfetivo`. Nenhuma menção ao gate.

### 2.2 O que muda

1. A consulta dos posts da janela passa a selecionar também `generationId`; para os posts com `generationId`, UMA consulta
   `generation.findMany({ where: { id: { in } }, select: { id, fieldValues, projectId } })` e UMA `page.findMany` das páginas
   desses posts (`select` da identidade: `id, name, tags, width, height, background, layers, copyAutoral`) — custo O(posts da
   janela), dito; sem N+1.
2. Por post, **fail-closed no vínculo** antes de ler qualquer registro: `post.projectId === generation.projectId ===
   page.Template.projectId` e `generation.fieldValues.pageId === post.pageId` e `post.projectId ∈ permitidos`; qualquer
   divergência ou ausência (Generation/página que não vieram) → `registroInvalido` (nenhum resultado exibido). Então
   `lerGateDaArte(fieldValues)` → `validadeDoGate(registro, identidadeAtual)` (os dois já existem, CP5b; `gate-registro.ts:333-360`),
   com `IdentidadeAtual` COMPLETA: `projectId`, `generationId`, `pageId`, `formato` e `formatoDoCompositor` (de
   `identidadeDaPagina(page)`), `pageVersion`, `copyVersion`, `rulesVersion = VERSAO_DAS_REGRAS`, `versaoDoGate = VERSAO_DO_GATE`,
   `politica = POLITICA_DO_ASSUNTO_DO_GATE` — exatamente o que `ver-geracao` passa (`ver-geracao-retorno.ts:133`). Resultado por
   post: `coincidente` (com a lista fixa `naoConferido`, como `ver-geracao`) | `historico` | `ilegivel` | `semRegistro` |
   `registroInvalido`. **Só leitura**; nada é medido aqui (medir a carteira inteira numa chamada é o que o § 4.8 vai
   dimensionar, não o `auditar-operacao`). **Rótulo**: `coincidente` significa "metadados iguais aos de hoje, com o que NÃO foi
   conferido listado" — nunca "aprovado agora"; o nome `atual` não é usado.
3. Por cliente, `gate: { posts: n, coincidente: { APTO: n, REVISAO_HUMANA_NECESSARIA: n, naoConferido: [...] }, historico: n,
   ilegivel: n, semRegistro: n, registroInvalido: n, politicaDoAssunto, aviso: AVISO_DO_GATE }` e, na raiz, o total; a frase fixa
   é a do `ver-geracao` (`AVISO_DO_GATE`, CP5b § 6: "último veredito gravado; não é o veredito atual da arte …").
   **Custo e teto**: as duas consultas são em número fixo, mas carregam `layers` e `fieldValues` dos posts da janela; o bloco
   lê no máximo `TETO_DE_POSTS_DO_GATE = 200` posts por chamada (ordem: `scheduledDatetime` asc), e acima disso devolve
   `parcial: true` com `naoLidos: n` — o teste mede com 60 posts sintéticos que as consultas são 2 e o tempo do resumo puro é
   < 50 ms.
4. `auditar-operacao.ts` e `agenda.ts` NÃO entram na barreira do gate: eles não decidem. A leitura/validade fica num módulo
   PURO novo, `src/lib/creatives/revisao/gate-resumo.ts` (`resumoDoGateDosPosts(posts, generations, pages, { permitidos,
   agora })`), que importa só `gate-registro.ts` (`lerGateDaArte`, `validadeDoGate`), `versao.ts`, `gate.ts` (tipos e
   `VERSAO_DO_GATE`), `contrato.ts` e `agendamento.ts` — NUNCA `@/lib/db` nem `mesclar-field-values` (o `gate-persistido.ts`
   de hoje importa o merge que carrega o banco, `gate-persistido.ts:13` — por isso não serve). O módulo entra na lista fechada
   de consumidores do lint (pode importar `lerGateDaArte`/`validadeDoGate`, nunca `gateDaMedida` nem `decidirEMontarRegistro`)
   e no inventário.

### 2.3 Invariantes

- I6 `auditar-operacao` não chama `gateDaMedida`, `decidirEMontarRegistro` nem `gravarGateDaArte` (inventário).
- I7 Um post sem `generationId` conta em `semRegistro`; um registro de outra `pageVersion` conta em `historico`, nunca em
  `coincidente`; vínculo cruzado (Generation de outra página/projeto) conta em `registroInvalido` e não exibe resultado.
- I8 O bloco não muda nenhum outro campo da auditoria (snapshot do corpo sem `gate` igual ao de hoje).

## 3. Prova ponta a ponta sintética (plano-mestre § 4.7)

Um arquivo novo, `src/lib/direcao-de-arte/__tests__/piloto-ponta-a-ponta.test.ts`, com o fluxo REAL de produção (`revisarArte`,
`ajustarArte`, `agendarItensDoLote`) sobre o banco falso com travas/fila/rollback do CP5d (extraído de
`creatives/__tests__/ajustar-arte-gate.test.ts` para `direcao-de-arte/__tests__/suporte/banco-com-travas.ts`, sem mudar o que ele
prova — o arquivo do CP5d passa a importá-lo) e a MEDIÇÃO REAL (renderer de produção, como `piloto-ciclo`/`piloto-portao`).

**Ponto de partida**: E0 COMPÕE de verdade (`comporPeca` real, gravando — não `somenteAvaliar`, que é o que
`piloto-compositor.test.ts:58` usa e não produz a peça persistida) a spec da peça limpa sobre o banco falso: Page + Generation do
compositor nascem do fluxo real; os demais casos partem da peça composta por E0 (e, onde dito, da fixture do piloto v1). **Limite
dito**: E0 roda UMA vez por arquivo (custo 3–4 renders); repetir o compor em cada caso é o que o § 4.8 vai medir, não isto. A
decisão 5.1 pergunta ao owner se E0 fica (proposta: fica); se sair, a prova integral do § 4.7 FICA PENDENTE e o contrato o diz —
não se marca o § 4.7 como concluído sem o compor.

### 3.1 O banco falso extraído (contrato de isolamento)

`suporte/banco-com-travas.ts` exporta `criarBancoComTravas()` com a MESMA semântica do harness do CP5d
(`creatives/__tests__/ajustar-arte-gate.test.ts`): fila por chave, `FOR UPDATE` devolve a linha DEPOIS da trava, toda escrita de
Page move o `@updatedAt`, rollback só do que a transação escreveu, timeout `P2028`, deadlock injetado, eventos com carimbo,
`escreverFora`/`segurarFora`/`segurarVarias`/`segurarChave`, e `reset()` por teste. O arquivo do CP5d passa a importá-lo e MANTÉM
os próprios mocks (medição pelo corpus, CP4 trocável, render trocável, Blob, `criarPostDoAgendamento`); a suíte do CP5d continua
verde sem mudar uma asserção (gate do PR). O novo `piloto-ponta-a-ponta.test.ts` declara o que troca por REAL: medição
(`revisar-arte` real, renderer de produção), CP4 (`ajustar-sem-piorar` real), compositor (E0), `agendar.ts` real com
`efeitosDoAgendamento` espionado (E8); continuam falsos: `@vercel/blob`, `register-project-fonts` (sem rede), `@/lib/db`.

**O que banco falso + medição real NÃO provam** (dito aqui e no cabeçalho do teste): a semântica real das travas e do SQL no
Postgres (`FOR UPDATE`, advisory locks, `P2028`); persistência e render no Blob; a autorização MCP (perfil, allowlist — provada
nos testes de `perfil`/C9); o comportamento do chat (se ele leva à pessoa); custo, estabilidade e repetibilidade do § 4.8.

| Caso | Entrada | Esperado |
|---|---|---|
| E0 compor | `comporPeca` real sobre a spec da peça limpa, gravando no banco falso | Page + Generation do compositor (`source: 'compositor'`, `versaoRenderizada` = `versaoDaPagina`) nascem do fluxo real; `revisar-arte` sobre ela: `gate.tipo = 'medida'` e `vinculo.generationId` = a Generation composta |
| E1 APTO → DRAFT | peça de E0; `revisar-arte` (gate APTO, informação) → `agendar-leva` draft-only | DRAFT criado; registro APTO; `ver-geracao` rotula `coincidente`; `auditar-operacao` conta 1 em `coincidente.APTO` |
| E2 não APTO → nenhum DRAFT | peça de E0 com o apoio sobre o piso de interface (y 1750) | `revisar-arte` informa `REVISAO_HUMANA_NECESSARIA` (piso-de-interface); `agendar-leva` não cria post, registro reprovado gravado na Generation da peça (CP5c); `auditar-operacao` não conta nada para esta página (não há post) — e `ver-geracao` da Generation mostra o registro reprovado |
| E-div medida fiel | fixture do piloto v1 (a régua corrige em memória) | o relatório propõe `gradiente`; o `gate` informativo diz `REVISAO_HUMANA_NECESSARIA` por `texto-sem-leitura`; `JSON(contraste)` da medida do gate = o de `agendar-leva` sobre a mesma página (mesma `corrigir: false`) |
| E3 corrigir e agendar | E2 + `ajustar-arte` draft-only com o `mover` que o revisor propõe → `revisar-arte` APTO → `agendar-leva` | 2 ciclos; a versão gravada é a APTA; DRAFT criado sobre ela; dois registros (ajuste e lote) com a mesma `pageVersion` (A9 do CP5d, ponta a ponta) |
| E4 edição concorrente | o editor grava a página entre o `revisar-arte` e o `ajustar-arte` (versão do revisor envelhece) | `VERSAO_DIVERGENTE`, nada gravado; o `revisar-arte` seguinte traz o `gate` da versão nova |
| E5 DRAFT anterior bom preservado | E1 feito; `ajustar-arte` draft-only que o gate recusa (piora que o CP4 aceita: apoio para o piso) | página intacta, DRAFT e sua Generation intactos, nenhuma Generation nova, `invalidateScheduledRenders` não chamado |
| E6 post aprovado intocável | E1 + o DRAFT vira SCHEDULED com `laterPostId` | `ajustar-arte` draft-only → `POST_APROVADO_INTOCAVEL` sob trava, nada medido; `agendar-leva` do mesmo item → `reaproveitar`/recusa de sempre (CP5c), nunca um segundo post |
| E7 regra não medida → humano | peça de E0 com a conferência de fontes FALHANDO (`motivoSemFontes`: `familiasNaoCarregadas` lança) | `revisar-arte` informa `gate.tipo = 'medida'`, `REVISAO_HUMANA_NECESSARIA` com motivo `NAO_COMPROVADA`/`NAO_MEDIDO` em `fonte-nao-carregada` (`gate.ts:736-739`); `agendar-leva` recusa; nenhum DRAFT. (`nao-medida` fica reservado para a DECISÃO lançar — I3.) |
| E7b fonte ausente → humano | peça de E0 com uma fonte da marca não cadastrada | achado `fonte-nao-carregada` crítico (`regras.ts:675`) ⇒ `ACHADO_CRITICO`; `agendar-leva` recusa; nenhum DRAFT |
| E8 sem efeitos externos | todos os casos | nenhum `fetch` para fora (a suíte é hermética), nenhum lembrete, webhook, publicação, Zernio: espiões de `efeitosDoAgendamento`/notificações não chamados |
| E9 `auditar-operacao` lê o que E1–E7 deixaram | banco ao fim de cada caso | contagens batem com o estado (`atual`/`historico`/`semRegistro`), nada medido, nada escrito |

Mais os unitários: `revisar-arte` (I1–I5, com `decidirEMontarRegistro` real sobre medida do corpus e o caso de exceção), o helper
`resumoDoGateDosPosts` (I6–I8), o `hojeViola` → `it()` (§ 1.4) e o inventário.

## 4. Arquivos

`src/lib/creatives/revisao/revisar-arte.ts` (bloco `gate`); `src/lib/mcp/catalogo/compositor.ts` (tool `revisar-arte`: corpo +
`comoAplicar` + descrição); `src/lib/creatives/revisao/gate-resumo.ts` (novo, puro: `resumoDoGateDosPosts`); `src/lib/posts/auditar-operacao.ts`
(+`generationId`, duas consultas, bloco `gate`); `src/lib/mcp/catalogo/agenda.ts` (descrição da tool); `eslint.config.mjs` e
`inventario-gate-da-arte.test.ts` (revisar-arte.ts consumidor); `src/lib/mcp/operacao-dot.ts` (v8: "revisar-arte devolve o gate como
informação; não é autorização; o que vale é o da hora"); docs `revisor-da-arte.md § CP5e`, `mcp.md`, `dot-lagosta-operacao.md`;
testes: `revisar-arte-gate.test.ts` (novo), `gate-resumo.test.ts` (novo), `auditar-operacao.test.ts` (+bloco), `piloto-ciclo.test.ts`
(§ 1.4), `piloto-ponta-a-ponta.test.ts` (novo), `suporte/banco-com-travas.ts` (extraído, § 3.1), `suporte/peca-limpa.ts` (+variantes com defeito e a spec para o compor de E0).

## 5. Decisões pendentes do OWNER (a implementação usa a recomendação como PROPOSTA nomeada, trocável numa linha)

| # | Decisão | Proposta | Alternativa |
|---|---|---|---|
| 5.1 | A prova ponta a ponta inclui o passo "compor" com o compositor real (E0, uma vez por arquivo)? | SIM (é o que o § 4.7 pede; custo 3–4 renders uma vez) | não — e então a prova integral do § 4.7 fica PENDENTE, dita como tal |
| 5.2 | O bloco `gate` do `revisar-arte` aparece para página-modelo (`aplicavel: false`)? | `sem-vinculo` com motivo "página-modelo não vai para a agenda" | medir e informar mesmo assim |
| 5.3 | `auditar-operacao` conta quais situações de post? | todos os posts da janela (DRAFT, SCHEDULED, POSTED, FAILED), por situação | só DRAFT |
| 5.4 | A escalada "em até 2 ciclos" por INFORMAÇÃO tipada do gate na revisão satisfaz o contrato alvo da V1 (owner, 13/10)? | sim — o plano-mestre § 4.7 descreve o veredito como informação no fluxo humano; o chat é instruído a levar à pessoa | exigir que o `ajustar-arte` humano também devolva `revisao` (amplia o CP5d ao fluxo humano, warn-only) |
| 5.5 | Medida fiel do gate informativo: segunda passada da régua (`corrigir: false`, +1 render do fundo por `revisar-arte`) ou `antesDaCorrecao` POR TEXTO na régua (muda `regua.ts`, do compositor)? | segunda passada agora (sem tocar a régua) | mudar a régua num PR próprio e o gate ler uma transformação pura da medida única |

## 6. Gates do PR de implementação

Matriz E1–E9 + unitários + inventário verdes; `hojeViola` restantes só CP2, P6/P7, A/A'/G (ditos); suíte completa sozinha
(`--maxWorkers=4`); typecheck; lint; `git diff --check <base>`; 3 validadores do CI; Codex APTO no HEAD final; CI e Vercel verdes;
merge por merge commit com `--match-head-commit` (SHA completo). Depois do merge: o checkpoint § 4.8 (piloto sintético) tem contrato
próprio e consome as provas daqui; MCP-M0 só depois dele.
