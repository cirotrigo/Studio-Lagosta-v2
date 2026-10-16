# CP5b — contrato técnico de PERSISTÊNCIA, IDENTIDADE e `rulesVersion` (proposta para revisão, 16/10/2026)

**Estado: PROPOSTA (rodada 2 do Codex aplicada: "vigente" só com a prova COMPLETA; vínculo projeto/Generation/página; bytes dos assets; impressão digital travada por validador no CI).** Nada aqui está implementado; este PR é documental. Base: `main` `5e96d5a1` (merge do CP5a,
PR #237; contrato do CP5a mergeado pelo PR #236). Ordem do owner (16/10): depois do fechamento do CP5a, preparar
SOMENTE o contrato do CP5b, centrado em persistência, identidade e `rulesVersion`; oclusão por pixels exige
justificativa e escopo explícitos (seção 10); a integração com a não-piora continua no CP5d, conforme o
plano-mestre (`docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md`, § 4.4 e § 4.6).

## 0. O que o CP5b entrega, em uma frase

O veredito do gate (`GateDaArte`, CP5a) passa a ser **gravado como auditoria e cache** em
`Generation.fieldValues.gateDaArte`, com a **identidade** da peça medida (`pageVersion`, `copyVersion`) e a
**versão das regras** (`rulesVersion` com política de bump conferida por teste e validador no CI), e ganha um **leitor**
que diz se o registro ainda vale (`vigente`, só com a prova completa), só coincide nos metadados (`coincidente`), é
`historico` ou `ilegivel` — **sem que nenhum registro gravado autorize coisa alguma**.
Nenhum caminho de produção passa a decidir por ele: o gate integrado é o CP5c.

## 1. Reconciliação das fontes

| Tema | Plano-mestre (§ 4.4) | Contrato CP5a (mergeado) | O que a `main` 5e96d5a1 tem | O que o CP5b faz |
|---|---|---|---|---|
| Onde gravar | `Generation.fieldValues.<gate>`, nome distinto de `veredito` | seção 2.3: a saída foi desenhada para o CP5b; "FORA do CP5a" | nada gravado; `VereditoDeArte` é o FEEDBACK humano (`aprendizado/feedback-de-arte.ts`) e `fieldValues.veredito` não existe | chave **`gateDaArte`** (seção 3); nunca `veredito` |
| Como gravar | `mesclarFieldValuesDaArte` (merge no banco, regra 🔴 do `AGENTS.md`) | idem | `src/lib/creatives/mesclar-field-values.ts` (`jsonb ||`, chave ausente fica como está); usado por `persist.ts`, `recompor.ts`, vídeo, crivo, feedback | só por merge; a chave inteira é substituída de uma vez (seção 3.3) |
| `pageVersion` | `versaoDaPagina`, SEM áudio — a mesma chamada do revisor | 2.2: `null` = ilegível, nunca "a mesma versão" | `versao.ts` (`v1:` + sha256 de dimensões, fundo, camadas; `quadro.audio` só para comparar com PNG de vídeo); o revisor chama `versaoDaPagina(page)` (`revisar-arte.ts:673`); o agendamento compara com áudio (`agendamento.ts:511`, versão RENDERIZADA) | `identidadeDaPagina(page)` = `versaoDaPagina(page)` sem áudio (seção 4); a versão renderizada do PNG é OUTRA coisa e fica fora |
| `copyVersion` | hash `estavel` + sha256 do `copyAutoral`; `null` → `'sem-contrato'` | `copyVersionDe` já está no CP5a (`versao.ts:64`, prefixo `c1:`) | `copyVersionDe` existe, puro, só os testes chamam | fonte fixada: **`Page.copyAutoral`** (o contrato da peça), não `Generation.fieldValues.copyAutoral` (que é a reconciliação `{ original, efetiva, comparavel, lacunas }`) — decisão 9.2 |
| `rulesVersion` | política de bump definida aqui (decisão 7 do plano-mestre) | 9.3: constante com bump OBRIGATÓRIO conferido por snapshot do relatório da fixture do piloto; hash de fonte em build inviável | `VERSAO_DAS_REGRAS = 'revisao-v1'` (`contrato.ts:27`) nunca bumpada após CP3, CP4.1, CP4.2 e CP5a; `gate.ts` copia; `GateDaArte.versao = 'gate-v1'` | seção 5: bump manual + **teste de impressão digital** que falha quando o comportamento muda sem bump |
| Stale | "veredito stale nunca autoriza nada; o consumidor compara as três versões e rotula histórico" | — | nada | `validadeDoGate` (seção 4.3): `vigente` só com vínculo projeto/Generation/página, as QUATRO versões iguais (`pageVersion`, `copyVersion`, `rulesVersion`, `versao` do gate), a mesma política E os mesmos bytes dos assets medidos; sem política ou sem bytes é no máximo `coincidente`; o resto é `historico` ou `ilegivel` |
| Consumidores | `ver-geracao`, `auditar-operacao` | — | `ver-geracao` (`arte-ia.ts:601`, lê `fieldValues` via `montarRetornoDaPagina`); `auditar-operacao` (`agenda.ts:667`, manual canônico do Dot em `operacao-dot.ts`) | bloco `gate` só leitura em `ver-geracao` (seção 6); `auditar-operacao` fica para o CP5c (9.9) |
| Precedentes de identidade na main | — | — | `lotes/identidade.ts` (`VERSAO_DO_HASH = 'lote-v1'`, "mudou a normalização, suba a versão", `hashConfere`); `PostRenderProof` (`proofVersion`, `layersSnapshot`); `persist.ts` (`versaoEsperada` relida sob `FOR UPDATE`) | os mesmos três princípios: versão explícita no registro, snapshot do que foi medido, releitura sob trava fica com quem decide (CP5c) |

## 2. Escopo e não-escopo

**Entra**: (a) o REGISTRO persistido e seu schema; (b) a função de IDENTIDADE e o leitor de VALIDADE; (c) a política
de `rulesVersion` com o teste que a impõe; (d) o escritor por merge e o leitor tolerante; (e) o bloco `gate` em
`ver-geracao` (só leitura); (f) testes puros + testes com cliente falso (com `@/lib/db` mockado antes do import);
(h) a impressão dos bytes dos assets medidos devolvida por `contextoDaMedicao`/`medirCamadasDaPeca` (4.2); (g) correção das duas
MENORes do Codex R13 (texto histórico do § CP5a em `docs/regras/revisor-da-arte.md` e a frase de 9.1 do contrato
CP5a), que são documentais e cabem neste PR.

**Não entra** (dito para não parecer garantia): gate integrado em `agendar-leva` e releitura de identidade sob
trava (CP5c, § 4.5 do plano-mestre); `ajustar-arte` autônomo e a fronteira transacional da não-piora (CP5d);
oclusão por pixels, estratégia (A) (seção 10); migration (o Json basta — plano-mestre); histórico de vereditos
(só o último, decisão 9.4); QUALQUER produtor em produção (o primeiro é o CP5c — 9.5); o bloco em `auditar-operacao`
(CP5c, 9.9).

## 3. Persistência

### 3.1 O registro (`RegistroDoGate`)

```ts
// src/lib/creatives/revisao/gate-registro.ts — PURO (zod + node:crypto); NÃO importa @/lib/db
export interface RegistroDoGate {
  gate: GateDaArte                       // a saída do CP5a, inteira, como saiu (versao 'gate-v1')
  politica: PoliticaDoAssunto            // a política com que o veredito foi calculado (sem ela o veredito não se lê)
  identidade: {
    projectId: number; generationId: string; pageId: string   // o VÍNCULO: a Generation desta página, deste projeto
    pageVersion: string | null; copyVersion: string
    assets: Array<{ url: string; sha256: string }>             // bytes REALMENTE medidos (foto de fundo, logos), ordenados por url
  }
  medidoEm: string                       // ISO-8601, relógio do servidor que mediu
  origem: 'agendar-leva' | 'ajustar-arte' | 'revisar-arte' | 'piloto'   // conjunto FECHADO; tool nova = decisão
  principal?: { tipo: string; id: string }   // quem pediu (perfil MCP), quando houver — auditoria, nunca autoridade
}
```

- `gate.pageVersion`/`gate.copyVersion` e `identidade.*` são REDUNDANTES de propósito: o gate carrega o que lhe
  deram; `identidade` é o que o escritor leu da página. Divergência entre os dois é `ilegivel` na leitura (4.3) —
  é a prova de que o chamador montou a entrada de uma página e gravou noutra.
- `identidade.generationId`/`projectId`/`pageId` são o vínculo que o escritor CONFERE na escrita (3.3) e o leitor
  compara na leitura (4.3): duas páginas com camadas e copy idênticas têm os mesmos hashes, e um registro gravado na
  Generation errada passaria nas comparações de versão (Codex R1). `assets` é a identidade dos BYTES: `versaoDaPagina`
  só vê a URL, e a mesma URL pode ter bytes novos (`persist.ts:174`, `allowOverwrite: true`).
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
export async function gravarGateDaArte(client: ClienteDoBanco, registro: RegistroDoGate): Promise<'gravado' | 'sem-vinculo'>
  // UPDATE "Generation" SET "fieldValues" = (… ELSE '{}'::jsonb END) || {"gateDaArte": registro}::jsonb
  //  WHERE "id" = registro.identidade.generationId AND "projectId" = registro.identidade.projectId
  //    AND "fieldValues"->>'pageId' = registro.identidade.pageId
  // 0 linhas → 'sem-vinculo' (nada gravado, console.warn): a Generation não é desta página/projeto.
```

- O `WHERE` é o mesmo vínculo que `contextoDaMedicao` usa para achar as Generations da página
  (`fieldValues.pageId`); `sourcePageId` é a página-MODELO de origem e não serve de vínculo. O SQL mora em
  `gate-persistido.ts` (não em `mesclar-field-values.ts`, cujo contrato é "merge sem condição"); a forma do patch é a
  mesma (`jsonb ||`, `CASE WHEN jsonb_typeof … ELSE '{}'`).

- `|| { gateDaArte: registro }` substitui a chave INTEIRA (nunca um merge parcial dentro de `gateDaArte`: um
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

Lê com schema **estrito e completo** (`gateDaArteSchema` em `gate-registro.ts`, espelho de `GateDaArte`: `versao`
literal `'gate-v1'`, `resultado`, as versões, `cobertura` com EXATAMENTE as 11 regras críticas + 4 conferências e os
estados válidos, `motivos`/`achados`/`naoMedidos`/`avisos` com a forma do CP5a; `politica`; `identidade` com o
vínculo e `assets`) e confere a **invariante 2.3 do CP5a**: `resultado === 'APTO'` ⇔ `motivos` vazio ∧ `naoMedidos`
vazio ∧ nenhuma cobertura `reprovada`/`nao-comprovada`. Qualquer violação → `null` (Codex R1: um JSON com
`resultado: 'APTO'` e cobertura vazia não é saída do CP5a e nunca pode ser exibido como veredito). Registro de outra
versão do gate (`versao` ≠ `'gate-v1'`) → `null`; a exibição diz "registro ilegível (versão do gate desconhecida)" —
um gate futuro define o seu leitor. `gate.test.ts` ganha o teste de que TODA saída de `gateDaMedida` dos G-casos passa
pelo `gateDaArteSchema` (o schema não pode ficar mais estrito do que o gate).

## 4. Identidade

### 4.1 `identidadeDaPagina` (puro, em `versao.ts`)

```ts
export function identidadeDaPagina(page: {
  id: string; width: number; height: number; background?: string | null; layers: unknown; copyAutoral?: unknown
}): { pageId: string; pageVersion: string | null; copyVersion: string }
  // pageVersion = versaoDaPagina(page) — SEM quadro de áudio (a mesma chamada do revisor, revisar-arte.ts:673)
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

### 4.2 Os bytes dos assets (o que `versaoDaPagina` não cobre)

`versaoDaPagina` cobre as camadas, inclusive `fileUrl`; a MESMA URL com bytes trocados no Blob não muda a versão
(`persist.ts:174` grava com `allowOverwrite: true`). Por isso o registro leva `identidade.assets`: o sha256 dos bytes
que a medição REALMENTE leu — a foto de fundo (`assuntoDaPeca` baixa por `fetchBuffer`) e as logos (`cacheDeLogos`
do contexto). Mudança de código do CP5b: `contextoDaMedicao`/`medirCamadasDaPeca` passam a devolver
`assetsLidos: Map<url, sha256>` (hash calculado sobre o buffer já baixado — sem download extra); quem monta o registro
copia para `assets`. Fontes NÃO entram (são registradas por família, não por URL; `fonte-nao-carregada` já cobre a
ausência) — dito como limite. Um leitor que NÃO tem os bytes (`ver-geracao`) não pode afirmar `vigente` (4.3).

### 4.3 Validade (puro, em `gate-registro.ts`)

```ts
export type ValidadeDoGate =
  | { estado: 'vigente' }                       // SÓ com a prova completa: vínculo + 4 versões + política + bytes
  | { estado: 'coincidente'; faltam: Array<'politica' | 'assets'> }   // metadados coincidem; o que falta para provar
  | { estado: 'historico'; divergencias: Array<'vinculo' | 'pageVersion' | 'copyVersion' | 'rulesVersion' | 'politica' | 'assets'> }
  | { estado: 'ilegivel'; motivo: string }      // registro ausente/inválido (3.4), pageVersion null, identidade ≠ gate

export function validadeDoGate(
  registro: RegistroDoGate | null,
  atual: {
    projectId: number; generationId: string; pageId: string
    pageVersion: string | null; copyVersion: string; rulesVersion: string
    politica?: PoliticaDoAssunto                 // ausente = quem lê não a conhece → no máximo `coincidente`
    assets?: Array<{ url: string; sha256: string }>   // ausente = quem lê não tem os bytes → no máximo `coincidente`
  },
): ValidadeDoGate
```

Invariantes (fail-closed):

1. `vigente` ⇔ registro legível (3.4) ∧ vínculo igual (`projectId`, `generationId`, `pageId`) ∧ `pageVersion` não
   nulo e igual ∧ `copyVersion` igual ∧ `rulesVersion` igual ∧ `registro.identidade` ≡ `registro.gate` nas versões ∧
   `atual.politica` PRESENTE e igual (os dois campos) ∧ `atual.assets` PRESENTE e igual (mesmo conjunto de urls, mesmos
   sha256). `gate.versao` ≠ `'gate-v1'` já caiu em `ilegivel` no leitor (3.4).
2. Divergência em QUALQUER item comparável → `historico`, com a lista; vínculo diferente é `historico` com
   `'vinculo'` (nunca `vigente`, mesmo com todos os hashes iguais — Codex R1).
3. Tudo comparável igual, mas sem `politica` ou sem `assets` no `atual` → `coincidente` com `faltam`. A exibição
   (`ver-geracao`) só chega a `coincidente`: ela não tem política nem bytes. Só quem mediu de novo (CP5c, com o
   contexto da medição) pode obter `vigente` — e o CP5c mede sempre (9.3), então `vigente` é um rótulo de auditoria,
   não um atalho.
4. `pageVersion` nulo de qualquer lado → `ilegivel`, nunca `historico` nem `coincidente`.
5. `validadeDoGate` NÃO devolve `resultado`: quem quiser o resultado lê `registro.gate.resultado` DEPOIS de ver o
   estado. A assinatura impede o atalho "pegar o APTO do cache sem olhar a validade".
6. **Nenhum caminho de produção usa `vigente`/`coincidente` para pular a medição no CP5b** (9.3). O cache é exibição
   e auditoria.

## 5. `rulesVersion` — a política (decisão 7 do plano-mestre, 9.3 do contrato CP5a)

**Decisão proposta: bump manual por PR, imposto por teste de impressão digital.** Hash do fonte foi descartado (CP5a
9.3: inviável em build, e mudança cosmética bumparia à toa); bump "por hábito" foi o que falhou quatro vezes
(`'revisao-v1'` desde o CP3).

- `VERSAO_DAS_REGRAS` continua constante em `revisao/contrato.ts`; `GateDaArte.versao` ('gate-v1') continua em
  `gate.ts`. São DUAS versões: regras do revisor e decisão do gate; `rulesVersion` persistido = `VERSAO_DAS_REGRAS`;
  `versaoDoGate` = `gate.versao`.
- Teste `src/lib/creatives/revisao/__tests__/impressao-digital-das-regras.test.ts`: calcula a impressão digital =
  sha256 do JSON `estavel` de { `REGRAS_DA_REVISAO` (os ids; as severidades nascem nos achados de `regras.ts`, não
  numa tabela), `REGRAS_CRITICAS`, `CONFERENCIAS_DO_GATE`, `CHAVES_CLASSIFICADAS` (caminhos e classes),
  `avaliarPeca(medida)` e `gateDaMedida(entrada)` para um CORPUS fixo } e compara com
  `__tests__/impressao-digital/<VERSAO_DAS_REGRAS>+<versao do gate>.json` commitado.
  - Mudou a impressão e a versão não mudou → o teste FALHA com a mensagem "a regra mudou: suba `VERSAO_DAS_REGRAS`
    (ou `gate.versao`) e gere a impressão da versão nova com `IMPRESSAO_DIGITAL=gravar npx vitest run …`".
  - Subiu a versão sem arquivo novo → falha ("gere a impressão da versão nova").
  - **O arquivo de uma versão que já existe na `main` é IMUTÁVEL, imposto por validador no CI** (Codex R1: sem isso
    bastava regenerar o JSON e o teste voltava a passar com a versão velha):
    `scripts/validar-impressao-digital.ts`, no job `check` ao lado de `validar-registro-mcp.ts`, compara cada
    `__tests__/impressao-digital/*.json` com `git show origin/main:<caminho>` — arquivo que existe na `main` e mudou
    no PR → falha; arquivo novo só é aceito se o nome bate com `VERSAO_DAS_REGRAS` + `gate.versao` do próprio PR.
    Rodando o validador também localmente (como os outros dois). Limite dito: quem tem força para editar a `main`
    diretamente contorna qualquer validador — é o mesmo limite de todo gate do CI deste repositório.
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
  medidoEm, origem, politica, validade: 'coincidente' | 'historico' | 'ilegivel', faltam?, divergencias?, motivos:
  [{ regra, codigo, motivo, camadas }] }` calculado com `validadeDoGate(registro, atual)` onde `atual` tem o vínculo
  (projeto, Generation, página), a identidade da página LIDA NA HORA (`identidadeDaPagina(page)`), `VERSAO_DAS_REGRAS`
  e `'gate-v1'` — e NÃO tem `politica` nem `assets` (a tool não mede): o máximo que ela mostra é `coincidente` com
  `faltam: ['politica', 'assets']`, e a frase fixa "último veredito gravado; metadados coincidem; não é o veredito
  atual da arte" (Codex R1). A política gravada é exibida, não comparada. Sem registro: `gate: null` (não "APTO",
  não "pendente"). O manual canônico (`operacao-dot.ts`) ganha a linha "o bloco `gate` de ver-geracao é auditoria;
  nunca agende por ele".
- `auditar-operacao`: fora do CP5b (9.9) — a resposta de hoje (`posts/auditar-operacao.ts`) traz cobertura, buracos e
  falhas e nem seleciona `generationId`; o bloco entra no CP5c, quando houver produtores em volume e a seleção das
  peças for definida junto com o gate integrado.
- Nada no app web lê o registro neste checkpoint.

## 7. Invariantes do CP5b (os testes provam)

1. Registro gravado só por `gravarGateDaArte` → só `jsonb ||` com a chave `gateDaArte` inteira e `WHERE` do vínculo
   (teste com cliente falso que captura o SQL/patch; `@/lib/db` mockado antes do import).
2. `lerGateDaArte` nunca lança; forma inválida, invariante 2.3 violada ou `gate.versao` desconhecida → `null`.
3. `validadeDoGate` é fail-closed: qualquer divergência → não `vigente`; sem política ou sem bytes → no máximo
   `coincidente`; `null` → `ilegivel`; identidade ≠ gate → `ilegivel`.
4. `identidadeDaPagina` é a mesma `versaoDaPagina(page)` (teste puro: igualdade com `versaoDaPagina(page)` para a
   fixture do piloto; `revisar-arte.ts:673` chama a mesma função sem áudio) e não muda com `audio`.
5. A impressão digital das regras bate com o arquivo da versão vigente (seção 5) — e o teste prova que mudar o
   comportamento de UMA regra muda a impressão (H10: `vi.mock` de `text-geometry` trocando `COLLISION_TOLERANCE_PX`,
   ou do `gate.ts` tirando uma regra de `REGRAS_CRITICAS`); o validador do CI prova que o JSON de uma versão existente
   não muda.
6. Nenhum caminho de produção lê `gateDaArte` para decidir (grep de `gateDaArte` fora de `ver-geracao-retorno.ts`,
   `arte-ia.ts`, `gate-*.ts` e testes é vazio — teste de inventário, como `validar-registro-mcp.ts` faz com as tools).
7. Determinismo: mesmo registro + mesma identidade → mesma validade; `medidoEm` e `principal` não entram na validade.

## 8. Matriz de testes

| Caso | Entrada | Esperado |
|---|---|---|
| H1 | `identidadeDaPagina` da fixture do piloto (v1) | `pageVersion` = `versaoDaPagina(page)`; `copyVersion` = `copyVersionDe(page.copyAutoral)`; `copyAutoral` ausente → `'sem-contrato'` |
| H2 | a mesma página com `audio` | `pageVersion` igual (sem áudio) |
| H3 | `layers` como string JSON dupla / ilegível | `pageVersion` `v1:…` igual ao da forma de array / `null` |
| H4 | `validadeDoGate` com vínculo, 4 versões, política e assets iguais | `vigente` |
| H4b | o mesmo sem `politica` / sem `assets` / sem os dois no `atual` | `coincidente` com `faltam` certo; nunca `vigente` |
| H5 | cada item divergente, um por vez (projectId, generationId, pageId, page, copy, rules, política.estimado, política.semAssuntoLocalizavel, um sha256 de asset, um asset a mais/a menos) | `historico` com a divergência nomeada; duas ao mesmo tempo → as duas; página idêntica em OUTRA Generation (mesmos hashes) → `historico` com `'vinculo'` |
| H6 | `pageVersion` null no registro / no atual; registro `null`; `identidade.pageVersion ≠ gate.pageVersion` | `ilegivel` com motivo |
| H7 | `lerGateDaArte` com `fieldValues` null, string, objeto sem `gateDaArte`, `gateDaArte` com `versao: 'gate-v2'`, `politica` faltando, `cobertura` sem uma das 15 entradas, `resultado: 'APTO'` com `motivos` não vazio ou cobertura `nao-comprovada` | `null` em todos; com registro válido → igualdade estrutural; TODA saída de `gateDaMedida` dos G-casos de `gate.test.ts` passa pelo schema |
| H8 | `gravarGateDaArte` com cliente falso (`vi.mock('@/lib/db')` antes do import) | um `$executeRaw` com `jsonb ||`, patch `{ gateDaArte: registro }` e `WHERE` com id, projectId e `fieldValues->>'pageId'`; `resultUrl` nunca tocado; 0 linhas → `'sem-vinculo'` sem lançar; gravar duas vezes = mesmo SQL |
| H8b | `contextoDaMedicao`/`medirCamadasDaPeca` com foto e logos por data URL (como G21c) | `assetsLidos` tem uma entrada por URL lida, sha256 dos bytes; sem download extra (contador do `fetchBuffer` mockado) |
| H9 | impressão digital: corpus vigente | bate com o arquivo `revisao-v1+gate-v1.json` |
| H10 | impressão digital: `REGRAS_DA_REVISAO` com uma severidade trocada (mock) | impressão diferente; a mensagem pede o bump |
| H11 | `montarRetornoDaPagina` com registro coincidente / histórico / ilegível / ausente | bloco `gate` com `validade` certa (nunca `vigente`: a tool não tem política nem bytes) / `gate: null`; nunca inventa `APTO` |
| H12 | inventário: `gateDaArte` não aparece fora dos módulos permitidos | lista vazia |

## 9. Decisões pendentes do owner

| # | Decisão | Recomendação | O que muda se decidir o contrário |
|---|---|---|---|
| 9.1 | Nome da chave: `gateDaArte` | `gateDaArte` (nunca `veredito`, que é o feedback humano) | nome livre; a regra "nunca `veredito`" fica |
| 9.2 | Fonte de `copyVersion`: `Page.copyAutoral` × `Generation.fieldValues.copyAutoral` | `Page.copyAutoral` (o contrato; é o que o CP5c lê "uma vez") | com a reconciliação, re-render sem mudança de contrato invalida o veredito |
| 9.3 | O cache `vigente` pode pular a medição no CP5c? | **não**: CP5c mede sempre; o registro é exibição/auditoria | sim = ganho de segundos por peça contra o risco de agendar por cache (4.2: bytes do asset fora da identidade) |
| 9.4 | Histórico de vereditos | só o último por Generation; `fieldValues` não é log | `historico[]` com teto (ex.: 5) na mesma chave; mais bytes, mais merge |
| 9.5 | Primeiro produtor do registro | **nenhum no CP5b**; o primeiro é o CP5c (`agendar-leva` draft-only), que tem a medida (`MedidaDaPeca`), a política e os bytes. `revisar-arte` NÃO serve: `revisarArte` devolve o relatório, não a `MedidaDaPeca` que `gateDaMedida` exige, e a tool se declara só leitura ("Não grava nada") | fazer `revisar-arte` gravar = refatorar `revisarArte` para expor a medida, trocar a anotação da tool e escolher uma política para uma tool humana — três decisões que o CP5c não precisa |
| 9.6 | Corpus da impressão digital | piloto v1+v2 + G1 + as fixtures de G13–G21 (5.) | só o piloto: regra que ele não toca muda em silêncio |
| 9.7 | `ver-geracao` não tem política nem bytes | mostra no máximo `coincidente` (4.3), exibe a política gravada e a frase fixa "não é o veredito atual da arte" | exigir `politica` como parâmetro da tool deixaria o bloco `coincidente` do mesmo jeito (faltam os bytes) — não compra nada |
| 9.8 | Conjunto FECHADO de `origem` (`agendar-leva`, `ajustar-arte`, `revisar-arte`, `piloto`) | fechado; tool nova = PR com decisão | string livre: auditoria perde o filtro |
| 9.9 | Bloco `gate` em `auditar-operacao` | fica para o CP5c (seleção das peças e `generationId` definidos junto com o gate integrado) | fazer agora = mexer em `posts/auditar-operacao.ts` e nos tipos de cobertura sem produtor nenhum |
| 9.10 | **Política de `rulesVersion`** (decisão 7 do plano-mestre): bump manual por PR imposto por teste + validador no CI (seção 5) × hash de fonte × hash do comportamento sem versão nomeada | bump manual + impressão digital + validador: a versão continua legível por humanos no registro e a mudança de regra vira ato explícito no PR | hash automático: a versão deixa de dizer nada a quem lê a auditoria, e mudança cosmética invalida vereditos |
| 9.11 | O que "vigente" significa com assets mutáveis | só com os bytes conferidos (4.2/4.3); sem bytes é `coincidente`, que a exibição rotula como "não é o veredito atual" | aceitar URL como identidade do asset = `vigente` para uma foto trocada no Blob (Codex R1) |

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
  `__tests__/suporte/corpus-do-gate.ts`; `scripts/validar-impressao-digital.ts` + a linha no job `check` de
  `.github/workflows/ci.yml`;
- `src/lib/creatives/revisao/revisar-arte.ts`: `assetsLidos` em `ContextoDaMedicao`/`MedidaDaPeca` (hash do buffer já
  baixado; sem mudança de regra — a impressão digital de `revisao-v1` tem de continuar igual, e é o teste quem prova);
- `src/lib/mcp/catalogo/ver-geracao-retorno.ts` (bloco `gate`), `arte-ia.ts` (`ver-geracao`), `operacao-dot.ts` (uma
  linha do manual);
- `docs/regras/revisor-da-arte.md` § CP5b; `docs/regras/mcp.md` (o bloco `gate` nas tools);
- MENORes do R13: `docs/regras/revisor-da-arte.md` (texto histórico do § CP5a) e `docs/PLANO-2026-10-15-CP5A-CONTRATO.md`
  (frase de 9.1) — corrigidos neste PR documental.

Fora: `agendar-itens.ts`, `arte-rapida.ts`, `persist.ts`, `nao-piora.ts`, `ajustar-sem-piorar.ts`, `compositor.ts`
(`revisar-arte`), `agenda.ts`/`posts/auditar-operacao.ts`, `mesclar-field-values.ts`, schema do Prisma.

## 12. Gates do PR de implementação (quando vier)

Suíte completa com `MOSTRAR_VIOLACOES=1` (nenhum `hojeViola` muda), `typecheck`, `lint`, `git diff --check`,
`validar-registro-mcp` (as tools não ganham parâmetro novo), `validar-oauth-mcp`, `validar-impressao-digital`; Codex no HEAD exato;
CI e Vercel verdes; merge por merge commit com `--match-head-commit`, só com autorização do owner.
