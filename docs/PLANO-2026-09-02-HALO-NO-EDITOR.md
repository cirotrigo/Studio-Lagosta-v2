# Plano — o halo como efeito do editor (02/09/2026)

> Nasceu de uma pergunta do Ciro em 02/09/2026 ("como funciona o efeito halo,
> recentemente implementado no canvas design?") que virou pedido: trazer o halo
> do canvas de design (`design-canvas/_halo.py`) para o editor Konva do Studio,
> como algo que a pessoa liga num texto e ajusta com controles — não como
> resultado de um script.
>
> O desenho passou por três rodadas. A primeira propunha uma camada `shape`
> vinculada ao texto (o que `aplicar-halo.ts` já produz no servidor). O Ciro
> devolveu com outra forma: *"aplicar como se fosse um efeito background atrás
> do texto com uma borda considerável, e depois aplicar um efeito gaussiano na
> caixa gerada"* — e a clarificação decisiva: *"o background de hoje aplica em
> toda a caixa de texto; esse outro é só no fundo do TEXTO"*. É o
> `width: fit-content` do `_halo.py`. A terceira rodada acrescentou os
> controles: opacidade, cor da marca com ajuste fino de tom, raio "bem grande",
> deslocamento X/Y.
>
> **Executado a partir de 02/09/2026** por decisão do Ciro ("pode executar todo
> o plano fazendo commits separados"). Placar ao fim do arquivo.

---

## 1. O que muda para quem usa

O efeito **Fundo** do texto (painel Efeitos, e também no painel Gradientes
quando um texto está selecionado) deixa de ser só "retângulo do tamanho da
caixa" e passa a ter:

| Controle | O que faz |
|---|---|
| **Ajuste: Caixa / Texto** | `Caixa` é o de sempre (`layer.size`). `Texto` mede as linhas desenhadas e cobre só a tinta — a manchete de 3 palavras numa caixa larga ganha uma mancha do tamanho das 3 palavras. |
| **Cor** | paleta do cliente (`BrandColorSwatches`) + hex + seletor nativo. O preset "Halo" nasce com a cor ESCURA da marca, nunca preto puro. |
| **Tom** | −40…+40 de luminosidade sobre a cor escolhida, preservando a matiz. Os motores leem só o hex final. |
| **Opacidade** | 0–100%. É a "tinta" do `_halo.py`. Vai na opacidade do NÓ, não misturada na cor. |
| **Borda** (H/V com cadeado) | o padding — a "borda considerável". Até 200 px em cada eixo. |
| **Cantos** | raio dos cantos. O halo do canvas usa ~raio+60. |
| **Desfoque** | 0 = fundo nítido; até 600 px visuais. É a diferença entre "etiqueta" e "halo". |
| **Posição X/Y** | desloca a mancha em relação ao texto (−200…200). |
| **Botão "Halo"** | preset: Texto, cor escura da marca, 70%, borda 60, cantos 60, desfoque 110. |

Quatro combinações válidas: caixa/texto × nítido/esfumado.

## 2. Decisões de arquitetura

### 2.1 Estender `effects.background`, não criar efeito novo

```ts
effects.background = {
  enabled, backgroundColor, padding,       // já existiam
  fit?: 'caixa' | 'texto',                 // default 'caixa' — artes antigas intactas
  opacity?: number,                         // 0..1
  borderRadius?: number,
  blur?: number,                            // px VISUAIS, 0..600
  offsetX?: number, offsetY?: number,
  paddingX?: number, paddingY?: number,     // quando presentes vencem `padding`
  baseColor?: string, tone?: number,        // só a UI lê (posição do slider de tom)
}
```

Um efeito, uma seção do painel, e tudo que já tinha fundo continua saindo
igual (`fit` ausente = caixa, `blur` ausente = 0, `opacity` ausente = 1).

### 2.2 A tinta é medida pela MESMA função nos dois motores

`retanguloDasLinhas` (`src/lib/creatives/halo/fundo-de-texto.ts`, módulo PURO)
recebe as linhas desenhadas com a largura de cada uma, a caixa, o alinhamento,
a âncora vertical, o `fontSize`, a entrelinha e o padding de desenho (6), e
devolve o retângulo da tinta em coordenadas locais da camada. A conta é a do
`_sceneFunc` do `Konva.Text` (linhas 100–140 do `Text.js`), que o
`renderLines` do servidor já reproduz:

- `y0 = pad + alignY`, com `alignY` = 0 / `(H − n·lh − 2·pad)/2` / `H − n·lh − 2·pad`
- `x` por linha = `pad` + 0 / `(W − w − 2·pad)/2` / `W − w − 2·pad`
- altura = `n × fontSize × lineHeight` (line-box, não glifo — é o que os dois
  motores usam para POSICIONAR; `inkTopSlack` fica para apertar depois)

O editor passa `textNode.textArr` (a quebra do próprio Konva; o rich-text já
usa isso), o servidor passa as linhas de `breakTextIntoLines` medidas com
`ctx.letterSpacing` — a paridade da quebra já existia.

### 2.3 O desfoque é borrado em ESCALA REDUZIDA

🔴 O stack blur do Konva tem tabelas de 256 entradas (`mul_table`/`shg_table`
em `konva/lib/filters/Blur.js`) — mas o teto real chega ANTES: o algoritmo
faz `(sum * mul_table[r]) >> shg_table[r]` com shift COM SINAL, e
`255 · (r+1)(r+2)/2 · mul[r]` passa de 2³¹ entre o raio 180 e 190. Medido em
02/09/2026 no render server-side (mesmo código): raio 150 borra certo; raio
200 devolve faixas verticais e a mancha SOME. O port (`src/lib/konva/filters/
apply.ts`) saturava em 254 — dentro da zona quebrada — e o `ShapeNode` só ia
até 200, então quase nunca bateu (190–200 já quebrava).

`escalaDoBlur(raio)` devolve `{ k, raioNoBuffer }` com `k = ceil(raio/160)`:
o editor cacheia o `Rect` com `pixelRatio: 1/k` e `blurRadius = raio/k`; o
servidor desenha o offscreen a `1/k`, borra `raio/k` e blita escalado de volta.
A mancha é lisa por natureza — a redução não custa nada visual — e o custo fica
LIMITADO: raio 600 num bloco de 800×300 seria 16 MP em escala 1; a 1/4, 1 MP.
O port passou a saturar em 180, para quem não passar pela escala.

`renderShapeBlurred` e o `ShapeNode` (os halos que o servidor cria por bloco)
adotam a mesma função, e o teto de 200 deles some.

### 2.4 O fundo é desenhado DENTRO do transform da camada

Hoje o fundo é desenhado antes do transform (servidor) e como `Rect` irmão sem
rotação (editor): texto girado tinha fundo reto nos dois — paridade de um
defeito. Passa a acompanhar a rotação nos dois motores. Camadas antigas com
fundo E rotação mudam de aparência — raras, e o novo desenho é o esperado.

### 2.5 O fundo SEGUE o texto durante o arraste

🔴 O `Rect` irmão lê `layer.position` do estado React, que só muda no
`dragend` — o fundo ficava parado e pulava ao soltar. Com desfoque isso fica
gritante. O componente novo escuta `dragmove`/`transform` do nó de texto e
reposiciona o retângulo imperativamente.

### 2.6 O que fica de fora, de propósito

- **Rich-text e texto curvo** não têm fundo — como já não tinham.
- **Halo por texto, não por bloco.** Manchete e apoio em camadas separadas
  fazem duas manchas; na interseção a tinta 0,6 vira 0,84. Com raio grande a
  transição é suave, mas não é o halo por bloco do canvas de design. Fase 4:
  fundo compartilhado pelo grupo (`metadata.groupId`, que as combinações de
  fontes já usam) — a camada líder desenha UMA mancha pela união.
- **Caixa baixa nunca chega à tinta cheia** (gaussiana de desvio `raio`): é o
  comportamento do Photoshop, e `ajustarPorGeometria` já existe para um
  "calibrar pela foto" futuro.
- **Os halos do servidor** (`aplicar-halo.ts`, um `shape` por bloco calibrado
  pela foto) continuam existindo — são a via automática; o efeito é a manual.

## 3. Fases

| Fase | Entrega | Commit |
|---|---|---|
| **F0** | tipos + `fundo-de-texto.ts` (puro: `resolverFundo`, `retanguloDasLinhas`, `retanguloDoFundo`, `escalaDoBlur`, `ajustarTom`, `corEscuraDaMarca`, `PRESET_HALO`) + testes | 1 |
| **F1** | render server: layout de linhas extraído (`layoutTextLines`), fundo desenhado em `renderText` dentro do transform (nítido ou borrado, com opacidade e cantos), `blurRoundedRect` compartilhado com `renderShapeBlurred` | 2 |
| **F2a** | editor: `FundoDoTexto` (Rect que mede `textArr`, cache com folga e `pixelRatio 1/k`, segue drag/transform, herda opacidade da camada); `ShapeNode` adota `escalaDoBlur` | 3 |
| **F2b** | painel: `FundoDeTextoControls` (Ajuste, Cor+Tom, Opacidade, Borda H/V, Cantos, Desfoque, Posição, botão Halo) no Efeitos e no Gradientes; "Halo nos textos" em lote | 4 |
| **F3** | `typecheck` + `lint` + vitest; paridade editor × render em alinhamento esq/centro/dir, âncora meio/base, texto girado, raio 400; confirmar que o PATCH invalida o render agendado | 5 |
| **F4** (opcional) | fundo compartilhado pelo grupo; "calibrar pela foto" no navegador | — |

## 4. Placar da execução

| Fase | Estado |
|---|---|
| F0 | **feito** (`07935f4d`) — 23 testes; o teto do blur foi re-medido durante o F1 e caiu para 160 |
| F1 | **feito** (`dd01693d`) — smoke server-side com 6 casos (caixa, texto+cantos, halo 110, raio 400 com offset, girado, caixa esfumada) |
| blur de forma em escala (ShapeNode + renderShapeBlurred) | **feito** (`806729e2`) — o cache do editor passou a declarar pixelRatio |
| F2a | **feito** (`24af7f48`) |
| F2b | **feito** (`1ff17973`) |
| F3 | **feito** — typecheck + lint + 56 testes; no navegador (template 199 do Quintal, dev server local): "Aplicar halo" em lote, halo salvo aparecendo no carregamento, arraste com o halo junto, Caixa/Texto, desfoque nítido→418 px (k=3), opacidade, swatches da marca; paridade editor × servidor medida por perfil de luminância (diferença ≤ 15 níveis na mancha) |
| F4 | **feito** — bloco-de-fundo pelo grupo (`metadata.groupId`, o Agrupar do PR #77): uma mancha para manchete + apoio, desenhada pelo líder; 8 testes; verificado no navegador (Shift+clique, Cmd+G, "Aplicar halo" → 1 Rect de halo cobrindo os dois) e no servidor (perfil de luminância ≤ 11 níveis). "Calibrar pela foto" continua em aberto |

### O bloco pelo grupo (F4, depois do PR #77)

- **Por que grupo e não proximidade**: o PR #77 deu ao usuário Agrupar/
  Desagrupar (Cmd+G / Cmd+Shift+G) e o arraste em grupo. Unir manchas por
  proximidade (`agruparEmBlocos`, folga 120 — o que o servidor faz em
  `aplicar-halo.ts`) faria a mancha mudar sozinha ao aproximar/afastar textos;
  o grupo é explícito e previsível. Proximidade fica como opção futura.
- **Quem desenha é o LÍDER** (menor `order`, o que fica por baixo), com a
  configuração dele; membros não desenham. Texto girado ou curvo não entra.
- **O servidor precisa enxergar os irmãos**: `renderDesign` passa
  `camadasDoDesign` (já com fieldValues) nas options; `renderLayer` avulso
  sem isso cai no fundo por texto.
- **O follow por eventos de atributo é pré-requisito**: o arraste em grupo
  move os irmãos com `position()` por código, sem dragmove — e o líder ouve
  TODOS os membros, re-medindo a união e re-cacheando só quando o tamanho
  muda.
- **Decisão sobre o reflow em grupos manuais** (o PR deixou para decidir):
  mantido. Editor e servidor (`reflowLayersAfterFill`) leem o mesmo
  `groupId`; se só o editor deixasse de refluir, a arte publicada divergiria
  do editor justamente no texto que cresce.

### O que o teste no navegador ensinou

- 🔴 **O `Rect` do fundo é irmão ANTERIOR do `Konva.Text`, e o React liga refs
  e roda layout effects na ordem da árvore**: no primeiro commit o ref do
  texto ainda é null quando o efeito do fundo roda. Página aberta com halo
  salvo ficava com o Rect em 0×0 (invisível, `Can not cache the node` no
  console) até a próxima mudança da camada. `pronto` (um frame depois)
  reexecuta geometria, cache e assinatura de eventos.
- 🔴 **`api.get` devolve TEXTO quando a resposta não é JSON.** Um redirect
  para `/sign-in` (HTML, 200) na chamada de cores virou
  `colors.map is not a function` e derrubou o editor inteiro. `useBrandColors`
  passou a garantir array — qualquer consumidor novo de lista via `api.get`
  precisa do mesmo cuidado.
- O desfoque grava ao soltar; clicar no TRILHO (16 px abaixo do rótulo) já
  comita — o thumb anda na escala quadrática (50% do curso = 150 px).

### O que a medição do F1 ensinou

- 🔴 **O teto do stack blur é 180, por overflow — não 255, pela tabela.** Raio
  150 borra certo; raio 200 devolve faixas verticais e a mancha SOME (medido no
  render server-side, mesmo algoritmo do Konva). O port saturava em 254, dentro
  da zona quebrada. `escalaDoBlur` usa 160 por buffer.
- **Raio muito maior que a caixa dilui a mancha** (kernel de desvio `raio`
  sobre uma caixa de 150 px de altura): raio 400/600 sai como um brilho largo
  e tênue — é o comportamento esperado (e o do Photoshop); a opacidade
  compensa.
