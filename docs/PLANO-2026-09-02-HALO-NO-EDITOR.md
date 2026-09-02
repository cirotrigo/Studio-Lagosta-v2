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
em `konva/lib/filters/Blur.js`): raio ≥ 256 indexa `undefined` e a mancha sai
QUEBRADA (NaN nos pixels). O port do servidor (`src/lib/konva/filters/apply.ts`)
satura em 254 — o slider subiria e nada mudaria, em silêncio. O `ShapeNode` só
ia até 200, então nunca bateu.

`escalaDoBlur(raio)` devolve `{ k, raioNoBuffer }` com `k = ceil(raio/200)`:
o editor cacheia o `Rect` com `pixelRatio: 1/k` e `blurRadius = raio/k`; o
servidor desenha o offscreen a `1/k`, borra `raio/k` e blita escalado de volta.
A mancha é lisa por natureza — a redução não custa nada visual — e o custo fica
LIMITADO: raio 600 num bloco de 800×300 seria 16 MP em escala 1; a 1/3, 1,8 MP.

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

_(preenchido conforme cada fase entra)_

| Fase | Estado |
|---|---|
| F0 | — |
| F1 | — |
| F2a | — |
| F2b | — |
| F3 | — |
| F4 | não iniciada (opcional) |
