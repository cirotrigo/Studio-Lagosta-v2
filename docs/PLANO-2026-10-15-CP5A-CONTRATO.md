# CP5a — contrato técnico do VEREDITO PURO (proposta para revisão, 15/10/2026, noite)

**Estado: PROPOSTA PARA REVISÃO. Nada implementado.** Base: `main` `01f3c3be` (merge do CP4.2, PR #235).
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
| Entrada | medida inteira + relatório + identidade | idem | `MedidaDaPeca` (`revisar-arte.ts`, `Omit<EntradaDaRevisao, 'vistos'\|'motivoSemVisao'\|'marcas'>`), `avaliarPeca(medida)` → `RelatorioDaRevisao`; identidade = `versaoDaPagina` (sem áudio) + hash do `copyAutoral` (só em testes) | seção 2: medida + relatório + camadas + identidade + opções. **O relatório não basta**: só a medida traz `assunto.origem`, `contraste`, `pioras`, `leituraDaLogo`, `motivoSemMedida`, `textosSemMetrica` |
| `texto-sobre-assunto` | comprova SÓ com catálogo; sem assunto → humano | o doc não conhecia `naoSeAplica` (CP4.1); política por caso A–E é a decisão 1 | `CoberturaDaRegra.naoSeAplica` existe (`contrato.ts:87`); `assunto.origem: 'catalogo' \| 'estimado'`; tetos 0,25 (catálogo) e 0,40 (estimado) em `mapa-de-calma.ts:175-177`; **o assunto sai das camadas efetivas** (CP4.2, revisão do owner) | seção 5: política por caso, parametrizada (`politicaDoAssunto`), com a recomendação; o CP5a implementa os cinco casos e testa cada um |
| Oclusão | não tratada | lacuna crítica; (B) detecção do cenário no CP5a, (A) medição no CP5b; decisão 2 | `regras.ts` não lê `Layer.order`; mede só `text`/`rich-text` visíveis, a foto de fundo (`fotoDeFundo`) e as logos soltas (`logosDaPeca`); `shape`/`icon`/`element`/`video`/`gradient2`/imagem que não é fundo são invisíveis; a régua (`regua.ts:342`, `semTinta`) renderiza as camadas ACIMA do texto como fundo | seção 6: (B) como função pura `cenariosNaoMedidos(camadas, canvas)` no CP5a — toda camada não-texto visível com `order` maior que o de um texto visível cuja caixa intersecta a dele → `REVISAO_HUMANA_NECESSARIA`; gradientes de leitura e a foto de fundo são exceções enumeradas |
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
`fotoDeFundo`, `logosDaPeca`, `ehGradienteDeLeitura` da régua ou equivalente puro). Regra do
`AGENTS.md`: módulo testável sem banco não importa `@/lib/db`.

### 2.2 Entrada

```ts
export interface EntradaDoGate {
  /** A medida completa (o que `medirCamadasDaPeca` devolve): SEM visão. */
  medida: MedidaDaPeca
  /** `avaliarPeca(medida)` — calculado por quem chama (o gate não recalcula, para a prova citar o mesmo relatório). */
  relatorio: RelatorioDaRevisao
  /** As camadas MEDIDAS (as mesmas de `medida.camadas`), para a oclusão (seção 6) e o piso de interface (4.3). */
  camadas: Layer[]
  canvas: { width: number; height: number }
  formato: 'story' | 'feed' | 'quadrado' | null
  /** Identidade da página medida — copiada para a saída; o gate não a valida (CP5c compara sob trava). */
  identidade: { pageVersion: string | null; copyVersion: string }
  /**
   * Copy completa (seção 4.4): o resultado de `revisaoDaPaginaComCamadas(page.copyAutoral, page.layers,
   * { autor: 'sistema', motivo: 'gate', superficie: 'gate' })`, calculado por quem chama sobre a MESMA leitura.
   * `undefined` = quem chama não conferiu → a regra `copy-completa` sai NÃO COMPROVADA (fail-closed), nunca omitida.
   */
  copy?: { estado: RevisaoDaPagina['estado']; lacunas: string[] }
  /** Política do assunto (seção 5) e da oclusão (seção 6). Sem opções = a política RECOMENDADA. */
  opcoes?: {
    politicaDoAssunto?: PoliticaDoAssunto
    oclusao?: 'detectar' | 'ignorar'
  }
}
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
  /** Por regra CRÍTICA (seção 3): o estado que o gate viu. É a prova; nunca omite uma crítica. */
  cobertura: Record<RegraCritica, CoberturaDoGate>
  /** Só o que DECIDIU contra a peça (vazio quando APTO). */
  motivos: MotivoDoGate[]
  /** Achados críticos MEDIDOS (regra, camadas, id) — os que reprovam. Vazio quando APTO. */
  achados: Array<{ regra: RegraCritica; camadas: string[]; id: string; severidade: Severidade }>
  /** O que o gate NÃO vê e diz (seção 6 e 4.2): camadas não-texto acima de texto, textos sem métrica, logo sem contrato… */
  naoMedidos: Array<{ regra: RegraCritica | 'oclusao' | 'geometria'; motivo: string; camadas: string[] }>
  /** Nunca bloqueiam, nunca somem: "peça sem logo solta", "assunto estimado sem sobreposição (política …)". */
  avisos: string[]
}

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

1. `resultado === 'APTO'` ⇔ `motivos.length === 0` ⇔ toda crítica está `comprovada` ou `nao-se-aplica`,
   `naoMedidos` vazio, `achados` vazio.
2. A ordem de `motivos` é determinística (pela ordem de `REGRAS_CRITICAS`, depois oclusão, copy, piso,
   identidade) — mesma entrada, mesma saída, byte a byte (`JSON.stringify` igual).
3. A saída não contém o relatório nem a medida (sem duplicar o que já existe; o CP5c anexa o relatório
   na resposta ao agente, como o doc antigo § 13 descreve).
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

Mais três conferências que NÃO são regra do revisor e por isso têm entrada própria (seção 4.3–4.5):
**piso de interface** (story), **copy completa** e **oclusão**.

`texto-pequeno` entra como crítica porque o CP4.2 fez a manchete medida por componente
(`texto-pequeno:<camada>:modelo|hierarquia|celular`, severidade `aviso`, `certeza: 'medida'`): achado
medido reprova (predicado 4.1). Apoio/serviço abaixo do piso já eram achados `problema`/`aviso` medidos.

---

## 4. Critérios de cobertura (o que COMPROVA)

### 4.1 Achado crítico — predicado executável

```
achadoCritico(a) = REGRAS_CRITICAS.includes(a.regra) && a.certeza === 'medida'
```

Qualquer severidade. `certeza: 'estimada'` em regra crítica NÃO reprova por si: torna a regra
**não comprovada** (motivo "achado só estimado em <regra>: <id>") — o humano decide. `certeza: 'visao'`
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
nunca menos). O gate aplica só com `formato === 'story'`: texto visível ou logo solta com
`position.y < topo` ou `y + height > canvas.height − rodape` → motivo `piso-de-interface` / `ACHADO_CRITICO`
com as camadas. A geometria de composição do projeto (`assinatura.geometria.story`, 250/350 na peça
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
export const POLITICA_DO_ASSUNTO_RECOMENDADA: PoliticaDoAssunto = { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' }
```

| Caso | Medida | Veredito da regra | Observação |
|---|---|---|---|
| A. catálogo | `assunto.origem === 'catalogo'` | sem achado → **comprovada**; achado (`certeza: 'medida'`, cobertura > 0,25) → **reprovada** | o caso mais seguro; raro até o acervo ter caixas de assunto |
| B. estimado | `assunto.origem === 'estimado'` | `estimado: 'humano'` (recomendado): **não comprovada** sempre — motivo "assunto só estimado pela textura"; com achado estimado o motivo cita o achado. `estimado: 'comprova'`: sem achado → comprovada; achado (> 0,40) → reprovada | a promoção para `'comprova'` depende do piloto sintético (concordância estimado × catálogo); decisão 9.1 |
| C. foto lida, sem assunto | `assunto === null` e `assuntoNaoSeAplica === true` e `fotoDeFundo(camadas)` existe | `semAssuntoLocalizavel: 'nao-se-aplica'` (recomendado): **não se aplica** (não bloqueia; aviso "foto sem assunto localizável"). `'humano'`: não comprovada | ganho de autonomia em fundos lisos; risco: assunto real de baixo contraste |
| D. falha ao analisar | `assunto === null`, `motivoSemAssunto` presente, SEM `assuntoNaoSeAplica` | **não comprovada** (fail-closed), motivo = `motivoSemAssunto` | nunca configurável |
| E. sem foto de fundo | `fotoDeFundo(camadas, canvas) === null` (a cobertura vem `naoSeAplica` com "a peça não tem foto de fundo") | **não se aplica** | sempre, independe da política |

O gate NÃO recalcula sobreposição: confia no achado do revisor (que já aplica os tetos) e na origem da
medida. Um teste fixa que o caso C exige `fotoDeFundo` presente — `naoSeAplica` sem foto é E, com foto é C;
e que D nunca vira C por nenhuma opção.

---

## 6. Estratégia de oclusão — (B) detecção do cenário não comprovável, no CP5a

Função pura em `gate.ts`:

```ts
export function cenariosNaoMedidos(camadas: Layer[], canvas): Array<{ texto: string; acima: string[]; tipo: LayerType }>
```

Regra: para cada texto VISÍVEL `t` (`ehTextoVisivel`), toda camada `c` visível, `c !== t`, com
`c.order > t.order` (empate de `order` conta como ACIMA — fail-closed), cuja caixa (`position`/`size`,
sem rotação) intersecta a de `t` em área > 0, e que NÃO seja:

- a foto de fundo (`fotoDeFundo(camadas, canvas)`) — ela está abaixo por construção e, se tiver `order`
  maior que um texto, É oclusão (não é exceção: só a instância devolvida por `fotoDeFundo` com `order`
  menor que o do texto fica de fora — na prática a regra geral já cobre);
- um gradiente de leitura (`type === 'gradient'` com `metadata.tratamentoDeTexto === 'gradiente-de-leitura'`,
  o mesmo predicado da régua); outros `gradient`/`gradient2` acima de texto CONTAM;
- outro texto (`text`/`rich-text`): texto sobre texto é `colisao`, já medida;

→ entra em `naoMedidos` com `regra: 'oclusao'` e vira motivo `NAO_MEDIDO` → `REVISAO_HUMANA_NECESSARIA`.
Tipos alcançados: `shape`, `icon`, `element`, `image` (que não é o fundo), `video`, `logo` (uma logo
acima de um texto que intersecta já é `logo-sobre-texto` — o gate deixa a regra decidir e NÃO duplica:
logo é exceção quando `logo-sobre-texto` está comprovada ou reprovada; vira oclusão só quando aquela regra
não comprovou).

Por que (B) e não (A) agora: é uma função sobre `Layer[]`, sem render, sem custo, e nunca aprova em
silêncio. O que ela NÃO faz (dito): não mede opacidade (`style.opacity`), nem `fill` transparente, nem
máscara — uma forma transparente acima do texto bloqueia a peça. Se o piloto sintético mostrar falsos
bloqueios demais (meta na seção 9.2), o CP5b implementa (A): render do texto sem as camadas acima × com
elas, pela própria régua.

Ligação com o compositor (plano-mestre 4.3): o acento do T1b precisa entrar com `order` abaixo dos
textos e `metadata.compositor` identificável, senão cai em (B). `opcoes.oclusao: 'ignorar'` existe só para
os testes isolarem as outras regras; nunca é o padrão.

---

## 7. Matriz de testes (`src/lib/creatives/revisao/__tests__/gate.test.ts`, puros)

Fixtures: `medida()` sintética (como `regras.test.ts` monta `EntradaDaRevisao`) + `avaliarPeca(medida)`
real para o relatório — o gate é testado sobre o relatório que o revisor de verdade produz, sem render.

| # | Caso | Esperado |
|---|---|---|
| G1 | peça limpa: 3 textos, foto de fundo com assunto de catálogo sem sobreposição, logo solta `medida`, régua presente, copy `sem-mudanca`, story dentro do piso | `APTO`; `cobertura` toda `comprovada`/`nao-se-aplica`; `motivos`, `achados`, `naoMedidos` vazios |
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
| G14 | assunto B (estimado) sem achado: política recomendada → não comprovada; `estimado: 'comprova'` → comprovada; com achado estimado e `'comprova'` → reprovada | conforme |
| G15 | assunto C (`naoSeAplica`, foto presente): recomendada → não se aplica + aviso; `'humano'` → não comprovada | conforme |
| G16 | assunto D (`motivoSemAssunto` sem a marca) | não comprovada, independente da política (as 4 combinações) |
| G17 | assunto E (sem foto de fundo) | não se aplica, independente da política |
| G18 | `naoSeAplica` numa crítica fora do mapa (ex.: forjado em `colisao`) | não comprovada |
| G19 | piso de interface: texto em `y = 100` no story / logo invadindo o rodapé / a mesma peça em `feed` | reprova / reprova / não se aplica |
| G20 | copy: cada estado da tabela 4.4 + `copy` ausente | conforme |
| G21 | oclusão: `shape` com `order` maior intersectando um texto → `naoMedidos.oclusao`; `order` igual → idem; `shape` abaixo → nada; `shape` acima sem intersecção → nada; gradiente de leitura acima → nada; `gradient` comum acima → oclusão; imagem que não é o fundo acima → oclusão; texto sobre texto → nada (é `colisao`); logo acima com `logo-sobre-texto` comprovada → nada; `opcoes.oclusao: 'ignorar'` → nada | conforme |
| G22 | `pageVersion: null` | `IDENTIDADE_ILEGIVEL` |
| G23 | `REGRAS_CRITICAS ∪ NAO_CRITICAS === REGRAS_DA_REVISAO` (sem sobra nem falta) | fixa a classificação |
| G24 | o relatório REAL da fixture do piloto (`piloto-2026-10-13`, medida sintética a partir de `composicaoRegistrada.contraste`, serviço `ok: false`) | `REVISAO_HUMANA_NECESSARIA` com `texto-sem-leitura:servico` — o mesmo contrato alvo que `piloto-portao` descreve, sem tocar nos `hojeViola` |
| G25 | `copyVersionDe`: `null` → `'sem-contrato'`; mesma copy com chaves em outra ordem → mesmo hash; copy diferente → hash diferente | puro |
| G26 | `foraDaInterface` de produção ≡ a do oráculo (o oráculo passa a importar a de produção; um teste do CP0 continua verde) | paridade |

Nenhum `hojeViola` muda. Gates do PR: suíte completa, typecheck, lint, `git diff --check`,
`validar-registro-mcp` (nenhum schema de tool muda), `validar-oauth-mcp`.

---

## 8. Arquivos (o que o CP5a toca)

- novo `src/lib/creatives/revisao/gate.ts` (puro): `REGRAS_CRITICAS`, `gateDaMedida`, `cenariosNaoMedidos`,
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
| 9.2 | **Oclusão**: (B) no CP5a com a meta de falsos bloqueios para disparar (A) no CP5b (decisão 2) | (B) agora; (A) só se o piloto sintético mostrar > 10 % de peças bloqueadas SÓ por oclusão | ir direto a (A) adia o CP5a (precisa da régua, render e custo) |
| 9.3 | **`rulesVersion`** (decisão 7, CP5b): bump manual por PR que muda regra × hash das regras | hash: `sha256` do fonte de `regras.ts` + `gate.ts` em build não é viável; proposta prática: constante `VERSAO_DAS_REGRAS` com bump OBRIGATÓRIO conferido por teste de snapshot do relatório da fixture do piloto (mudou o relatório → o teste exige o bump) | o CP5a só copia a versão; a decisão não bloqueia este checkpoint |
| 9.4 | **Copy completa em página sem `copyAutoral`** (`sem-contrato`): humano (fail-closed, doc antigo) ou "não se aplica" para páginas que nunca tiveram contrato | humano, como o doc antigo; a maior parte das artes do Dot nasce com contrato (`compor-leva` grava `copyAutoral`) | "não se aplica" abre a porta para o agente agendar artes legadas sem a reconciliação; se o owner quiser, que seja por opção explícita e com aviso |
| 9.5 | **Sem logo solta** = comprovada com aviso (doc antigo) ou humano | comprovada com aviso: a ausência de logo é decisão de composição, não defeito medido | humano bloquearia toda peça que o compositor fez sem logo por desenho |
| 9.6 | **`texto-pequeno` crítica** (nova em relação ao doc antigo, que não a listava): sim | sim: o CP4.2 tornou o piso medido e a manchete protegida; achado `aviso` medido reprova | fora das críticas, uma headline de 25 px em 1080 seria `APTO` |

Nada disto está decidido aqui. Sem resposta, o CP5a implementa a recomendação de cada linha e a
registra como "política recomendada, a confirmar".

---

## 10. Fora do CP5a (dito para não parecer garantia)

- Nenhum caminho de produção chama o gate: `agendar-leva` continua criando DRAFT sem veredito (CP5c);
  `ajustar-arte` continua só com a não-piora (CP5d); nada é persistido (CP5b).
- O gate não protege o fluxo humano (warn-only por decisão do owner) nem o perfil `normal` do Dot.
- A oclusão por (B) não mede opacidade nem máscara; (A) é CP5b.
- O piloto sintético (plano-mestre 4.8) é quem mede a taxa de bloqueio por regra; o CP5a não tem número.
