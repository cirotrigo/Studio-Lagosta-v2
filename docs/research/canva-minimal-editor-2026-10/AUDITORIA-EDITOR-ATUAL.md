# Auditoria do editor atual — Studio Lagosta

> **Read-only.** Código auditado: `origin/main` **`1cab1ab85fb89a3f432a7be8380c707e6a3a1cde`** (merge do PR #223),
> num worktree destacado, sem tocar no checkout compartilhado. Data: 14/10/2026.
>
> **Método.** Seis auditores paralelos, cada um com uma pergunta-chave (A modelo de layers, B canvas/Konva, C UI/UX,
> D cores/marca, E persistência/render, F templates/arquétipos). Os relatórios completos, com cada afirmação citada em
> `arquivo:linha` e marcada OBSERVADO ou INFERÊNCIA, estão em `evidencias/auditoria/auditor-*.md`. Esta página consolida.
> As linhas que sustentam a decisão principal (os dois ramos `svg-path`, os `default` de despacho, os enums de tipo, o
> `reverter`, o Transformer, a canonização de shape e o normalizador do desktop) foram **reconferidas por mim** no
> worktree antes de entrarem aqui.
>
> **Legenda:** [OBS] observado no código · [INF] inferência a partir do código, não executada.

---

## 1. Resumo em dez linhas

1. **Já existe vetor no editor:** a camada `shape` com `shapeType: 'svg-path'` guarda o path `d` congelado na camada
   (`style.pathData/pathViewBox/pathFillRule`) e é desenhada pelo editor e pelo servidor. É monocromática: um `fill` e um
   `stroke` (`src/types/template.ts:191-195`; `konva-layer-factory.tsx:1518-1560`; `render-engine.ts:1843-1862`). [OBS]
2. A biblioteca de formas (`src/lib/assets/shapes-library.ts`, 37 entradas, 23–27 `svg-path`) já declara a regra certa:
   "forma nova é UMA entrada de dados, sem case novo no editor nem no render". [OBS]
3. **Um `type` novo some em silêncio** em quase toda superfície: o editor devolve `null`, o servidor pula com
   `console.warn` e publica a arte com buraco como RENDERED, o "Salvar" dá 400, o `reverter` descarta, o desktop pinta
   caixa cinza. [OBS]
4. **Há cinco desenhadores de `Page.layers`**, não um: editor Konva (R1), `RenderEngine` em `@napi-rs/canvas` (R2,
   implementação própria por tipo, não Konva), a prévia do `/gerar-criativo` (desenha toda forma como retângulo e publica
   esse PNG), o Konva 10 do desktop e o Canvas 2D do desktop. [OBS]
5. Paridade editor↔servidor do `svg-path` hoje já tem **duas lacunas**: o editor ignora `pathFillRule` e o traço diverge
   sob escala não uniforme. [OBS reconferido]
6. **Cor é sempre hex literal na camada**; `BrandColor` só tem `name` + `hexCode` (sem papel, sem ordem, sem edição);
   nenhum renderer lê paleta; há ≥ 7 resolvedores de "cor X da marca" com regras diferentes e 4 paletas paralelas. [OBS]
7. **O compositor já é um materializador** spec → `Layer[]` → página de conteúdo normal, com fila durável, dry-run,
   recomposição, régua e procedência em `Generation.fieldValues`; o editor não depende dele para editar. [OBS]
8. Persistência aceita qualquer campo novo em `style` (PATCH `z.array(z.unknown())`; `style` é `z.record`), e
   invalidação/versão/prova enxergam tudo que estiver **dentro** de `Page.layers`. [OBS]
9. **UI:** o painel "Formas" já tem busca, categorias e inserção no centro; "Elementos" é outra coisa (uploads PNG/JPEG);
   forma não tem toolbar contextual nem flip; no celular forma não troca de cor; não há botão visível de desfazer. [OBS]
10. **Desktop** (último commit 26/03/2026) lê o mesmo `Page.layers` por um normalizador que perde dados nos dois sentidos
    e regrava as páginas no push — já destrói `svg-path`, halo e slots hoje. [OBS]

---

## 2. Diagrama do editor atual

```
UI (template-editor-shell.tsx)
 rail esq: Texto · Imagens · Vídeos · Músicas · Elementos(PNG) · Formas(svg) · Logo · Cores · Gradientes · Fundo · IA · Editor · Templates
 rail dir: Criativos · Agenda · Efeitos · Camadas · Chat · Propriedades        toolbars de canvas (118 px): Alinhar · Texto · Imagem
   │  addLayer / updateLayer / updateLayerStyle / applyDesign / loadTemplate
   ▼
TemplateEditorContext (src/contexts/template-editor-context.tsx)
   design { canvas, layers[], audio } · undo/redo 50 por página, LRU 5 páginas, coalesce 800 ms
   createDefaultLayer · normalizeLayerOrder (order = índice) · canonicaliza shape a cada updateLayerStyle
   │
   ▼
Layer (src/types/template.ts:38-140)   type ∈ {text, rich-text, image, gradient, gradient2, logo, element, shape, icon, video}
   position/size/rotation (sem scale persistido) · style (aberto) · effects · metadata (groupId, compositor, slot…)
   │
   ▼
Konva (R1) KonvaEditorStage → KonvaLayerFactory switch(type) → nós Konva; default → null
   shape/svg-path = <Shape sceneFunc> (traceSvgPath) · Transformer (keepRatio só imagem; flip bloqueado) · guias pelo modelo
   ├── prévias do workspace contínuo (mesmo factory)
   ├── miniatura (stage.clone → JPEG 150 px) ─────────┐
   ├── export PNG (toDataURL pixelRatio 2) ──────────┤
   └── vídeo (toCanvas por quadro + MediaRecorder) ──┤
   │                                                  │
   ▼                                                  ▼
PageSyncWrapper + fila-de-gravacao (1 PATCH por vez, debounce 800 ms)
   PATCH /api/templates/[id]/pages/[pageId]  z.array(z.unknown()) → canonicaliza shape → CAS em updatedAt
     ├─ invalidateScheduledRenders (na transação, só se o visual mudou)
     └─ after(): pedirRecomposicaoDaArteCongelada
   "Salvar" = descarregar() + PUT /api/templates/[id] {designData:{layers}} → layerSchema com ENUM FECHADO
   │
   ▼
Page.layers (Json; array | string | string dupla → ler sempre por lerCamadas)
   │
   ▼
Renderer de servidor (R2) CanvasRenderer(@napi-rs/canvas, Path2D injetado) → RenderEngine.renderLayer switch(type); default → warn + pula
   chamado por: render-stories (cron) → renderPostArt → PNG + PostRenderProof(layersSnapshot)
                persist.renderPageAndRegister (arte rápida, ajustar-arte, trocar arte, recomposição)
                compositor (prova), régua, revisor (visão), testes CP0
   │
   ▼
Export / thumbnail / posts: Blob → SocialPost.mediaUrls → later-scheduler → Zernio (laterPostId ⇒ intocável)

Fora do eixo: R3 /gerar-criativo (forma = Rect, publica o PNG do cliente) · R4/R5 desktop (formato próprio, sync com perda)
```

Detalhe e linhas: `evidencias/auditoria/auditor-E-persistencia-render.md` §2.4 e `auditor-C-ui-ux.md` §2.1.

---

## 3. Modelo de layers

| Aspecto | Hoje | Onde |
|---|---|---|
| Tipos | 10 tipos fechados em três enums (TS, contrato do compositor, "Salvar") + `Record<LayerType>` de ícones | `src/types/template.ts:38-48`; `src/lib/creatives/layer-contract.ts:30-41`; `src/lib/validations/studio.ts:11`; `layers/layer-icons.tsx:14-44` [OBS] |
| Transform | `position {x,y}`, `size {width,height}`, `rotation` em graus em torno de `(x,y)`; **sem `scaleX/scaleY` persistido** (o transformEnd zera a escala e grava `size`) | `template.ts:57-59`; `konva-layer-factory.tsx:412-447`; `render-engine.ts:199-206` [OBS] |
| Flip | só imagem: `style.flipH/flipV`, desenhado num nó interno; servidor espelha | `template.ts:177-179`; `konva-layer-factory.tsx:900-911`; `render-engine.ts:1690-1695` [OBS] |
| Estilo | `LayerStyle` aberto (`[key: string]: unknown`); forma: `fill/fillOpacity/strokeColor/strokeOpacity/strokeWidth/shapeType/pathData/pathViewBox/pathFillRule/lineStyle/caps`; imagem: `objectFit/crop/mask{shapeId,path}/filtros` | `template.ts:142-217` [OBS] |
| Efeitos | `blur`, `stroke`, `shadow`, `background` (halo, com `baseColor/tone` só de UI), `curved` | `template.ts:75-106` [OBS] |
| Metadados | `groupId` (grupo lógico, não `Konva.Group`), `compositor.{papel,…}`, `slot.id` (B1; leitor sem produtor), `iconeDe/ornamentoDe`, `revisao.*` | `template.ts:68-74`; `compor.ts:959`; `semantica/ler.ts:69-76` [OBS] |
| IDs | `crypto.randomUUID`; duplicar/colar gera id novo e tira `slot`/marca do compositor; duplicar página regenera todos; duplicar template copia verbatim | `src/lib/id.ts`; `copy-autoral/camada-copiada.ts:62-115`; `duplicacao.ts:29-41`; `api/templates/[id]/duplicate/route.ts:74-85` [OBS] |
| Serialização | `Page.layers Json`; o autosave grava **string JSON dentro do Json**; persist/recompor gravam array; legado tem string dupla | `prisma/schema.prisma:1125`; `pages/[pageId]/route.ts:172`; `posts/page-layers.ts:4-67` [OBS] |
| Versão de schema | nenhuma; "versão" de página = hash do conteúdo | `creatives/revisao/versao.ts:45-58` [OBS] |
| Validação | PATCH aceita tudo; contrato do compositor e "Salvar" recusam tipo fora do enum; "Salvar" sem passthrough remove chave de topo desconhecida | `pages/[pageId]/route.ts:47`; `layer-contract.ts:30-70`; `studio.ts:9-37` [OBS] |

**Um campo novo dentro de `style` atravessa tudo** (autosave, contrato, "Salvar", combinações, compositor, cópias,
versão, invalidação). **Um `type` novo não atravessa nada.** É o fato que decide a arquitetura de vetores. [OBS]

---

## 4. Os vetores que já existem

| O quê | Como guarda | Cor | Situação | Onde |
|---|---|---|---|---|
| `shape` + `svg-path` | path `d` congelado na camada (viewBox 0 0 100 100 por padrão) | 1 `fill` + 1 `stroke` | **vivo**, editor e servidor | `shapes-library.ts:1-11,36-81`; `panels/shapes-panel.tsx:27-58` [OBS] |
| `icon` | só o nome (`style.iconId`) → 4 paths de 24×24 | 1 `fill` | **legado**: não redimensiona (Konva.Path cru), nenhuma UI insere | `icon-library.ts:7-33`; `konva-layer-factory.tsx:1643-1676`; `render-engine.ts:2053-2077` [OBS] |
| Máscara de imagem | `style.mask = {shapeId, path}` com path congelado | — | **vivo** (arco, círculo… da biblioteca de formas) | `template.ts:180-181`; `image-toolbar.tsx:33`; `svg-path-clip.ts` [OBS] |
| Ícones das combinações | camada `image` com PNG | assada no arquivo | vivo; a Real ganhou **um PNG por cor** (elementos 429–432) | `font-combinations-icones.ts:23-26`; `docs/regras/editor-e-galeria.md:241-243` [OBS] |
| SVG como imagem | logo/elemento por `fileUrl`; painel de logo aceita `image/svg+xml` | assada | vivo só para logo; o painel Elementos aceita só PNG/JPEG | `logo-panel.tsx:139`; `elements-panel.tsx:140-141` [OBS] |

---

## 5. Fluxo de edição

- **Inserir:** tudo passa por `addLayer` (topo da pilha, seleção única, um passo de desfazer). Formas nascem no centro
  com `min(360, 33% da largura)`; elementos e logos no centro com ≤ 200 px; imagens em tela cheia; combinações chamam
  `addLayer` N vezes (N desfazeres). Não há arrastar do painel para o canvas nem "área livre" no cliente.
  (`template-editor-context.tsx:461-478`; `shapes-panel.tsx:27-58`; tabela completa em `auditor-C-ui-ux.md` §3.1) [OBS]
- **Selecionar:** máquina de estados pura por gesto; grupo lógico seleciona o grupo no 1º clique; toolbar contextual só
  com UMA camada; **Propriedades edita só a última selecionada**. (`selecao-por-gesto.ts`; `editor-canvas.tsx:111-116`;
  `template-editor-context.tsx:1358`) [OBS]
- **Transformar:** 8 âncoras + rotação; `keepRatio` forçado só para imagem/logo/elemento (Shift para o resto);
  **espelhar arrastando é bloqueado** (`boundBoxFunc` devolve `oldBox` com caixa < 5 px, inclusive negativa); guias e
  snap pela caixa do MODELO, alinhamento por `getClientRect`. (`konva-transformer.tsx:120-145,194-202`;
  `konva-editor-stage.tsx:640-686`) [OBS reconferido]
- **Cor de forma:** só pelo painel Propriedades → `ShapeControls`; swatch, seletor nativo ou texto cru; a opacidade é
  embutida no `fill` como **`rgba(...)`** e a UI deixa de reconhecer a cor (seletor mostra o azul padrão, swatch da marca
  nunca aparece ativo). `HexColorField` (validado) existe e **não é usado por ninguém**. (`properties-panel.tsx:1398-1450`;
  `shape-style.ts:99-105,132-168`; `hex-color-field.tsx`) [OBS]
- **Desfazer:** histórico por página (50), atalhos Cmd+Z/Shift+Cmd+Z; **nenhum botão visível** no editor montado (o único
  estava no órfão `editor-toolbar.tsx`); no celular não há nem atalho. O "Usar" do painel Templates substitui a página e
  **zera o histórico**. (`template-editor-context.tsx:1081,1100`; `templates-panel.tsx:104-109`) [OBS]

---

## 6. Fluxo de persistência

| Escritor de `Page.layers` | Invalida render | Pede recomposição | Onde |
|---|---|---|---|
| Autosave (PATCH de página, CAS) | sim, se o visual mudou | sim, em `after()` | `api/templates/[id]/pages/[pageId]/route.ts:266-318,385-390` [OBS] |
| PATCH de camada | sim | sim | `api/pages/[pageId]/layers/[layerId]/route.ts:81-129` [OBS] |
| PUT do template ("Salvar", push do desktop) | sim | sim | `api/templates/[id]/route.ts:198-360` (apaga páginas sem par: `:290-298`) [OBS] |
| `ajustarArte`, `reverter`, `recompor` | sim | sim / é ela | `arte-rapida.ts:1459-1470`; `reverter.ts:72-85`; `recompor.ts:727-730` [OBS] |
| Página nova (persist, duplicar, criar de modelo, modelos) | não precisa | não precisa | `persist.ts:231`; `duplicate/route.ts:82` … [OBS] |

A regra do `AGENTS.md` (quem grava `Page.layers` chama as duas) está cumprida em todos os escritores de página
existente. `laterPostId` não nulo é intocável (`invalidate-renders.ts:89-105`). [OBS]

---

## 7. Renderers e paridade

| # | Desenhador | Tipo desconhecido | `svg-path` |
|---|---|---|---|
| R1 | Editor Konva (+ prévias, miniatura, PNG, vídeo) | `null` (some, não seleciona) | `Shape` + `sceneFunc`; **sem `fillRule`**; traço em px da camada |
| R2 | `RenderEngine` (servidor, napi) | `warn` + pula → **buraco publicado como RENDERED** | `Path2D` + `fillRule`; traço ÷ escala média (diverge em caixa não quadrada) |
| R2' | `generateThumbnail` (rota de miniatura) | pula | **não desenha** (sem `createPath2D` injetado) |
| R3 | Prévia do `/gerar-criativo` | `null` | **retângulo** (e o PNG é publicado) |
| R4/R5 | Desktop (Konva 10 / Canvas 2D) | placeholder / caixa cinza | retângulo |

Fontes: `auditor-B-canvas-konva.md` §2.1, `auditor-E-persistencia-render.md` §2.3. [OBS]

**Precedente de paridade por construção:** módulos puros isomórficos já compartilhados por R1 e R2
(`src/lib/konva/filters/apply.ts`, `src/lib/image-fit.ts`, `fundo-de-texto`). O `RenderEngine` recebe `Path2D` e
`createCanvas` por injeção justamente para rodar nos dois ambientes (`render-engine.ts:57-69`). [OBS]
**Não há teste de regressão visual** (golden); o mais próximo é o harness do CP0, que renderiza com o `CanvasRenderer`
de produção dentro do vitest e roda no CI (`src/lib/direcao-de-arte/__tests__/suporte/propriedades.ts:108-111`). [OBS]

---

## 8. Export

- PNG do editor: `stage.toDataURL({ pixelRatio: 2 })` com seleção limpa, guias e máscara do story escondidas; o servidor
  só recebe os bytes (`template-editor-context.tsx:826-950`; `api/templates/[id]/export/route.ts:62-72`). [OBS]
- Miniatura: `stage.clone()` → JPEG 150 px, Transformer destruído no clone (`template-editor-context.tsx:635-756`).
  `src/lib/page-thumbnail-utils.ts` é código morto. [OBS]
- Vídeo: `stage.toCanvas` por quadro + `MediaRecorder` → ffmpeg no servidor (`konva-video-export.ts:89-93,407-478`). [OBS]
- Post publicado: R2 a 1x (`canvas-renderer.ts:102`). [OBS]
- **Consequência:** tudo o que o R1 desenha sai em PNG, miniatura e vídeo sem código novo; o post publicado depende do R2.

---

## 9. Cores e marca

- `BrandColor { id, name, hexCode }`, sem papel, sem ordem, **sem rota de edição** (editar = apagar e criar → id muda)
  (`prisma/schema.prisma:619-629`; `api/projects/[projectId]/colors/route.ts:30,68`). [OBS]
- Ordem da paleta muda por consumidor (`createdAt DESC` no editor, `ASC` no desktop e no `loadBrandContext`, `id ASC`
  na arte rápida, sem ordem em dois lugares) → "a primeira cor da marca" não existe. [OBS]
- "Escuro" da marca tem duas definições: regex no nome (`fundo-de-texto.ts:348-365`, duplicada em
  `integracao-arte-rapida.ts`) × `Project.assinatura.mancha` (compositor). "Destaque" vem de `assinatura.destaque.fill`.
  "Claro" não tem casa no banco. "Primária/secundária" só existem por posição (desktop, `generate-art`). [OBS]
- Paletas paralelas: `GRADIENTES_POR_PROJETO` (código), kits em `scripts/lib`, `Project.assinatura`,
  `textColorPreferences` (só desktop). [OBS]
- **Nenhum renderer resolve cor de marca**; o único override em render (`fieldValues["<id>_<campo>"]`) só existe no
  servidor e ninguém grava. [OBS]
- Validação: o servidor não tem sanitizador central (`sanitizeColor` citado num script não existe); parada de gradiente
  opaca vai crua ao `addColorStop` (`render-engine.ts:1796-1802`); `hexValido` (`fundo-de-texto.ts:83-90`) é o
  validador canônico puro. [OBS]
- Precedente de **proveniência ao lado da cor**: `effects.background.baseColor/tone` — "os motores nunca sabem do slider"
  (`template.ts:101-103`). [OBS]

Detalhe: `evidencias/auditoria/auditor-D-cores-e-marca.md`.

---

## 10. Assets

| Superfície | O que é | Onde |
|---|---|---|
| Painel **Formas** | `SHAPES_LIBRARY` em código: busca por rótulo/keywords, 4 categorias (Básicas, Setas, Linhas, Decorativas), prévia SVG em `currentColor`, clique insere no centro | `panels/shapes-panel.tsx:13-161`; `shapes-library.ts:16,83-88` [OBS] |
| Painel **Elementos** | uploads PNG/JPEG do projeto (modelo `Element`), inseridos como `image`; usa `fetch` direto (contra a regra do repo) | `panels/elements-panel.tsx:46-148,287-375` [OBS] |
| Painel **Logo** | logos do projeto, aceita SVG cru (vai ao Blob com o content-type original) | `panels/logo-panel.tsx:139`; `api/projects/[projectId]/logos/route.ts:108-111` [OBS] |
| Combinações de texto | `FontCombination.elements` com ornamentos: imagem (`url`) ou **molde de `shape`** (a camada inteira menos id/posição/`metadata`) | `font-combinations.ts:73-94,207-241`; `font-combinations-capture.ts:297-321` [OBS] |
| Gradientes | presets + gradientes da marca (`GRADIENTES_POR_PROJETO`) | `gradients-library.ts:70-106` [OBS] |

**O que estiver em `style` viaja com o molde do compositor; o que estiver em `metadata` se perde.** [OBS]

---

## 11. Templates, páginas e compositor

- `Template` = pasta (STORY/FEED/SQUARE); `Page` = peça ou modelo (`isTemplate`, `tags`); `isTemplate` decide se o post
  sobrescreve a página com slots (`copy-segue-a-pagina.ts:108-115`). [OBS]
- **Compositor (`src/lib/compositor/`)**: `comporPeca` valida a spec → lê a foto → `carregarAssinatura` (porta única de
  compor, `medir-copy` e `ver-assinatura`) → prepara blocos → posiciona pela foto e pelas caixas da variante → logo →
  `bg-foto` → contrato do Layer → ornamentos → gradiente de leitura → régua → persiste como página normal
  (`isTemplate:false`, tags `['compositor', formato]`) com procedência em `Generation.fieldValues` (spec, composição,
  `layersSnapshot`) (`compor.ts:536-1229`; `persistencia.ts:116-144`). [OBS]
- Preferências já existentes da spec: `ancora`, `alinha`, `cantoDaMarca`, `enquadramento`, `variante`, `arranjos`
  (`spec.ts:108-136`; MCP `catalogo/compositor.ts:62-79`). [OBS]
- **Arquétipos de fato já existem** como variantes da página "Assinatura" (Espeto: Promoção/Rodapé/Topo, geradas por
  script) — toda página desse template entra no rodízio automático (`compor.ts:191-211`; `assinatura.ts:541-634`). [OBS]
- Dois sistemas de layout em código morreram por ignorar a assinatura: `LAYOUT_TEMPLATES` (sem chamador) e o
  "(3 layouts)" (arquivado, 0/33 no placar) (`auditor-F-templates-arquetipos.md` §2.8). [OBS]
- Story ↔ Feed: o painel Redimensionar **só muda o canvas**; adaptar = compor de novo no outro formato
  (`resize-panel.tsx:60-64,141`). [OBS]

---

## 12. Desktop

- Formato próprio (`KonvaTemplateDocument` v2, camada plana `x/y/width/fill/shape/src`), Konva 10, sem `svg-path`
  (`desktop-app/src/types/template.ts:8-27`). [OBS]
- Sync: pull pelo `GET …/templates?includeDesign=true`, push pelo `PUT /api/templates/:id` que **sobrescreve
  `Page.layers` e apaga páginas sem par**; o normalizador do Electron copia só campos conhecidos (shape: `fill`,
  `stroke`, `strokeWidth`, `shapeType`, `cornerRadius`, `points`) e reduz `metadata` a `{role}`;
  `preserveUnknownFields: true` é declarado e **nunca lido** (`electron/services/sync/template-normalizer.ts:166-344,446-476`). [OBS reconferido]
- Último commit em `desktop-app/`: **26/03/2026**. Se o push ainda é usado em produção não dá para saber sem logs/banco.

---

## 13. Gaps para o que se pede

| Capacidade | Existe? | O que falta |
|---|---|---|
| Elementos vetoriais de 1 cor (linha, curva, onda, blob, spark, moldura…) | **sim, como `svg-path`** | só os DADOS (entradas na biblioteca) e categorias |
| Elementos de contorno (moldura aberta, cantoneiras, colchetes) | parcial | paridade de traço editor×servidor sob escala não uniforme; `fillRule` no editor |
| Recolor com 2 papéis (preenchimento + contorno) | sim (`fill` + `strokeColor`) | UI que reconheça a cor (`rgba`→hex), cores da marca primeiro |
| Recolor com N slots (3+ cores) | não | partes coloridas por slot dentro do `svg-path` (`style`), nos dois renderers, com módulo de traçado compartilhado |
| Flip H/V de vetor | não | ler `flipH/flipV` no `ShapeNode` e no `renderShape`; botão |
| Trava de proporção por camada | não (só Shift) | `keepRatio` por camada + alças de canto |
| Vínculo da cor a papel da marca | não | resolvedor puro único + proveniência em `style` + "reaplicar cores da marca" |
| Papéis de cor da marca | não (sem dado) | derivar escuro/claro/destaque da assinatura e da paleta; coluna de papel só se a derivação falhar |
| Painel "Elementos" estilo Canva | parcial (Formas) | fundir Formas + Elementos; categorias; toolbar contextual de forma; celular |
| Arquétipos paramétricos | de fato (variantes da assinatura) | definição em código + `preferencias.arquetipo` + variante em memória em `carregarAssinatura` |
| Materializar arquétipo em página editável | **sim (compositor)** | a porta de entrada do editor ("Layouts" → página nova) |
| Story + Feed do mesmo arquétipo | sim (compor 2×) | nada além do arquétipo declarado em frações |
| Foto não full-bleed (split, moldura, inserida) no compositor | não | a foto do compositor é sempre `bg-foto` em tela cheia; precisa de "foto em caixa" (+ máscara, que o editor e o servidor já desenham) |
| SVG enviado por usuário recolorível | não | importador com sanitizador e normalização de path (P2) |

---

## 14. Riscos (por gravidade)

1. 🔴 **Buraco publicado em silêncio** se um vetor depender de algo que o R2 não desenha (type novo, shapeType novo,
   campo novo sem ramo no servidor). A `PostRenderProof` "prova" a camada que não saiu. [OBS]
2. 🔴 **Desktop destrói dados ao salvar** (normalizador com perda + PUT que sobrescreve e apaga). Vale para qualquer
   opção de vetor e já acontece com `svg-path`. [OBS]
3. 🔴 **Paridade de traço/`fillRule`** entre R1 e R2 — vetores minimalistas são justamente feitos de fios finos e
   contornos. [OBS]
4. 🔴 **R3 (`/gerar-criativo`) publica forma como retângulo** — já hoje. [OBS]
5. **Cor de forma vira `rgba(...)`** e a UI não reconhece; canonização zera opacidade — slots precisam entrar nela. [OBS]
6. **Arquétipo no rodízio de variantes** muda as levas existentes do cliente se entrar sem exclusão. [OBS]
7. **CP1 em curso:** véu/gradiente (polaridade) e leitura da logo são exatamente os parâmetros `treatment` e `logo.zone`;
   não criar quarta fonte de tratamento antes do CP1. [OBS]
8. **Payload:** o autosave manda todas as camadas; undo guarda 50 snapshots; prova e `layersSnapshot` duplicam tudo — SVG
   cru embutido incharia tudo; paths compactos não. [OBS + INF]
9. **Parsers de path diferentes** (regex do Konva × Skia) para SVG "do mundo": normalizar na ingestão. [OBS + INF]
10. Docs desatualizadas apontam caminhos que não existem (`docs/regras/arquitetura-geral.md:87`; `docs/konva-editor.md:164,582`). [OBS]

---

## 15. Achados de passagem (dívidas existentes, fora do escopo vetorial)

| Achado | Onde | Gravidade |
|---|---|---|
| Editor ignora `pathFillRule` (servidor respeita) | `konva-layer-factory.tsx:1539-1558` | média (paridade) |
| Traço do `svg-path` diverge em caixa não quadrada | `render-engine.ts:1851-1858` × `konva-layer-factory.tsx:1549-1557` | média |
| `generateThumbnail` não injeta `Path2D` (perde `svg-path`, ícone, máscara) | `render-engine.ts:2199-2204` | baixa |
| `/gerar-criativo` desenha forma como `Rect` e publica | `canvas-preview.tsx:244-299`; `finalize/route.ts:31` | média |
| `reverter` descarta camada inválida sem avisar | `compositor/reverter.ts:34-35` | média |
| "Usar" do painel Templates não desfaz e zera o histórico | `templates-panel.tsx:104-109`; `template-editor-context.tsx:1081,1100` | média (UX) |
| Filtro de formato do painel Templates compara `type` com `category` | `templates-panel.tsx:22-59`; `api/templates/route.ts:107-109` | baixa |
| Sem botão visível de desfazer no editor web | `editor-toolbar.tsx` (órfão) | média (UX) |
| Cor de forma em `rgba` não casa com swatch; inputs de cor crus; `HexColorField` órfão | `properties-panel.tsx:322-334,1398-1450` | média |
| Cadastro de cor pela aba Marca não invalida `['brand-colors']` (até 5 min de atraso no editor) | `project-assets-panel.tsx:1182,1209` | baixa |
| Sem sanitizador central de cor no servidor | `render-engine.ts:1796-1802`; `scripts/reparar-cores-invalidas.ts:11` | média |

Alguns destes entram no plano como pré-requisito (CP-V0); os demais ficam registrados para o owner.
