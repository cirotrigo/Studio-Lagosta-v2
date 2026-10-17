# CP5e — provas de autonomia: o gate como INFORMAÇÃO no `revisar-arte`, o bloco `gate` em `auditar-operacao` e a prova ponta a ponta sintética (contrato)

**Estado: PROPOSTA, em revisão do Codex (rodada 1). Nada aqui está implementado; este PR é documental.** Base: `main` `a13ad938`
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

1. **`revisarArte` calcula a decisão do gate sobre a MESMA medida** que já produziu o relatório, via `decidirEMontarRegistro`
   (`gate-registro.ts:119`) com `origem: 'revisar-arte'`, `principal` ausente, e devolve em `RevisaoDaArte.gate`:
   - `{ tipo: 'medida', resultado, rulesVersion, versaoDoGate, medidoEm, motivos, naoMedidos, pageVersion, copyVersion,
     informacao: FRASE_FIXA }` quando há vínculo;
   - `{ tipo: 'sem-vinculo', motivo, informacao: FRASE_FIXA }` quando `decidirEMontarRegistro` devolve `sem-vinculo` (página-modelo,
     formato que os classificadores não acordam, sem Generation da peça — § 1.4);
   - `{ tipo: 'nao-medida', motivo, informacao: FRASE_FIXA }` quando a decisão lança (fail-closed; a revisão humana continua
     saindo normalmente — o gate é informação, não pode derrubar o `revisar-arte`).
   `FRASE_FIXA` = "informação do gate sobre a página como está agora: não autoriza, não grava e não vale para a agenda — o veredito
   que vale é o medido na hora por agendar-leva/ajustar-arte". É a mesma ideia da frase fixa do bloco `gate` de `ver-geracao`
   (CP5b § 6), com a diferença dita: lá é REGISTRO (passado), aqui é MEDIDA DE AGORA sem registro.
2. **Vínculo** (`vinculo.generationId`, exigido por `decidirEMontarRegistro`): a Generation de ORIGEM da página, com a MESMA seleção
   do CP5d (`source: 'compositor'` e `fieldValues.pageId = page.id`, a mais recente); sem ela, a última arte da página
   (`alvoDaRecomposicao`, `recompor.ts`); sem nenhuma → `sem-vinculo` ("a página não tem arte: o gate só decide sobre arte"). O
   `postType` do vínculo = `TIPO_DO_POST_POR_FORMATO[formato]` da página (o mesmo que o CP5c/CP5d passam).
3. **Política do assunto**: `POLITICA_DO_ASSUNTO_DO_GATE` (`lotes/agendamento.ts`) — a mesma dos produtores; o bloco diz qual
   (`politicaDoAssunto`), para a pessoa saber que a informação segue a proposta 8.1 ainda não decidida.
4. **Sem transação, sem trava, sem gravação.** A medida de `revisar-arte` é a de sempre (leitura sem `FOR UPDATE`); o bloco carrega
   `pageVersion`/`copyVersion` da leitura, e `ajustar-arte`/`agendar-leva` medem de novo sob trava. Dito no bloco e no manual:
   "o veredito de revisar-arte pode envelhecer; o que vale é o da hora".
5. **A tool `revisar-arte` repassa `gate` no corpo** (depois de `cobertura`), e `comoAplicar` ganha a frase: se `gate.resultado`
   for `REVISAO_HUMANA_NECESSARIA` e não houver `ajustes`, "leve à pessoa: o gate não aprovaria esta versão e o revisor não tem
   ajuste a propor". `revisar-arte` continua `readOnlyHint: true` e no perfil draft-only como hoje.
6. **Barreira de lint e inventário**: `revisar-arte.ts` entra na lista dos consumidores (pode importar `decidirEMontarRegistro`,
   nunca `gateDaMedida`); o inventário H12 (`inventario-gate-da-arte.test.ts`) ganha o arquivo e o caso "revisar-arte não chama
   gateDaMedida nem gravarGateDaArte".

### 1.3 Invariantes (os testes exercitam)

- I1 `revisar-arte` não escreve em `Generation` nem em `Page` (nenhum `update`/`$executeRaw` no banco falso; `gravarGateDaArte` não
  é importada em `revisar-arte.ts` — inventário).
- I2 O bloco `gate` é derivado da MESMA `medida` do relatório: `gate.motivos` ⊆ regras da `cobertura`; achado crítico `problema`
  em regra do gate ⇒ `resultado = REVISAO_HUMANA_NECESSARIA` (paridade `gateDaMedida` × `avaliarPeca`, já provada no CP5a — aqui só
  se confere que o `revisar-arte` não a quebra: o relatório e o gate saem de uma única `medirCamadasDaPeca`).
- I3 Falha ao decidir (exceção) ⇒ `gate.tipo = 'nao-medida'` e o resto da revisão igual ao de hoje (snapshot do corpo sem `gate`).
- I4 `pageVersion` do bloco = `versao` da revisão (`RevisaoDaArte.versao` já é `versaoDaPagina`).
- I5 O bloco NUNCA vem com `resultado: 'APTO'` quando `naoMedidos` não está vazio (invariante 2.3 do CP5a, herdada).

### 1.4 O `hojeViola` "em até 2 ciclos" vira `it()`

Com o bloco `gate` na revisão, `JSON.stringify([revisao, ultimoAjuste]).includes('REVISAO_HUMANA_NECESSARIA')` passa a ser
verdadeiro sempre que a versão final não é apta pelo gate — é EXATAMENTE a semântica do plano-mestre ("apta ou escalada"). O
teste mantém as guardas: as `REGRAS_DURAS` mediram; `apta` = sem problemas abertos (fora `fonte-nao-carregada`, artefato do
ambiente); `escalada` lida do bloco `gate` da última revisão **ou** do `revisao` do último ajuste. **Limite dito**: a fixture do
piloto hoje termina em escalada (o serviço sem leitura não tem correção executável — CP2, `hojeViola` que fica); o caso
"termina APTA em ≤ 2 ciclos" é provado com a peça limpa (`suporte/peca-limpa.ts`) + um defeito corrigível pelo revisor (apoio
movido para dentro da área segura: `fora-da-area-segura` → ajuste `mover` → apta). Harness de `piloto-ciclo`: `generation.findFirst`
já honra o where do compositor (CP5d); nada novo além da peça limpa com defeito.

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
2. Por post: `lerGateDaArte(fieldValues)` → `validadeDoGate(registro, identidade)` (os dois já existem, CP5b) → um de
   `atual` | `historico` | `ilegivel` | `sem-registro` | `registro-invalido`. **Só leitura**; nada é medido aqui (medir a carteira
   inteira numa chamada é o que o § 4.8 vai dimensionar, não o `auditar-operacao`).
3. Por cliente, `gate: { posts: n, atual: { APTO, REVISAO_HUMANA_NECESSARIA }, historico: n, ilegivel: n, semRegistro: n,
   registroInvalido: n, politicaDoAssunto, informacao: FRASE_FIXA_DO_REGISTRO }` e, na raiz, o total. A frase fixa é a do
   `ver-geracao` (CP5b § 6: "o registro é auditoria, nunca o veredito de agora").
4. `auditar-operacao.ts` e `agenda.ts` NÃO entram na barreira do gate: eles não decidem; a leitura/validade fica num helper em
   `gate-persistido.ts` (já consumidor nomeado) — `resumoDoGateDosPosts(posts, generations, pages)` puro, testável sem banco.

### 2.3 Invariantes

- I6 `auditar-operacao` não chama `gateDaMedida`, `decidirEMontarRegistro` nem `gravarGateDaArte` (inventário).
- I7 Um post sem `generationId` conta em `semRegistro`; um registro de outra `pageVersion` conta em `historico`, nunca em `atual`.
- I8 O bloco não muda nenhum outro campo da auditoria (snapshot do corpo sem `gate` igual ao de hoje).

## 3. Prova ponta a ponta sintética (plano-mestre § 4.7)

Um arquivo novo, `src/lib/direcao-de-arte/__tests__/piloto-ponta-a-ponta.test.ts`, com o fluxo REAL de produção (`revisarArte`,
`ajustarArte`, `agendarItensDoLote`) sobre o banco falso com travas/fila/rollback do CP5d (extraído de
`creatives/__tests__/ajustar-arte-gate.test.ts` para `direcao-de-arte/__tests__/suporte/banco-com-travas.ts`, sem mudar o que ele
prova — o arquivo do CP5d passa a importá-lo) e a MEDIÇÃO REAL (renderer de produção, como `piloto-ciclo`/`piloto-portao`).

**Ponto de partida**: a peça já COMPOSTA — a peça limpa (`suporte/peca-limpa.ts`, com a Generation do compositor apontando a
assinatura da fixture) e a fixture do piloto (v1). **Limite dito**: o passo "compor" não roda o compositor aqui (o
`comporPeca` real com foto está provado em `piloto-compositor.test.ts`; rodá-lo de novo em cada caso custaria 3–4 renders por
peça e é o que o § 4.8 vai medir). Decisão 5.1 pergunta ao owner se a prova deve incluir o compor.

| Caso | Entrada | Esperado |
|---|---|---|
| E1 APTO → DRAFT | peça limpa; `revisar-arte` (gate APTO, informação) → `agendar-leva` draft-only | DRAFT criado; registro APTO `coincidente`; `ver-geracao` rotula `atual`; `auditar-operacao` conta 1 em `atual.APTO` |
| E2 não APTO → nenhum DRAFT | peça limpa com o apoio sobre o piso de interface (y 1750) | `revisar-arte` informa `REVISAO_HUMANA_NECESSARIA` (piso-de-interface); `agendar-leva` não cria post, registro reprovado gravado (CP5c); `auditar-operacao` conta `semRegistro` (sem post) — dito |
| E3 corrigir e agendar | E2 + `ajustar-arte` draft-only com o `mover` que o revisor propõe → `revisar-arte` APTO → `agendar-leva` | 2 ciclos; a versão gravada é a APTA; DRAFT criado sobre ela; dois registros (ajuste e lote) com a mesma `pageVersion` (A9 do CP5d, ponta a ponta) |
| E4 edição concorrente | o editor grava a página entre o `revisar-arte` e o `ajustar-arte` (versão do revisor envelhece) | `VERSAO_DIVERGENTE`, nada gravado; o `revisar-arte` seguinte traz o `gate` da versão nova |
| E5 DRAFT anterior bom preservado | E1 feito; `ajustar-arte` draft-only que o gate recusa (piora que o CP4 aceita: apoio para o piso) | página intacta, DRAFT e sua Generation intactos, nenhuma Generation nova, `invalidateScheduledRenders` não chamado |
| E6 post aprovado intocável | E1 + o DRAFT vira SCHEDULED com `laterPostId` | `ajustar-arte` draft-only → `POST_APROVADO_INTOCAVEL` sob trava, nada medido; `agendar-leva` do mesmo item → `reaproveitar`/recusa de sempre (CP5c), nunca um segundo post |
| E7 regra não medida → humano | peça limpa com fonte da marca que não carrega (`fontesAusentes`) | `revisar-arte` informa `nao-medida`/motivo `NAO_MEDIDO`; `agendar-leva` recusa (`naoMedidos` ≠ ∅ ⇒ não APTO); nenhum DRAFT |
| E8 sem efeitos externos | todos os casos | nenhum `fetch` para fora (a suíte é hermética), nenhum lembrete, webhook, publicação, Zernio: espiões de `efeitosDoAgendamento`/notificações não chamados |
| E9 `auditar-operacao` lê o que E1–E7 deixaram | banco ao fim de cada caso | contagens batem com o estado (`atual`/`historico`/`semRegistro`), nada medido, nada escrito |

Mais os unitários: `revisar-arte` (I1–I5, com `decidirEMontarRegistro` real sobre medida do corpus e o caso de exceção), o helper
`resumoDoGateDosPosts` (I6–I8), o `hojeViola` → `it()` (§ 1.4) e o inventário.

## 4. Arquivos

`src/lib/creatives/revisao/revisar-arte.ts` (bloco `gate`); `src/lib/mcp/catalogo/compositor.ts` (tool `revisar-arte`: corpo +
`comoAplicar` + descrição); `src/lib/creatives/revisao/gate-persistido.ts` (`resumoDoGateDosPosts`); `src/lib/posts/auditar-operacao.ts`
(+`generationId`, duas consultas, bloco `gate`); `src/lib/mcp/catalogo/agenda.ts` (descrição da tool); `eslint.config.mjs` e
`inventario-gate-da-arte.test.ts` (revisar-arte.ts consumidor); `src/lib/mcp/operacao-dot.ts` (v8: "revisar-arte devolve o gate como
informação; não é autorização; o que vale é o da hora"); docs `revisor-da-arte.md § CP5e`, `mcp.md`, `dot-lagosta-operacao.md`;
testes: `revisar-arte-gate.test.ts` (novo), `gate-persistido.test.ts` (+resumo), `auditar-operacao.test.ts` (+bloco), `piloto-ciclo.test.ts`
(§ 1.4), `piloto-ponta-a-ponta.test.ts` (novo), `suporte/banco-com-travas.ts` (extraído), `suporte/peca-limpa.ts` (+variantes com defeito).

## 5. Decisões pendentes do OWNER (a implementação usa a recomendação como PROPOSTA nomeada, trocável numa linha)

| # | Decisão | Proposta | Alternativa |
|---|---|---|---|
| 5.1 | A prova ponta a ponta inclui o passo "compor" com o compositor real? | NÃO neste CP (parte da peça composta; o compor está provado em `piloto-compositor`; o custo por peça é assunto do § 4.8) | sim, 1 caso com `comporPeca` real sobre a spec da peça limpa |
| 5.2 | O bloco `gate` do `revisar-arte` aparece para página-modelo (`aplicavel: false`)? | `sem-vinculo` com motivo "página-modelo não vai para a agenda" | medir e informar mesmo assim |
| 5.3 | `auditar-operacao` conta quais situações de post? | todos os posts da janela (DRAFT, SCHEDULED, POSTED, FAILED), por situação | só DRAFT |
| 5.4 | A escalada "em até 2 ciclos" por INFORMAÇÃO do gate satisfaz o contrato alvo da V1 (owner, 13/10)? | sim — é o que o plano-mestre § 4.7 descreve; o chat é instruído a levar à pessoa | exigir que o `ajustar-arte` humano também devolva `revisao` (amplia o CP5d ao fluxo humano) |

## 6. Gates do PR de implementação

Matriz E1–E9 + unitários + inventário verdes; `hojeViola` restantes só CP2, P6/P7, A/A'/G (ditos); suíte completa sozinha
(`--maxWorkers=4`); typecheck; lint; `git diff --check <base>`; 3 validadores do CI; Codex APTO no HEAD final; CI e Vercel verdes;
merge por merge commit com `--match-head-commit` (SHA completo). Depois do merge: o checkpoint § 4.8 (piloto sintético) tem contrato
próprio e consome as provas daqui; MCP-M0 só depois dele.
