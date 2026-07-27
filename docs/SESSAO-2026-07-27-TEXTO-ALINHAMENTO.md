# Sessão 27/07/2026 — Texto e alinhamento no editor

Continuação de [SESSAO-2026-07-26-EDITOR-INSTAGRAM.md](./SESSAO-2026-07-26-EDITOR-INSTAGRAM.md).
Sete mudanças no editor de templates, todas na mesma área: como o texto nasce,
onde ele se posiciona e como a caixa se comporta.

Cada item diz **o que mudou**, **por que** e **a armadilha** — essa última parte
é o que costuma se perder e voltar a morder.

---

## 1. Padrão do texto novo: sem negrito, entrelinha 1

**Commit:** `60bec79`

Todo texto adicionado nascia em **negrito** com **entrelinha 1.2**. O peso vinha
dos botões de Adicionar texto (`700` no Título, `500` no Subtítulo) e a
entrelinha do `createDefaultLayer`, em dois lugares (`style` e `autoWrap`).

Agora o padrão é `fontWeight: '400'` e `lineHeight: 1`, definido num lugar só —
`createDefaultLayer` em `template-editor-context.tsx`. Os botões Título /
Subtítulo / Corpo passaram a variar **apenas tamanho e família**, herdando peso
e entrelinha do padrão.

**Armadilha:** os *fallbacks* de renderização continuam em `?? 1.2`, de
propósito. Camadas antigas sem `lineHeight` explícito seguem em 1.2 — mudar o
fallback reflowaria silenciosamente o texto de todos os templates já existentes.
Só o que nasce a partir de agora usa 1.

**Armadilha maior — a entrelinha mora em dois campos.** No `render-engine`
(server-side) a precedência é `textboxConfig.autoWrap.lineHeight ?? style.lineHeight ?? 1.2`,
ou seja, **o `autoWrap` ganha do `style`**. Todo texto criado pelo editor grava
os dois. Quem escrever em só um deles produz editor e arte exportada com
entrelinhas diferentes.

Foi assim que **dois** defeitos passaram, ambos invisíveis no editor:

1. O botão Auto gravava `autoWrap.lineHeight: ... ?? 1`. Ligar o Auto numa
   camada antiga sem `style.lineHeight` apertava a entrelinha da arte de 1.2
   para 1. Corrigido em `df0a105` — o fallback do botão virou 1.2, o mesmo do
   renderer.
2. `buildComboLayers` gravava o valor do catálogo no `style` e um **1 fixo** no
   `autoWrap`. Como o render prefere o `autoWrap`, **toda combinação aplicada
   saía achatada na arte agendada**: 9 das 10 entrelinhas do catálogo divergiam
   (1.5 → 1, 1.3 → 1); só quem já era 1 escapava. Mesmo problema em
   `arte-livre.ts` (style 1.1, autoWrap 1). Corrigido em `82e09c4`.

**Por que ninguém viu:** o download direto do editor é `stage.toDataURL()` — o
próprio Konva, que lê `style.lineHeight`. Só o que passa pelo `RenderEngine`
(story agendado, thumbnail, carrossel) usava o campo errado. **Conferir a arte
pelo botão de exportar do editor não pega essa classe de bug** — é a mesma
armadilha do Montserrat/Arial da sessão anterior, em outro campo.

Camadas já gravadas mantêm `autoWrap: 1`; a correção vale para o que for
aplicado a partir de agora.

**Armadilha vizinha — o peso não viaja por `fontStyle`.** No Konva o peso vai na
prop `fontVariant` (`fontVariant={String(layer.style.fontWeight)}`), porque a
font string montada é `${fontStyle} ${fontVariant} ${fontSize}px ${fontFamily}`
— `normal 400 36px Montserrat` é CSS válido e funciona por isso. Trocar para
`fontStyle` "para consertar o peso" **derruba o itálico**. O render server-side
monta a string por outro caminho (`buildFontString`).

---

## 2. Setas do teclado posicionam a seleção

**Commit:** `ab9884f`

As setas rolavam a página. Agora movem a seleção: **1px**, ou **10px com
Shift**, em `editor-canvas.tsx` junto dos atalhos que já existiam (Cmd+J,
Delete). Vale para seleção múltipla e ignora camadas travadas.

**Armadilha:** o `preventDefault` vem **depois** do filtro de camadas travadas e
do `if (alvos.length === 0) return`, então a tecla só é consumida quando há algo
destravado para mover. Hoje isso não protege scroll nenhum — o editor é
`h-dvh` e não rola —, mas mantém a seta livre para quem estiver focado em outro
elemento e para qualquer painel rolável que venha a existir. Quem mexer no
handler precisa manter essa ordem.

A seta chama `moveLayer` direto e **não passa pelo snap nem pelas guias
inteligentes** — essas só rodam no `onDragMove`/`onDragEnd` do ponteiro. É o
comportamento desejado (a seta existe justamente para o ajuste fino que o snap
atrapalharia), mas explica por que arrastar e teclar dão resultados diferentes
perto de uma guia. Também não há limite de canvas: dá para empurrar a camada
inteira para fora da área visível sem aviso.

Mais três coisas que só aparecem lendo o `moveLayer`:

- **Ele não checa `locked`** — nem ele nem o `updateLayer` que chama. A
  verificação vive só no chamador. Chamador novo que esqueça o filtro move
  camada travada em silêncio.
- **O arredondamento é do resultado, não do delta:** `Math.round(x + delta)`.
  Camada em `x = 100.4` vai para 101 na primeira seta — deslocamento real de
  0.6px. Posições fracionárias herdadas de arraste se normalizam no primeiro
  toque.
- **Cada seta empilha um item de histórico**, e o handler chama `moveLayer` uma
  vez por camada: uma tecla com 3 selecionadas exige 3 Cmd+Z. Como o `past` é
  limitado a 50, segurar a seta apaga o undo anterior em poucos segundos.

Cmd/Ctrl/Alt+seta não são interceptados de propósito — só o Shift, que é o
multiplicador.

---

## 3. Alinhamento passou a valer com um elemento só

**Commits:** `0ec30d9`, `fff1467`

Os botões de alinhar ficavam **desativados** na seleção única: eles só alinhavam
elementos entre si, então com um só não havia o que fazer e clicar não produzia
nada. Era o que os usuários relatavam como "o alinhamento não funciona".

- **1 elemento** → o alvo é a **página**.
- **2 ou mais** → alinha **entre si**, como antes.
- O rótulo diz qual dos dois está valendo (`1 sel. · na página`).

Os seis callbacks do contexto eram cópias do mesmo bloco de ~40 linhas; viraram
`alinharSelecao(axis, mode, forcarCanvas)`. "Centralizar na página" é o mesmo
caminho com o alvo forçado — 165 linhas de `alignToCanvasCenterH/V` ficaram
órfãs e foram removidas (`0151182`).

**Armadilha (custou um segundo commit):** o mesmo controle existe em **duas
telas** — o painel de propriedades e a barra no topo do canvas
(`alignment-toolbar.tsx`). A primeira correção pegou só o painel; a barra do
topo, que é a mais visível, continuou com `selectedCount < 2` e os botões
mortos. **Mexeu em alinhamento, confira as duas.**

Os atalhos `Shift+Ctrl+L/C/R/T/M/B` **existem** e ficam em
`konva-editor-stage.tsx`, não em `editor-canvas.tsx` — procurar no arquivo
errado dá a impressão de que os tooltips mentem.

---

## 4. Alinhar encosta na margem de segurança, não na borda da página

**Commit:** `7661b52`

"Alinhar à esquerda" levava o elemento até `x = 0`, a borda da página — onde o
conteúdo justamente **não** deve ficar, porque a interface do Instagram cobre as
bordas. Agora encosta nas **guias azuis pontilhadas**.

O valor `70` estava solto em cinco lugares: as quatro linhas das guias e a
constante do snap, todas em `konva-editor-stage.tsx`. Virou `CANVAS_MARGIN` em
`src/lib/canvas-margin.ts`, usado pelas guias, pelo snap e pelo alinhamento.

Centralizar não mudou: a margem é simétrica.

**Armadilhas:**
- `getClientRect({ relativeTo: layerInstance })` é obrigatório. Sem o
  `relativeTo`, a caixa vem em coordenadas de tela e o erro **cresce com o
  zoom** — o alinhamento fica certo em 100% e errado em 30%.
- Um bloco mais largo que a área útil não tem como encostar numa margem sem
  estourar a outra; nesse caso `alignToCanvas` centraliza, que é o menor dos
  males. Sem esse desvio, o elemento sairia da página.

---

## 5. Âncora vertical e crescimento automático da caixa

**Commits:** `7661b52`, `63f7dcb`

O nome da funcionalidade é **alinhamento vertical (âncora)** + **crescimento
automático**. Metade já existia e ninguém sabia: `textboxConfig.anchor`
(`top | middle | bottom`) estava no modelo de dados **e o render server-side já
o respeitava** (`render-engine.ts`, `renderLines`). Só o editor ignorava — dava
para ter a arte exportada com o texto embaixo e o editor mostrando em cima.

No popover **Mais opções de texto**, seção **Texto na caixa**:

| controle | o que faz |
|---|---|
| topo / meio / base | onde o texto encosta dentro da caixa |
| **Auto** | a caixa acompanha o texto quebrado |

Com o Auto ligado, a caixa cresce **no sentido oposto à âncora**: na base, a
borda de baixo fica parada e a caixa sobe; no topo, desce; no meio, abre para os
dois lados.

Medido no editor, caixa de 400px, mesmo texto, só trocando o modo:

| modo | posição do texto |
|---|---|
| topo | topo da caixa |
| meio | centro |
| base | base da caixa |

E com Auto ligado e âncora na base, ao passar de 1 para 4 linhas: altura
84 → 300, `y` 948 → 732, **borda de baixo parada em 1032**.

**Armadilhas — as três que custaram travamento ou retrabalho:**

1. **Medir a altura no próprio nó não funciona.** Com altura fixa, o Konva
   **para de quebrar linha** ao encher a caixa. O nó da tela nunca revela que o
   texto precisa de mais linhas, então a caixa jamais cresceria. A medida sai de
   um `Konva.Text` descartável, sem altura.
2. **O efeito escreve no estado que o dispara.** Sem uma trava por assinatura
   das entradas de quebra (conteúdo, largura, fonte, peso, entrelinha,
   espaçamento, âncora), um pixel de divergência vira
   *"Maximum update depth exceeded"*. O `onChange` também vem de uma arrow
   inline e muda de identidade a cada render — por isso vive num ref.
3. **Com Auto ligado a caixa abraça o texto**, então a âncora deixa de mudar a
   posição e passa a mandar só na direção do crescimento. Parece que o controle
   não faz nada. Os rótulos dizem isso; se for preciso ver a âncora movendo o
   texto, desligue o Auto e deixe a caixa maior que o texto.

**Decisão:** texto novo nasce com `anchor: 'top'` e `autoExpand: true`.
Combinações tipográficas (`font-combinations-layers.ts`) e artes geradas
(`arte-livre.ts`) **desligam explicitamente** — elas gravam a altura que o
usuário ajustou, e o crescimento automático a sobrescreveria.

Efeito colateral do padrão ligado: a altura que `adicionarTexto` calcula
(`fontSize × lineHeight × 2`, espaço para duas linhas) vira só um valor
transitório — o crescimento automático a substitui pela altura real do texto no
mesmo instante. Como o `y` de centralização é calculado com a altura antiga, o
texto nasce um pouco acima do centro do canvas. É cosmético, mas quem for mexer
em `adicionarTexto` vai achar que o cálculo de altura não faz nada.

### ⚠️ O crescimento é do editor, não do render

`render-engine.ts` respeita `anchor`, mas **não conhece `autoExpand`**: ele
desenha com a altura gravada e **corta** o que passar dela
(`renderLines`, `if (currentY > maxHeight) break`).

Na prática funciona porque o editor grava a altura já crescida. Mas em
**story agendado por template**, o texto entra por `slotValues` no servidor — se
a cópia for mais longa que a que passou pelo editor, **ela é cortada**, e nada
cresce a caixa ali. Decisão pendente: fazer o render crescer também mudaria arte
antiga (texto hoje cortado passaria a aparecer).

---

## 6. Fim do negrito

**Commit:** `7661b52`

O botão de negrito saiu da barra de texto e do editor de rich text. O peso agora
vem **da variante da fonte** escolhida no seletor de família (ex.: "Montserrat
Bold" → família `Montserrat`, peso `700`).

**Por que, além da preferência:** o botão marcava um peso que a fonte pode não
ter. O navegador **sintetiza** um falso negrito nesse caso e o render
server-side **não** — as duas telas divergiam em silêncio. É a mesma família do
bug do Montserrat/Arial documentado na sessão anterior.

**Armadilha que a remoção abriu:** `handleFontFamilyChange` só gravava
`fontWeight` quando a variante trazia um peso; para família simples o peso
antigo sobrevivia no `...selectedLayer.style`. Enquanto existia o botão de
negrito isso passava despercebido — dava para desligar por ali. Sem ele, **uma
camada em 700 não tinha mais como voltar a regular**. Corrigido em `df0a105`: o
peso é sempre reescrito, como o seletor do painel de propriedades já fazia.

Saiu junto o `simple-text-panel.tsx`, órfão desde que a aba Texto virou o
`TextToolsPanel` — 148 linhas que ainda aplicavam peso 700/600/500/400 e
rotulavam os botões de "Bold".

---

## 7. A armadilha que atravessa tudo: o cache do Konva

**Commit:** `63f7dcb`

Trocar topo/meio/base **não mudava nada na tela**, embora o dado mudasse.

A camada de texto é **cacheada como bitmap** sempre que `fontSize > 24` — ou
seja, em praticamente todo título. As duas invalidações de cache em
`konva-editable-text.tsx` tinham **listas de dependências escritas à mão**, e
`textboxConfig` não estava em nenhuma delas. O Konva continuava blitando a
imagem antiga e o controle parecia morto.

Isso também explica por que o teste inicial *pareceu* passar: recarregando a
página, o cache nasce correto. Só a troca **ao vivo** ficava presa.

As listas viraram uma assinatura de tudo que muda o desenho:

```ts
const assinaturaRender = JSON.stringify([
  layer.content, layer.size, layer.style, layer.effects, layer.textboxConfig,
])
```

**Armadilha:** qualquer campo novo que afete o desenho de um texto precisa estar
nessa assinatura. Com lista manual, esquecer um campo não dá erro — dá um
controle que não funciona, e é caro de diagnosticar. O recache agora tem um dono
só; o segundo efeito ficou apenas com o `transformer.forceUpdate()`.

---

## Estado ao fim da sessão

| Área | Situação |
|---|---|
| Padrão do texto novo | ✅ regular, entrelinha 1, Auto ligado |
| Setas do teclado | ✅ 1px / 10px com Shift |
| Alinhamento na seleção única | ✅ nas duas telas |
| Margem de segurança no alinhamento | ✅ `CANVAS_MARGIN` = 70 |
| Âncora vertical | ✅ editor e render server-side de acordo |
| Crescimento automático | ✅ no editor; ⚠️ o render não cresce |
| Negrito | ✅ removido; peso vem da variante |
| Regressões da releitura | ✅ peso e entrelinha corrigidos (`df0a105`) |
| Entrelinha das combinações no render | ✅ os dois campos batem (`82e09c4`) |

### Próximos passos sugeridos

1. Decidir se o render server-side deve crescer a caixa como o editor. Hoje um
   `slotValues` mais longo que o texto do template é cortado em silêncio. É o
   único item desta sessão que continua sendo um defeito conhecido.
2. `docs/alignment-controls-summary.md` descreve a regra antiga
   (`selectedCount < 2`); foi atualizado, mas o documento é de 2025 e merece uma
   revisão completa.

### Nota de processo

Todos os testes desta sessão rodaram em **templates descartáveis**, criados e
apagados na hora — a correção do procedimento que a sessão anterior recomendou
depois de perder camadas de um template de produção.

Sete achados desta lista **não apareceram em teste** — saíram de reler o código
com ceticismo antes de escrever esta documentação, boa parte com verificação
adversarial (agentes tentando derrubar cada afirmação lendo o código atual):

- a barra de alinhamento do topo, que tinha ficado para trás (`fff1467`);
- 165 linhas órfãs em `konva-alignment.ts` (`0151182`);
- o `simple-text-panel.tsx` órfão, 148 linhas ainda aplicando peso 700
  (`df0a105`);
- o peso preso em 700 sem caminho de volta, aberto pela remoção do negrito
  (`df0a105`);
- a entrelinha apertada ao ligar o Auto em camada antiga (`df0a105`);
- **a entrelinha de toda combinação achatada no render agendado** (`82e09c4`) —
  o mais grave, e o mais invisível: só aparecia em arte que passa pelo
  `RenderEngine`, nunca no editor;
- o corte do texto no render server-side, ainda em aberto.

Todos passariam por qualquer teste manual rápido no editor. Vale manter o
hábito: depois de mexer no editor, reler o que mudou procurando **a segunda
tela**, **o campo que ficou de fora da lista** e **o que o editor desenha por um
caminho e o servidor por outro**.

O ambiente atrapalhou: o `.next` corrompeu três vezes — numa delas havia um
`next build` rodando junto do `next dev`, e os dois escrevem na mesma pasta — e
o Neon respondeu em 15–19s por requisição em certos momentos. Nada disso vinha
do código, mas custou boa parte do tempo de verificação.
