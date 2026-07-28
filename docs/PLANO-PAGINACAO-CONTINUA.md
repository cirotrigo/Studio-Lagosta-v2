# Plano — Paginação contínua estilo Polotno (dois modos de visualização)

**Data**: 28/07/2026 · **Status**: plano aprovado para execução, nada implementado ainda.

**Pedido do Ciro**: todas as páginas do template abertas uma abaixo da outra no
workspace, navegando por scroll e editando direto em qualquer página — como no
Polotno. **Dois modos**: o padrão passa a ser o contínuo com a barra de páginas
(PagesBar) **recolhida**; o modo atual (uma página por vez + PagesBar expandida)
continua disponível como "modo clássico".

**Origem**: inspeção ao vivo do https://studio.polotno.com (DOM + `window.store`
+ interação real) cruzada com a documentação do SDK (`Workspace` props) e com a
leitura dos arquivos de estado do editor (`template-editor-context`,
`multi-page-context`, `page-sync-wrapper`, `konva-editor-stage`,
`editor-canvas`, `template-editor-shell`, `use-pages`).

**Legenda**: **P** ≈ meio dia · **M** ≈ 1–2 dias · **G** ≈ 3+ dias.

---

## 1. Como o Polotno faz de verdade (referência de UX e arquitetura)

A parte mais valiosa da investigação: o Polotno **não** desenha as páginas num
stage único com offsets. Inspecionando o DOM do studio com 8 páginas:

- **Um `Konva.Stage` por página**, cada um dentro de um
  `div.polotno-page-container`, empilhados num `div.polotno-workspace-inner`
  com **scroll DOM nativo** (`overflow: auto`). Rolar entre páginas é scroll de
  browser, não transform do Konva.
- **Virtualização**: com 8 páginas no store, só ~5 containers tinham `<canvas>`
  no DOM — as páginas perto do viewport (±1–2 de buffer) e **a página ativa,
  que fica sempre montada mesmo fora da tela**. A altura total do scroll é
  reservada por placeholders, então a barra de rolagem não pula quando páginas
  montam/desmontam.
- **Cada stage tem o tamanho da página escalada** (página 1080×1080 a 42% de
  zoom → canvas de ~452px + margens), nunca o tamanho bruto da página. O buffer
  de pixels de cada canvas é pequeno.
- **Página ativa** = classe CSS `active-page` + borda azul
  (`activePageBorderColor` no SDK). A ativa é onde inserções (novo texto, nova
  imagem) acontecem.
- **A ativa muda com o scroll do usuário**: rolando de verdade (wheel), a
  página mais visível vira ativa (prop `scrollToPageThreshold`, default 0.5 =
  mais de 50% visível). Scroll **programático** (scroll-to-page, ajustes de
  layout) não dispara a troca — testado: mudar `scrollTop` via script e
  despachar `WheelEvent` sintético não mudam a ativa; girar a rodinha de
  verdade muda.
- **Seleção sobrevive ao scroll**: rolando para longe da página do elemento
  selecionado, a seleção continua e a toolbar contextual do topo **segue a
  seleção**, não a página visível. Clicar em área vazia de outra página limpa
  a seleção.
- **Controles por página** ficam na faixa entre as páginas (alinhados à
  direita): mover para cima/baixo, duplicar, excluir, adicionar página abaixo.
  O espaçamento entre páginas é fixo em pixels de tela (~90–110px, não escala
  com zoom) e abriga essa faixa. Ao clicar no "+", a página nova é criada,
  vira ativa e a view rola até ela.
- **Zoom** (controle no rodapé, centro) re-escala a coluna inteira — todas as
  páginas juntas; wheel puro é scroll vertical nativo; o auto-fit recalcula o
  zoom quando o workspace muda de largura (abrir painel lateral, por exemplo).
- O rodapé de páginas do studio virou uma **timeline horizontal** de cards
  (viés de vídeo, com duração por página); card ativo com contorno azul.
- Props relevantes do SDK que confirmam o desenho: `renderOnlyActivePage`
  (default **false** — contínuo é o modo padrão do Polotno),
  `scrollToPageThreshold` (0.5), `pageGap`, `activePageBorderColor`,
  `components.PageControls` (controles por página customizáveis).

**Conclusão da referência**: o "modelo Polotno de verdade" é a nossa opção 1
(um stage por página + scroll nativo + virtualização), não a opção 2 (stage
único com offsets). Isso muda o peso da comparação abaixo.

---

## 2. Estado atual do Studio (o que a mudança toca)

- `template-editor-context.tsx`: **um único `design`** = canvas + layers da
  página corrente. Histórico por página via `historiesRef`
  (`Map<pageId, {past, future}>`, LRU de 5) com troca de ponteiro no
  `loadTemplate({historyKey})`. `croppingLayerId` (modo recorte),
  `selectedLayerIds`, `zoom` (um valor só), `stageInstanceRef` (UM stage — é o
  que `generateThumbnail`, `exportStageDataUrl`, `exportDesign` e os
  alinhamentos usam via `stage.findOne`).
- `multi-page-context.tsx`: `pages` (com dedupe por id), `currentPageId`,
  `savePageState` (PATCH único layers+width+height+background+audio),
  `updatePageThumbnail` (fire-and-forget, tolera 404).
- `page-sync-wrapper.tsx`: o coração endurecido por bugs reais de vazamento —
  `lastPageIdRef` (o par página↔design só é salvo se foi essa página que o
  PageSync carregou por último), `isSyncingRef`, `lastSaved*Refs` (diff),
  flush do save pendente **antes** de trocar de página, debounce de 800ms,
  thumbnail 150px pós-save com checagens de corrida. **Nada disso muda.**
- `konva-editor-stage.tsx`: UM `<Stage>` dentro de container com scroll
  nativo; efeito de sincronização zoom→stage.scale com centralização via
  `stage.position` (~linhas 294–340); ResizeObserver de centralização
  (desktop) e auto-fit (mobile ≤768px); marquee; smart guides (threshold
  dividido pelo zoom); atalhos de teclado no `window`; pinch-zoom;
  `Konva.pixelRatio = 1` em mobile retina (mutação **global**).
- `editor-canvas.tsx`: zona de toolbars com altura fixa (118px) acima do
  canvas; atalhos Delete/setas/Cmd+J; **busca o stage via
  `document.querySelector('.konvajs-content')` e `Konva.stages.find(...)`** —
  assume um stage só (armadilha nº 7 abaixo).
- `template-editor-shell.tsx`: `PagesBar` inline (~linha 1369) já com
  `isCollapsed`/`onToggleCollapse` (recolhida vira linha de 40px com
  "Página X de N"); thumbnails DnD (dnd-kit) com clique = `setCurrentPageId`;
  Ctrl+PageUp/PageDown navega; `handleSave` faz a dança de trocar para a
  primeira página → esperar rAF+500ms → `generateThumbnail(300)` → voltar.
  Mobile (≤768px): layout próprio com chips ‹ 1/3 › + drawer de ferramentas.
- `use-pages.ts`: cache manual (create dá append, autosave usa
  `skipInvalidation`, delete/reorder otimistas com rollback).
- PATCH de página invalida renders agendados **só em diff visual real**
  (regra do CLAUDE.md) — o modo contínuo não muda o caminho de escrita, então
  essa regra fica intacta.

---

## 3. Arquiteturas avaliadas

### Opção 1 — Um stage por página, empilhados (modelo Polotno real)

Coluna com scroll DOM nativo; cada página é um slot. O slot da **página
ativa** monta o `KonvaEditorStage` atual (pipeline completo: design do
context, PageSync, transformer, guias, marquee, crop, atalhos). Os demais
slots montam um **preview leve** que "acorda" ao clique/scroll — e acordar é
simplesmente `setCurrentPageId(pageId)`, o mesmo caminho que o clique na
PagesBar usa hoje.

| Prós | Contras |
|---|---|
| Preserva TODO o pipeline de edição e as guardas do PageSync sem tocar nelas — a página ativa continua sendo "a dona do design" | N canvases na memória (mitigável: virtualização como o Polotno, previews dimensionados já escalados, `listening: false`) |
| Coordenadas por página intactas: guias, snap, transformer, crop, margem — zero reescrita | Precisa de um componente de preview e do gerenciamento de "acordar" (1 clique extra para editar página não-ativa, igual Polotno com elemento) |
| Undo por página (Map LRU) funciona sem mudança | Página com vídeo não pode ter `<video>` tocando em preview (usar poster) |
| É literalmente como o Polotno faz — arquitetura validada em produção por eles | Stage ativo precisa de um modo "embutido" (sem scroll próprio, sem centralização via `stage.position`) |

**Estimativa**: G para o MVP navegável (fase 1), M para previews vivos (fase 2).

### Opção 2 — Stage único com todas as páginas em offsets Y

Carregar todas as layers de todas as páginas num design só, desenhar cada
página deslocada em Y, escopar seleção/guias/atalhos por página.

| Prós | Contras |
|---|---|
| Continuidade visual "de verdade" num canvas só; drag de elemento entre páginas sairia de graça | **Reescreve o núcleo mais endurecido do editor**: design deixa de ser "uma página", então PageSync (diff por página, `lastPageIdRef`), autosave (PATCH por página), undo por página e `markSaved` precisam todos virar cientes de pageId — exatamente a área onde os bugs de vazamento entre páginas nasceram |
| | Cada write path (`updateLayer`, alinhamento, colar, z-order) precisa resolver "de qual página é esta layer" |
| | Buffer de canvas gigante ou redraw por frame de scroll: 8 stories = 15.360px de altura lógica; o Konva não recorta sozinho |
| | Export/thumbnail precisam recortar regiões; crop overlay, margem, background e marquee precisam de offset por página |
| | O próprio Polotno **não** usa esse modelo — indício forte de que não compensa |

**Estimativa**: G×2–3 (semanas), com risco alto de regressão em autosave/undo.
**Rejeitada.**

### Opção 3 — Híbrido: ativa editável + vizinhas como imagem

Página ativa = stage atual; as demais = `<img>` (thumbnail persistido ou
dataURL capturado ao sair da página), com IntersectionObserver para ativação
por scroll e clique para acordar.

| Prós | Contras |
|---|---|
| Menor mudança possível; zero stage extra; memória barata | Preview de imagem fica borrado se usar o thumbnail atual (150px) — precisa de captura em ~450px |
| PageSync/undo/atalhos intactos | Piscada breve na troca imagem→stage ao acordar |
| MVP rápido e já navegável | Preview pode ficar defasado até o autosave/captura rodar |

**Estimativa**: M/G para o MVP.

### Recomendação: **Opção 1, chegando lá pela 3** (caminho evolutivo)

A opção 3 **é** a fase 1 da opção 1: mesma coluna, mesmos slots, mesma
ativação — só muda o que o slot inativo renderiza (imagem primeiro, stage
read-only depois). Começamos com previews por imagem (MVP navegável em dias,
risco quase zero), e na fase 2 promovemos os slots visíveis a stages Konva
read-only (`KonvaLayerFactory` com `disableInteractions`, `listening: false`,
vídeo em poster), com virtualização estilo Polotno (placeholder além de ±1
viewport). O estado não muda em nenhuma das fases: **uma página por vez é a
dona do pipeline** — o contínuo é uma camada de apresentação + navegação em
cima do modelo atual.

---

## 4. Especificação da UX dos dois modos

### 4.1 Toggle de modo

- **Onde vive**: na própria PagesBar (canto esquerdo, visível nos dois estados
  recolhida/expandida) — um segmented control de dois ícones: ▤ "Contínuo" e
  ▢ "Página única". É o lugar onde o usuário já pensa em páginas.
- **Persistência**: `localStorage` (`lagosta:editor:view-mode`), por usuário
  do navegador. Sem coluna no banco.
- **Defaults**: desktop = **contínuo + PagesBar recolhida**; se o usuário
  trocar, a escolha persiste (inclusive o estado da barra, que hoje não
  persiste — passa a persistir junto, `lagosta:editor:pages-bar`).
- **Mobile (≤768px)**: o toggle não aparece; mobile continua no modo página
  única com os chips ‹ 1/3 › (corte consciente, § 8).
- Modo clássico = comportamento atual, sem NENHUMA mudança de código no
  caminho dele além do ponto de escolha em `editor-canvas.tsx`.

### 4.2 Modo contínuo — comportamento

- **Coluna de páginas** no lugar do canvas único: cada página num slot com
  a largura/altura dela × zoom, gap fixo de ~48px de tela entre páginas
  (menor que o Polotno — nossos stories são altos), scroll DOM nativo.
- **Página ativa**:
  - **Por scroll**: IntersectionObserver + cálculo de "mais visível" (>50% do
    viewport, com histerese para não oscilar na fronteira). Ativação
    **debounced** (~300ms após o scroll assentar) e **só para scroll de
    usuário** — scroll programático (scroll-to-page, dança do `handleSave`)
    seta um flag e não ativa. Igual Polotno.
  - **Por clique**: clicar em qualquer ponto de uma página inativa a ativa
    (vamos além do Polotno aqui, que ignora clique em área vazia — no nosso
    modelo "acordar" o clique é o gesto natural). Na fase 2, o clique num
    elemento de página inativa ativa a página E seleciona a camada clicada.
  - **Indicador**: ring `primary` de 2px no slot ativo + label "Pag.02" no
    canto superior esquerdo de cada slot (nome da Page).
  - Trocar a ativa = `setCurrentPageId` — flush do PageSync, load do design,
    troca da pilha de undo: exatamente o fluxo de hoje.
- **Controles por página** (estilo Polotno), na faixa do gap, à direita:
  duplicar · excluir · adicionar abaixo. Reordenar continua sendo o drag da
  PagesBar expandida (não replicar o drag na coluna). Handlers já existem no
  `PagesBar` — extrair para um hook `usePageActions()` (já previsto no
  PLANO-EVOLUCAO § 4.5.3).
- **PagesBar recolhida** ganha navegação: além de "Página X de N", uma fileira
  de chips numerados (1 2 3 …) clicáveis — clique = ativa a página + scroll
  suave até ela (`scrollToPage`). Na expandida, o clique no thumbnail passa a
  fazer o mesmo scroll quando o modo é contínuo.
- **Zoom**: um valor para a coluna toda (estado `zoom` atual serve). Auto-fit
  inicial pela largura do container; controles do rodapé, Cmd+± e pinch
  continuam. Wheel puro permanece scroll nativo (decisão antiga mantida).
- **Ctrl+PageUp/PageDown**: continua trocando a ativa e passa a fazer
  scroll-to-page.

### 4.3 O que fica idêntico nos dois modos

- Seleção, marquee e atalhos **dentro da página ativa** (vivem no
  `KonvaEditorStage`, que só existe no slot ativo).
- Guias de margem, smart guides e snap (coordenadas por página — intactas).
- Crop overlay (`croppingLayerId`) — e durante o crop a ativação por
  scroll/clique fica **travada** (guarda explícita no observer).
- Toolbars contextuais no topo (zona fixa de 118px do `editor-canvas`) —
  seguem a seleção, como no Polotno.
- Autosave/PageSync, undo por página, thumbnails da barra.
- `handleSave` (dança da primeira página para o thumbnail), "Gerar Criativo",
  "Agendar" (usam `currentPageId` + `stageInstanceRef`, que continua apontando
  para o único stage editável). O `scrollToPage` é responsabilidade de quem
  chama (clique em chip/thumbnail rola; `handleSave` troca a página SEM rolar
  e restaura no fim).
- Badge da trilha (`design.audio`) — continua refletindo a página ativa.

---

## 5. Fases

### Fase 1 — MVP navegável (contínuo com previews por imagem) — G

1. `use-editor-view-mode.ts`: modo + persistência + default por viewport.
2. `continuous-workspace.tsx`: coluna com scroll, slots por página (dimensões
   da Page × zoom), gap com controles por página, label e ring da ativa.
3. Slot ativo: `KonvaEditorStage` em modo **embutido** (prop `embedded`):
   sem container de scroll próprio, stage dimensionado já escalado
   (`width*zoom × height*zoom`, `scale=zoom`, `position 0,0`), sem os efeitos
   de centralização/auto-fit (a coluna centraliza via CSS). É a única mudança
   dentro do stage — o resto do arquivo não muda.
4. Slots inativos: `page-preview.tsx` — `<img>` do melhor disponível entre
   (a) dataURL capturado em memória ao desativar a página
   (`exportStageDataUrl`-like em ~450px, `Map<pageId, dataUrl>` no client) e
   (b) `Page.thumbnail` (150px) como primeiro paint; placeholder numerado se
   não houver nenhum.
5. Ativação por scroll (IntersectionObserver + debounce + flag de scroll
   programático + trava do crop) e por clique; `scrollToPage(pageId)` via
   registry de refs `pageId → HTMLElement`.
6. Toggle na PagesBar + chips numerados na recolhida + defaults novos
   (contínuo + recolhida no desktop).
7. `editor-canvas.tsx` escolhe workspace pelo modo; modo clássico intocado.

**Critério de aceite**: template de 8 páginas (Abertura do Seu Quinto) abre em
contínuo, rola fluido, edita qualquer página após ativá-la, salva/exporta/
agenda como antes, e o modo clássico continua idêntico ao atual.

### Fase 2 — Previews vivos + virtualização — M/G

1. `page-preview` ganha variante Konva: stage read-only com
   `KonvaLayerFactory` (`disableInteractions`, `listening: false`), sem
   marquee/transformer/guias/atalhos, dimensionado já escalado. Vídeo nunca
   dá autoplay em preview (poster/primeiro frame).
2. Virtualização: só páginas no viewport ±1 montam stage; além disso,
   placeholder com a imagem capturada (altura reservada — scrollbar estável).
3. Acordar com seleção: clique em elemento de página inativa guarda o hit,
   ativa a página e aplica `selectLayer` após o load do PageSync.
4. Captura de dataURL ao desativar página (alimenta os placeholders e o modo
   imagem da fase 1).

### Fase 3 — Polimento e QA — M

1. Scroll suave nas navegações, histerese fina da ativação, transição
   imagem→stage sem piscada perceptível.
2. QA de performance com o template de 8 páginas (uma com vídeo): medir
   memória/FPS com previews vivos vs imagem; se necessário, rebaixar o
   default da fase 2 para "vivos só ±1 da ativa".
3. Decisão sobre mobile contínuo (hoje cortado) com base nas medições.
4. Sessão de teste com template descartável em produção (nunca em template de
   cliente — write invalida render agendado).

---

## 6. Arquivos a tocar

| Arquivo | Mudança |
|---|---|
| `src/components/templates/continuous/continuous-workspace.tsx` | **novo** — coluna, slots, observer, controles por página |
| `src/components/templates/continuous/page-preview.tsx` | **novo** — preview imagem (F1) / stage read-only (F2) |
| `src/hooks/use-editor-view-mode.ts` | **novo** — modo + localStorage + defaults |
| `src/components/templates/editor-canvas.tsx` | escolhe workspace pelo modo; corrigir lookup de stage (armadilha 7) |
| `src/components/templates/konva-editor-stage.tsx` | prop `embedded` (dimensionamento/centralização); resto intacto |
| `src/components/templates/template-editor-shell.tsx` | toggle na PagesBar, chips na recolhida, defaults, `usePageActions()` extraído |
| `src/contexts/multi-page-context.tsx` | (mínimo) expor registry/scrollToPage se não ficar no workspace |
| `src/components/templates/page-sync-wrapper.tsx` | **não tocar** |
| `src/contexts/template-editor-context.tsx` | **não tocar** (zoom/histórico/stageInstance já servem) |

---

## 7. Riscos e armadilhas (lista explícita)

1. **Guardas do PageSync são sagradas**: ativação por scroll/clique passa
   SEMPRE por `setCurrentPageId` e nunca carrega design por fora. O flush
   antes da troca, `lastPageIdRef`, `isSyncingRef` e os checks de corrida do
   thumbnail já cobrem o resto — qualquer atalho aqui reabre o vazamento de
   layers entre páginas que motivou as guardas.
2. **Tempestade de trocas**: scroll rápido por 8 páginas não pode disparar 8
   flush+load (e o LRU de histórico só guarda 5). Debounce da ativação até o
   scroll assentar + histerese no "mais visível".
3. **Crop mode**: `croppingLayerId != null` trava ativação por scroll E por
   clique — trocar de página no meio do recorte descartaria o gesto.
4. **`handleSave`**: a dança da primeira página vai disparar o observer se
   fizer scroll — trocar página programaticamente NÃO rola a view, e o flag
   de "scroll programático" segura o observer durante restauração.
5. **`editor-canvas.tsx` assume stage único** (`querySelector('.konvajs-content')`
   e `Konva.stages.find`): com previews Konva na fase 2 existirão N stages.
   Trocar por `stageInstanceRef` do context (a fonte da verdade do stage
   ativo) ANTES de montar o segundo stage. Previews jamais chamam
   `setStageInstance`.
6. **Vídeo em preview**: cada camada de vídeo cria um `HTMLVideoElement`;
   N páginas de vídeo tocando = memória e CPU. Preview usa poster e não monta
   `<video>`.
7. **Dimensionar stages já escalados**: o stage atual nasce com o tamanho
   bruto da página (1080×1920 CSS px ≈ 33MB de buffer em dpr 2) e depois é
   redimensionado pelos efeitos. No modo embutido/preview, nascer com o
   tamanho escalado — é o que faz N páginas caberem na memória (é o que o
   Polotno faz).
8. **`Konva.pixelRatio` é global**: o ajuste mobile muta o global; previews
   não podem depender de pixelRatio por stage — a resolução deles vem do
   dimensionamento escalado (item 7).
9. **Atalhos de teclado no `window`**: só o `KonvaEditorStage` (ativo) e o
   `editor-canvas` registram — previews não registram nada, senão Delete
   apagaria camada de página errada.
10. **Thumbnail 150px borrado** no primeiro paint dos previews: aceitável no
    MVP; a captura em ~450px ao desativar resolve nas visitas seguintes. Não
    aumentar o thumbnail persistido sem medir o peso no banco (é dataURL na
    coluna `Page.thumbnail`).
11. **Páginas com dimensões diferentes** no mesmo template: o slot usa
    `page.width/height` individuais — não assumir uniformidade.
12. **Testes em produção** (`.env` aponta para produção): usar template
    descartável próprio; nunca salvar em template de cliente (PATCH visual
    invalida o render agendado e o cron não revisita RENDERED).

---

## 8. Cortes conscientes

- **Mobile contínuo**: fora do escopo inicial. O mobile tem auto-fit, pinch
  e drawer próprios; contínuo lá exige medição antes (fase 3 decide).
- **Stage único (opção 2)**: rejeitado — risco alto, e nem o Polotno faz assim.
- **Todas as páginas editáveis simultaneamente** (multi-stage totalmente vivo
  como o Polotno): não no início — o modelo continua "uma página dona do
  pipeline por vez"; o acordar-com-seleção da fase 2 entrega 95% da sensação.
- **Drag de camada entre páginas** e **marquee atravessando páginas**: não;
  copiar/colar já cobre o caso real.
- **Zoom independente por página**: não; zoom é da coluna.
- **Reordenar páginas arrastando slots na coluna**: não; o drag da PagesBar
  expandida já faz isso.

---

## 9. Registro das observações do Polotno (evidências)

Colhidas em sessão ao vivo (28/07/2026, studio.polotno.com, 8 páginas de
teste; screenshots na sessão de pesquisa):

- `window.store` exposto: `pages`, `activePage`, `scale`; 8 páginas no store
  com só 5 `.polotno-page-container` no DOM (virtualização) e altura total
  reservada (`scrollHeight` ≈ 8 × altura do slot).
- Página ativa permaneceu a nº 7 com a view na nº 0 após `scrollTop = 0`
  programático e `WheelEvent` sintético; mudou para a nº 6 no primeiro wheel
  real — ativação por scroll é gated em gesto de usuário.
- Seleção de texto criada na página ativa continuou selecionada (e a toolbar
  de texto no topo continuou armada) com a view em outra página.
- Faixa de controles por página entre os slots: ↑ ↓ duplicar lixeira +;
  "+" cria, ativa e rola até a página nova.
- Zoom auto-ajustou de 47%→42%→25% conforme painéis laterais/timeline
  roubaram espaço do workspace.
