# CP5a — contrato técnico do VEREDITO PURO (proposta para revisão, 15/10/2026, noite)

**Estado: PROPOSTA PARA REVISÃO. Nada implementado.** Base: `main` `01f3c3be` (merge do CP4.2, PR #235).
Rodada 4 do Codex (BLOCKER: o render gira em torno da ORIGEM, não do centro; IMPORTANTE: piso de interface sem
rotação; MENOR: descrições) aplicada no HEAD seguinte. Revisão do OWNER sobre o HEAD 5949eb33 (NÃO APTO) aplicada: sem exceção de gradiente na oclusão (metadata não
prova ausência de oclusão); rotação/transformação fechada por limites conservadores ou `NAO_MEDIDO`; invariantes
com copy completa, identidade e piso; `cenariosNaoMedidos` recebe as evidências da medida e a exceção de logo exige
prova positiva; 9.4 (copy sem contrato) já afeta o CP5a. Rodada 2 do Codex (2 IMPORTANTE, 1 MENOR) aplicada: exceção de gradiente só para `gradient`/`gradient2` COM a
marca; empate de `order` escrito como `>=`; `achados` da saída inclui a exceção do estimado. Rodada 1 do Codex
(NÃO APTO: 5 IMPORTANTE, 1 MENOR) aplicada: fonte única das camadas (o gate calcula o
relatório), exceção de logo só para o par examinado, foto sem arquivo não é "sem assunto", exceção do
achado estimado declarada no predicado, sem opção de ignorar oclusão, exceção de gradiente pelo predicado
existente, política do assunto como parâmetro OBRIGATÓRIO (a recomendação não vira padrão sem decisão).
Este documento reconcilia três fontes — o plano-mestre
(`docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md`, § 2 e § 4.1–4.3), o documento antigo do
CP5 (`docs/research/CP5-GATE-AUTONOMIA-2026-10.md`, §§ 5, 11, 12, 15) e o código da `main` de hoje — e
fixa o que o CP5a entrega: **uma função pura** que recebe a medida completa de uma peça e devolve `APTO`
ou `REVISAO_HUMANA_NECESSARIA`, com cobertura, achados e motivos. Sem banco, sem DRAFT, sem gate, sem
chamador de produção. MCP-M e editor ficam fora.

Onde as três fontes divergem, a tabela da seção 1 diz qual vale e por quê. Onde este contrato decide
algo que o plano-mestre deixou em aberto (decisões 1, 2 e 7 da seção 10 dele), a seção 9 pede a decisão
do owner, com recomendação e sem assumir aprovação.

---

## 1. Reconciliação das três fontes

| Tema | Doc antigo do CP5 (53eda0c9) | Plano-mestre (b86cf5a8) | Código da main 01f3c3be | O que VALE neste contrato |
|---|---|---|---|---|
| Nome da função | `vereditoDaMedida(medida, relatorio, identidade)` em `veredito.ts` | nome livre; chave persistida NÃO pode ser `veredito` | `REVISAO_HUMANA_NECESSARIA` existe só como texto (`operacao-dot.ts`, manual) e no oráculo dos testes | função `gateDaMedida` em `src/lib/creatives/revisao/gate.ts`; tipo `GateDaArte`. "gate" é o vocabulário do plano-mestre e não colide com `VereditoDeArte` (feedback humano) nem com o crivo |
| Entrada | medida inteira + relatório + identidade | idem | `MedidaDaPeca` (`revisar-arte.ts`, `Omit<EntradaDaRevisao, 'vistos'\|'motivoSemVisao'\|'marcas'>`) já traz `camadas`, `canvas` e `formato`; `avaliarPeca(medida)` (`regras.ts`, pura e síncrona) → `RelatorioDaRevisao`; identidade = `versaoDaPagina` (sem áudio) + hash do `copyAutoral` (só em testes) | seção 2: **a medida é a fonte única** — o gate chama `avaliarPeca(medida)` ele mesmo e devolve o relatório junto (Codex R1: relatório e camadas recebidos à parte permitiam provar uma peça com o relatório de outra). **O relatório não basta**: só a medida traz `assunto.origem`, `contraste`, `pioras`, `leituraDaLogo`, `motivoSemMedida`, `textosSemMetrica` |
| `texto-sobre-assunto` | comprova SÓ com catálogo; sem assunto → humano | o doc não conhecia `naoSeAplica` (CP4.1); política por caso A–E é a decisão 1 | `CoberturaDaRegra.naoSeAplica` existe (`contrato.ts:87`); `assunto.origem: 'catalogo' \| 'estimado'`; tetos 0,25 (catálogo) e 0,40 (estimado) em `mapa-de-calma.ts:175-177`; **o assunto sai das camadas efetivas** (CP4.2, revisão do owner) | seção 5: política por caso, parametrizada (`politicaDoAssunto`), com a recomendação; o CP5a implementa os cinco casos e testa cada um |
| Oclusão | não tratada | lacuna crítica; (B) detecção do cenário no CP5a, (A) medição no CP5b; decisão 2 | `regras.ts` não lê `Layer.order`; mede só `text`/`rich-text` visíveis, a foto de fundo (`fotoDeFundo`) e as logos soltas (`logosDaPeca`); `shape`/`icon`/`element`/`video`/`gradient2`/imagem que não é fundo são invisíveis; a régua (`regua.ts:342`, `semTinta`) renderiza as camadas ACIMA do texto como fundo | seção 6: (B) como função pura `cenariosNaoMedidos(medida, cobertura)` no CP5a — toda camada visível (de qualquer tipo, inclusive texto girado ou sem métrica) com `order` maior OU IGUAL ao de um texto visível cujos limites (conservadores, com a rotação em torno da origem, como o render) intersectam os dele → `REVISAO_HUMANA_NECESSARIA`; sem exceção para gradiente (metadata não prova ausência de oclusão); as únicas exceções são texto × texto ambos medidos e sem rotação (é `colisao`) e o par logo solta × texto que `logo-sobre-texto` comprovadamente examinou; transformação não suportada → `NAO_MEDIDO` (seção 6) |
| Piso de interface 188/224 | lacuna; `foraDaInterface` do oráculo vira produção no CP5c2 | "no CP5a `foraDaInterface` vira função de produção ou regra do revisor" | só em `direcao-de-arte/__tests__/suporte/propriedades.ts:35,349` (`PISO_DE_INTERFACE_DO_STORY`, `foraDaInterface`) | seção 4.3: vira função de produção em `gate.ts` (`foraDaInterface`), conferida pelo gate sobre as CAIXAS (texto e logo visíveis), só para `formato === 'story'`; o oráculo dos testes passa a importar a de produção (um só lugar com os números) |
| Copy completa | reconciliação pura `revisaoDaPaginaComCamadas` em `sem-mudanca` + `lacunas` vazias | idem + `copyRemovida` como evidência | `revisaoDaPaginaComCamadas(gravado, camadas, quem)` (`copy-autoral/revisar-pagina.ts:83`): estados `sem-contrato`, `ilegivel`, `historico-cheio`, `copy-invalida`, `sem-mudanca`, `registrada` | seção 4.4: entra no CP5a como entrada OPCIONAL (`copy`), já calculada por quem chama; o gate não lê banco. `copyRemovida` NÃO entra no CP5a (mora na Generation; é evidência do CP5b/CP5c) |
| Achado crítico | regra crítica com `certeza: 'medida'`, qualquer severidade; `estimada` = não comprovado; `visao` não entra | idem | `Certeza = 'medida' \| 'estimada' \| 'visao'`; `colisao`, `fora-da-area-segura`, `logo-sobre-texto`, `texto-sobre-assunto`, `texto-cortado` saem `aviso` | seção 4.1, sem mudança: predicado executável |
| Cobertura | `nao-avaliada`/`parcial` em regra crítica → não comprovada | os três estados (§ 2): medido, não se aplica, não foi possível medir | `EstadoDaCobertura = 'avaliada' \| 'parcial' \| 'nao-avaliada'`; `naoSeAplica?: true` | seção 4.2: `parcial` em regra crítica é **não comprovada** (motivo da cobertura), salvo a exceção enumerada da fonte não cadastrada no AMBIENTE DE TESTE, que o gate de produção NÃO tem |
| `fonte-nao-carregada` | em produção é `problema` → não APTO | idem | regra existe; `motivoSemFontes` quando a conferência não rodou | seção 4.1: crítica; `motivoSemFontes` → não comprovada |
| Régua (contraste) | comprova só com `contraste !== null` E `pioras !== null` | idem | `EntradaDaRevisao.contraste: ContrasteMedido[] \| null`; `pioras?: PioraDeTratamento[] \| null` (ausente = derivada de `contraste`) | seção 4.2: `contraste === null` → `texto-sem-leitura` e `tratamento-piorou-leitura` não comprovadas; `pioras === null` com `contraste` presente → só `tratamento-piorou-leitura` não comprovada |
| `logo-sem-leitura` | comprova só com toda logo solta `medida`; peça sem logo = "sem logo", aviso humano | idem | `LeituraDaLogoNaRevisao.estado: 'medida' \| 'indisponivel' \| 'sem-pixels' \| 'fora-do-contrato'`; `leituraDaLogo: []` quando não há logo solta; `null` = não rodou | seção 4.2: idem; sem logo → comprovada com `avisos: ['peça sem logo solta']`, nunca em silêncio |
| `rulesVersion` | `VERSAO_DAS_REGRAS` | política (bump manual × hash) é a decisão 7, no CP5b | `'revisao-v1'` nunca bumpada desde CP3/CP4.1/CP4.2 | seção 2: o gate COPIA `relatorio.versaoDasRegras` para a saída e não decide a política (CP5b). Recomendação em 9.3 |
| `piloto-portao` | "vira `it()` no CP5a/CP5c1" | errado: só no CP5c (gate integrado) | 8 `hojeViola` em `piloto-portao.test.ts:188-215` exercitam `agendar-leva` | seção 7: NENHUM `hojeViola` muda no CP5a; só testes puros novos |
| Persistência | `fieldValues.veredito` | `fieldValues.<gate>` com `pageVersion`, `copyVersion`, `rulesVersion`… (CP5b) | nada gravado | FORA do CP5a. O CP5a define o TIPO da saída pensando no CP5b (seção 2.3), não grava nada |

---

## 2. Entradas e saídas

### 2.1 Módulo

`src/lib/creatives/revisao/gate.ts` — **puro**: sem `@/lib/db`, sem `fetch`, sem `sharp`, sem render.
Importa só tipos e funções puras já existentes (`contrato.ts`, `regras.ts` para `ehTextoVisivel`,
`fotoDeFundo`, `logosDaPeca`). Regra do
`AGENTS.md`: módulo testável sem banco não importa `@/lib/db`.

### 2.2 Entrada

```ts
export interface EntradaDoGate {
  /**
   * A medida completa (o que `medirCamadasDaPeca` devolve): SEM visão. É a FONTE ÚNICA: as camadas, o canvas e o
   * formato saem dela (`medida.camadas`, `medida.canvas`, `medida.formato`), e o relatório é calculado DENTRO do gate
   * por `avaliarPeca(medida)` (pura) — não há como provar uma peça com o relatório de outra (Codex R1).
   */
  medida: MedidaDaPeca
  /** Identidade da página medida — copiada para a saída; o gate não a valida (CP5c compara sob trava). */
  identidade: { pageVersion: string | null; copyVersion: string }
  /**
   * Copy completa (seção 4.4): o resultado de `revisaoDaPaginaComCamadas(page.copyAutoral, page.layers,
   * { autor: 'sistema', motivo: 'gate', superficie: 'gate' })`, calculado por quem chama sobre a MESMA leitura.
   * `undefined` = quem chama não conferiu → a regra `copy-completa` sai NÃO COMPROVADA (fail-closed), nunca omitida.
   */
  copy?: { estado: RevisaoDaPagina['estado']; lacunas: string[] }
  /**
   * Política do assunto (seção 5) — OBRIGATÓRIA, sem padrão: a recomendação deste contrato é uma proposta
   * (`POLITICA_DO_ASSUNTO_RECOMENDADA` exportada com esse nome), e quem chama (CP5c) passa a política DECIDIDA pelo
   * owner. Não existe opção para ignorar a oclusão (seção 6): os testes isolam regras com fixtures sem camada acima.
   */
  politicaDoAssunto: PoliticaDoAssunto
}

/** O gate devolve o relatório que ele mesmo calculou, para o CP5c anexá-lo à resposta sem recalcular. */
export function gateDaMedida(entrada: EntradaDoGate): { gate: GateDaArte; relatorio: RelatorioDaRevisao }
```

Notas:

- `pageVersion: null` (camadas ilegíveis por `versaoDaPagina`) → `REVISAO_HUMANA_NECESSARIA` com motivo
  `identidade: camadas ilegíveis` — ilegível nunca é "a mesma versão" (`versao.ts`).
- `copyVersion` é `hash(estavel(copyAutoral))` ou `'sem-contrato'`; o CP5a só a copia. A função de hash
  entra no CP5a como `copyVersionDe(copyAutoral: unknown): string` em `versao.ts` (reusa `estavel` +
  sha256, prefixo `c1:`), porque é pura e os testes do gate precisam dela. Não grava nada.
- Nada no `EntradaDoGate` vem do banco: quem chama (CP5c) lê a página UMA vez, mede, avalia, reconcilia a
  copy e monta a entrada.

### 2.3 Saída

```ts
export type ResultadoDoGate = 'APTO' | 'REVISAO_HUMANA_NECESSARIA'

export interface GateDaArte {
  versao: 'gate-v1'
  resultado: ResultadoDoGate
  /** `relatorio.versaoDasRegras` copiado (hoje 'revisao-v1'); a política de bump é do CP5b. */
  rulesVersion: string
  pageVersion: string | null
  copyVersion: string
  /**
   * Por regra CRÍTICA (seção 3) E pelas quatro conferências que não são regra do revisor (seção 4.3–4.5 e 2.2):
   * o estado que o gate viu. É a prova; nunca omite uma entrada.
   */
  cobertura: Record<RegraCritica | ConferenciaDoGate, CoberturaDoGate>
  /** Só o que DECIDIU contra a peça (vazio quando APTO). */
  motivos: MotivoDoGate[]
  /**
   * Os achados que REPROVARAM (regra, camadas, id): os críticos `certeza: 'medida'` e, só com
   * `politicaDoAssunto.estimado === 'comprova'`, o achado `estimada` de `texto-sobre-assunto` (exceção 4.1) —
   * `certeza` vem junto para o leitor distinguir. Vazio quando APTO.
   */
  achados: Array<{ regra: RegraCritica; camadas: string[]; id: string; severidade: Severidade; certeza: 'medida' | 'estimada' }>
  /** O que o gate NÃO vê e diz (seção 6 e 4.2): camadas não-texto acima de texto, textos sem métrica, logo sem contrato… */
  naoMedidos: Array<{ regra: RegraCritica | 'oclusao' | 'geometria'; motivo: string; camadas: string[] }>  // 'oclusao' cobre também a transformação não suportada (seção 6)
  /** Nunca bloqueiam, nunca somem: "peça sem logo solta", "assunto estimado sem sobreposição (política …)". */
  avisos: string[]
}

/** As conferências do gate que NÃO são regra de `REGRAS_DA_REVISAO`: cada uma tem de estar comprovada (ou não se aplicar) para APTO. */
export type ConferenciaDoGate = 'copy-completa' | 'piso-de-interface' | 'oclusao' | 'identidade'

export type CoberturaDoGate =
  | { estado: 'comprovada' }
  | { estado: 'nao-se-aplica'; motivo: string }
  | { estado: 'nao-comprovada'; motivo: string }
  | { estado: 'reprovada'; achados: string[] }

export interface MotivoDoGate {
  regra: RegraCritica | 'oclusao' | 'identidade' | 'copy-completa' | 'piso-de-interface'
  codigo: 'ACHADO_CRITICO' | 'NAO_COMPROVADA' | 'NAO_MEDIDO' | 'IDENTIDADE_ILEGIVEL'
  motivo: string
  camadas: string[]
}
```

Invariantes da saída (todas com teste):

1. `resultado === 'APTO'` ⇔ `motivos.length === 0` ⇔ TODAS as entradas de `cobertura` — as 11 críticas E as
   quatro conferências (`copy-completa`, `piso-de-interface`, `oclusao`, `identidade`) — estão `comprovada` ou
   `nao-se-aplica`, `naoMedidos` vazio, `achados` vazio. Em particular, **APTO exige copy completa comprovada
   (4.4), identidade válida (`pageVersion !== null`) e piso de interface satisfeito (4.3; `nao-se-aplica` fora
   do story)**: 11 regras comprovadas com copy ausente, `pageVersion: null` ou piso violado é
   `REVISAO_HUMANA_NECESSARIA` (testes G27–G29, isolados).
2. A ordem de `motivos` é determinística (pela ordem de `REGRAS_CRITICAS`, depois `oclusao`, `copy-completa`,
   `piso-de-interface`, `identidade`) — mesma entrada, mesma saída, byte a byte (`JSON.stringify` igual).
3. `GateDaArte` não contém o relatório nem a medida (sem duplicar o que já existe); o relatório vem AO LADO,
   no retorno de `gateDaMedida`, e é o único que o CP5c anexa à resposta ao agente (doc antigo § 13).
4. `avisos` nunca muda `resultado`.

---

## 3. Regras críticas (o conjunto fechado)

```ts
export const REGRAS_CRITICAS = [
  'fonte-nao-carregada',
  'texto-cortado',
  'tinta-fora-da-caixa',
  'colisao',
  'fora-da-area-segura',
  'texto-sem-leitura',
  'tratamento-piorou-leitura',
  'texto-sobre-assunto',
  'logo-sem-leitura',
  'logo-sobre-texto',
  'texto-pequeno',
] as const satisfies readonly RegraDaRevisao[]
```

Fora (não decidem, nem aprovam nem reprovam): `gradiente-forte-demais`, `titulo-grande`,
`entrelinha-grande`, `palavra-orfa` (gosto/sugestão), `visao` (a visão nunca entra). Um teste fixa que
`REGRAS_CRITICAS ∪ NAO_CRITICAS === REGRAS_DA_REVISAO` — regra nova em `contrato.ts` sem classificação
quebra o teste (nunca "não contada").

Mais QUATRO conferências que NÃO são regra do revisor e por isso têm entrada própria na cobertura
(`ConferenciaDoGate`): **piso de interface** (story, 4.3), **copy completa** (4.4), **oclusão** (4.5/6) e
**identidade** (2.2, `pageVersion` legível). As quatro são condição de APTO (invariante 1).

`texto-pequeno` entra como crítica porque o CP4.2 fez a manchete medida por componente
(`texto-pequeno:<camada>:modelo|hierarquia|celular`, severidade `aviso`, `certeza: 'medida'`): achado
medido reprova (predicado 4.1). Apoio/serviço abaixo do piso já eram achados `problema`/`aviso` medidos.

---

## 4. Critérios de cobertura (o que COMPROVA)

### 4.1 Achado crítico — predicado executável

```
achadoCritico(a, politica) =
  REGRAS_CRITICAS.includes(a.regra) &&
  (a.certeza === 'medida' ||
    // A ÚNICA exceção, declarada aqui e na tabela da seção 5: o achado ESTIMADO de `texto-sobre-assunto` reprova
    // quando (e só quando) o owner decidiu `estimado: 'comprova'` — se o estimado serve para aprovar, serve
    // para reprovar. Com `estimado: 'humano'` (recomendado) a exceção está dormente.
    (a.regra === 'texto-sobre-assunto' && a.certeza === 'estimada' && politica.estimado === 'comprova'))
```

Qualquer severidade. Fora dessa exceção, `certeza: 'estimada'` em regra crítica NÃO reprova por si: torna a
regra **não comprovada** (motivo "achado só estimado em <regra>: <id>") — o humano decide. `certeza: 'visao'`
é ignorado. (Hoje só `texto-sobre-assunto` com assunto estimado e rich text produzem `estimada`.)

### 4.2 Por regra crítica, lido da MEDIDA (não só do relatório)

| Regra | Comprovada quando | Não se aplica quando | Não comprovada quando (motivo) |
|---|---|---|---|
| `fonte-nao-carregada` | `cobertura.estado === 'avaliada'`, `medida.motivoSemFontes` ausente, sem achado | — | `motivoSemFontes` (a conferência não rodou); `parcial` |
| `texto-cortado`, `tinta-fora-da-caixa`, `colisao`, `fora-da-area-segura`, `logo-sobre-texto`, `texto-pequeno` | `avaliada`, `medida.motivoSemMedida` ausente, `medida.textosSemMetrica` vazio, sem achado medido | peça sem texto visível (`camadas.filter(ehTextoVisivel).length === 0`) → `nao-se-aplica` para as de texto | `motivoSemMedida`; `textosSemMetrica` não vazio (→ também em `naoMedidos.geometria` com os ids); `parcial` (rich text, fonte não cadastrada — ver 4.6); `nao-avaliada` |
| `texto-sem-leitura` | `avaliada` e `medida.contraste !== null` (a régua renderizou: é a prova de render do gate) e sem achado medido | peça sem texto visível | `contraste === null` ("a régua não mediu"); `nao-avaliada`/`parcial` |
| `tratamento-piorou-leitura` | como a anterior E `medida.pioras !== null` (ausente conta como derivada de `contraste`: comprovada se `contraste` presente) | idem | `pioras === null` com `contraste` presente |
| `texto-sobre-assunto` | seção 5 (política) | seção 5 (casos C e E) | seção 5 (caso D; caso B na política recomendada) |
| `logo-sem-leitura` | `medida.leituraDaLogo` é array e TODA logo solta tem `estado === 'medida'` e sem achado medido | `leituraDaLogo` é `[]` (nenhuma logo solta) → **comprovada** + aviso `peça sem logo solta` (nunca em silêncio) | `leituraDaLogo === null`/ausente (`motivoSemLeituraDaLogo`); alguma logo `indisponivel`/`sem-pixels`/`fora-do-contrato` (→ `naoMedidos` com a camada) |

Regra transversal: **cobertura `nao-avaliada` em crítica → não comprovada com o `motivo` da cobertura**;
**`parcial` em crítica → não comprovada** (4.6 diz a única exceção, e ela é de ambiente de teste, não do
gate). `naoSeAplica: true` só é respeitado onde a tabela diz "não se aplica" (hoje `texto-sobre-assunto`);
uma regra crítica que apareça `nao-avaliada` com `naoSeAplica` fora desse mapa é **não comprovada**
(o gate não confia numa marca que não conhece).

### 4.3 Piso de interface do story (não é regra do revisor)

`foraDaInterface(camadas, canvas, interface)` sai do oráculo dos testes para `gate.ts` (produção), com
`PISO_DE_INTERFACE_DO_STORY = { topo: 188, rodape: 224 }` e `interfaceDoStory(doCliente?)` (mais restritivo,
nunca menos). O gate aplica só com `formato === 'story'`: texto visível ou logo solta cujos **limites
conservadores `limitesDe(l)` (seção 6: a caixa envolvente da geometria girada em torno da origem, como o render)**
têm `topo < interface.topo` ou `base > canvas.height − rodape` → motivo `piso-de-interface` / `ACHADO_CRITICO`
com as camadas e `cobertura['piso-de-interface'] = reprovada`; satisfeito → `comprovada`; fora do story →
`nao-se-aplica`. É condição de APTO (invariante 1). Camada girada cuja caixa original está na faixa livre mas
cujos limites girados invadem topo ou rodapé REPROVA (Codex R4); camada com transformação não suportada deixa o
piso **não comprovado** (`naoMedidos`), nunca comprovado pela caixa original. A geometria de composição do projeto (`assinatura.geometria.story`, 250/350 na peça
piloto) NÃO entra (decisão do owner de 13/10, mantida). O `hojeViola` P6 de `piloto-compositor` NÃO muda
aqui (ele é sobre o compositor, não sobre o gate).

### 4.4 Copy completa (entrada `copy`)

| `copy.estado` | Veredito da regra `copy-completa` |
|---|---|
| `sem-mudanca` com `lacunas` vazias | comprovada |
| `sem-mudanca` com lacunas | não comprovada (motivo: as lacunas) |
| `registrada` (as camadas dizem outra copy: contrato defasado) | não comprovada |
| `sem-contrato`, `ilegivel`, `copy-invalida`, `historico-cheio` | não comprovada (o estado é o motivo) |
| `copy` ausente (`undefined`) | não comprovada ("quem chamou não conferiu a copy") |

O estado vai em `cobertura['copy-completa']`; só `comprovada` permite APTO (invariante 1) — não existe
"não se aplica" para a copy no CP5a (decisão 9.4: `sem-contrato` → humano).

Peça SEM contrato de copy (compor legado/arte rápida sem `copyAutoral`) vai ao humano pelo
`sem-contrato`. É o fail-closed do doc antigo § 11; a seção 9.4 pergunta ao owner se quer uma exceção
para páginas sem `copyAutoral` nenhum (hoje a maior parte das artes antigas).

### 4.5 Oclusão — seção 6.

### 4.6 `parcial` e o ambiente de teste

Hoje `parcial` nasce de: fonte não cadastrada (`fonteIncerta`), rich text (`medidasAproximadas`),
`textosSemMetrica`, título sem referência de modelo (`texto-pequeno`, CP4.2a). **O gate de produção trata
todas como não comprovadas.** Os testes do piloto excluem `fonte-nao-carregada` e aceitam `parcial` por
"fonte não cadastrada" porque as fontes da marca não existem no ambiente de teste (`regraMediu`,
`problemasAbertos` em `piloto-ciclo.test.ts`); os testes do CP5a usam fixtures de MEDIDA sintéticas, não
o renderer, e por isso não precisam dessa exceção. Quando o CP5c integrar, o harness de `piloto-portao`
vai precisar registrar as fontes ou fixar o motivo — dito aqui para não virar "afrouxar o gate".

---

## 5. Política para o assunto da foto (`texto-sobre-assunto`)

Estado da medida que o gate lê: `medida.assunto` (`{ rect, origem: 'catalogo' | 'estimado' } | null`),
`medida.motivoSemAssunto`, `medida.assuntoNaoSeAplica`, `relatorio.cobertura['texto-sobre-assunto']`,
e os achados da regra (`certeza` = `'medida'` com catálogo, `'estimada'` com estimado; tetos 0,25 e
0,40 já aplicados pelo revisor ao decidir se há achado). Desde o CP4.2 (revisão do owner) o assunto vem das
**camadas efetivas** da chamada — a política abaixo não depende da foto anterior.

```ts
export type PoliticaDoAssunto = {
  /** Caso B: o assunto só ESTIMADO comprova (com o teto 0,40 do revisor) ou manda ao humano. */
  estimado: 'comprova' | 'humano'
  /** Caso C: foto lida sem assunto localizável (`naoSeAplica`) não bloqueia, ou manda ao humano. */
  semAssuntoLocalizavel: 'nao-se-aplica' | 'humano'
}
/** PROPOSTA (seção 9.1): não é padrão de nada — `gateDaMedida` exige a política explicitamente. */
export const POLITICA_DO_ASSUNTO_RECOMENDADA: PoliticaDoAssunto = { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' }
```

| Caso | Medida | Veredito da regra | Observação |
|---|---|---|---|
| A. catálogo | `assunto.origem === 'catalogo'` | sem achado → **comprovada**; achado (`certeza: 'medida'`, cobertura > 0,25) → **reprovada** | o caso mais seguro; raro até o acervo ter caixas de assunto |
| B. estimado | `assunto.origem === 'estimado'` | `estimado: 'humano'` (recomendado): **não comprovada** sempre — motivo "assunto só estimado pela textura"; com achado estimado o motivo cita o achado. `estimado: 'comprova'`: sem achado → comprovada; achado estimado (> 0,40) → **reprovada**, pela exceção declarada no predicado 4.1 (`cobertura.texto-sobre-assunto = reprovada` com o id do achado) | a promoção para `'comprova'` depende do piloto sintético (concordância estimado × catálogo); decisão 9.1 |
| C. foto LIDA, sem assunto | `assunto === null`, `assuntoNaoSeAplica === true` e `fotoDeFundo(medida.camadas, canvas)` existe **com `fileUrl` não vazio** | `semAssuntoLocalizavel: 'nao-se-aplica'` (recomendado): **não se aplica** (não bloqueia; aviso "foto sem assunto localizável"). `'humano'`: não comprovada | ganho de autonomia em fundos lisos; risco: assunto real de baixo contraste |
| C'. foto de fundo SEM arquivo | `fotoDeFundo` devolve uma camada visível sem `fileUrl` (ela não exige arquivo, `regras.ts:436-441`) e `assuntoDaPeca` marca `naoSeAplica` com o motivo "não tem foto de fundo" (`revisar-arte.ts:255-256`) | **não comprovada** (fail-closed): nada foi lido; motivo "foto de fundo sem arquivo" | Codex R1: pela tabela anterior caía em C. O gate decide pelo `fileUrl` da camada, não pelo texto do motivo; o motivo do código continua enganoso e NÃO é alterado no CP5a (fica anotado para o CP5b) |
| D. falha ao analisar | `assunto === null`, `motivoSemAssunto` presente, SEM `assuntoNaoSeAplica` | **não comprovada** (fail-closed), motivo = `motivoSemAssunto` | nunca configurável |
| E. sem foto de fundo | `fotoDeFundo(camadas, canvas) === null` (a cobertura vem `naoSeAplica` com "a peça não tem foto de fundo") | **não se aplica** | sempre, independe da política |

O gate NÃO recalcula sobreposição: confia no achado do revisor (que já aplica os tetos) e na origem da
medida. Testes fixam que o caso C exige foto de fundo COM arquivo — `naoSeAplica` sem camada de foto é E, com
camada sem arquivo é C' (humano), com arquivo é C; e que D e C' nunca viram C ou E por nenhuma política.

---

## 6. Estratégia de oclusão — (B) detecção do cenário não comprovável, no CP5a

Função pura em `gate.ts`, alimentada pela MEDIDA (não só por `Layer[]`): a exceção de logo precisa de prova
positiva de que o par foi examinado, e isso mora nas métricas e na cobertura.

```ts
export function cenariosNaoMedidos(
  medida: Pick<MedidaDaPeca, 'camadas' | 'canvas' | 'metricas' | 'textosSemMetrica' | 'motivoSemMedida'>,
  cobertura: RelatorioDaRevisao['cobertura'],
): Array<
  | { tipo: 'oclusao'; texto: string; acima: string[] }
  | { tipo: 'transformacao-nao-suportada'; camadas: string[]; motivo: string }
>
```

**Limites de cada camada**: `limitesDe(l)` devolve a caixa alinhada aos eixos que CONTÉM a geometria desenhada,
com o MESMO pivô do render: o servidor gira o node em torno da ORIGEM `(position.x, position.y)`, sem offset
(`render-engine.ts:199-205`, "Konva rotaciona o node em torno da própria origem") — **não em torno do
centro** (Codex R4). Para `rotation` ∈ {0, undefined} é `position`/`size`; para qualquer outra rotação são os
quatro cantos `(0,0) (w,0) (0,h) (w,h)` girados por `rotation` graus em torno da origem, somados a
`position`, e a caixa envolvente deles (limites conservadores: podem sobrar, nunca faltar). Transformações
que a caixa CONTÉM e por isso são suportadas: `style.flipH`/`flipV` (o render espelha DENTRO da caixa,
`render-engine.ts:1692-1693`) e `style.mask` (o `clip` só RETIRA desenho, `render-engine.ts:1664-1668` —
a caixa continua contendo o que sobra; uma forma mascarada acima de um texto que intersecta CONTA, porque o
gate não sabe o que o recorte deixou). Qualquer outro campo de geometria que o tipo venha a ter (escala,
`skew`, `offset`…) classifica a camada como **`transformacao-nao-suportada` → `NAO_MEDIDO`** ANTES de qualquer
teste de intersecção (nunca "descartar pela caixa original"); um teste (G23b) fixa por snapshot as chaves de
`Layer`/`LayerStyle` que o gate conhece — chave nova no tipo faz o teste falhar e exige classificação.

O cenário fixado em teste (com a geometria REAL do render): uma forma 600×40 em (400, 500) girada 90°
tem caixa original y 500–540, que NÃO toca um texto em x 370–390 × y 600–700, mas o render dela ocupa
x 360–400 × y 500–1100 (girou em torno da origem, para baixo e para a esquerda) — os limites conservadores
intersectam o texto e a peça vai ao humano. A paridade com o render é provada por teste (G21c): para
rotações 0/30/90/180/270, os pixels pintados de uma forma opaca no render REAL ficam todos dentro de
`limitesDe(l)`.

**Regra**: para cada texto VISÍVEL `t` (`ehTextoVisivel`), toda camada `c` visível, `c.id !== t.id`, com
**`c.order >= t.order`** (o empate conta como ACIMA — fail-closed), cujos `limitesDe(c)` intersectam
`limitesDe(t)` em área > 0, entra em `naoMedidos` com `regra: 'oclusao'` (motivo `NAO_MEDIDO` →
`REVISAO_HUMANA_NECESSARIA`), **salvo exatamente estas duas exceções**:

- outro texto (`text`/`rich-text`) **sem rotação nos dois** e **ambos com métrica** (`metricas` tem os dois
  `layerId`, nenhum em `textosSemMetrica`, `motivoSemMedida` ausente): texto sobre texto é `colisao`, que a
  geometria mediu. Texto girado, ou texto sem métrica, acima de outro texto CONTA como oclusão — `colisao`
  trabalha com caixas sem rotação e só com o que mediu;
- a logo, SÓ para o par (logo, texto) que `logo-sobre-texto` comprovadamente examinou — prova positiva, todas
  as condições: a logo está em `logosDaPeca(camadas)` (solta, visível, fora de grupo); o texto tem métrica
  (`metricas` contém o `layerId`, fora de `textosSemMetrica`); nenhum dos dois tem rotação nem transformação
  não suportada; e `cobertura['logo-sobre-texto'].estado === 'avaliada'` (sem `parcial`, sem `nao-avaliada`).
  Faltando qualquer uma, CONTA como oclusão (Codex R1: logo agrupada; owner: exceção sem prova).

**Sem exceção para gradiente** (revisão do owner): um `gradient`/`gradient2` — marcado como tratamento de
leitura ou não — com `order >=` ao de um texto que intersecta é oclusão. `metadata.tratamentoDeTexto` é
intenção, não prova: a régua mede a leitura COM o gradiente, mas não prova que ele não cobre o texto.
O gradiente de leitura do compositor fica ABAIXO dos textos por construção (na fixture do piloto: gradientes
`order` 1–2, textos 3–5) e sai pela ordenação normal, sem exceção. A foto de fundo idem: abaixo por
construção; com `order >=` ao de um texto, É oclusão.

Tipos alcançados: `shape`, `icon`, `element`, `image` (inclusive o fundo fora de ordem), `video`,
`gradient`/`gradient2`, `logo` fora do par comprovado, `text`/`rich-text` girado ou sem métrica.

`cobertura['oclusao']`: `comprovada` quando a função devolve vazio; `nao-comprovada` (com os pares) caso
contrário — e `naoMedidos` leva cada item. Nunca `nao-se-aplica`: uma peça sem camada acima de texto é
comprovada, não inaplicável.

Por que (B) e não (A) agora: é uma função pura sobre a medida, sem render, sem custo, e nunca aprova em
silêncio. O que ela NÃO faz (dito): não mede opacidade (`style.opacity`) nem `fill` transparente — uma
forma transparente acima do texto bloqueia a peça; máscara e as demais transformações não suportadas
bloqueiam como `NAO_MEDIDO`. Se o piloto sintético mostrar falsos
bloqueios demais (meta na seção 9.2), o CP5b implementa (A): render do texto sem as camadas acima × com
elas, pela própria régua.

Ligação com o compositor (plano-mestre 4.3): o acento do T1b precisa entrar com `order` abaixo dos
textos e `metadata.compositor` identificável, senão cai em (B). **Não existe opção para desligar a
detecção** (Codex R1): uma opção pública seria um caminho configurável de "não medido → APTO"; os testes
isolam as outras regras com fixtures sem camada acima de texto.

---

## 7. Matriz de testes (`src/lib/creatives/revisao/__tests__/gate.test.ts`, puros)

Fixtures: `medida()` sintética (como `regras.test.ts` monta `EntradaDaRevisao`) + `avaliarPeca(medida)`
real para o relatório — o gate é testado sobre o relatório que o revisor de verdade produz, sem render.

| # | Caso | Esperado |
|---|---|---|
| G1 | peça limpa: 3 textos sem rotação e com métrica, foto de fundo (com `fileUrl`, `order` 0) com assunto de catálogo sem sobreposição, logo solta `medida` com `logo-sobre-texto` `avaliada`, régua presente, copy `sem-mudanca`, `pageVersion` válido, story dentro do piso, nenhuma camada acima de texto | `APTO`; `cobertura` toda `comprovada`/`nao-se-aplica`; `motivos`, `achados`, `naoMedidos` vazios; o `relatorio` devolvido é `avaliarPeca(medida)` (igualdade estrutural) |
| G2 | invariantes: G1 serializado duas vezes é idêntico; `avisos` não muda o resultado | igual byte a byte |
| G3 | achado crítico medido de severidade `aviso` (`colisao`) | `REVISAO_HUMANA_NECESSARIA`, `achados` com o id, `cobertura.colisao = reprovada` |
| G4 | achado em regra NÃO crítica (`palavra-orfa`, `titulo-grande`) | `APTO` |
| G5 | achado `certeza: 'visao'` em regra crítica | ignorado → `APTO` |
| G6 | cobertura `nao-avaliada` em crítica (`motivoSemMedida`) | `NAO_COMPROVADA` com o motivo da cobertura |
| G7 | `parcial` (rich text; fonte não cadastrada) | `NAO_COMPROVADA` (o gate de produção não tem a exceção do piloto) |
| G8 | `textosSemMetrica: ['x']` | `NAO_COMPROVADA` nas regras de texto + `naoMedidos.geometria` com `x` |
| G9 | `contraste === null` | `texto-sem-leitura` e `tratamento-piorou-leitura` não comprovadas; `pioras === null` com contraste presente → só a segunda |
| G10 | `fonte-nao-carregada` com achado `problema`; `motivoSemFontes` | reprovada / não comprovada |
| G11 | logo: `leituraDaLogo: []` | comprovada + aviso "peça sem logo solta" |
| G12 | logo `indisponivel` / `fora-do-contrato` / `sem-pixels`; `leituraDaLogo: null` | não comprovada, `naoMedidos` com a camada |
| G13 | assunto A (catálogo) sem achado / com achado | comprovada / reprovada |
| G14 | assunto B (estimado) sem achado: `estimado: 'humano'` → não comprovada; `'comprova'` → comprovada; com achado estimado (`certeza: 'estimada'`) e `'comprova'` → reprovada pela exceção 4.1, e o achado aparece em `achados` com `certeza: 'estimada'`; o MESMO achado com `'humano'` → não comprovada (a regra geral); um achado `estimada` de OUTRA regra crítica (rich text em `texto-cortado`) nunca reprova, com qualquer política | conforme |
| G15 | assunto C (`naoSeAplica`, foto COM `fileUrl`): `'nao-se-aplica'` → não se aplica + aviso; `'humano'` → não comprovada. **C'** (`naoSeAplica`, camada de foto visível SEM `fileUrl`) → não comprovada com as 4 combinações de política | conforme |
| G16 | assunto D (`motivoSemAssunto` sem a marca) | não comprovada, independente da política (as 4 combinações) |
| G17 | assunto E (sem foto de fundo) | não se aplica, independente da política |
| G18 | `naoSeAplica` numa crítica fora do mapa (ex.: forjado em `colisao`) | não comprovada |
| G19 | piso de interface: texto em `y = 100` no story / logo invadindo o rodapé / a mesma peça em `feed` / texto com caixa original na faixa livre mas girado 90° em torno da origem invadindo o topo / logo com transformação não suportada | reprova / reprova / não se aplica / reprova (limites girados) / não comprovada |
| G20 | copy: cada estado da tabela 4.4 + `copy` ausente | conforme |
| G21 | oclusão (sem rotação): `shape` com `order` maior intersectando um texto → `naoMedidos.oclusao`; `order` igual → idem; `shape` abaixo → nada; `shape` acima sem intersecção → nada; `gradient` E `gradient2` acima, COM e SEM `metadata.tratamentoDeTexto` → oclusão (sem exceção); gradiente de leitura abaixo (ordem normal) → nada; imagem que não é o fundo acima → oclusão; foto de fundo com `order >=` ao de um texto → oclusão; texto sobre texto, ambos com métrica e sem rotação → nada (é `colisao`); logo SOLTA acima de texto COM métrica, `logo-sobre-texto` `avaliada` → nada (par comprovado); logo em GRUPO acima de texto → oclusão; logo solta acima de texto em `textosSemMetrica` → oclusão; logo solta com `logo-sobre-texto` `parcial`/`nao-avaliada` → oclusão; `motivoSemMedida` presente → a exceção de texto e a de logo não valem; texto oculto (`visible: false`) sob uma forma → nada; `cobertura.oclusao` = `comprovada` só com a lista vazia | conforme |
| G21b | rotação e transformação: forma 600×40 em (400, 500) girada 90° (caixa original y 500–540) sobre texto em x 370–390 × y 600–700 → oclusão pelos limites conservadores (render ocupa x 360–400 × y 500–1100; a caixa original não intersecta); a mesma forma girada com `order` ABAIXO do texto → nada; texto girado 15° acima de outro texto → oclusão (a exceção de texto não vale); logo solta girada acima de texto com métrica → oclusão (a exceção de logo não vale); `shape` com `style.mask` acima de texto cuja caixa intersecta → oclusão (o recorte não é prova); `shape` com `flipH` → limites iguais à caixa; camada com chave de geometria fora da lista conhecida → `transformacao-nao-suportada`/`NAO_MEDIDO` ANTES do teste de caixa | conforme |
| G21c | paridade com o render REAL: forma opaca 600×40 em (400, 500) com rotação 0/30/90/180/270 renderizada pelo renderizador do servidor; todo pixel pintado está dentro de `limitesDe(l)` (limites conservadores contêm o desenho); e para 90° os limites são exatamente x 360–400 × y 500–1100 | conforme |
| G22 | `pageVersion: null` com as 11 regras comprovadas e o resto limpo | `IDENTIDADE_ILEGIVEL`, `cobertura.identidade = nao-comprovada`, `REVISAO_HUMANA_NECESSARIA` (ver G28) |
| G23 | `REGRAS_CRITICAS ∪ NAO_CRITICAS === REGRAS_DA_REVISAO` (sem sobra nem falta) | fixa a classificação |
| G23b | snapshot das chaves de `Layer` e `LayerStyle` que o gate classifica (suportadas: `rotation`, `flipH`, `flipV`, `mask`; o resto não é geometria); chave de geometria nova no tipo → o teste falha e exige classificação | fixa a lista |
| G24 | o relatório REAL da fixture do piloto (`piloto-2026-10-13`, medida sintética a partir de `composicaoRegistrada.contraste`, serviço `ok: false`) | `REVISAO_HUMANA_NECESSARIA` com `texto-sem-leitura:servico` — o mesmo contrato alvo que `piloto-portao` descreve, sem tocar nos `hojeViola` |
| G25 | `copyVersionDe`: `null` → `'sem-contrato'`; mesma copy com chaves em outra ordem → mesmo hash; copy diferente → hash diferente | puro |
| G26 | `foraDaInterface` de produção, casos independentes: texto com `y = 187` reprova e `y = 188` passa; logo com base em `canvas.height − 223` reprova e `− 224` passa; cliente MENOS restritivo (`topo: 100`) não afrouxa (continua 188); cliente MAIS restritivo (`topo: 300`) aperta; camada oculta não conta. O oráculo dos testes passa a importar a de produção e os testes do CP0 seguem verdes | conforme |
| G27 | ISOLADO: as 11 regras críticas comprovadas, oclusão limpa, piso satisfeito, identidade válida, e `copy` AUSENTE (depois: `sem-contrato`) | `REVISAO_HUMANA_NECESSARIA` só por `copy-completa` (`motivos` com um item) |
| G28 | ISOLADO: as 11 comprovadas, copy `sem-mudanca`, piso ok, e `pageVersion: null` | `REVISAO_HUMANA_NECESSARIA` só por `identidade` |
| G29 | ISOLADO: as 11 comprovadas, copy ok, identidade ok, story com um texto em `y = 100` | `REVISAO_HUMANA_NECESSARIA` só por `piso-de-interface`; a mesma peça em `feed` → `APTO` |

Nenhum `hojeViola` muda. Gates do PR: suíte completa, typecheck, lint, `git diff --check`,
`validar-registro-mcp` (nenhum schema de tool muda), `validar-oauth-mcp`.

---

## 8. Arquivos (o que o CP5a toca)

- novo `src/lib/creatives/revisao/gate.ts` (puro): `REGRAS_CRITICAS`, `gateDaMedida`, `cenariosNaoMedidos`, `limitesDe`,
  `foraDaInterface`, `PISO_DE_INTERFACE_DO_STORY`, `interfaceDoStory`, `POLITICA_DO_ASSUNTO_RECOMENDADA`;
- `src/lib/creatives/revisao/versao.ts`: `copyVersionDe` (puro);
- `src/lib/direcao-de-arte/__tests__/suporte/propriedades.ts`: passa a importar `foraDaInterface` e o piso de
  `gate.ts` (um só lugar com 188/224);
- novo `src/lib/creatives/revisao/__tests__/gate.test.ts`;
- docs: `docs/regras/revisor-da-arte.md` § CP5a; este contrato com a nota "implementado no PR …".

Não toca: `agendar-itens.ts`, `agendamento.ts`, `arte-rapida.ts`, `regras.ts` (nenhuma regra nova no
revisor), `contrato.ts` (nenhuma regra em `REGRAS_DA_REVISAO`), MCP, Generation, `hojeViola`.

---

## 9. Decisões pendentes do owner

| # | Decisão | Recomendação | O que muda se decidir o contrário |
|---|---|---|---|
| 9.1 | **Assunto estimado (caso B)**: `humano` ou `comprova` (decisão 1 do plano-mestre) | `humano` até o piloto sintético medir a concordância estimado × catálogo; a política é um parâmetro, a promoção é um PR de uma linha com teste | com `comprova`, toda peça com foto texturizada e texto fora do assunto estimado vira `APTO` já no CP5c — mais autonomia, risco de aprovar texto sobre assunto que o mapa de calma não viu |
| 9.2 | **Oclusão**: (B) no CP5a — corrigida pela revisão do owner (sem exceção de gradiente; rotação por limites conservadores; transformação não suportada → `NAO_MEDIDO`; exceção de logo com prova positiva) — com a meta de falsos bloqueios para disparar (A) no CP5b (decisão 2) | (B) corrigida agora; (A) só se o piloto sintético mostrar > 10 % de peças bloqueadas SÓ por oclusão | ir direto a (A) adia o CP5a (precisa da régua, render e custo) |
| 9.3 | **`rulesVersion`** (decisão 7, CP5b): bump manual por PR que muda regra × hash das regras | hash: `sha256` do fonte de `regras.ts` + `gate.ts` em build não é viável; proposta prática: constante `VERSAO_DAS_REGRAS` com bump OBRIGATÓRIO conferido por teste de snapshot do relatório da fixture do piloto (mudou o relatório → o teste exige o bump) | o CP5a só copia a versão; a decisão não bloqueia este checkpoint |
| 9.4 | **Copy completa em página sem `copyAutoral`** (`sem-contrato`): humano (fail-closed, doc antigo) ou "não se aplica" para páginas que nunca tiveram contrato. **Afeta o CP5a** (a regra `copy-completa` é do gate e condição de APTO, invariante 1), não só o CP5b | humano, como o doc antigo; a maior parte das artes do Dot nasce com contrato (`compor-leva` grava `copyAutoral`) | "não se aplica" abre a porta para o agente agendar artes legadas sem a reconciliação; mudaria o CP5a (a tabela 4.4 e G20/G27); se o owner quiser, que seja por decisão expressa antes da implementação, com aviso na saída |
| 9.5 | **Sem logo solta** = comprovada com aviso (doc antigo) ou humano | comprovada com aviso: a ausência de logo é decisão de composição, não defeito medido | humano bloquearia toda peça que o compositor fez sem logo por desenho |
| 9.6 | **`texto-pequeno` crítica** (nova em relação ao doc antigo, que não a listava): sim | sim: o CP4.2 tornou o piso medido e a manchete protegida; achado `aviso` medido reprova | fora das críticas, uma headline de 25 px em 1080 seria `APTO` |

Nada disto está decidido aqui. **O CP5a não fixa padrão para 9.1**: a política é parâmetro obrigatório de
`gateDaMedida`, a constante recomendada é uma proposta nomeada, e os testes cobrem os dois ramos; quem for
chamar (CP5c) passa a política que o owner decidir — a decisão fica registrada no contrato do CP5c, não
presumida aqui (Codex R1). Para 9.2, 9.4, 9.5 e 9.6 o CP5a implementa a recomendação (oclusão B corrigida;
copy sem contrato → humano; sem logo solta → aviso; `texto-pequeno` crítica) porque ela é o lado fail-closed
ou a única opção sem nova medição — **9.4 já é decisão do CP5a**, porque muda o gate; só 9.3 (versionamento)
fica para o CP5b. Recomendações mantidas na proposta: estimado → humano; foto lida sem assunto → não se
aplica; política do assunto explícita, sem padrão silencioso.

---

## 10. Fora do CP5a (dito para não parecer garantia)

- Nenhum caminho de produção chama o gate: `agendar-leva` continua criando DRAFT sem veredito (CP5c);
  `ajustar-arte` continua só com a não-piora (CP5d); nada é persistido (CP5b).
- O gate não protege o fluxo humano (warn-only por decisão do owner) nem o perfil `normal` do Dot.
- A oclusão por (B) não mede opacidade nem máscara; (A) é CP5b.
- O piloto sintético (plano-mestre 4.8) é quem mede a taxa de bloqueio por regra; o CP5a não tem número.
