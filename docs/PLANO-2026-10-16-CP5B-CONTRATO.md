# CP5b — contrato técnico de PERSISTÊNCIA, IDENTIDADE e `rulesVersion` (proposta para revisão, 16/10/2026)

**Estado: PROPOSTA.** Nada aqui está implementado; este PR é documental. Base: `main` `5e96d5a1` (merge do CP5a,
PR #237; contrato do CP5a mergeado pelo PR #236). Ordem do owner (16/10): depois do fechamento do CP5a, preparar
SOMENTE o contrato do CP5b, centrado em persistência, identidade e `rulesVersion`; oclusão por pixels exige
justificativa e escopo explícitos (seção 10); a integração com a não-piora continua no CP5d, conforme o
plano-mestre (`docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md`, § 4.4 e § 4.6).

## 0. O que o CP5b entrega, em uma frase

O veredito do gate (`GateDaArte`, CP5a) passa a ser **gravado como auditoria e cache** em
`Generation.fieldValues.gateDaArte`, com a **identidade** da peça medida (`pageVersion`, `copyVersion`) e a
**versão das regras** (`rulesVersion` com política de bump conferida por teste), e ganha um **leitor** que diz se
o registro ainda vale ("vigente") ou é "histórico" — **sem que nenhum registro gravado autorize coisa alguma**.
Nenhum caminho de produção passa a decidir por ele: o gate integrado é o CP5c.

## 1. Reconciliação das fontes

| Tema | Plano-mestre (§ 4.4) | Contrato CP5a (mergeado) | O que a `main` 5e96d5a1 tem | O que o CP5b faz |
|---|---|---|---|---|
| Onde gravar | `Generation.fieldValues.<gate>`, nome distinto de `veredito` | seção 2.3: a saída foi desenhada para o CP5b; "FORA do CP5a" | nada gravado; `VereditoDeArte` é o FEEDBACK humano (`aprendizado/feedback-de-arte.ts`) e `fieldValues.veredito` não existe | chave **`gateDaArte`** (seção 3); nunca `veredito` |
| Como gravar | `mesclarFieldValuesDaArte` (merge no banco, regra 🔴 do `AGENTS.md`) | idem | `src/lib/creatives/mesclar-field-values.ts` (`jsonb ||`, chave ausente fica como está); usado por `persist.ts`, `recompor.ts`, vídeo, crivo, feedback | só por merge; a chave inteira é substituída de uma vez (seção 3.3) |
| `pageVersion` | `versaoDaPagina`, SEM áudio — a mesma chamada do revisor | 2.2: `null` = ilegível, nunca "a mesma versão" | `versao.ts` (`v1:` + sha256 de dimensões, fundo, camadas; `quadro.audio` só para comparar com PNG de vídeo); o revisor chama `versaoDaPagina(page)` (`revisar-arte.ts:534`); o agendamento compara com áudio (`agendamento.ts:511`, versão RENDERIZADA) | `identidadeDaPagina(page)` = `versaoDaPagina(page)` sem áudio (seção 4); a versão renderizada do PNG é OUTRA coisa e fica fora |
| `copyVersion` | hash `estavel` + sha256 do `copyAutoral`; `null` → `'sem-contrato'` | `copyVersionDe` já está no CP5a (`versao.ts:64`, prefixo `c1:`) | `copyVersionDe` existe, puro, só os testes chamam | fonte fixada: **`Page.copyAutoral`** (o contrato da peça), não `Generation.fieldValues.copyAutoral` (que é a reconciliação `{ original, efetiva, comparavel, lacunas }`) — decisão 9.2 |
| `rulesVersion` | política de bump definida aqui (decisão 7 do plano-mestre) | 9.3: constante com bump OBRIGATÓRIO conferido por snapshot do relatório da fixture do piloto; hash de fonte em build inviável | `VERSAO_DAS_REGRAS = 'revisao-v1'` (`contrato.ts:27`) nunca bumpada após CP3, CP4.1, CP4.2 e CP5a; `gate.ts` copia; `GateDaArte.versao = 'gate-v1'` | seção 5: bump manual + **teste de impressão digital** que falha quando o comportamento muda sem bump |
| Stale | "veredito stale nunca autoriza nada; o consumidor compara as três versões e rotula histórico" | — | nada | `validadeDoGate` (seção 4.3): `vigente` só com as QUATRO versões iguais (`pageVersion`, `copyVersion`, `rulesVersion`, `versao` do gate) E a mesma política; o resto é `historico` ou `ilegivel` |
| Consumidores | `ver-geracao`, `auditar-operacao` | — | `ver-geracao` (`arte-ia.ts:601`, lê `fieldValues` via `montarRetornoDaPagina`); `auditar-operacao` (`agenda.ts:667`, manual canônico do Dot em `operacao-dot.ts`) | bloco `gate` só leitura nas duas (seção 6) |
| Precedentes de identidade na main | — | — | `lotes/identidade.ts` (`VERSAO_DO_HASH = 'lote-v1'`, "mudou a normalização, suba a versão", `hashConfere`); `PostRenderProof` (`proofVersion`, `layersSnapshot`); `persist.ts` (`versaoEsperada` relida sob `FOR UPDATE`) | os mesmos três princípios: versão explícita no registro, snapshot do que foi medido, releitura sob trava fica com quem decide (CP5c) |

## 2. Escopo e não-escopo

**Entra**: (a) o REGISTRO persistido e seu schema; (b) a função de IDENTIDADE e o leitor de VALIDADE; (c) a política
de `rulesVersion` com o teste que a impõe; (d) o escritor por merge e o leitor tolerante; (e) o bloco `gate` em
`ver-geracao` e `auditar-operacao` (só leitura); (f) testes puros + testes com cliente falso; (g) correção das duas
MENORes do Codex R13 (texto histórico do § CP5a em `docs/regras/revisor-da-arte.md` e a frase de 9.1 do contrato
CP5a), que são documentais e cabem neste PR.

**Não entra** (dito para não parecer garantia): gate integrado em `agendar-leva` e releitura de identidade sob
trava (CP5c, § 4.5 do plano-mestre); `ajustar-arte` autônomo e a fronteira transacional da não-piora (CP5d);
oclusão por pixels, estratégia (A) (seção 10); migration (o Json basta — plano-mestre); histórico de vereditos
(só o último, decisão 9.4); qualquer produtor em produção além do opcional da decisão 9.5.

## 3. Persistência

### 3.1 O registro (`RegistroDoGate`)

```ts
// src/lib/creatives/revisao/gate-registro.ts — PURO (zod + node:crypto); NÃO importa @/lib/db
export interface RegistroDoGate {
  gate: GateDaArte                       // a saída do CP5a, inteira, como saiu (versao 'gate-v1')
  politica: PoliticaDoAssunto            // a política com que o veredito foi calculado (sem ela o veredito não se lê)
  identidade: { pageId: string; pageVersion: string | null; copyVersion: string }
  medidoEm: string                       // ISO-8601, relógio do servidor que mediu
  origem: 'agendar-leva' | 'ajustar-arte' | 'revisar-arte' | 'piloto'   // conjunto FECHADO; tool nova = decisão
  principal?: { tipo: string; id: string }   // quem pediu (perfil MCP), quando houver — auditoria, nunca autoridade
}
```

- `gate.pageVersion`/`gate.copyVersion` e `identidade.*` são REDUNDANTES de propósito: o gate carrega o que lhe
  deram; `identidade` é o que o escritor leu da página. Divergência entre os dois é `ilegivel` na leitura (4.3) —
  é a prova de que o chamador montou a entrada de uma página e gravou noutra.
- `politica` entra porque `resultado` depende dela (caso B/C do assunto): dois registros com a mesma peça e políticas
  diferentes são vereditos diferentes. Sem `politica` gravada, nenhum registro é `vigente`.
- Tamanho: `GateDaArte` tem 15 entradas de cobertura, motivos, achados, `naoMedidos` e avisos — centenas de bytes a
  poucos KB; `fieldValues` já carrega `composicao` e `videoDaPagina` maiores.

### 3.2 A chave e o dono

`Generation.fieldValues.gateDaArte`. **Uma Generation, um registro** (o último). A Generation é a que o chamador
VAI ligar ao post (no CP5c, `sob.peca.id`, a peça relida sob a trava); o CP5b não escolhe Generation por página — a
página pode ter várias (`contextoDaMedicao` lê até 15 por `fieldValues.pageId`). Carrossel: cada slide tem a sua
Generation e o seu registro.

### 3.3 Escrita: só por merge, a chave inteira

```ts
// src/lib/creatives/revisao/gate-persistido.ts — importa mesclar-field-values (que importa @/lib/db): NÃO é testável
// sem banco; a lógica fica toda em gate-registro.ts e este módulo só compõe o patch e chama o merge.
export function gravarGateDaArte(client: ClienteDoBanco, generationId: string, registro: RegistroDoGate)
  // = mesclarFieldValuesDaArte(client, generationId, { gateDaArte: registro })
```

- `jsonb || { gateDaArte: registro }` substitui a chave INTEIRA (nunca um merge parcial dentro de `gateDaArte`: um
  registro é atômico — gate de uma medição com identidade de outra é exatamente o que 3.1 proíbe).
- Nunca `update({ fieldValues: { ...lido } })` (regra 🔴 do `AGENTS.md`: apaga `somenteReRender`, `videoDaPagina`
  e o que outro worker gravou no intervalo).
- Fora da transação de 20 s de `persist.ts`/`agendar-itens.ts`: o CP5c decide ONDE chamar (depois de medir, antes ou
  depois de criar o DRAFT); o CP5b só garante que a chamada é idempotente (gravar o mesmo registro duas vezes é o
  mesmo estado) e que falhar a gravação NUNCA muda a decisão (o veredito já foi decidido em memória; a gravação é
  auditoria). Erro na gravação: `console.warn('[gate]', …)` e segue — dito aqui porque é um "falha em silêncio"
  deliberado e limitado à auditoria.
- A gravação não dispara `invalidateScheduledRenders` nem `pedirRecomposicaoDaArteCongelada`: `fieldValues` não é
  `Page.layers` (a regra 🔴 é sobre quem grava camadas).

### 3.4 Leitura tolerante

```ts
export function lerGateDaArte(fieldValues: unknown): RegistroDoGate | null   // zod; forma inválida → null (nunca lança)
```

Lê com schema **estrito nas chaves que decidem** (`gate.versao === 'gate-v1'`, `gate.resultado`, as quatro versões,
`politica`, `identidade`) e **tolerante no resto** (`cobertura`, `motivos`, `achados`, `naoMedidos`, `avisos` são
`z.unknown()` validados pelo leitor de exibição, não pelo de validade). Registro gravado por um gate futuro
(`versao: 'gate-v2'`) lê como `null` para a validade e como "registro de outra versão" para a exibição.

## 4. Identidade

### 4.1 `identidadeDaPagina` (puro, em `versao.ts`)

```ts
export function identidadeDaPagina(page: {
  id: string; width: number; height: number; background?: string | null; layers: unknown; copyAutoral?: unknown
}): { pageId: string; pageVersion: string | null; copyVersion: string }
  // pageVersion = versaoDaPagina(page) — SEM quadro de áudio (a mesma chamada do revisor, revisar-arte.ts:534)
  // copyVersion = copyVersionDe(page.copyAutoral)
```

- **Sem áudio, de propósito**: o gate mede o render de imagem (CP5a; vídeo e movimento vão ao humano), e a versão com
  áudio (`agendamento.ts:511`) é a do PNG RENDERIZADO para publicação — outra pergunta. Misturar as duas faria uma
  página com música ter dois `pageVersion` para a mesma composição.
- `copyAutoral` é o da **Page** (decisão 9.2). `Generation.fieldValues.copyAutoral` é a reconciliação
  (`ver-geracao-retorno.ts:39`) e muda quando a copy visual muda — se fosse a fonte, uma re-renderização sem mudança
  de contrato trocaria `copyVersion`.
- `pageVersion: null` (ilegível) é gravável (o registro diz `REVISAO_HUMANA_NECESSARIA` por `IDENTIDADE_ILEGIVEL`, como
  no CP5a) mas nunca é `vigente` (4.3).

### 4.2 O que a identidade NÃO cobre (dito)

Assets por URL (foto, logo, fontes): `versaoDaPagina` cobre as camadas, inclusive `fileUrl`; a MESMA URL com bytes
trocados no Blob não muda a versão. É a mesma lacuna do revisor e de `persist.ts` hoje; cobrir exigiria hash de
bytes (CP5c pode exigir a prova do render, `PostRenderProof`, para o post). Fica dito, não resolvido.

### 4.3 Validade (puro, em `gate-registro.ts`)

```ts
export type ValidadeDoGate =
  | { estado: 'vigente' }
  | { estado: 'historico'; divergencias: Array<'pageVersion' | 'copyVersion' | 'rulesVersion' | 'versaoDoGate' | 'politica'> }
  | { estado: 'ilegivel'; motivo: string }   // registro ausente, forma inválida, pageVersion null, identidade ≠ gate

export function validadeDoGate(
  registro: RegistroDoGate | null,
  atual: { pageVersion: string | null; copyVersion: string; rulesVersion: string; versaoDoGate: 'gate-v1'; politica: PoliticaDoAssunto },
): ValidadeDoGate
```

Invariantes (fail-closed):

1. `vigente` ⇔ registro legível ∧ `pageVersion` não nulo e igual ∧ `copyVersion` igual ∧ `rulesVersion` igual ∧
   `gate.versao` igual ∧ `politica` igual (os dois campos) ∧ `registro.identidade` ≡ `registro.gate` nas versões.
2. `pageVersion` nulo de qualquer lado → `ilegivel`, nunca `historico` (ilegível não é "a mesma versão").
3. `validadeDoGate` NÃO devolve `resultado`: quem quiser o resultado lê `registro.gate.resultado` DEPOIS de ver
   `vigente`. A assinatura impede o atalho "pegar o APTO do cache sem olhar a validade".
4. **Nenhum caminho de produção usa `vigente` para pular a medição no CP5b** (decisão 9.3 para o CP5c). O cache é
   exibição e auditoria.

## 5. `rulesVersion` — a política (decisão 7 do plano-mestre, 9.3 do contrato CP5a)

**Decisão proposta: bump manual por PR, imposto por teste de impressão digital.** Hash do fonte foi descartado (CP5a
9.3: inviável em build, e mudança cosmética bumparia à toa); bump "por hábito" foi o que falhou quatro vezes
(`'revisao-v1'` desde o CP3).

- `VERSAO_DAS_REGRAS` continua constante em `revisao/contrato.ts`; `GateDaArte.versao` ('gate-v1') continua em
  `gate.ts`. São DUAS versões: regras do revisor e decisão do gate; `rulesVersion` persistido = `VERSAO_DAS_REGRAS`;
  `versaoDoGate` = `gate.versao`.
- Teste `src/lib/creatives/revisao/__tests__/impressao-digital-das-regras.test.ts`: calcula a impressão digital =
  sha256 do JSON `estavel` de { `REGRAS_DA_REVISAO` (ids, severidades), `REGRAS_CRITICAS`, `CONFERENCIAS_DO_GATE`,
  `CHAVES_CLASSIFICADAS` (caminhos e classes), `avaliarPeca(medida)` e `gateDaMedida(entrada)` para um CORPUS fixo }
  e compara com `__tests__/impressao-digital/<VERSAO_DAS_REGRAS>+<versao do gate>.json` commitado.
  - Mudou a impressão e a versão não mudou → o teste FALHA com a mensagem "a regra mudou: suba `VERSAO_DAS_REGRAS`
    (ou `gate.versao`) e regenere a impressão com `IMPRESSAO_DIGITAL=gravar npx vitest run …`".
  - Subiu a versão sem arquivo novo → falha ("gere a impressão da versão nova").
  - Arquivo da versão antiga permanece commitado (auditoria de quando cada regra mudou).
- **Corpus** (decisão 9.6): a fixture do piloto (`piloto-2026-10-13/peca.json`, v1 e v2, como G24 monta a medida), a
  peça limpa de G1 e as peças de G13–G21 que exercitam cada regra crítica (reusando as fixtures de `gate.test.ts`,
  extraídas para `__tests__/suporte/corpus-do-gate.ts`). **Limite dito**: a impressão só vê o que o corpus
  exercita; regra que nenhuma peça do corpus toca muda em silêncio — por isso o corpus é enumerado e a revisão de PR
  que toca `regras.ts`/`gate.ts` tem de perguntar "o corpus cobre?".
- Efeito no persistido: `rulesVersion` diferente do vigente → `historico` (4.3). O CP5c re-mede sempre (9.3), então o
  custo de um bump é zero em produção; o ganho é a auditoria honesta ("este APTO foi com as regras v1").

## 6. Consumidores (só leitura)

- `ver-geracao` (`arte-ia.ts:601` → `montarRetornoDaPagina`): bloco `gate` = `{ resultado, rulesVersion, versaoDoGate,
  medidoEm, origem, validade: 'vigente' | 'historico' | 'ilegivel', divergencias?, motivos: [{ regra, codigo, motivo,
  camadas }] }` calculado com a identidade da página LIDA NA HORA (`identidadeDaPagina(page)`), `VERSAO_DAS_REGRAS`
  atual e a política… **que `ver-geracao` não tem** → decisão 9.7: o bloco compara a política gravada com
  `POLITICA_DO_ASSUNTO_RECOMENDADA` só para rotular (`politicaDiferenteDaRecomendada: true`), nunca para decidir.
  Sem registro: `gate: null` (não "APTO", não "pendente").
- `auditar-operacao` (`agenda.ts:667`): nas peças listadas, o mesmo bloco resumido (`resultado`, `validade`,
  `medidoEm`); o manual canônico (`operacao-dot.ts`) ganha a linha "o gate gravado é histórico quando a identidade ou
  as regras mudaram; nunca agende por ele".
- Nada no app web lê o registro neste checkpoint.

## 7. Invariantes do CP5b (os testes provam)

1. Registro gravado só por `gravarGateDaArte` → só por `mesclarFieldValuesDaArte` → só `jsonb ||` com a chave
   `gateDaArte` inteira (teste com cliente falso que captura o SQL/patch).
2. `lerGateDaArte` nunca lança; forma inválida → `null`; `gate.versao` desconhecida → `null`.
3. `validadeDoGate` é fail-closed: qualquer divergência → não `vigente`; `null` → `ilegivel`; identidade ≠ gate →
   `ilegivel`.
4. `identidadeDaPagina` é a mesma `versaoDaPagina(page)` do revisor (teste: igualdade com `revisarArte(...).versao`
   para a fixture do piloto) e não muda com `audio`.
5. A impressão digital das regras bate com o arquivo da versão vigente (seção 5) — e o teste prova que mudar UMA
   severidade em `REGRAS_DA_REVISAO` (mock) muda a impressão.
6. Nenhum caminho de produção lê `gateDaArte` para decidir (grep de `gateDaArte` fora de `ver-geracao`,
   `auditar-operacao`, `gate-*.ts` e testes é vazio — teste de inventário, como `validar-registro-mcp.ts` faz com as
   tools).
7. Determinismo: mesmo registro + mesma identidade → mesma validade; `medidoEm` e `principal` não entram na validade.

## 8. Matriz de testes

| Caso | Entrada | Esperado |
|---|---|---|
| H1 | `identidadeDaPagina` da fixture do piloto (v1) | `pageVersion` = `versaoDaPagina(page)`; `copyVersion` = `copyVersionDe(page.copyAutoral)`; `copyAutoral` ausente → `'sem-contrato'` |
| H2 | a mesma página com `audio` | `pageVersion` igual (sem áudio) |
| H3 | `layers` como string JSON dupla / ilegível | `pageVersion` `v1:…` igual ao da forma de array / `null` |
| H4 | `validadeDoGate` com as cinco igualdades | `vigente` |
| H5 | cada versão divergente, uma por vez (page, copy, rules, gate, política.estimado, política.semAssuntoLocalizavel) | `historico` com a divergência nomeada; duas ao mesmo tempo → as duas |
| H6 | `pageVersion` null no registro / no atual; registro `null`; `identidade.pageVersion ≠ gate.pageVersion` | `ilegivel` com motivo |
| H7 | `lerGateDaArte` com `fieldValues` null, string, objeto sem `gateDaArte`, `gateDaArte` com `versao: 'gate-v2'`, `politica` faltando | `null` em todos; com registro válido → igualdade estrutural |
| H8 | `gravarGateDaArte` com cliente falso | um `$executeRaw` com `jsonb ||` e patch `{ gateDaArte: registro }`; `resultUrl` nunca tocado; gravar duas vezes = mesmo patch |
| H9 | impressão digital: corpus vigente | bate com o arquivo `revisao-v1+gate-v1.json` |
| H10 | impressão digital: `REGRAS_DA_REVISAO` com uma severidade trocada (mock) | impressão diferente; a mensagem pede o bump |
| H11 | `montarRetornoDaPagina` com registro vigente / histórico / ausente | bloco `gate` com `validade` certa / `gate: null`; nunca inventa `APTO` |
| H12 | inventário: `gateDaArte` não aparece fora dos módulos permitidos | lista vazia |

## 9. Decisões pendentes do owner

| # | Decisão | Recomendação | O que muda se decidir o contrário |
|---|---|---|---|
| 9.1 | Nome da chave: `gateDaArte` | `gateDaArte` (nunca `veredito`, que é o feedback humano) | nome livre; a regra "nunca `veredito`" fica |
| 9.2 | Fonte de `copyVersion`: `Page.copyAutoral` × `Generation.fieldValues.copyAutoral` | `Page.copyAutoral` (o contrato; é o que o CP5c lê "uma vez") | com a reconciliação, re-render sem mudança de contrato invalida o veredito |
| 9.3 | O cache `vigente` pode pular a medição no CP5c? | **não**: CP5c mede sempre; o registro é exibição/auditoria | sim = ganho de segundos por peça contra o risco de agendar por cache (4.2: bytes do asset fora da identidade) |
| 9.4 | Histórico de vereditos | só o último por Generation; `fieldValues` não é log | `historico[]` com teto (ex.: 5) na mesma chave; mais bytes, mais merge |
| 9.5 | `revisar-arte` (tool humana, warn-only) grava o registro com `origem: 'revisar-arte'` e a política RECOMENDADA, nomeada | sim, para a auditoria começar a existir antes do CP5c; nunca autoriza | não = nenhum produtor até o CP5c; `ver-geracao` mostra `gate: null` para tudo |
| 9.6 | Corpus da impressão digital | piloto v1+v2 + G1 + as fixtures de G13–G21 (5.) | só o piloto: regra que ele não toca muda em silêncio |
| 9.7 | Política em `ver-geracao` (que não tem política): rotular diferença da recomendada, sem decidir | rotular | exigir parâmetro `politica` na tool: mais fiel, mais atrito |
| 9.8 | Conjunto FECHADO de `origem` (`agendar-leva`, `ajustar-arte`, `revisar-arte`, `piloto`) | fechado; tool nova = PR com decisão | string livre: auditoria perde o filtro |

## 10. Oclusão por pixels (estratégia A) — fora do CP5b, e o que a justificaria

O owner pediu justificativa e escopo explícitos antes de qualquer medição por pixels. O CP5a (B) já cobre a
oclusão por geometria conservadora com `NAO_MEDIDO` para o que não prova. A (A) só se justifica com a métrica do
plano-mestre (9.2 do contrato CP5a): **> 10 % das peças do piloto sintético bloqueadas SÓ por oclusão** (motivo único
`oclusao`/`NAO_MEDIDO`), medido depois do CP5c (que é quem produz vereditos em volume). Escopo, se vier: render
duplo (com e sem a camada acima) e comparação de pixels dos glifos do texto protegido — custo de um render extra por
par, e um contrato próprio. Nada disso entra aqui.

## 11. Arquivos (o que o CP5b toca)

- `src/lib/creatives/revisao/versao.ts`: `identidadeDaPagina` (puro);
- `src/lib/creatives/revisao/gate-registro.ts` (novo, puro): `RegistroDoGate`, `registroDoGateSchema`, `lerGateDaArte`,
  `validadeDoGate`, `montarRegistroDoGate(gate, politica, identidade, origem, principal?)`;
- `src/lib/creatives/revisao/gate-persistido.ts` (novo, com banco): `gravarGateDaArte`;
- `src/lib/creatives/revisao/__tests__/impressao-digital-das-regras.test.ts` + `__tests__/impressao-digital/*.json` +
  `__tests__/suporte/corpus-do-gate.ts`;
- `src/lib/mcp/catalogo/ver-geracao-retorno.ts` (bloco `gate`), `arte-ia.ts` (`ver-geracao`), `agenda.ts`
  (`auditar-operacao`), `operacao-dot.ts` (uma linha do manual);
- opcional (9.5): `compositor.ts` (`revisar-arte` grava);
- `docs/regras/revisor-da-arte.md` § CP5b; `docs/regras/mcp.md` (o bloco `gate` nas tools);
- MENORes do R13: `docs/regras/revisor-da-arte.md` (texto histórico do § CP5a) e `docs/PLANO-2026-10-15-CP5A-CONTRATO.md`
  (frase de 9.1) — corrigidos neste PR documental.

Fora: `agendar-itens.ts`, `arte-rapida.ts`, `persist.ts`, `nao-piora.ts`, `ajustar-sem-piorar.ts`, schema do Prisma.

## 12. Gates do PR de implementação (quando vier)

Suíte completa com `MOSTRAR_VIOLACOES=1` (nenhum `hojeViola` muda), `typecheck`, `lint`, `git diff --check`,
`validar-registro-mcp` (as tools não ganham parâmetro novo salvo 9.7), `validar-oauth-mcp`; Codex no HEAD exato;
CI e Vercel verdes; merge por merge commit com `--match-head-commit`, só com autorização do owner.
