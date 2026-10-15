# CP4.2 — contrato técnico: piso da manchete e `slotValues` inválidos (15/10/2026)

**Estado: PROPOSTA PARA REVISÃO. Nada implementado.** Base: `main` `b86cf5a8` (merge do PR #234; contém
CP0→CP4.1 e o plano-mestre). Este documento fecha o contrato das duas dívidas que o plano-mestre
(`docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md`, seção 3) reservou ao CP4.2 — e só delas. Os
números de linha são do commit `b86cf5a8`.

Vocabulário: **corpo** = `fontSize` da camada; **corpo1080** = corpo normalizado para 1080 px de largura
(`fontSize / s`, `s = canvas.width / 1080`); **referência** = o corpo que o modelo (variante da assinatura
casada por papel, ou página-modelo casada por id) usa para aquela camada
(`referencias[id].fontSize1080`); **piso** = o menor corpo1080 que a regra aceita; **base** = as camadas
da página antes do ajuste (já com os textos/foto da chamada e o autofix deles); **candidata** = a base
com o ajuste aplicado e o autofix geométrico, isto é, o que seria gravado.

---

## Parte A — CP4.2a: piso da manchete (`headline` / `headline2`)

### A.1 Estado real (conferido)

| O que | Onde | Como é hoje |
|---|---|---|
| Títulos identificados | `src/lib/creatives/revisao/regras.ts:1059-1071` (`idsDeTitulo`) | por PAPEL (`papelDaCamada` = `metadata.compositor.papel`, id ou nome ∈ `PAPEIS_DA_PECA`: `headline`/`headline2`); sem papel, por TAMANHO: com ≥ 2 textos medidos, o maior é título se `fontSize ≥ 1,5 × segundo` |
| Regra 9 `texto-pequeno` | `regras.ts:1155-1176` | `if (idsDeTitulo.includes(m.layerId) …) continue` — títulos **pulados**. Para os demais: `piso = ref ? (ref ≥ 24 ? max(24, 0,8·ref) : 0,8·ref) : 24`; achado se `corpo1080 < piso − 0,5`; evidência `{ corpo1080, piso1080, referencia1080 }` **arredondada** (`Math.round`, `regras.ts:1169-1170`) — por isso a não-piora tolera 1 px; severidade `aviso` para `servico`, `sugestao` para o resto; sugere `fonte` com `fontSize = ceil(piso·s)` |
| Constantes | `regras.ts:220-227` (`LIMITES_DA_REVISAO`) | `pisoDeFonte1080 = 24`, `pisoRelativo = 0,8`, `tituloRelativo = 1,15`, `tituloAlturaSugestao = 0,2`, `tituloAlturaAviso = 0,27` |
| Regra 7 `titulo-grande` | `regras.ts:1072-1125` | `razao = max(corpo1080 / ref)` entre os títulos; acusa se `razao > 1,15` ou fração da altura útil > 0,2; sugere `fonte` com uma ESCALA sobre o corpo ATUAL, limitada por baixo a `max(razao>1,15 ? 0,5 : 0,8, 24 / corpoMinimo)` — é uma escala mínima do corpo atual (um título em 140 pode receber escala 0,5 → 70), **não** "50 % da referência" |
| Referência por camada | `src/lib/creatives/revisao/revisar-arte.ts:166-225` (`referenciasDaPagina`) | variante da assinatura casada por PAPEL (papel repetido casa pela ordem vertical; contagens diferentes não casam), senão página-modelo casada por ID; peça com arranjo de combinação **fica sem referência** (de propósito) |
| Escada do compositor | `src/lib/compositor/blocos.ts:308-320` | a unidade manchete + segunda voz desce em degraus até o piso de **80 % da assinatura**; com arquétipo, `escalaMaxima ≤ 1` sobre `escalaDoFormato`; o piso continua 80 % |
| Hierarquia | `src/lib/compositor/arquetipos/pontuacao-espacial.ts:141-149`; `direcao-de-arte/__tests__/suporte/propriedades.ts:381-401` | só ESTRUTURAL (quem estava acima continua acima); a escala (`K_REFERENCIA_HIERARQUIA = 1,25`, H1 / maior secundário) é **telemetria — "NUNCA reprova (o owner decidiu que não há K como hard gate)"** |
| Não-piora | `src/lib/creatives/revisao/nao-piora.ts:57, 74, 172-178` | `texto-pequeno` ∈ `PROPRIEDADES` e `REGRAS_COMPARADAS`; gravidade `max(0, piso1080 − corpo1080)`, tolerância 1 px; chave do achado = `a.id` (um por camada) |
| Executor | `src/lib/creatives/revisao/ajustar-sem-piorar.ts:61-70, 120-130` | mede base e candidata com `corrigir: false`; a candidata passa pelo autofix geométrico ANTES da medida (o que ele mexeu vai dito em `autocorrecao`) |
| Autofix geométrico | `src/lib/creatives/text-autofix.ts:7-9, 154, 185-200` | reduz `fontSize` em passos de 4 % do corpo DE ENTRADA, até o piso `max(0,8 × entrada, 24·s)` — ou seja, sozinho nunca passa de 80 % da entrada, mas **um ajuste `escala 0,5` seguido do autofix chega a 40 % da base** |
| Ajuste `fonte` | `revisao/contrato.ts:109-110`; `aplicar-ajustes.ts:357-378` | `fontSize ∈ [8, 600]`, `escala ∈ [0,5, 2]`; aplica a todas as camadas pedidas; rich-text escala os trechos pela mesma razão |

Consequência hoje: um ajuste `fonte` (direto) ou a composição ajuste + autofix pode levar a manchete a
8 px sem que `texto-pequeno` acuse; só colisão/safe area/leitura ainda a protegem. A regra 7 fala só do
lado "grande".

### A.2 Proposta recomendada — a fórmula

**Um só piso para título, com três componentes que JÁ existem; nenhuma constante nova:**

```
pisoDoTitulo1080(id) = max(
  pisoRelativoDoTitulo(id),        // (1) o modelo: 0,8 × referência — a MESMA escada do compositor e dos não-títulos
  maiorCorpoSecundario1080 × 1,0,  // (2) a hierarquia: o título nunca fica MENOR que o maior apoio/serviço/cta
  pisoAbsoluto(id)                 // (3) o celular: 24 px em 1080, como hoje — salvo modelo discreto (abaixo)
)
```

- **(1) O modelo.** `referencia = referencias[id].fontSize1080` (`referenciasDaPagina`). Com referência:
  `pisoRelativo × referencia` = **0,8 × ref** (o mesmo `LIMITES_DA_REVISAO.pisoRelativo` dos não-títulos e o
  mesmo "piso de 80 % da assinatura" da escada do compositor — `blocos.ts:310-320`). É a resposta a "não
  inventar um mínimo universal": o mínimo é o do modelo, como já é para apoio e serviço.
- **(2) A hierarquia.** O título tem de continuar **maior ou igual** ao maior corpo1080 entre os textos
  visíveis que NÃO são título (apoio, serviço, cta, pre). Fator **1,0** — não é `K_REFERENCIA_HIERARQUIA`
  (1,25), que continua telemetria e nunca reprova; é só "a hierarquia não se inverte", a mesma noção
  estrutural de `pontuacao-espacial.ts:141-149` levada ao corpo. `headline2` (a segunda voz da unidade)
  entra no mesmo conjunto de títulos e é comparado contra os mesmos secundários.
- **(3) O celular.** `pisoDeFonte1080 = 24`, como hoje, **quando a referência é ≥ 24 ou não existe**.
  Modelo deliberadamente discreto (referência < 24): o piso é só `0,8 × ref` — exatamente o ramo que a
  regra 9 já tem para os não-títulos (`regras.ts:1160`: "modelo que já nasceu miúdo é desenho da equipe:
  só o recuo de 80 % conta") — e a hierarquia (2) continua valendo.

Sem referência (peça com arranjo de combinação, página feita à mão sem modelo, assinatura sem a camada
do papel): (1) não existe; valem (2) e (3). **No fluxo de ajuste, a BASE vira a referência, fixada no
CONTEXTO antes do lote**: o executor (`ajustar-sem-piorar.ts`) lê a entrada UMA vez e grava em
`ContextoDaMedicao` (a) `referencias[id] = { fontSize1080: corpoDaEntrada, origem: 'página como está' }`
para todo título **sem referência OU com referência `inferida: true`** (o fallback 16 do modelo nunca vira
piso: é substituído pela base no executor) e (b) `titulosFixados` (A.3); as duas coisas valem para TODAS as medidas
do lote (entrada, cada candidata, catraca contra a entrada) e não são recalculadas por estado — assim dois
ajustes de 15 % no mesmo lote somam 28 % contra a MESMA referência e o segundo é recusado, e "headline →
50 % da referência" é recusa mesmo sem modelo. No `revisar-arte` solto só (2) e (3) se aplicam, com a
cobertura dizendo `parcial: título sem referência de modelo`.

**Tolerância:** a não-piora compara a gravidade (`piso1080 − corpo1080`, inteiros pelo arredondamento da
evidência) com tolerância de 1 px (`TOLERANCIA_PX`, `nao-piora.ts`). Isso vale igual para o título: um
título JÁ abaixo do piso pode perder até 1 px por arredondamento sem ser "piora" — o mesmo que apoio e
serviço hoje; qualquer redução além disso é piora. Sem exceção nova no comparador.

Referência inválida: hoje `referenciasDaPagina` NÃO produz `NaN` — a camada do modelo sem `fontSize`
numérico recebe o fallback `16` (`revisar-arte.ts:173`, `doTexto`), que viraria uma referência "legítima"
de 16 px e um piso de 12,8 px para a manchete. Contrato: `referenciasDaPagina` passa a marcar
`inferida: true` quando usou o fallback, e o piso do título trata referência inferida como AUSENTE
(componente (1) fora, cobertura `parcial`, motivo "referência do título sem corpo no modelo"); nunca
como piso de 12,8. Os não-títulos continuam como hoje (fora do escopo).

**Onde mora:** a regra 9 ganha um ramo para `idsDeTitulo` em vez do `continue` — mesma regra
`texto-pequeno`, mesma evidência (`corpo1080`, `piso1080`, `referencia1080`) mais `componente:
'modelo' | 'hierarquia' | 'celular'` (qual das três ganhou) e `maiorSecundario1080`. Severidade **`aviso`**
para título (hoje `servico` é `aviso` e o resto `sugestao`): a manchete é a hierarquia da peça. Sugestão
de correção: `fonte` com `fontSize = ceil(piso × s)`, como já é. Como `texto-pequeno` já está em
`REGRAS_COMPARADAS` e a gravidade é `piso − corpo`, **o não-piorar herda tudo sem mudar o comparador**:
o achado que APARECE na candidata é piora; o que piora (corpo mais baixo) é piora; o que melhora é
melhora. Reduzir até 8 px: gravidade `piso − 8`, recusa; 50 % da referência: `0,8·ref − 0,5·ref = 0,3·ref`,
recusa; −10 % com hierarquia preservada: sem achado, entra.

### A.3 A classificação não pode escapar pela redução

Hoje `idsDeTitulo` é recalculado em cada medida. Um título INFERIDO por tamanho (sem papel) que seja
reduzido abaixo de 1,5× do segundo deixa de ser título na candidata — e seria julgado como não-título
(piso 24, ou 0,8 × sua própria referência de não-título), escapando da proteção. Contrato:

- `EntradaDaRevisao` ganha `titulosFixados?: string[]`. Quando presente, `idsDeTitulo` = essa lista
  (interseção com as camadas medidas), sem inferência. O executor (`ajustar-sem-piorar.ts`) calcula os
  títulos UMA vez, na base, e passa a mesma lista para a medida da candidata. Títulos por PAPEL já são
  estáveis (o papel não muda com o corpo); a fixação protege os inferidos.
- Um título inferido que, na candidata, deixa de satisfazer 1,5× do segundo NÃO perde a proteção; e,
  se cair abaixo do maior secundário, o componente (2) acusa — a inversão de hierarquia É a piora.
- Caso inverso: um secundário que o ajuste AUMENTA não vira título na candidata (a lista é a da base); se
  ele passar do corpo do título fixado, o componente (2) do título acusa — a inversão de hierarquia é
  piora do título, não "promoção" do secundário. Se a base NÃO tinha título identificável, a lista fixa é
  vazia e a candidata não ganha título inferido: coerente com "classificar na base".
- `revisar-arte` solto (sem base) continua inferindo como hoje.

### A.4 Redução direta e autofix

A candidata medida é a pós-autofix (`ajustar-sem-piorar.ts:120-130`), então os dois caminhos passam pelo
mesmo juízo: (a) `fonte` direto (`fontSize`/`escala`); (b) ajuste de outro tipo (`mover`, `caixa`) cujo
autofix encolhe o título para caber. No caso (b), a recusa já diz `autocorrecao` (CP4.1); o motivo passa a
nomear o componente (`hierarquia` / `modelo` / `celular`). O autofix em si (`text-autofix.ts`) **não muda**:
seu piso (80 % da entrada, mínimo 24) continua; o que o CP4.2a fecha é o acúmulo (ajuste × autofix) contra
a base, porque a comparação é sempre base × candidata.

### A.5 Exemplos numéricos (story 1080 × 1920, `s = 1`)

A evidência de `texto-pequeno` é ARREDONDADA (`Math.round`), como hoje: o piso 67,2 chega ao comparador como
67 e as gravidades são inteiras. A tabela mostra o piso exato e, entre parênteses, o arredondado.

| Caso | Referência | Base | Secundário maior | Candidata | Piso (componente) | Resultado |
|---|---|---|---|---|---|---|
| headline saudável → 8 px | 84 | 84 | apoio 36 | 8 | max(67,2 ; 36 ; 24) = **67,2** (67) (modelo) | **recusa** — gravidade 59 |
| headline → 50 % da referência | 84 | 84 | 36 | 42 | 67,2 (67) | **recusa** — gravidade 25 |
| redução pequena, ainda hierárquica | 84 | 84 | 36 | 72 (−14,3 %) | 67,2 (67) | entra (sem achado) |
| redução no limite | 84 | 84 | 36 | 67 | 67,2 | entra (67 ≥ 67,2 − 0,5) |
| `escala 0,5` + autofix a 80 % | 84 | 84 | 36 | 42 → 33,6 | 67,2 | **recusa** (33,6 < piso e < secundário) |
| hierarquia invertida | 60 | 60 | serviço 52 | 50 | max(48 ; 52 ; 24) = **52** (hierarquia) | **recusa** — gravidade 2 |
| `headline2` segue a unidade | 48 (h2) | 48 | 36 | 30 | max(38,4 ; 36 ; 24) = **38,4** | **recusa** |
| modelo discreto | 20 | 20 | 14 | 16 | max(16 ; 14) = **16** (modelo; sem os 24) | entra |
| modelo discreto, abaixo do recuo | 20 | 20 | 14 | 12 | 16 | **recusa** — gravidade 4 |
| sem referência, no ajuste | — (base vira ref: 84) | 84 | 36 | 42 | max(67,2 ; 36 ; 24) = 67,2 | **recusa** |
| sem referência, `revisar-arte` solto | — | 84 | 36 | (medida única) | max(36 ; 24) = 36; cobertura `parcial` | só acusa abaixo de 36 |
| título inferido (sem papel) 60 vs segundo 36, reduzido a 50 | — (base: 60) | 60 | 36 | 50 (deixaria de ser 1,5×) | classificação fixada na base; piso max(48 ; 36 ; 24) = 48 | entra (50 ≥ 48) |
| idem, reduzido a 30 | — (base: 60) | 60 | 36 | 30 | 48 (hierarquia também: 30 < 36) | **recusa** |
| título GRANDE corrigido pela regra 7 | 84 | 140 (1,67× ref) | 36 | 84 (escala 0,6) | 67,2 (67) | entra (84 ≥ 67). A escala mínima que a regra 7 pode sugerir para este título passa a ser `67,2 / 140 = 0,48` (A.9, decisão 2) — e 0,5 × 140 = 70 ≥ 67,2 também entraria |

### A.6 Arquivos e funções

| Arquivo | Mudança |
|---|---|
| `src/lib/creatives/revisao/regras.ts` | regra 9: ramo para títulos (piso com 3 componentes, evidência `componente`, `maiorSecundario1080`, severidade `aviso`); `idsDeTitulo` lê `e.titulosFixados` quando presente; cobertura `parcial` para título sem referência / referência inferida; função pura exportada `pisoDoTitulo1080(ref, maiorSecundario, limites)` para teste e reuso; regra 7: a escala mínima da sugestão passa a ser `min(1, max(0,5, max(pisoDoTitulo1080(id) / corpoAtual1080(id)), 24 / corpoMinimo))` entre os títulos atingidos (decisão 2) |
| `src/lib/creatives/revisao/contrato.ts` | `EntradaDaRevisao.titulosFixados?: string[]`; evidência tipada de `texto-pequeno` ganha `componente?` |
| `src/lib/creatives/revisao/ajustar-sem-piorar.ts` | calcula `idsDeTitulo` na base uma vez e passa `titulosFixados` às duas medidas; injeta referência da base para título sem referência (`origem: 'página como está'`); motivo da recusa cita o componente |
| `src/lib/creatives/revisao/revisar-arte.ts` | `referenciasDaPagina` marca `inferida: true` no fallback 16; `ContextoDaMedicao` ganha `titulosFixados` e aceita referências extras; `medirCamadasDaPeca` as usa (sem mudar `revisarArte` solto) |
| `src/lib/creatives/revisao/nao-piora.ts` | **sem mudança** de lógica; só a mensagem de `motivoDaComparacao` para `texto-pequeno` diz o componente |
| `src/lib/mcp/catalogo/arte-ia.ts`, `docs/regras/revisor-da-arte.md` | descrição e doc: "títulos entram em `texto-pequeno` (modelo, hierarquia, celular)" |
| Testes | `regras.test.ts` (regra 9 para títulos), `nao-piora.test.ts` (gravidade por componente), `ajustar-sem-piorar.test.ts` (fixação da classificação; referência da base; autofix), `direcao-de-arte/__tests__/piloto-ciclo.test.ts` (casos da matriz com o renderer real) |

### A.7 Critérios de aceite

1. Nenhum ajuste (direto ou via autofix) leva `headline`/`headline2` a criar o achado `texto-pequeno`
   ou a piorá-lo em mais de 1 px (a tolerância de arredondamento de sempre) sem recusa
   `AJUSTE_PIOROU_ARTE` com o componente no motivo; referência e classificação são as do contexto,
   fixadas antes do lote.
2. Título inferido por tamanho não perde a proteção por ter sido reduzido (classificação fixada na base).
3. Modelo deliberadamente discreto (ref < 24) não recebe o mínimo de 24.
4. `K_REFERENCIA_HIERARQUIA` continua telemetria; nenhum teste a usa como limiar.
5. `revisar-arte` solto sem referência não acusa por (1); a cobertura diz `parcial` com o motivo.
6. Reduções pequenas e hierárquicas (até 20 % da referência, acima do maior secundário) continuam entrando.
7. Baselines T1a/CP2B intocados; `hojeViola` existentes não mudam de estado sem virar `it()`.

### A.8 Matriz de testes

| # | Cenário | Via | Esperado |
|---|---|---|---|
| T1 | headline 84 (ref 84) → 8 | `fonte.fontSize` | recusa, componente `modelo`, gravidade 59 (evidência arredondada: 67 − 8) |
| T2 | headline → 42 (50 %) | `fonte.escala 0,5` | recusa |
| T3 | headline → 72 (−14 %) | `fonte.fontSize` | entra |
| T4 | headline 60, serviço 52 → headline 50 | `fonte` | recusa, componente `hierarquia` |
| T5 | `headline2` 48 → 30 | `fonte` | recusa |
| T6 | ref 20 (discreto) → 16 / → 12 | `fonte` | entra / recusa (piso 16, sem os 24) |
| T7 | sem referência, base 84 → 42 | `fonte` | recusa (referência da base) |
| T8 | sem referência, `revisar-arte` solto | medida | sem achado acima do secundário; cobertura `parcial` |
| T9 | título inferido 60/36 → 50 / → 30 | `fonte` | entra / recusa; `titulosFixados` da base |
| T10 | `mover` que faz o autofix encolher o título abaixo do piso | `mover` | recusa com `autocorrecao` + componente |
| T11 | `caixa` estreita + autofix no título | `caixa` | idem |
| T12 | referência ilegível (`fontSize` não numérico no modelo) | medida | tratada como ausente; `parcial` |
| T13 | peça com arranjo de combinação (sem referência por desenho) | ajuste | base vira referência; recusa a 50 % |
| T13b | referência INFERIDA (modelo sem `fontSize` numérico → fallback 16), base 84 → 42 | `fonte` | base vira referência (não o 16); recusa |
| T16 | título em 200 (ref 84) corrigido pela regra 7 | sugestão | escala sugerida 0,5 (não 0,42); aplicada, 100 ≥ 67,2 entra; a regra 7 acusa de novo |
| T14 | título grande (140, ref 84) corrigido para 84 | regra 7 → `fonte` | entra (84 ≥ 67,2) |
| T15 | piloto real (fixture) 84 → 8 e → 25 | renderer real | recusa nos dois |

### A.9 Decisões que precisam do owner (CP4.2a)

1. **Fator do componente modelo**: 0,8 (o mesmo `pisoRelativo` da escada e dos não-títulos — recomendado)
   ou algo mais estrito só para título (ex.: 0,9). Recomendo 0,8: uma constante só, já calibrada.
2. **Conflito com a regra 7**: a sugestão de `titulo-grande` é uma ESCALA sobre o corpo atual, limitada
   por baixo a 0,5 (quando acima de 1,15 × ref) ou 0,8; com o piso absoluto do título, uma escala pode
   produzir um corpo abaixo de `pisoDoTitulo1080` (ex.: título em 100 com ref 84: escala 0,5 → 50 < 67,2) e
   a sugestão seria recusada pelo não-piorar. Opções: (a) a escala mínima da regra 7 passa a ser
   `max(pisoDoTitulo1080(id) / corpoAtual1080(id))` entre os títulos atingidos, mais `24 / corpoMinimo`
   (recomendado: uma fonte só, preserva 140 → 84 e `headline2`); (b) manter 0,5/0,8 e aceitar a recusa;
   (c) piso especial acima de 1,15 × ref. Recomendo (a), com a escala mínima final =
   `min(1, max(0,5, max(pisoDoTitulo1080(id) / corpoAtual1080(id)) dos títulos atingidos, 24 / corpoMinimo))`
   — o `0,5` continua porque `ajusteSchema` recusa `escala < 0,5` (`contrato.ts:110`): corpo atual 200 com
   ref 84 pede 0,42 para voltar à referência, mas a sugestão fica em 0,5 (→ 100, ainda grande, e a regra 7
   acusa de novo na rodada seguinte); teste obrigatório (T16).
3. **Fator da hierarquia**: 1,0 (não inverter — recomendado) ou um mínimo acima de 1,0 (o que seria um K
   disfarçado, contra a decisão anterior).
4. **Severidade** do achado em título: `aviso` (recomendado) ou `sugestao` como os demais não-serviço.
5. **"Base vira referência" só no executor** (recomendado) ou também no `revisar-arte` solto (não há base
   nesse caso; seria a própria peça contra si mesma — sem sentido).
6. **Referência inferida (fallback 16 do modelo)**: tratar como ausente só para títulos (recomendado,
   escopo mínimo) ou também para apoio/serviço (muda comportamento atual; fora do CP4.2).

---

## Parte B — CP4.2b: `slotValues` inválidos

### B.1 Estado real (conferido)

| O que | Onde | Como é hoje |
|---|---|---|
| Schema da tool | `src/lib/mcp/catalogo/arte-ia.ts:185-188` | `slotValues: z.record(z.any())` — qualquer valor entra |
| Validação semântica (`_slots`/`_papeis`) | `src/lib/semantica/resolver-valores.ts:100-110` (`valorSemanticoValido`), `:131-146` (`estruturaDoCampo`), `:156` (`validarEntradaSemantica`) | string, ou objeto simples não vazio só com `content: string` e/ou `fileUrl: string` não vazia; o resto → `VALOR_INVALIDO` (por origem) ou `ENTRADA_INVALIDA` (campo fornecido que não é objeto). **`_slots: null`/`undefined` conta como NÃO fornecido** (`fornecido()`, `resolver-valores.ts:96`) e é ignorado em silêncio. Chamada em `ajustarArte` (`arte-rapida.ts:1176-1177`, antes do banco, 400) e na resolução (`:1211`, 422); a criação idem (`:713`). **Qualquer erro recusa o pedido inteiro** |
| Legado (chave = id ou nome) | `src/lib/creatives/bake-layers.ts:90-135` | só string e objeto com `content: string` / `fileUrl: string` / `hidden === true` / `papel`/`bloco: string` têm efeito; **tipo errado é ignorado em silêncio** (número, array, boolean, `null`, `{ hidden: 'true' }`, `{ visible: false }`, `{ content: 123 }`, objeto vazio) |
| Chaves reservadas | `arte-rapida.ts:639` (`CHAVES_RESERVADAS`: `_driveImageId`, `_imageUrl`, `_slots`, `_papeis`) | tratadas à parte; `_imageUrl`/`_driveImageId` lidos só se string (`:1238-1240`) |
| Chave que não endereça camada | `bakeLayers` | ignorada em silêncio (nenhuma camada com esse id ou nome) |
| `temAjuste` | `arte-rapida.ts:1134-1140` | `Object.keys(slotValues).length > 0` basta: a chamada segue, regrava a página igual e re-renderiza |
| Guard de copy (CP4.1) | `arte-rapida.ts:1224-1232` | lê o RESULTADO do bake; valor ignorado não muda nada → não é remoção; nada protege contra o no-op |

### B.2 Proposta recomendada — uma fonte só de validação

**Uma função pura, ao lado de `valorSemanticoValido`, e todo mundo a chama:**

```ts
// src/lib/semantica/resolver-valores.ts (ou módulo irmão `valores-de-slot.ts`, puro, sem db)
export type ValorLegado =
  | string
  | { content?: string; fileUrl?: string; hidden?: true; papel?: string; bloco?: string }

export function valorLegadoValido(v: unknown): v is ValorLegado
//  string (qualquer, inclusive "" — o CP4.1 decide se "" é remoção; aqui é só FORMATO)
//  ou objeto simples NÃO vazio cujas chaves ⊆ {content, fileUrl, hidden, papel, bloco} e:
//    content: string | fileUrl: string não vazia | hidden: exatamente true | papel/bloco: string não vazia
//  Tudo o mais é inválido: número, boolean, null, array, objeto vazio, chave desconhecida
//  (`visible`, `hidden: "true"`, `text`, `value`…), `content: 123`.

export function validarEntradaLegada(
  slotValues: Record<string, unknown>,
  camadas: ReadonlyArray<{ id: unknown; name?: unknown }>,
): ErroDeValor[]
//  Para cada chave NÃO reservada (não começa com `_`):
//    - valor inválido → { codigo: 'VALOR_INVALIDO', origem: { tipo: 'layerId' | 'name', chave } }
//    - chave que não casa com id nem nome de camada → { codigo: 'CHAVE_DESCONHECIDA', origem: { tipo: 'name', chave } }
//  Chave reservada desconhecida (`_qualquerCoisa` fora de CHAVES_RESERVADAS) → 'CHAVE_DESCONHECIDA'.
//  `_imageUrl`/`_driveImageId` não-string → 'VALOR_INVALIDO'.
```

**Despacho único, em duas fases:**

```ts
export function validarSlotValues(slotValues, camadas?): ErroDeValor[]
//  FASE 1 — FORMATO (sem página): para cada chave de slotValues:
//    chave começa com `_`  → controle: `_slots`/`_papeis` → validarEntradaSemantica (como hoje; null/undefined = não fornecido);
//                            `_imageUrl`/`_driveImageId` → string não vazia, senão VALOR_INVALIDO;
//                            qualquer outro `_…` → CHAVE_DESCONHECIDA
//    chave não começa com `_` → legado: valorLegadoValido(valor), senão VALOR_INVALIDO { tipo: 'layerId'|'name', chave }
//  FASE 2 — ENDEREÇO (com as camadas do modelo EFETIVO): chave legada que não casa com id nem com nome de
//    camada → CHAVE_DESCONHECIDA. Camada cujo id/nome começa com `_` não é endereçável pelo legado (chave
//    com `_` é sempre controle) — hoje essa camada já é recusada como "chave visual reservada".
```

**O mesmo despacho nas três portas, antes de qualquer escrita ou render:**

1. **`ajustarArte`** (`arte-rapida.ts`): FASE 1 logo depois de `validarEntradaSemantica` (`:1176`, antes do
   banco; 400); FASE 2 logo depois de `camadasParaBake` (`:1209`) e ANTES de `resolverValoresSemanticos`
   (`:1210`), da chave visual reservada e do guard de copy (`:1224`); `resolveImageUrl` só vem em `:1236`.
   Ordem resultante: formato (semântico + legado) → projeto/página → endereço legado → semântico resolvido
   → chave visual reservada → guard de copy (CP4.1) → foto → … → escrita. Nada é escrito, nenhum
   `resolveImageUrl`, nenhuma Generation, nenhum render.
2. **`createArteRapida`** (`arte-rapida.ts:740-930`) e seus chamadores (`criar-arte-de-modelo`, execução de
   plano `src/lib/planos/execucao.ts`, `POST /api/external/creatives`): a ordem de hoje é
   `resolveImageUrl` (lê a foto; `:795-800`) → escolha da página pela foto (`escolherPaginaPelaFoto`,
   `:808-819`) → `camadasDoModelo` (`:830`) → `valoresDaArte` → `ensureArteTemplate` → bake → Generation →
   render. Contrato: **FASE 1 (formato) roda na entrada, antes de `resolveImageUrl`**; **FASE 2 (endereço)
   roda contra o MODELO EFETIVO (a página escolhida pela foto), logo após `camadasDoModelo` e antes de
   `ensureArteTemplate`, Generation e render**. Consequência dita: na criação, um erro de ENDEREÇO é
   detectado depois da leitura da foto e da escolha de layout (sem escrita, sem Generation, sem render),
   porque o endereço depende do modelo que a foto escolhe; um erro de FORMATO é detectado antes de tudo.
   Os valores que a criação monta por dentro (`{ hidden: true }` dos placeholders, `efetivo` com
   `content`/`papel`/`bloco` do casamento da copy, `{ fileUrl }` em imagem) são válidos pelo formato; a
   criação não muda de comportamento.
3. **Schema da tool** (`arte-ia.ts:185` e as tools de criação que expõem `slotValues`):
   `z.record(z.unknown()).superRefine(...)` que chama a FASE 1 — a MESMA função, para a recusa chegar ao
   modelo com a chave errada nomeada já na porta (`validar-registro-mcp` continua descrevendo o schema). A
   FASE 2 não cabe no schema (precisa da página). Não duplicar a lista de chaves no zod: o zod delega.

**Contrato de erro:** `VALOR_INVALIDO` (código que já existe para `_slots`/`_papeis`; `erroDeValores`
agrupa todos os erros em `details.erros[]`, cada um com `codigo` e `origem { tipo, chave }`), status 422
(400 quando a recusa é de puro formato antes do banco — como hoje para a semântica). Mensagem em
português nomeando a chave e o formato aceito ("`cta`: valor `123` não é texto nem `{ content }`; aceito:
string, ou objeto com content/fileUrl/hidden:true/papel/bloco").

**Entradas mistas (válidas + inválidas): o pedido INTEIRO é recusado.** Motivo: `slotValues` é um MAPA de
conteúdo aplicado em conjunto num só bake, sem resultado por entrada nem rollback parcial — diferente do
lote de `ajustes` do CP4, em que cada ajuste é tentado isoladamente sobre o estado aceito e volta por
índice como aplicado/recusado. É o contrato que `_slots`/`_papeis` já têm (`erros.length > 0 → throw`) e
o que o agente consegue corrigir numa só rodada (todos os erros vêm na lista). Nada é gravado, nada é
renderizado.

**Preserva o CP4.1:** a validação é de FORMATO e ENDEREÇO, não de conteúdo. `""`, `"   "`, `"."`,
`{ content: "" }`, `{ hidden: true }` continuam FORMATOS VÁLIDOS e seguem para `copyRemovidaDoBake`, que
decide `esvaziado`/`sem-conteudo`/`escondido` e recusa no draft-only. Ordem: validação (CP4.2b) → guard de
copy (CP4.1). Um valor inválido numa camada e uma remoção noutra: a chamada cai na validação (primeiro),
com os dois problemas listados quando for possível listar (a remoção é calculada só se o formato passar —
o agente recebe a remoção na rodada seguinte).

**`temAjuste` não muda neste checkpoint.** Com a validação na frente, toda chave que sobrevive tem formato
válido; o objeto só com `papel`/`bloco` (metadata sem efeito visual) continua sendo escrita de metadata
como hoje (`bake-layers.ts:130`) — mudar isso é a decisão 3, separada, e não é necessária para fechar a
dívida.

### B.3 Exemplos

| `slotValues` | Hoje | Proposta |
|---|---|---|
| `{ cta: 123 }` | ignora, regrava, renderiza, "sucesso" | 422 `VALOR_INVALIDO` (`cta`, layerId), nada gravado |
| `{ cta: ['x'] }` / `{ cta: true }` / `{ cta: null }` / `{ cta: {} }` | idem | idem |
| `{ cta: { hidden: 'true' } }` / `{ cta: { visible: false } }` / `{ cta: { text: 'x' } }` | idem | 422 `VALOR_INVALIDO` (chave desconhecida ou tipo errado dentro do objeto) |
| `{ cta: { content: 123 } }` | idem | 422 `VALOR_INVALIDO` |
| `{ cta: 'Novo texto', headline: 123 }` | aplica `cta`, ignora `headline`, "sucesso" | 422 — pedido inteiro recusado; `erros: [{ VALOR_INVALIDO, headline }]` |
| `{ cta: '' }` (draft-only) | `CONTEUDO_NAO_PODE_SER_REMOVIDO` | igual (formato válido; CP4.1 decide) |
| `{ cta: '.' }` (humano) | grava, `copyRemovida: sem-conteudo` | igual |
| `{ naoExiste: 'x' }` | ignora, regrava, "sucesso" | 422 `CHAVE_DESCONHECIDA` (decisão 1) |
| `{ _qualquer: 'x' }` | ignora | 422 `CHAVE_DESCONHECIDA` |
| `{ _imageUrl: 123 }` | ignora (só string é lida) | 422 `VALOR_INVALIDO` |
| `{ _slots: { manchete: 123 } }` | 400 `VALOR_INVALIDO` (já hoje) | igual (mesma função de erro) |
| `{ cta: { papel: 'cta' } }` (só metadata) | regrava com metadata, renderiza | válido pelo formato; comportamento inalterado neste CP (decisão 3, separada) |

### B.4 Arquivos e funções

| Arquivo | Mudança |
|---|---|
| `src/lib/semantica/resolver-valores.ts` (ou `valores-de-slot.ts` irmão) | `valorLegadoValido`, `validarEntradaLegada`, código `CHAVE_DESCONHECIDA` em `ErroDeValor` |
| `src/lib/creatives/arte-rapida.ts` | `ajustarArte`: FASE 1 antes do banco, FASE 2 depois de `camadasParaBake`; `createArteRapida`: FASE 1 na entrada (antes de `resolveImageUrl`), FASE 2 após `camadasDoModelo` do modelo efetivo e antes de `ensureArteTemplate`; mensagens em PT |
| `src/lib/mcp/catalogo/arte-ia.ts` (e `criar-arte-de-modelo`, `criar-arte` se expõem `slotValues`) | schema `z.record(z.unknown()).superRefine(validador)`; descrição com os formatos aceitos |
| `src/lib/creatives/bake-layers.ts` | **sem mudança** de lógica (continua tolerante; a validação mora antes) — ou, opcionalmente, `assert` de desenvolvimento |
| `docs/regras/revisor-da-arte.md`, `docs/regras/mcp.md` | contrato e códigos |
| Testes | `resolver-valores.test.ts` (validador puro, tabela B.3), `ajustar-arte-concorrencia.test.ts` (12 casos abaixo com o banco falso: zero escrita/Generation/`put`), `arte-rapida` criação (placeholders continuam), `validar-registro-mcp` (schema) |

### B.5 Critérios de aceite

1. Todo valor fora do FORMATO, por id, nome, `_slots` ou `_papeis`, é recusado com `VALOR_INVALIDO`
   (valor malformado) — ou `ENTRADA_INVALIDA` quando o CAMPO `_slots`/`_papeis` fornecido não é um objeto,
   como hoje (`resolver-valores.ts:140`) — ANTES de ler a foto, escrever a página, criar Generation ou renderizar — em `ajustarArte` e na
   criação (todas as portas: tool, execução de plano, API externa). Erro de ENDEREÇO (`CHAVE_DESCONHECIDA`)
   é recusado antes de qualquer escrita/Generation/render; em `ajustarArte` também antes da foto; na
   criação, depois da escolha do modelo pela foto (que é quem define o endereço).
2. Pedido misto (válido + inválido) é recusado inteiro, com todos os erros de formato listados.
3. `""`, espaço, `"."`, `{ content: "" }`, `{ hidden: true }` continuam chegando ao guard do CP4.1 com o
   mesmo comportamento de hoje (testes S1–S11/A1 intactos).
4. A criação de arte (`createArteRapida`, placeholders escondidos) não muda de comportamento.
5. Uma só função decide o formato; o schema da tool delega a ela (`validar-registro-mcp` verde).
6. `temAjuste` e a escrita de metadata (`papel`/`bloco`) não mudam neste checkpoint.

### B.6 Matriz de testes (ajuste, banco falso; `intacto` = zero escrita, zero Generation, zero `put`)

| # | Entrada | Esperado |
|---|---|---|
| V1 | `{ cta: 123 }` | 422 `VALOR_INVALIDO`, origem layerId `cta`, intacto |
| V2 | `{ cta: ['x'] }`, `{ cta: true }`, `{ cta: null }`, `{ cta: {} }` | idem |
| V3 | `{ cta: { hidden: 'true' } }` | 422, intacto |
| V4 | `{ cta: { visible: false } }` | 422, intacto |
| V5 | `{ cta: { content: 123 } }` | 422, intacto |
| V6 | `{ Chamada: 7 }` (por NOME) | 422, origem name |
| V7 | `{ _slots: { manchete: 123 } }` | 400 `VALOR_INVALIDO` (já hoje; regressão) |
| V8 | `{ _papeis: { headline: [] } }` | 400, idem |
| V9 | `{ cta: 'Novo', headline: 123 }` (misto) | 422, nada gravado (nem `cta`) |
| V10 | `{ naoExiste: 'x' }` | 422 `CHAVE_DESCONHECIDA` (ou aviso — decisão 1) |
| V11 | `{ cta: '' }` / `{ cta: '.' }` draft-only | `CONTEUDO_NAO_PODE_SER_REMOVIDO` (CP4.1 intacto) |
| V12 | `{ cta: 'Texto B' }` | entra (controle) |
| V13 | criação com placeholders | `{ hidden: true }` interno continua; arte criada igual |
| V14 | `{ _imageUrl: 123 }` | 422 |
| V15 | `{ cta: { papel: 'cta' } }` | conforme decisão 3 |

### B.7 Decisões que precisam do owner (CP4.2b)

1. **Chave que não endereça camada** (`{ naoExiste: 'x' }`): recusar `CHAVE_DESCONHECIDA` (recomendado —
   é o mesmo erro silencioso que o owner mandou fechar) ou aceitar com `aviso`. Risco da recusa: skills
   antigas que mandam chaves a mais passam a falhar (visível, corrigível).
2. **Status**: 400 para formato (antes do banco, como a semântica) e 422 para endereço — ou 422 para tudo.
3. **(Separada, fora da dívida) Objeto só com `papel`/`bloco`** (metadata sem efeito visual) e
   `temAjuste` por efeito: hoje grava metadata e re-renderiza; mudar é decisão adicional, não necessária
   para o CP4.2b. Recomendo deixar para depois.
4. **Aplicar também à criação** (`criar-arte-de-modelo`, `criar-arte`): recomendado sim, mesma função,
   sem mudar os valores internos.

---

## Fora deste checkpoint

CP5, MCP-M, editor, piso de interface do story, oclusão, `VERSAO_DAS_REGRAS`. Nenhum cliente, DRAFT,
agenda ou publicação real.
