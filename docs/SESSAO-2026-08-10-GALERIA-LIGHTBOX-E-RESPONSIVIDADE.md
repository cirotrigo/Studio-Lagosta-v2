# Sessão 10/08/2026 — galeria de criativos: lightbox e responsividade

Quatro PRs (#26, #27, #28, #29). O pedido de entrada era "o lightbox não
navega, e a página quebra no iPad". O "não navega" tinha **três causas
distintas e independentes**, descobertas uma de cada vez, e só a terceira era
a que o usuário estava vendo.

---

## 1. As três causas do "não navega"

### 1.1 Setas escondidas em tela de toque (PR #26)

O `photoswipe.css` esconde as setas em qualquer aparelho com toque:

```css
.pswp--touch     .pswp__button--arrow { visibility: hidden;  }
.pswp--has_mouse .pswp__button--arrow { visibility: visible; }
```

`pswp--touch` entra quando `'ontouchstart' in window || maxTouchPoints > 1`.
`pswp--has_mouse` só entra com um `mousedown` real, ou no `updateSize` se
`matchMedia('(any-hover: hover)')` casar. **No iPad e no celular nenhuma das
duas acontece**: a galeria abria com o contador certo, o arrasto funcionando e
nenhum controle à vista.

Correção: `mainClass: 'pswp--nav-sempre-visivel'` + regra em
`src/hooks/use-photoswipe.css`. Detalhes e armadilhas em
`docs/photoswipe-lightbox.md`.

### 1.2 A grade ordenava por coluna (PR #27)

As duas galerias usavam masonry de colunas CSS (`columns-*`), que preenche a
primeira coluna INTEIRA antes de passar para a segunda. Com 58 itens em 5
colunas, a linha de cima mostrava os itens **#1, #13, #25, #37 e #49** — as
artes mais recentes não ficavam em cima, e o "próximo" do lightbox (que segue a
ordem do DOM) ia para o card de BAIXO, não para o da direita.

Correção: `grid` de verdade, que ordena por linha. **`items-start` é
obrigatório** — sem ele o item estica até a altura da linha e a `aspect-ratio`
do card é ignorada, deformando a arte.

Custo assumido: perde-se o encaixe irregular do masonry.

### 1.3 A causa real — regra global recortando o slide (PR #29)

Esta era a que o usuário via. O `globals.css` tem, em `@layer base`:

```css
.container,
[class*="container"] { max-width: 100vw; overflow-x: hidden; }
```

O seletor por **substring** casa com `.pswp__container`, o carrossel do
PhotoSwipe. Medido em produção no instante da falha:

| elemento | transform | overflow |
|---|---|---|
| `.pswp__container` | `−2050px` | **`hidden auto`** |
| slide ativo (`.pswp__item`) | `+2050px` | `hidden` |

Os dois transforms se cancelam e a arte cai no centro da tela — mas o
`overflow-x: hidden` faz o contêiner recortar pela **própria caixa**, que está
lá em −2050. O slide fica inteiro fora dela e não é pintado.

Por isso **o primeiro slide sempre funcionou** (transform 0, sem recorte) e a
falha só aparecia ao navegar.

**O diagnóstico só saiu quando parei de olhar o carregamento.** A `<img>`
estava impecável — `complete: true`, 2160×3840, `opacity: 1`,
`visibility: visible`, posicionada em (676,0) com 513×912 dentro da viewport.
O que denunciou foi `document.elementsFromPoint()` no centro dela: devolvia
`.pswp__scroll-wrap`, **nunca a própria imagem**. Elemento com caixa correta
que não aparece no hit-test do próprio centro = recorte ou clipping de
ancestral. Daí foi só subir a árvore lendo `overflow` e `transform`.

---

## 2. Desempenho: a galeria baixava a si mesma em resolução cheia (PR #28)

Medido em produção, numa única carga da galeria do projeto 8:

| | antes | depois |
|---|---|---|
| Bytes de imagem na carga | **38,22 MB** | **0,89 MB** |
| Downloads da arte original | **54** | **0** |

54 era exatamente o número de criativos do projeto — **um download do original
por card**. A origem: um `new window.Image()` por card apontando para a arte
ORIGINAL, só para ler `naturalWidth/naturalHeight`. A medição já vinha de graça
do `onLoad` da `<Image>`.

### O defeito que a sonda mascarava

Ao removê-la, apareceu isto: o `onLoad` gravava **no estado do React o tamanho
da MINIATURA** (360×639 numa janela pequena) e o re-render sobrescrevia o
`data-pswp-*` que o código imperativo tinha acabado de corrigir. O lightbox
abria a arte em 360px, sem zoom útil.

É a mesma disputa que explica o histórico daquele arquivo (PRs #14, #15, #16,
#20 e um `PSWP_FIX_VERSION` de cache-bust). **Encerrada:** o estado guarda a
PROPORÇÃO, e `data-pswp-*` é derivado dela no render por
`dimensoesParaLightbox()` — que usa as dimensões declaradas quando a proporção
bate (preservando zoom na resolução cheia) e cai numa caixa de 1080 quando não
bate, caso dos criativos recuperados do Drive, cujo `Template.dimensions`
mente. Sobrou **uma** escrita imperativa, no caminho lento, onde o re-clique é
síncrono e o render não aconteceria a tempo.

---

## 3. Responsividade (PR #26)

No celular a galeria só começava a **~800px** de rolagem; passou a **~430px**.

- breadcrumb e descrição saem abaixo de `sm` via `compactOnMobile` — opt-in por
  página, porque o cabeçalho do shell é o mesmo para todo mundo. O breadcrumb
  deixou de ser hifenizado pelo `hyphens: auto` global, que produzia
  `Dash-board > Proje-tos > Criati-vos` em três linhas;
- filtros num painel colapsável com contador de filtros ativos; a partir de
  `lg` continua tudo à vista;
- os chips de dia quebram linha — Sáb e Dom ficavam cortados fora do card.

**iPad em pé (768–1023px):** com a sidebar aberta a topbar tem ~480px úteis. O
saldo de créditos quebrava **um dígito por linha** (`4 / 8 / 7`), cortesia do
`word-break: break-word` que o `globals.css` aplica até 768px; e o botão
"Gerenciar créditos" espremia o seletor de organização até sobrar a setinha.

**No card**, os até 5 botões de ação saíam pela borda direita num card de
~140px. Agora encolhem (`min-w-0`, sem padding lateral): último botão em 173px
num card que termina em 182px.

---

## 4. Armadilhas que sobrevivem a esta sessão

- **`[class*="container"]` no `globals.css` pega classe de terceiro.** Já
  pegou o `.pswp__container`. Qualquer biblioteca cuja classe contenha
  "container" herda `max-width: 100vw` e `overflow-x: hidden` sem ninguém
  pedir. Ver a seção correspondente no CLAUDE.md.
- **Elemento com caixa correta que não aparece no `elementsFromPoint` do
  próprio centro** é recorte de ancestral, não problema de carregamento.
  Medir `complete`/`naturalWidth` não enxerga isso.
- **`lg:max-w-sm` e `sm:ml-auto` não geram CSS nesta build** (`sm:max-w-sm`
  gera). Vale a variante que já existe em outro ponto do código-fonte, não a
  variante em si — `grep` pela classe exata antes de usar.
- **Cache de produção engana duas vezes.** Depois de dois merges a página só
  mostrou o código novo após recarga forçada. Antes de concluir que um deploy
  não subiu, force o recarregamento e confirme por estilo computado.
- **PhotoSwipe usa placeholder de imagem só no primeiro slide.** Ver
  `docs/photoswipe-lightbox.md`.
