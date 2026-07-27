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

---

## 2. Setas do teclado posicionam a seleção

**Commit:** `ab9884f`

As setas rolavam a página. Agora movem a seleção: **1px**, ou **10px com
Shift**, em `editor-canvas.tsx` junto dos atalhos que já existiam (Cmd+J,
Delete). Vale para seleção múltipla e ignora camadas travadas.

**Armadilha:** o `preventDefault` só acontece quando há algo selecionado para
mover. Sem seleção, a seta volta a rolar a página normalmente — o atalho não
sequestra a tecla à toa. Quem mexer nisso precisa manter essa saída.

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

### Próximos passos sugeridos

1. Decidir se o render server-side deve crescer a caixa como o editor. Hoje um
   `slotValues` mais longo que o texto do template é cortado em silêncio.
2. `docs/alignment-controls-summary.md` descreve a regra antiga
   (`selectedCount < 2`); foi atualizado, mas o documento é de 2025 e merece uma
   revisão completa.

### Nota de processo

Todos os testes desta sessão rodaram em **templates descartáveis**, criados e
apagados na hora — a correção do procedimento que a sessão anterior recomendou
depois de perder camadas de um template de produção.

Três defeitos desta lista (`fff1467`, `0151182` e o corte no render) **não
apareceram em teste**: saíram de conferir o código antes de escrever esta
documentação.

O ambiente atrapalhou: o `.next` corrompeu três vezes — numa delas havia um
`next build` rodando junto do `next dev`, e os dois escrevem na mesma pasta — e
o Neon respondeu em 15–19s por requisição em certos momentos. Nada disso vinha
do código, mas custou boa parte do tempo de verificação.
