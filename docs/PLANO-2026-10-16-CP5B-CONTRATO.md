# CP5b — contrato técnico de PERSISTÊNCIA, IDENTIDADE e `rulesVersion` (proposta para revisão, 16/10/2026)

**Estado: PROPOSTA (rodada 6: NÃO EXISTE "vigente" no CP5b; duas impressões, com as entradas do corpus dentro; o registro nasce da MESMA chamada que decide, e sem vínculo NÃO HÁ decisão — o registro é auditoria; só a re-medição prova; vínculo projeto/Generation/página; formato na identidade; impressão digital travada por validador no CI).** Nada aqui está implementado; este PR é documental. Base: `main` `5e96d5a1` (merge do CP5a,
PR #237; contrato do CP5a mergeado pelo PR #236). Ordem do owner (16/10): depois do fechamento do CP5a, preparar
SOMENTE o contrato do CP5b, centrado em persistência, identidade e `rulesVersion`; oclusão por pixels exige
justificativa e escopo explícitos (seção 10); a integração com a não-piora continua no CP5d, conforme o
plano-mestre (`docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md`, § 4.4 e § 4.6).

## 0. O que o CP5b entrega, em uma frase

O veredito do gate (`GateDaArte`, CP5a) passa a ser **gravado como auditoria e cache** em
`Generation.fieldValues.gateDaArte`, com a **identidade** da peça medida (`pageVersion`, `copyVersion`) e a
**versão das regras** (`rulesVersion` com política de bump conferida por teste e validador no CI), e ganha um **leitor**
que diz se os METADADOS do registro coincidem com a peça de hoje (`coincidente`), divergem (`historico`) ou o registro é
`ilegivel` — **nunca que o veredito "ainda vale"**: isso só a re-medição prova (o CP5c mede sempre), e nenhum registro
gravado autoriza coisa alguma.
Nenhum caminho de produção passa a decidir por ele: o gate integrado é o CP5c.

## 1. Reconciliação das fontes

| Tema | Plano-mestre (§ 4.4) | Contrato CP5a (mergeado) | O que a `main` 5e96d5a1 tem | O que o CP5b faz |
|---|---|---|---|---|
| Onde gravar | `Generation.fieldValues.<gate>`, nome distinto de `veredito` | seção 2.3: a saída foi desenhada para o CP5b; "FORA do CP5a" | nada gravado; `VereditoDeArte` é o FEEDBACK humano (`aprendizado/feedback-de-arte.ts`) e `fieldValues.veredito` não existe | chave **`gateDaArte`** (seção 3); nunca `veredito` |
| Como gravar | `mesclarFieldValuesDaArte` (merge no banco, regra 🔴 do `AGENTS.md`) | idem | `src/lib/creatives/mesclar-field-values.ts` (`jsonb ||`, chave ausente fica como está); usado por `persist.ts`, `recompor.ts`, vídeo, crivo, feedback | só por merge; a chave inteira é substituída de uma vez (seção 3.3) |
| `pageVersion` | `versaoDaPagina`, SEM áudio — a mesma chamada do revisor | 2.2: `null` = ilegível, nunca "a mesma versão" | `versao.ts` (`v1:` + sha256 de dimensões, fundo, camadas; `quadro.audio` só para comparar com PNG de vídeo); o revisor chama `versaoDaPagina(page)` (`revisar-arte.ts:673`); o agendamento compara com áudio (`agendamento.ts:511`, versão RENDERIZADA) | `identidadeDaPagina(page)` = `versaoDaPagina(page)` sem áudio (seção 4); a versão renderizada do PNG é OUTRA coisa e fica fora |
| `copyVersion` | hash `estavel` + sha256 do `copyAutoral`; `null` → `'sem-contrato'` | `copyVersionDe` já está no CP5a (`versao.ts:64`, prefixo `c1:`) | `copyVersionDe` existe, puro, só os testes chamam | fonte fixada: **`Page.copyAutoral`** (o contrato da peça), não `Generation.fieldValues.copyAutoral` (que é a reconciliação `{ original, efetiva, comparavel, lacunas }`) — decisão 9.2 |
| `rulesVersion` | política de bump definida aqui (decisão 7 do plano-mestre) | 9.3: constante com bump OBRIGATÓRIO conferido por snapshot do relatório da fixture do piloto; hash de fonte em build inviável | `VERSAO_DAS_REGRAS = 'revisao-v1'` (`contrato.ts:27`) nunca bumpada após CP3, CP4.1, CP4.2 e CP5a; `gate.ts` copia; `GateDaArte.versao = 'gate-v1'` | seção 5: bump manual + **teste de impressão digital** que falha quando o comportamento muda sem bump |
| Stale | "veredito stale nunca autoriza nada; o consumidor compara as três versões e rotula histórico" | — | nada | `validadeDoGate` (seção 4.3): três estados — `coincidente` (vínculo, formato, 4 versões e política iguais), `historico` (algo divergiu) e `ilegivel`. NÃO existe `vigente`: a identidade não cobre tudo o que a medição lê (4.2), então "ainda vale" é indecidível sem medir de novo (Codex R2) |
| Consumidores | `ver-geracao`, `auditar-operacao` | — | `ver-geracao` (`arte-ia.ts:601`, lê `fieldValues` via `montarRetornoDaPagina`); `auditar-operacao` (`agenda.ts:667`, manual canônico do Dot em `operacao-dot.ts`) | bloco `gate` só leitura em `ver-geracao` (seção 6); `auditar-operacao` fica para o CP5c (9.9) |
| Precedentes de identidade na main | — | — | `lotes/identidade.ts` (`VERSAO_DO_HASH = 'lote-v1'`, "mudou a normalização, suba a versão", `hashConfere`); `PostRenderProof` (`proofVersion`, `layersSnapshot`); `persist.ts` (`versaoEsperada` relida sob `FOR UPDATE`) | dois dos três princípios: versão explícita no registro e releitura sob trava com quem decide (CP5c); o CP5b NÃO guarda snapshot da medida (é hash/identidade + auditoria do veredito, não prova reproduzível como `PostRenderProof.layersSnapshot`) |

## 2. Escopo e não-escopo

**Entra**: (a) o REGISTRO persistido e seu schema; (b) a função de IDENTIDADE e o leitor de VALIDADE; (c) a política
de `rulesVersion` com o teste que a impõe; (d) o escritor por merge e o leitor tolerante; (e) o bloco `gate` em
`ver-geracao` (só leitura); (f) testes puros + testes com cliente falso (com `@/lib/db` mockado antes do import);
(h) `formato` na identidade (4.1); (g) correção das duas
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
    formato: 'story' | 'feed' | 'quadrado' | null              // formatoDaPagina(name, tags, w, h): decide piso e canvas canônico
    pageVersion: string | null; copyVersion: string
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
  Generation errada passaria nas comparações de versão (Codex R1). `formato` entra porque `pageVersion` não vê
  `Page.name`/`tags`, e é deles que `formatoDaPagina` (`assinatura.ts:487`) tira o formato — renomear "feed" para
  "story" muda o piso e o canvas canônico sem mudar o hash (Codex R2).
- **O registro nasce da MESMA chamada que decide** (Codex R4: `gate`, `medida` e `identidade` recebidos à parte não
  têm como ser amarrados — o CP5a só COPIA as versões que lhe dão, `gate.ts:883`):

  ```ts
  // gate-registro.ts (puro)
  export function decidirEMontarRegistro(args: {
    entrada: EntradaDoGate                       // a medida, a identidade, a copy e a política — o que o CP5c montou
    page: { id: string; name: string; tags: string[]; width: number; height: number; background?: string | null; layers: unknown; copyAutoral?: unknown }
    vinculo: { projectId: number; generationId: string }
    origem: RegistroDoGate['origem']; principal?: RegistroDoGate['principal']; agora: () => Date
  }):
    | { decisao: 'ok'; gate: GateDaArte; relatorio: RelatorioDaRevisao; registro: RegistroDoGate }
    | { decisao: 'sem-vinculo'; motivo: string }   // NÃO há gate: sem vínculo com a página não existe decisão
  ```

  Ela confere o VÍNCULO da entrada com a página ANTES de decidir, e só então chama `gateDaMedida(entrada)` e monta
  o registro — gate, medida e página são os da mesma chamada por construção. O vínculo exige (Codex R4/R5):
  `estavel(entrada.medida.camadas)` ≡ `estavel(lerCamadas(page.layers).camadas)` (a medida é DESTAS camadas; o
  mesmo `estavel` de `versaoDaPagina`); `entrada.identidade` ≡ `identidadeDaPagina(page)` nas duas versões;
  `entrada.medida.formato === identidadeDaPagina(page).formato`; `entrada.medida.canvas` ≡ `{ page.width, page.height }`.
  Falhou → `{ decisao: 'sem-vinculo', motivo }`: **nenhum gate é devolvido**, logo nenhum `APTO` existe para o
  produtor usar (Codex R5: "a decisão não depende da auditoria" valia para a GRAVAÇÃO, nunca para o vínculo — falha ao
  vincular a decisão à peça recusa a decisão autônoma). O CP5c, único produtor, chama `decidirEMontarRegistro` e
  trata `sem-vinculo` como `REVISAO_HUMANA_NECESSARIA` (condição obrigatória do contrato do CP5c; H12 confere que
  nenhum caminho de produção chama `gateDaMedida` diretamente — ela fica exportada para os testes). A conferência
  da copy (`entrada.copy`) o CP5b não tem como amarrar por hash: é obrigação do CP5c calculá-la da MESMA leitura de
  `page.copyAutoral` cujo `copyVersion` entra na identidade (dito no contrato do CP5c).
- `politica` entra porque `resultado` depende dela (caso B/C do assunto): dois registros com a mesma peça e políticas
  diferentes são vereditos diferentes. Sem `politica` gravada, nenhum registro é `coincidente`.
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
  // = mesclarFieldValuesDaArte(client, generationId, { gateDaArte: registro }, { somenteSe: { projectId, pageId } })
  //   → UPDATE "Generation" SET "fieldValues" = (… ELSE '{}'::jsonb END) || {"gateDaArte": …}::jsonb
  //      WHERE "id" = $1 AND "projectId" = $2 AND "fieldValues"->>'pageId' = $3
  // 0 linhas → 'sem-vinculo' (nada gravado, console.warn): a Generation não é desta página/projeto.
```

- O `WHERE` é o mesmo vínculo que `contextoDaMedicao` usa para achar as Generations da página
  (`fieldValues.pageId`); `sourcePageId` é a página-MODELO de origem e não serve de vínculo. Em vez de duplicar o SQL
  (Codex R3), `mesclarFieldValuesDaArte` ganha o parâmetro OPCIONAL `somenteSe?: { projectId: number; pageId: string }`
  (em `colunas`, ao lado de `resultUrl`) e passa a devolver o número de linhas afetadas; as duas opções juntas
  aplicam as duas (`SET … , "resultUrl" = $x WHERE id AND projectId AND pageId`); sem o parâmetro o SQL é byte a byte o
  de hoje (teste de regressão com cliente falso para as QUATRO formas: sem nada, só `resultUrl`, só `somenteSe`, as
  duas). Os chamadores atuais não mudam.

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
export type LeituraDoRegistro =
  | { estado: 'ausente' }                                            // sem a chave `gateDaArte`
  | { estado: 'invalido'; motivo: string; versaoGravada?: string }   // chave presente, forma/invariante inválida ou versão de gate desconhecida
  | { estado: 'ok'; registro: RegistroDoGate }
export function lerGateDaArte(fieldValues: unknown): LeituraDoRegistro   // zod; nunca lança; nunca expõe campos de um JSON rejeitado
```

Lê com schema **estrito e completo** (`gateDaArteSchema` em `gate-registro.ts`, espelho de `GateDaArte`: `versao`
literal `'gate-v1'`, `resultado`, as versões, `cobertura` com EXATAMENTE as 11 regras críticas + 4 conferências e os
estados válidos, `motivos`/`achados`/`naoMedidos`/`avisos` com a forma do CP5a; `politica`; `identidade` com o
vínculo e o formato) e confere a **invariante 2.3 do CP5a, inteira**: `resultado === 'APTO'` ⇔ `motivos` vazio ∧ `naoMedidos` vazio
∧ `achados` vazio ∧ nenhuma cobertura `reprovada`/`nao-comprovada` ∧ `copy-completa`, `identidade` e `oclusao`
`comprovada` ∧ `piso-de-interface` `comprovada` ou `nao-se-aplica` ∧ as 11 críticas `comprovada` ou `nao-se-aplica`
(Codex R2: `nao-se-aplica` em `copy-completa`/`identidade`/`oclusao` nunca sai do CP5a; `gate.ts` só as marca
`comprovada` ou `nao-comprovada`). Qualquer violação → `invalido` com o motivo (e nada do JSON rejeitado sai —
nem `resultado`) (Codex R1: um JSON com
`resultado: 'APTO'` e cobertura vazia não é saída do CP5a e nunca pode ser exibido como veredito). Registro de outra
versão do gate (`versao` ≠ `'gate-v1'`) → `invalido` com `versaoGravada`: **um bump de `gate.versao` torna os registros anteriores
ilegíveis para o leitor novo** (não há leitor compatível com versões antigas — decisão 9.13; o JSON fica no banco
como auditoria crua e a exibição mostra "registro de versão anterior do gate: <versao>", lendo só esse campo). As três
formas de `LeituraDoRegistro` deixam a projeção distinguir chave ausente de chave inválida (Codex R4); `validadeDoGate`
só recebe o `registro` de uma leitura `ok`. `gate.test.ts` ganha o teste de que TODA saída de `gateDaMedida` dos G-casos passa
pelo `gateDaArteSchema` (o schema não pode ficar mais estrito do que o gate).

## 4. Identidade

### 4.1 `identidadeDaPagina` (puro, em `versao.ts`)

```ts
export function identidadeDaPagina(page: {
  id: string; name: string; tags: string[]; width: number; height: number; background?: string | null; layers: unknown; copyAutoral?: unknown
}): { pageId: string; formato: Formato | null; pageVersion: string | null; copyVersion: string }
  // pageVersion = versaoDaPagina(page) — SEM quadro de áudio (a mesma chamada do revisor, revisar-arte.ts:673)
  // copyVersion = copyVersionDe(page.copyAutoral)
  // formato     = formatoDaPagina({ name, tags, width, height }) — o mesmo de contextoDaMedicao (revisar-arte.ts:389)
```

- **Sem áudio, de propósito**: o gate mede o render de imagem (CP5a; vídeo e movimento vão ao humano), e a versão com
  áudio (`agendamento.ts:511`) é a do PNG RENDERIZADO para publicação — outra pergunta. Misturar as duas faria uma
  página com música ter dois `pageVersion` para a mesma composição.
- `copyAutoral` é o da **Page** (decisão 9.2). `Generation.fieldValues.copyAutoral` é a reconciliação
  (`ver-geracao-retorno.ts:39`) e muda quando a copy visual muda — se fosse a fonte, uma re-renderização sem mudança
  de contrato trocaria `copyVersion`.
- `pageVersion: null` (ilegível) é gravável (o registro diz `REVISAO_HUMANA_NECESSARIA` por `IDENTIDADE_ILEGIVEL`, como
  no CP5a) mas nunca é `coincidente` (4.3).

### 4.2 O que a identidade NÃO cobre — e por isso "vigente" não existe

A medição lê mais do que a página: os BYTES dos assets por URL (a mesma URL pode ter bytes novos — `persist.ts:174`
grava com `allowOverwrite: true`; a régua ainda renderiza a foto por outro carregador, `regua.ts:466`, e
`assuntoDaPeca` reaproveita o assunto gravado sem baixar nada), os bytes das FONTES do projeto
(`CustomFont.fileUrl`, `register-project-fonts.ts:60` — trocar o arquivo preservando a família muda geometria e
render), as REFERÊNCIAS da assinatura e a FAIXA do gradiente do projeto (`contextoDaMedicao`, `revisar-arte.ts:389`).
Nada disso está em `pageVersion`/`copyVersion`, e cobrir tudo exigiria hashear cada entrada da medição — um
contrato de reprodutibilidade, não o CP5b. Decisão proposta (9.11): **o CP5b não afirma que um veredito gravado
"ainda vale"**. O leitor diz só `coincidente` ("os metadados coincidem: vínculo, formato, página, copy, regras,
política"), com a frase fixa do que NÃO foi conferido; quem precisa do veredito atual mede de novo (CP5c, 9.3).
Isso fecha de uma vez os cenários do Codex R2 (foto trocada no Blob, fonte trocada, assinatura ou gradiente
alterados): nenhum deles produz um rótulo que autorize algo, porque nenhum rótulo autoriza.

### 4.3 Validade (puro, em `gate-registro.ts`)

```ts
export type ValidadeDoGate =
  | { estado: 'coincidente'; naoConferido: readonly string[] }   // metadados iguais; a lista fixa do que a identidade não cobre (4.2)
  | { estado: 'historico'; divergencias: Array<'vinculo' | 'formato' | 'pageVersion' | 'copyVersion' | 'rulesVersion' | 'versaoDoGate' | 'politica'> }
  | { estado: 'ilegivel'; motivo: string }      // pageVersion null de um lado, ou identidade ≠ gate nas versões

export function validadeDoGate(
  registro: RegistroDoGate,                            // só de uma leitura `ok` (3.4); ausente/inválido nunca chegam aqui
  atual: {
    projectId: number; generationId: string; pageId: string; formato: Formato | null
    pageVersion: string | null; copyVersion: string
    rulesVersion: string; versaoDoGate: string          // VERSAO_DAS_REGRAS e GateDaArte['versao'] de QUEM LÊ
    politica: PoliticaDoAssunto                          // obrigatória: sem ela não há comparação (ver-geracao exibe a gravada e passa a RECOMENDADA, nomeada — 9.7)
  },
): ValidadeDoGate
```

Invariantes (fail-closed):

1. `coincidente` ⇔ registro legível (3.4) ∧ vínculo igual (`projectId`, `generationId`, `pageId`) ∧ `formato` igual ∧
   `pageVersion` não nulo e igual ∧ `copyVersion` igual ∧ `rulesVersion` igual ∧ `versaoDoGate` igual ao `gate.versao`
   gravado (a quarta versão É comparada; na prática, depois de um bump do gate o registro antigo já cai em `ilegivel`
   no leitor — 3.4/9.13 — e a comparação é a rede de segurança para quem monta `atual` com outra constante) ∧
   `politica` igual (os dois campos) ∧ `registro.identidade` ≡ `registro.gate` nas versões.
2. Divergência em QUALQUER item → `historico`, com a lista; vínculo diferente é `historico` com `'vinculo'` (mesmos
   hashes noutra Generation nunca coincidem — Codex R1).
3. `pageVersion` nulo de qualquer lado → `ilegivel`, nunca `historico` nem `coincidente`.
4. `coincidente` carrega SEMPRE `naoConferido` = a lista fixa de 4.2 (bytes dos assets, bytes das fontes, assinatura,
   gradiente do projeto, o que a medição lê fora da página): é o leitor quem diz o que não provou, não o consumidor.
5. `validadeDoGate` NÃO devolve `resultado`: quem quiser o resultado lê `registro.gate.resultado` DEPOIS de ver o
   estado. Não existe estado que signifique "o veredito ainda vale".
6. **Nenhum caminho de produção usa `coincidente` para pular a medição** (9.3): o CP5c mede sempre. O registro é
   exibição e auditoria — e é por isso que a identidade PODE ser incompleta sem risco: ela só rotula.

## 5. `rulesVersion` — a política (decisão 7 do plano-mestre, 9.3 do contrato CP5a)

**Decisão proposta: bump manual por PR, cobrado por teste de impressão digital sobre um corpus enumerado.** Hash
do fonte foi descartado (CP5a 9.3: inviável em build, e mudança cosmética bumparia à toa); bump "por hábito" foi o
que falhou quatro vezes (`'revisao-v1'` desde o CP3). **O que a impressão cobre, dito sem rodeio (Codex R2)**: as
REGRAS DE DECISÃO — `avaliarPeca` + `gateDaMedida` sobre medidas FIXAS do corpus — e as tabelas fechadas (regras,
críticas, conferências, chaves classificadas). Ela NÃO cobre a MEDIÇÃO (`medirCamadasDaPeca`, régua, medidor de
texto, leitura da logo): mudança que altera a medida entregue ao gate não muda a impressão. `rulesVersion` é,
portanto, a versão das regras de decisão; a medição não tem versão neste checkpoint (limite dito; como nada é
"vigente", um registro antigo nunca autoriza nada por causa disso — ele só pode ser rotulado `coincidente` com a
ressalva). Regra fora do corpus também escapa: por isso o corpus é enumerado (9.6) e todo PR que toca `regras.ts` ou
`gate.ts` responde "o corpus cobre?" na descrição.

- `VERSAO_DAS_REGRAS` continua constante em `revisao/contrato.ts`; `GateDaArte.versao` ('gate-v1') continua em
  `gate.ts`. São DUAS versões, cada uma com a SUA impressão e o SEU bump obrigatório (Codex R3: com um arquivo só,
  mudar `avaliarPeca` e subir só `gate.versao` passava):
  - **impressão do revisor** = sha256 do JSON `estavel` de { `REGRAS_DA_REVISAO`, e, para cada peça do corpus, a
    ENTRADA (`medida`) e a saída `avaliarPeca(medida)` } → arquivo `__tests__/impressao-digital/revisao-<VERSAO_DAS_REGRAS>.json`; mudou → o teste exige
    bump de `VERSAO_DAS_REGRAS`;
  - **impressão do gate** = sha256 do JSON `estavel` de { `REGRAS_CRITICAS`, `CONFERENCIAS_DO_GATE`,
    `CHAVES_CLASSIFICADAS`, e, para cada peça do corpus e cada uma das 4 políticas, a ENTRADA e a saída
    `gateDaMedida(entrada).gate` } → arquivo
    `__tests__/impressao-digital/gate-<GateDaArte['versao']>.json`; mudou → o teste exige bump de `gate.versao`.
    Como `gateDaMedida` chama `avaliarPeca` (`gate.ts:797`), uma mudança do revisor muda as duas impressões e exige
    os DOIS bumps — é o custo de "a medida é a fonte única" (CP5a) e é deliberado: o registro persistido diz em que
    versão de CADA camada o veredito saiu. (Isso vale pelo código real; H10 não o prova por injeção — ver a matriz.)
- Teste `src/lib/creatives/revisao/__tests__/impressao-digital-das-regras.test.ts`: calcula a impressão digital =
  sha256 do JSON `estavel` de { `REGRAS_DA_REVISAO` (os ids; as severidades nascem nos achados de `regras.ts`, não
  numa tabela), `REGRAS_CRITICAS`, `CONFERENCIAS_DO_GATE`, `CHAVES_CLASSIFICADAS` (caminhos e classes),
  `avaliarPeca(medida)` e `gateDaMedida(entrada)` para um CORPUS fixo } — nas DUAS impressões acima, cada uma
  comparada com o seu arquivo commitado.
  - Mudou a impressão do revisor e `VERSAO_DAS_REGRAS` não mudou → FALHA ("a regra do revisor mudou: suba
    `VERSAO_DAS_REGRAS` e gere `revisao-<nova>.json` com `IMPRESSAO_DIGITAL=gravar npx vitest run …`"); o mesmo,
    separadamente, para a impressão do gate e `gate.versao`. Subir a versão ERRADA não resolve: cada impressão só
    aceita o arquivo da sua própria versão.
  - Subiu uma versão sem o arquivo dela → falha ("gere a impressão da versão nova").
  - **O arquivo de uma versão que já existe na `main` é IMUTÁVEL, imposto por validador no CI** (Codex R1: sem isso
    bastava regenerar o JSON e o teste voltava a passar com a versão velha):
    `scripts/validar-impressao-digital.ts`, no job `check` ao lado de `validar-registro-mcp.ts`, compara cada
    `__tests__/impressao-digital/*.json` com `git show <base>:<caminho>`, onde `<base>` é `origin/main` obtido por
    `git fetch --no-tags --depth=1 origin main` DENTRO do validador (o `actions/checkout@v4` do `ci.yml:17` é raso e
    não garante a referência — Codex R2); base indisponível → o validador FALHA explicitamente ("sem origin/main para
    comparar"), nunca passa em silêncio. Arquivo que existe na base e mudou no PR → falha; arquivo novo só é aceito se o
    nome bate com a versão correspondente do próprio PR (`revisao-<VERSAO_DAS_REGRAS>.json` ou
    `gate-<gate.versao>.json`). Rodando o validador também localmente (como os
    outros dois). Limite dito: quem tem força para editar a `main`
    diretamente contorna qualquer validador — é o mesmo limite de todo gate do CI deste repositório.
  - Arquivo da versão antiga permanece commitado (auditoria de quando cada regra mudou).
- **Corpus** (decisão 9.6): TODAS as fixtures de `gate.test.ts`, extraídas para `__tests__/suporte/corpus-do-gate.ts`
  — a peça limpa de G1, os achados críticos e a logo de G3–G12, a política do assunto G13–G18, piso G19/G26,
  oclusão G21/G21b/G21f, movimento e vídeo G30/G31, as conferências G22/G27–G29 — mais a fixture do piloto
  (`piloto-2026-10-13/peca.json`, v1 e v2, como G24 monta a medida). É cobertura AMOSTRAL (Codex R4): a impressão só
  vê o que o corpus exercita; regra que nenhuma peça do corpus toca muda em silêncio. O owner aceita expressamente
  essa amostra (9.6) ou amplia o corpus antes de o bump ser chamado de obrigatório; e a revisão de PR que toca
  `regras.ts`/`gate.ts` responde "o corpus cobre?".
- As ENTRADAS do corpus entram na impressão (Codex R5): mudar regra e fixture ao mesmo tempo, preservando as
  saídas, muda a impressão do mesmo jeito e cobra o bump — editar o corpus é, por definição, mudar o que a versão
  prova. O custo (bump por mudança de fixture) é deliberado.
- Efeito no persistido: `rulesVersion` diferente do atual → `historico` (4.3). O CP5c re-mede sempre (9.3), então o
  custo de um bump é zero em produção; o ganho é a auditoria honesta ("este APTO foi com as regras v1").

## 6. Consumidores (só leitura)

- `ver-geracao` (`arte-ia.ts:601` → `montarRetornoDaPagina`): bloco `gate` = `{ resultado, rulesVersion, versaoDoGate,
  medidoEm, origem, politica, validade: 'coincidente' | 'historico' | 'ilegivel', naoConferido?, divergencias?,
  motivos: [{ regra, codigo, motivo, camadas }], aviso: 'último veredito gravado; não é o veredito atual da arte' }`.
  **Leitura real (Codex R2)**: o handler hoje passa a `montarRetornoDaPagina` só `{ id, name, templateId, isTemplate }`
  da página (`arte-ia.ts:663-665`); o CP5b acrescenta (ADITIVO, sem tirar `status`, `resultUrl`, `templateId`, `isTemplate` nem os demais
  campos que `montarRetornoDaPagina` já usa para o link do editor e `comoAgendar`, `ver-geracao-retorno.ts:113`)
  `projectId` ao `select` da Generation e `tags`, `width`, `height`, `background`, `layers`, `copyAutoral` ao da
  página, mantendo o filtro `where: { id: paginaId, Template: { projectId } }` de hoje (`arte-ia.ts:639`) — página de
  outro projeto continua indisponível; `atual` leva `VERSAO_DAS_REGRAS`, `'gate-v1'` e a política RECOMENDADA, nomeada
  (9.7) — a gravada é exibida ao lado, e política diferente sai como `historico` com `'politica'`. Sem registro:
  `gate: null` (não "APTO", não "pendente"). O manual canônico (`operacao-dot.ts`) ganha a linha "o bloco `gate` de
  ver-geracao é auditoria; nunca agende por ele" — com bump de `DOT_OPERACAO_VERSAO` e a mesma mudança em
  `docs/regras/dot-lagosta-operacao.md`, como a fonte canônica exige (Codex R4).
- `auditar-operacao`: fora do CP5b (9.9) — a resposta de hoje (`posts/auditar-operacao.ts`) traz cobertura, buracos e
  falhas e nem seleciona `generationId`; o bloco entra no CP5c, quando houver produtores em volume e a seleção das
  peças for definida junto com o gate integrado.
- Nada no app web lê o registro neste checkpoint.

## 7. Invariantes do CP5b (os testes provam)

1. Registro gravado só por `gravarGateDaArte` → só `jsonb ||` com a chave `gateDaArte` inteira e `WHERE` do vínculo
   (teste com cliente falso que captura o SQL/patch; `@/lib/db` mockado antes do import).
2. `lerGateDaArte` nunca lança; forma inválida, invariante 2.3 violada ou `gate.versao` desconhecida → `invalido`
   (com `versaoGravada` quando dá para ler), sem expor campo nenhum do JSON rejeitado; chave ausente → `ausente`.
3. `validadeDoGate` é fail-closed: qualquer divergência → `historico`; `pageVersion` nulo ou identidade ≠ gate →
   `ilegivel`; nunca existe estado "vigente"; `coincidente` sempre lista o não conferido. Leitura `ausente`/`invalido`
   nem chega a ela: a projeção mostra `gate: null` ou `validade: 'ilegivel'` com o motivo e a `versaoGravada`.
4. `identidadeDaPagina` é a mesma `versaoDaPagina(page)` (teste puro: igualdade com `versaoDaPagina(page)` para a
   fixture do piloto; `revisar-arte.ts:673` chama a mesma função sem áudio) e não muda com `audio`.
5. A impressão digital das regras bate com o arquivo da versão em vigor (seção 5) — e o teste prova que mudar UMA
   entrada observável muda a impressão (H10: `impressaoDigitalDasRegras(entradas, corpus)` recebe as tabelas e as
   funções como PARÂMETROS; o teste passa `criticas` sem `colisao` e um `gate` que devolve outro resultado para uma
   peça do corpus, e exige hash diferente — sem `vi.mock` de constante privada); o validador do CI prova que o JSON de
   uma versão existente não muda.
6. Nenhum caminho de produção lê `gateDaArte` para decidir (grep de `gateDaArte` fora de `ver-geracao-retorno.ts`,
   `arte-ia.ts`, `gate-*.ts` e testes é vazio — teste de inventário, como `validar-registro-mcp.ts` faz com as tools).
7. Determinismo: mesmo registro + mesma identidade → mesma validade; `medidoEm` e `principal` não entram na validade.

## 8. Matriz de testes

| Caso | Entrada | Esperado |
|---|---|---|
| H1 | `identidadeDaPagina` da fixture do piloto (v1) | `pageVersion` = `versaoDaPagina(page)`; `copyVersion` = `copyVersionDe(page.copyAutoral)`; `copyAutoral` ausente → `'sem-contrato'`; `formato` = `formatoDaPagina(...)` ('story' para a fixture; 'quadrado' para 500×500 sem nome; `null` para 400×300 sem nome) |
| H2 | a mesma página com `audio` | `pageVersion` igual (sem áudio) |
| H3 | `layers` como string JSON dupla / ilegível | `pageVersion` `v1:…` igual ao da forma de array / `null` |
| H3b | `decidirEMontarRegistro` com `medida.formato` ≠ formato da página (gate de feed para página story), `medida.canvas` ≠ página (1080×1920 × 2160×3840), `entrada.identidade` ≠ `identidadeDaPagina(page)`, ou **a medida LIMPA de OUTRA peça do mesmo formato e canvas** (camadas ≠ `page.layers`) | `{ decisao: 'sem-vinculo', motivo }` — sem gate, sem registro, nunca um `APTO`; com tudo igual → `ok`, e `gate` ≡ `gateDaMedida(entrada)` (igualdade estrutural) |
| H4 | `validadeDoGate` com vínculo, formato, 4 versões e política iguais | `coincidente` com `naoConferido` = a lista fixa de 4.2 (não vazia) |
| H5 | cada item divergente, um por vez (projectId, generationId, pageId, formato, page, copy, rulesVersion, versaoDoGate, política.estimado, política.semAssuntoLocalizavel) | `historico` com a divergência nomeada; duas ao mesmo tempo → as duas; página idêntica em OUTRA Generation (mesmos hashes) → `historico` com `'vinculo'`; página renomeada de "feed" para "story" (mesmo hash) → `historico` com `'formato'` |
| H6 | `pageVersion` null no registro / no atual; `identidade.pageVersion ≠ gate.pageVersion` | `ilegivel` com motivo |
| H7 | `lerGateDaArte`: `fieldValues` null/string/objeto sem `gateDaArte` → `ausente`; `gateDaArte` com `gateDaArte` com `versao: 'gate-v2'`, `politica` faltando, `cobertura` sem uma das 15 entradas, `resultado: 'APTO'` com `motivos` não vazio, com `achados` não vazio, com cobertura `nao-comprovada`, ou com `copy-completa`/`identidade`/`oclusao` em `nao-se-aplica` | `invalido` com motivo (e `versaoGravada` para `gate-v2`) em todos; com registro válido → `ok` e igualdade estrutural; TODA saída de `gateDaMedida` dos G-casos de `gate.test.ts` passa pelo schema |
| H8 | `gravarGateDaArte` com cliente falso (`vi.mock('@/lib/db')` antes do import) | um `$executeRaw` com `jsonb ||`, patch `{ gateDaArte: registro }` e `WHERE` com id, projectId e `fieldValues->>'pageId'`; `resultUrl` nunca tocado; 0 linhas → `'sem-vinculo'` sem lançar; gravar duas vezes = mesmo SQL |
| H9 | impressão digital: corpus em vigor | a do revisor bate com `revisao-revisao-v1.json` e a do gate com `gate-gate-v1.json` |
| H10 | `impressaoDigitalDasRegras(entradas, corpus)` com `criticas` sem `colisao` / com um `gate` que devolve outro resultado para uma peça → a impressão do GATE muda; com um `avaliar` que devolve um achado a mais → a impressão do REVISOR muda; a mensagem pede o bump da versão certa | (a dependência real gate → `avaliarPeca` é por código, `gate.ts:797`, e não é provada por injeção: a impressão do gate usa o `gateDaMedida` REAL sobre o corpus, então uma mudança real de `avaliarPeca` a altera na prática — dito, não testado por H10) |
| H11 | `montarRetornoDaPagina` com registro coincidente / histórico / inválido / ausente | bloco `gate` com `validade` certa, `naoConferido` e o `aviso` fixo; inválido → `validade: 'ilegivel'` com o motivo (e a versão gravada, se houver); ausente → `gate: null`; nunca inventa `APTO` |
| H11b | a projeção do banco de `ver-geracao` (cliente falso) | o `select` da Generation inclui os campos de hoje + `projectId`; o da página inclui os de hoje + os de `identidadeDaPagina`, com `Template: { projectId }` no `where`; página de OUTRO projeto ou sumida → `gate` com `validade: 'ilegivel'`, e o resto do retorno igual ao de hoje |
| H12 | inventário: `gateDaArte` não aparece fora dos módulos permitidos | lista vazia |

## 9. Decisões pendentes do owner

| # | Decisão | Recomendação | O que muda se decidir o contrário |
|---|---|---|---|
| 9.1 | Nome da chave: `gateDaArte` | `gateDaArte` (nunca `veredito`, que é o feedback humano) | nome livre; a regra "nunca `veredito`" fica |
| 9.2 | Fonte de `copyVersion`: `Page.copyAutoral` × `Generation.fieldValues.copyAutoral` | `Page.copyAutoral` (o contrato; é o que o CP5c lê "uma vez") | com a reconciliação, re-render sem mudança de contrato invalida o veredito |
| 9.3 | O registro pode pular a medição no CP5c? | **não**: CP5c mede sempre; o registro é exibição/auditoria (e 4.2 mostra por que não poderia ser outra coisa) | sim = exigiria o contrato de reprodutibilidade de 4.2 (hash de assets, fontes, assinatura, gradiente) — outro checkpoint |
| 9.4 | Histórico de vereditos | só o último por Generation; `fieldValues` não é log | `historico[]` com teto (ex.: 5) na mesma chave; mais bytes, mais merge |
| 9.5 | Primeiro produtor do registro | **nenhum no CP5b**; o primeiro é o CP5c (`agendar-leva` draft-only), que tem a medida (`MedidaDaPeca`), a política e os bytes. `revisar-arte` NÃO serve: `revisarArte` devolve o relatório, não a `MedidaDaPeca` que `gateDaMedida` exige, e a tool se declara só leitura ("Não grava nada") | fazer `revisar-arte` gravar = refatorar `revisarArte` para expor a medida, trocar a anotação da tool e escolher uma política para uma tool humana — três decisões que o CP5c não precisa |
| 9.6 | Corpus da impressão digital — e a aceitação de que é AMOSTRAL | todas as fixtures de `gate.test.ts` + piloto v1/v2 (5.); o owner aceita expressamente que regra fora do corpus muda sem bump | só o piloto: cobre menos; "bump obrigatório para toda mudança" exigiria cobertura exaustiva, que não existe |
| 9.7 | Política que `ver-geracao` passa ao leitor | a RECOMENDADA, nomeada (`POLITICA_DO_ASSUNTO_RECOMENDADA`), exibindo a gravada ao lado; diferença → `historico` com `'politica'`. **Depende de 9.12**: quando o CP5c fixar a política efetiva, `ver-geracao` passa a mesma constante | parâmetro `politica` na tool: mais fiel ao chamador, mais atrito; como nada autoriza, o ganho é só de rótulo |
| 9.8 | Conjunto FECHADO de `origem` (`agendar-leva`, `ajustar-arte`, `revisar-arte`, `piloto`) | fechado; tool nova = PR com decisão | string livre: auditoria perde o filtro |
| 9.9 | Bloco `gate` em `auditar-operacao` | fica para o CP5c (seleção das peças e `generationId` definidos junto com o gate integrado) | fazer agora = mexer em `posts/auditar-operacao.ts` e nos tipos de cobertura sem produtor nenhum |
| 9.10 | **Política de `rulesVersion`** (decisão 7 do plano-mestre): bump manual por PR imposto por teste + validador no CI (seção 5) × hash de fonte × hash do comportamento sem versão nomeada | bump manual + impressão digital + validador: a versão continua legível por humanos no registro e a mudança de regra vira ato explícito no PR | hash automático: a versão deixa de dizer nada a quem lê a auditoria, e mudança cosmética invalida vereditos |
| 9.12 | Política EFETIVA do assunto no primeiro produtor (CP5c) — a decisão 9.1 do CP5a que o owner deixou para o chamador | fechar ANTES do produtor, no contrato do CP5c; até lá, `historico` por `'politica'` só compara com a recomendada | sem ela, `historico`/`coincidente` por política não têm significado estável (Codex R3) |
| 9.13 | Bump de `gate.versao` torna os registros anteriores ilegíveis para o leitor novo (sem leitor compatível) | sim: o JSON fica no banco e a exibição diz a versão gravada; um leitor por versão é código morto até existir a v2 | leitor compatível = manter os schemas antigos e as suas invariantes para sempre |
| 9.11 | Existe "vigente"? | **não no CP5b**: a identidade não cobre bytes de assets/fontes, assinatura e gradiente (4.2); o leitor rotula só `coincidente`/`historico`/`ilegivel` e lista o não conferido; "ainda vale" = medir de novo | criar "vigente" exige o contrato de reprodutibilidade da medição (hash de cada entrada) — checkpoint próprio, se o owner quiser |

## 10. Oclusão por pixels (estratégia A) — fora do CP5b, e o que a justificaria

O owner pediu justificativa e escopo explícitos antes de qualquer medição por pixels. O CP5a (B) já cobre a
oclusão por geometria conservadora com `NAO_MEDIDO` para o que não prova. A (A) só se justifica com a métrica do
plano-mestre (9.2 do contrato CP5a): **> 10 % das peças do piloto sintético bloqueadas SÓ por oclusão** (motivo único
`oclusao`/`NAO_MEDIDO`), medido depois do CP5c (que é quem produz vereditos em volume). Escopo, se vier: render
duplo (com e sem a camada acima) e comparação de pixels dos glifos do texto protegido — custo de um render extra por
par, e um contrato próprio. Nada disso entra aqui.

## 11. Arquivos (o que o CP5b toca)

- `src/lib/creatives/revisao/versao.ts`: `identidadeDaPagina` (puro; importa `formatoDaPagina` de `src/lib/compositor/assinatura.ts`, que é puro);
- `src/lib/creatives/revisao/gate-registro.ts` (novo, puro): `RegistroDoGate`, `registroDoGateSchema`, `lerGateDaArte`,
  `validadeDoGate`, `decidirEMontarRegistro({ entrada, page, vinculo, origem, principal?, agora })` (3.1);
- `src/lib/creatives/revisao/gate-persistido.ts` (novo, com banco): `gravarGateDaArte`;
- `src/lib/creatives/mesclar-field-values.ts`: parâmetro opcional `somenteSe` + número de linhas (3.3), sem mudar o SQL
  dos chamadores atuais;
- `src/lib/creatives/revisao/__tests__/impressao-digital-das-regras.test.ts` + `__tests__/impressao-digital/*.json` +
  `__tests__/suporte/corpus-do-gate.ts`; `scripts/validar-impressao-digital.ts` + a linha no job `check` de
  `.github/workflows/ci.yml`;
- `src/lib/mcp/catalogo/ver-geracao-retorno.ts` (bloco `gate`), `arte-ia.ts` (`ver-geracao`), `operacao-dot.ts` (uma
  linha do manual + bump de `DOT_OPERACAO_VERSAO`) e `docs/regras/dot-lagosta-operacao.md`;
- `docs/regras/revisor-da-arte.md` § CP5b; `docs/regras/mcp.md` (o bloco `gate` nas tools);
- MENORes do R13: `docs/regras/revisor-da-arte.md` (texto histórico do § CP5a) e `docs/PLANO-2026-10-15-CP5A-CONTRATO.md`
  (frase de 9.1) — corrigidos neste PR documental.

Fora: `agendar-itens.ts`, `arte-rapida.ts`, `persist.ts`, `nao-piora.ts`, `ajustar-sem-piorar.ts`, `compositor.ts`
(`revisar-arte`), `agenda.ts`/`posts/auditar-operacao.ts`, schema do Prisma.

## 12. Gates do PR de implementação (quando vier)

Suíte completa com `MOSTRAR_VIOLACOES=1` (nenhum `hojeViola` muda), `typecheck`, `lint`, `git diff --check`,
`validar-registro-mcp` (as tools não ganham parâmetro novo), `validar-oauth-mcp`, `validar-impressao-digital`; Codex no HEAD exato;
CI e Vercel verdes; merge por merge commit com `--match-head-commit`, só com autorização do owner.
