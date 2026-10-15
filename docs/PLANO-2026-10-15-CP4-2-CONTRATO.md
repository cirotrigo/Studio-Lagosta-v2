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
| Regra 9 `texto-pequeno` | `regras.ts:1155-1176` | `if (idsDeTitulo.includes(m.layerId) …) continue` — títulos **pulados**. Para os demais: `piso = ref ? (ref ≥ 24 ? max(24, 0,8·ref) : 0,8·ref) : 24`; achado se `corpo1080 < piso − 0,5`; evidência `{ corpo1080, piso1080, referencia1080 }`; severidade `aviso` para `servico`, `sugestao` para o resto; sugere `fonte` com `fontSize = ceil(piso·s)` |
| Constantes | `regras.ts:220-227` (`LIMITES_DA_REVISAO`) | `pisoDeFonte1080 = 24`, `pisoRelativo = 0,8`, `tituloRelativo = 1,15`, `tituloAlturaSugestao = 0,2`, `tituloAlturaAviso = 0,27` |
| Regra 7 `titulo-grande` | `regras.ts:1072-1125` | `razao = max(corpo1080 / ref)` entre os títulos; acusa se `razao > 1,15` ou fração da altura útil > 0,2; a escala sugerida tem piso `max(razao>1,15 ? 0,5 : 0,8, 24 / corpoMinimo)` — ou seja, **a regra 7 já sabe reduzir um título até 50 % da referência quando ele está grande demais** |
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
do papel): (1) não existe; valem (2) e (3). **No fluxo de ajuste, a BASE vira a referência**: o executor
(`ajustar-sem-piorar.ts`) preenche `referencias[id] = { fontSize1080: corpoDaBase, origem: 'página como
está' }` para todo título sem referência antes de medir base e candidata — assim "headline → 50 % da
referência" é recusa mesmo sem modelo, e a regra continua honesta no `revisar-arte` solto (onde só (2) e
(3) se aplicam, com a cobertura dizendo `parcial: título sem referência de modelo`).

Referência inválida (`fontSize1080` não numérico, ≤ 0 ou `NaN` — hoje possível se a camada do modelo
tiver `fontSize` corrompido): tratada como ausente (cobertura `parcial`, motivo "referência do título
ilegível"); nunca como "piso zero".

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
- `revisar-arte` solto (sem base) continua inferindo como hoje.

### A.4 Redução direta e autofix

A candidata medida é a pós-autofix (`ajustar-sem-piorar.ts:120-130`), então os dois caminhos passam pelo
mesmo juízo: (a) `fonte` direto (`fontSize`/`escala`); (b) ajuste de outro tipo (`mover`, `caixa`) cujo
autofix encolhe o título para caber. No caso (b), a recusa já diz `autocorrecao` (CP4.1); o motivo passa a
nomear o componente (`hierarquia` / `modelo` / `celular`). O autofix em si (`text-autofix.ts`) **não muda**:
seu piso (80 % da entrada, mínimo 24) continua; o que o CP4.2a fecha é o acúmulo (ajuste × autofix) contra
a base, porque a comparação é sempre base × candidata.

### A.5 Exemplos numéricos (story 1080 × 1920, `s = 1`)

| Caso | Referência | Base | Secundário maior | Candidata | Piso (componente) | Resultado |
|---|---|---|---|---|---|---|
| headline saudável → 8 px | 84 | 84 | apoio 36 | 8 | max(67,2 ; 36 ; 24) = **67,2** (modelo) | **recusa** — gravidade 59,2 |
| headline → 50 % da referência | 84 | 84 | 36 | 42 | 67,2 | **recusa** — gravidade 25,2 |
| redução pequena, ainda hierárquica | 84 | 84 | 36 | 72 (−14 %) | 67,2 | entra (sem achado) |
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
| título GRANDE corrigido pela regra 7 | 84 | 140 (1,67× ref) | 36 | 84 (escala 0,6) | 67,2 | entra — a regra 7 continua podendo descer até 0,5 × ref? **Não com este piso: 0,5·ref = 42 < 67,2.** Ver decisão 2 |

### A.6 Arquivos e funções

| Arquivo | Mudança |
|---|---|
| `src/lib/creatives/revisao/regras.ts` | regra 9: ramo para títulos (piso com 3 componentes, evidência `componente`, `maiorSecundario1080`, severidade `aviso`); `idsDeTitulo` lê `e.titulosFixados` quando presente; cobertura `parcial` para título sem referência / referência ilegível; função pura exportada `pisoDoTitulo1080(ref, maiorSecundario, limites)` para teste e reuso |
| `src/lib/creatives/revisao/contrato.ts` | `EntradaDaRevisao.titulosFixados?: string[]`; evidência tipada de `texto-pequeno` ganha `componente?` |
| `src/lib/creatives/revisao/ajustar-sem-piorar.ts` | calcula `idsDeTitulo` na base uma vez e passa `titulosFixados` às duas medidas; injeta referência da base para título sem referência (`origem: 'página como está'`); motivo da recusa cita o componente |
| `src/lib/creatives/revisao/revisar-arte.ts` | `medirCamadasDaPeca` aceita `titulosFixados` e referências extras (sem mudar `revisarArte` solto) |
| `src/lib/creatives/revisao/nao-piora.ts` | **sem mudança** de lógica; só a mensagem de `motivoDaComparacao` para `texto-pequeno` diz o componente |
| `src/lib/mcp/catalogo/arte-ia.ts`, `docs/regras/revisor-da-arte.md` | descrição e doc: "títulos entram em `texto-pequeno` (modelo, hierarquia, celular)" |
| Testes | `regras.test.ts` (regra 9 para títulos), `nao-piora.test.ts` (gravidade por componente), `ajustar-sem-piorar.test.ts` (fixação da classificação; referência da base; autofix), `direcao-de-arte/__tests__/piloto-ciclo.test.ts` (casos da matriz com o renderer real) |

### A.7 Critérios de aceite

1. Nenhum ajuste (direto ou via autofix) deixa `headline`/`headline2` abaixo de `pisoDoTitulo1080` sem
   recusa `AJUSTE_PIOROU_ARTE` com `texto-pequeno` e o componente no motivo.
2. Título inferido por tamanho não perde a proteção por ter sido reduzido (classificação fixada na base).
3. Modelo deliberadamente discreto (ref < 24) não recebe o mínimo de 24.
4. `K_REFERENCIA_HIERARQUIA` continua telemetria; nenhum teste a usa como limiar.
5. `revisar-arte` solto sem referência não acusa por (1); a cobertura diz `parcial` com o motivo.
6. Reduções pequenas e hierárquicas (até 20 % da referência, acima do maior secundário) continuam entrando.
7. Baselines T1a/CP2B intocados; `hojeViola` existentes não mudam de estado sem virar `it()`.

### A.8 Matriz de testes

| # | Cenário | Via | Esperado |
|---|---|---|---|
| T1 | headline 84 (ref 84) → 8 | `fonte.fontSize` | recusa, componente `modelo`, gravidade 59,2 |
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
| T14 | título grande (140, ref 84) corrigido para 84 | regra 7 → `fonte` | entra (84 ≥ 67,2) |
| T15 | piloto real (fixture) 84 → 8 e → 25 | renderer real | recusa nos dois |

### A.9 Decisões que precisam do owner (CP4.2a)

1. **Fator do componente modelo**: 0,8 (o mesmo `pisoRelativo` da escada e dos não-títulos — recomendado)
   ou algo mais estrito só para título (ex.: 0,9). Recomendo 0,8: uma constante só, já calibrada.
2. **Conflito com a regra 7**: hoje `titulo-grande` pode sugerir escala até 0,5 × ref quando o título está
   acima de 1,15 × ref; com o piso de 0,8 × ref, essa sugestão passa a ser recusada abaixo de 0,8. Opções:
   (a) alinhar a regra 7 ao piso (`max(0,8, 24/corpo)` em vez de 0,5 — recomendado, uma fonte só); (b)
   manter 0,5 na sugestão e aceitar que o não-piorar a recuse; (c) título acima de 1,15 × ref ganha piso
   especial. Recomendo (a).
3. **Fator da hierarquia**: 1,0 (não inverter — recomendado) ou um mínimo acima de 1,0 (o que seria um K
   disfarçado, contra a decisão anterior).
4. **Severidade** do achado em título: `aviso` (recomendado) ou `sugestao` como os demais não-serviço.
5. **"Base vira referência" só no executor** (recomendado) ou também no `revisar-arte` solto (não há base
   nesse caso; seria a própria peça contra si mesma — sem sentido).

---

## Parte B — CP4.2b: `slotValues` inválidos

### B.1 Estado real (conferido)

| O que | Onde | Como é hoje |
|---|---|---|
| Schema da tool | `src/lib/mcp/catalogo/arte-ia.ts:185-188` | `slotValues: z.record(z.any())` — qualquer valor entra |
| Validação semântica (`_slots`/`_papeis`) | `src/lib/semantica/resolver-valores.ts:100-110` (`valorSemanticoValido`), `:131-146` (`estruturaDoCampo`), `:156` (`validarEntradaSemantica`) | string, ou objeto simples não vazio só com `content: string` e/ou `fileUrl: string` não vazia; o resto → `VALOR_INVALIDO` (por origem) ou `ENTRADA_INVALIDA` (campo não é objeto). Chamada em `ajustarArte` (`arte-rapida.ts:1176-1177`, antes do banco, 400) e na resolução (`:1211`, 422); a criação idem (`:713`). **Qualquer erro recusa o pedido inteiro** |
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

**O mesmo validador nas três portas, antes de qualquer escrita ou render:**

1. **`ajustarArte`** (`arte-rapida.ts`): logo depois de `validarEntradaSemantica` (que já roda antes do
   banco) roda `validarEntradaLegada` — a parte de FORMATO não precisa da página (400, como a semântica);
   a parte de ENDEREÇO (`CHAVE_DESCONHECIDA`) precisa das camadas: roda logo depois de `camadasParaBake`
   e ANTES de `resolverValoresSemanticos` e do guard de copy (422, como `VALOR_INVALIDO` semântico).
   Ordem resultante: formato semântico → formato legado → projeto/página → endereço legado → semântico
   resolvido → chave visual reservada → guard de copy (CP4.1) → … → escrita. Nada é escrito, nenhum
   `resolveImageUrl`, nenhuma Generation, nenhum render.
2. **`createArteRapida`** (`arte-rapida.ts:~700-740`, `valoresDaArte`): o mesmo `valorLegadoValido` sobre
   a ENTRADA do chamador. Os valores que a criação monta por dentro (`{ hidden: true }` dos placeholders,
   `efetivo`) são válidos pelo formato; a criação não muda de comportamento.
3. **Schema da tool** (`arte-ia.ts:185`): `z.record(z.unknown()).superRefine(...)` que chama
   `valorLegadoValido`/`validarEntradaSemantica` — a MESMA função, para a recusa chegar ao modelo com a
   chave errada nomeada já na porta (e `validar-registro-mcp` continuar descrevendo o schema). Não
   duplicar a lista de chaves no zod: o zod delega.

**Contrato de erro:** `VALOR_INVALIDO` (código que já existe para `_slots`/`_papeis`; `erroDeValores`
agrupa todos os erros em `details.erros[]`, cada um com `codigo` e `origem { tipo, chave }`), status 422
(400 quando a recusa é de puro formato antes do banco — como hoje para a semântica). Mensagem em
português nomeando a chave e o formato aceito ("`cta`: valor `123` não é texto nem `{ content }`; aceito:
string, ou objeto com content/fileUrl/hidden:true/papel/bloco").

**Entradas mistas (válidas + inválidas): o pedido INTEIRO é recusado.** Motivo: é o contrato que
`_slots`/`_papeis` já têm (`erros.length > 0 → throw`), é o que o agente consegue corrigir numa só
rodada (todos os erros vêm na lista), e evita o estado "metade aplicado" que o CP4 proíbe para ajustes
estruturais. Nada é gravado, nada é renderizado.

**Preserva o CP4.1:** a validação é de FORMATO e ENDEREÇO, não de conteúdo. `""`, `"   "`, `"."`,
`{ content: "" }`, `{ hidden: true }` continuam FORMATOS VÁLIDOS e seguem para `copyRemovidaDoBake`, que
decide `esvaziado`/`sem-conteudo`/`escondido` e recusa no draft-only. Ordem: validação (CP4.2b) → guard de
copy (CP4.1). Um valor inválido numa camada e uma remoção noutra: a chamada cai na validação (primeiro),
com os dois problemas listados quando for possível listar (a remoção é calculada só se o formato passar —
o agente recebe a remoção na rodada seguinte).

**`temAjuste` deixa de ser "tem chave":** passa a ser "tem valor que o bake aplicaria" (string, ou objeto
com efeito). Com a validação na frente isso vira redundante, mas fecha o caso da chave reservada sozinha
(`{ _imageUrl: 123 }`) e do objeto só com `papel` (metadata sem efeito visual — ver decisão 3).

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
| `{ cta: { papel: 'cta' } }` (só metadata) | regrava com metadata, renderiza | válido pelo formato; `temAjuste` com efeito só de metadata — decisão 3 |

### B.4 Arquivos e funções

| Arquivo | Mudança |
|---|---|
| `src/lib/semantica/resolver-valores.ts` (ou `valores-de-slot.ts` irmão) | `valorLegadoValido`, `validarEntradaLegada`, código `CHAVE_DESCONHECIDA` em `ErroDeValor` |
| `src/lib/creatives/arte-rapida.ts` | chamadas em `ajustarArte` (formato antes do banco; endereço depois de `camadasParaBake`) e em `createArteRapida`/`valoresDaArte`; `temAjuste` por efeito; mensagens em PT |
| `src/lib/mcp/catalogo/arte-ia.ts` (e `criar-arte-de-modelo`, `criar-arte` se expõem `slotValues`) | schema `z.record(z.unknown()).superRefine(validador)`; descrição com os formatos aceitos |
| `src/lib/creatives/bake-layers.ts` | **sem mudança** de lógica (continua tolerante; a validação mora antes) — ou, opcionalmente, `assert` de desenvolvimento |
| `docs/regras/revisor-da-arte.md`, `docs/regras/mcp.md` | contrato e códigos |
| Testes | `resolver-valores.test.ts` (validador puro, tabela B.3), `ajustar-arte-concorrencia.test.ts` (12 casos abaixo com o banco falso: zero escrita/Generation/`put`), `arte-rapida` criação (placeholders continuam), `validar-registro-mcp` (schema) |

### B.5 Critérios de aceite

1. Todo valor fora do formato, por id, nome, `_slots` ou `_papeis`, é recusado com `VALOR_INVALIDO`
   (ou `CHAVE_DESCONHECIDA`) ANTES de ler a foto, escrever a página, criar Generation ou renderizar.
2. Pedido misto (válido + inválido) é recusado inteiro, com todos os erros de formato listados.
3. `""`, espaço, `"."`, `{ content: "" }`, `{ hidden: true }` continuam chegando ao guard do CP4.1 com o
   mesmo comportamento de hoje (testes S1–S11/A1 intactos).
4. A criação de arte (`createArteRapida`, placeholders escondidos) não muda de comportamento.
5. Uma só função decide o formato; o schema da tool delega a ela (`validar-registro-mcp` verde).
6. `temAjuste` só é verdadeiro com efeito real.

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
3. **Objeto só com `papel`/`bloco`** (metadata sem efeito visual): tratar como "sem efeito"
   (`AJUSTE_SEM_EFEITO`, nada gravado) ou continuar aceitando como escrita de metadata. Recomendo "sem
   efeito" no ajuste — a metadata do papel é da criação.
4. **Aplicar também à criação** (`criar-arte-de-modelo`, `criar-arte`): recomendado sim, mesma função,
   sem mudar os valores internos.

---

## Fora deste checkpoint

CP5, MCP-M, editor, piso de interface do story, oclusão, `VERSAO_DAS_REGRAS`. Nenhum cliente, DRAFT,
agenda ou publicação real.
