# Plano de Evolução do Editor — rev. 2 (prioridades do usuário)

**Data**: 28/07/2026 · **Rev. 2**: reprioritizado após decisão do Ciro — o que importa é (1) consertar o que sai errado na arte, (2) linhas guias, (3) comportamento das caixas de texto e alinhamento do texto, (4) ajuste de tamanho pelo box, (5) propriedades de texto, (6) fidelidade de fontes, (7) paginação. Conforto estilo Canva (grupos, copy style, magic resize, zoom/pan) vira backlog sob demanda.

**Origem**: análise ao vivo da demo https://konvajs.org/docs/sandbox/Canvas_Editor.html (Polotno/Konva) cruzada com o mapa do editor real (4 frentes de design + parecer crítico). A rev. 1 completa fica no histórico do git para consulta.

**Legenda**: **P** ≈ meio dia · **M** ≈ 1–2 dias · **G** ≈ 3+ dias.

---

## 1. Gap: demo × editor (resumo com veredito da rev. 2)

| Funcionalidade da demo | Estado no Studio Lagosta | Veredito rev. 2 |
|---|---|---|
| Crop in-canvas (dblclick) | `konva-image-crop.tsx` pronto ~80%, órfão | Fase 2 |
| Máscara de forma na imagem | Inexistente | Fase 2 |
| Biblioteca de formas + linhas | 7 formas, 4 ícones, painéis órfãos | Fase 2 (20–30 formas) |
| Gradiente universal, eyedropper, picker unificado | Gradiente só como camada própria | Sob demanda |
| Presets de filtro com thumbnail | Sliders sem preset; zero filtro no render | Sob demanda |
| Flip/Fit/toolbar de imagem rica | image-toolbar só opacidade | Fase 2 |
| Copy style / grupos / Position dropdown | — | Sob demanda |
| Magic resize + presets de plataforma | resize não persiste na Page (**bug**) | Só o fix do bug (Fase 0); magic resize sob demanda |
| Background como propriedade da página | Cadeia 90% pronta, autosave não grava | **Fase 0 (em execução)** |
| Zoom/pan estilo Polotno | Desabilitado de propósito | Sob demanda |
| Undo robusto | Sem coalescing; zerado ao trocar página | **Fase 1** (parte de paginação) |
| Save as PDF / export multi-página | export-modal órfão | Sob demanda |
| AI write | Rotas IA prontas, falta rewrite | Sob demanda (skill de copies já cobre) |
| Draw tool / Unsplash / presets multi-plataforma / blend modes | — | **Cortados** (justificativa § 6) |

**Bugs de produção (Fase 0, em execução nesta sessão):**
1. Redimensionar canvas não persiste `width/height` na Page → arte agendada sai no tamanho antigo.
2. `renderShape` sem case `star`/`arrow` (viram retângulo) + pivô de circle/triangle/star deslocado meia caixa.
3. Background da página nunca é gravado pelo autosave (painel pronto e órfão).
4. `objectFit: cover` transborda no render; `cropPosition` tem UI e é ignorado nos dois lados; `border.radius` não recorta.

---

## 2. Visão geral das fases (rev. 2)

| Fase | Tema | Estimativa |
|---|---|---|
| **0** | Bugs de produção (itens 1–4 acima) | ~1 semana · **em execução** |
| **1** | **Texto, guias, fontes e paginação** — o coração do uso diário | 2–3 semanas |
| **2** | Imagem e formas (crop in-canvas, máscara, biblioteca enxuta) | 2 semanas |
| **—** | Backlog sob demanda (grupos, copy style, magic resize, zoom/pan, PDF, AI write, gradiente universal) | quando doer |

**Regra transversal mantida**: cada marco que toca `render-engine.ts` fecha com teste A/B editor×CanvasRenderer e uma rodada de `scripts/rerender-agendados.ts` pós-deploy.

---

## 3. Fase 0 — Bugs de produção (em execução)

1. **Persistir `width/height` da Page no resize** — PATCH único com layers+width+height via PageSync/multi-page-context (o endpoint já existe e já invalida renders).
2. **Paridade star/arrow/pivô** — cases novos em `renderShape` replicando a geometria do Konva; flag `centerOrigin` no transform de circle/triangle/star.
3. **Background da página** — montar `backgrounds-panel.tsx` no shell; PageSync grava `canvas.backgroundColor → Page.background` no mesmo PATCH dos layers, só quando mudou.
4. **Crop/cover unificado** — `src/lib/image-fit.ts` isomórfico (`resolveImageSourceRect`: cover+cropPosition > contain/fill) usado pelo `ImageNode` e pelo `drawImage` do render; radius com clip real no render.

---

## 4. Fase 1 — Texto, guias, fontes e paginação (2–3 semanas)

### 4.1 Linhas guias e snapping — M
O motor existe (`src/lib/konva-smart-guides.ts`: threshold 5px, snap a stage/objetos/margens, detecção de dimensões iguais) mas só atua **no drag**. Evoluções, em ordem:
1. **Snap também no resize** (transformer): hoje redimensionar não snapa em nada — anexar a mesma lógica ao `boundBoxFunc`/`anchorDragBound` do `konva-transformer.tsx`.
2. **Threshold em pixels de TELA**: 5px em coordenadas do canvas fica grosso em zoom baixo e fino em zoom alto — dividir pelo scale do stage.
3. **Guias de margem de segurança como feature, não debug**: hoje `R` liga/desliga margens, a cruz verde central (`G`) vem **ligada por padrão** e as bordas amarelas (`C`) idem — trocar por um toggle único e visível na UI ("mostrar guias"), remover os atalhos de letra solta e os defaults de debug.
4. **Snap ao centro da página com guia persistente** (linha central exibida só durante o gesto, estilo Canva/Polotno).
5. Distância entre objetos (badges de espaçamento igual) — opcional, só se sobrar tempo.

Arquivos: `konva-smart-guides.ts`, `konva-editor-stage.tsx` (consumo + toggles), `konva-transformer.tsx`.

### 4.2 Caixa de texto: comportamento e alinhamento interno — M/G
O que já funciona: wrap por palavra, âncora vertical (top/middle/bottom via `textboxConfig.anchor`), autoExpand com direção pela âncora, corner-resize muda fontSize / lateral-resize muda caixa.
O que precisa de correção ou acabamento:
1. **Paridade do autoExpand no render** — a caixa cresce só no editor; `slotValues` mais longo é **cortado na altura gravada** na arte agendada. O render precisa re-medir o texto quebrado e aplicar a mesma regra de crescimento por âncora (base sobe, meio abre, topo desce). É o item mais importante da fase: é fidelidade da arte publicada.
2. **`padding: 6` hardcoded** no editor (`konva-editable-text.tsx:1251`) e ausente no render → textos deslocados ~6px na arte. Unificar (replicar no render ou zerar no editor e compensar nos templates).
3. **Alinhamento vertical no render**: conferir que `verticalAlign` derivado de `textboxConfig.anchor` é aplicado igual no `renderText` (auditar com A/B das 9 combinações align×anchor).
4. ✅ **Resize pelas alças com feedback** (28/07): tooltip DOM com o fontSize ao vivo durante corner-resize (some no transformend); mínimo de caixa maior que 5×5 para texto (evitar caixa colapsada); Shift para manter proporção já existe — documentar.
5. ✅ **textarea de edição fiel** (28/07): o overlay compensa o `padding=6` do Konva.Text (offset rotacionado junto com o node) — era a única métrica divergente; lineHeight/letterSpacing/fontWeight já batiam.
6. **`textTransform` no render**: o editor aplica uppercase/lowercase/capitalize no display; auditar se `renderText` transforma o `content` igual (se não, é divergência silenciosa).

Arquivos: `konva-editable-text.tsx`, `render-engine.ts` (renderText), `text-toolbar.tsx`, `konva-transformer.tsx`.
**Armadilhas**: campo novo que afete desenho entra em `assinaturaRender`; entrelinha SEMPRE via `patchLineHeight` (dois campos).

### 4.3 Propriedades de texto — P/M
1. ✅ **Auditoria dos caminhos de escrita de lineHeight** (28/07): toolbar e properties-panel usam `patchLineHeight`; MCP→`arte-livre`, `font-combinations-layers` e o default de texto novo do context gravam os dois campos; rich-text modal e font-combinations-panel só leem. Nenhum write fora dos dois campos.
2. **letter case (Aa)** na toolbar (o campo `textTransform` já existe — é expor o botão como na demo).
3. ✅ **Efeitos de texto no render** (28/07): stroke e fundo (commit f5a5336), blur, curvo e `richTextStyles` por segmento — tudo desenhado pelo render server (ver § 5.1).
4. Revisar defaults do texto novo (tamanho/fonte/posição pela margem) — já houve sessão sobre isso (27/07); só conferir regressões.

Arquivos: `render-engine.ts`, `text-toolbar.tsx`, `properties-panel.tsx`, `src/lib/text-line-height.ts`.

### 4.4 Fidelidade de fontes — M
O problema estrutural: o editor carrega Google Fonts do CDN e usa faux-bold do browser; o render server só enxerga TTF estático registrado (`CustomFont` + blob). Divergência aparece **só na arte agendada**. Ações:
1. **Aviso no editor**: badge/toast quando a página usa fonte de projeto **sem arquivo enviado** (vai cair em fallback no render) e quando usa um peso que não existe no arquivo (faux-bold só existe no browser). A informação existe no banco (`CustomFont`) — é cruzar com as fontes usadas nos layers.
2. **Medir só com a fonte carregada**: aguardar `document.fonts.ready`/`FontFaceObserver` antes de medir caixa (autoExpand/troca de fonte) — medir com fallback e desenhar com a fonte real desloca quebras.
3. **Render fail-loud**: `canvas-renderer.ts` registra fontes via `GlobalFonts`; hoje fonte ausente cai em fallback silencioso — logar/alertar por página renderizada quando uma família pedida não foi registrada (aparece no log do cron `render-stories`).
4. **Fluxo de upload orientado a pesos**: no `fonts-panel`, deixar explícito quais pesos foram enviados e quais faltam.

Arquivos: `font-manager.ts`, `font-config.ts`, `canvas-renderer.ts`, `sidebar/fonts-panel.tsx`, `konva-editable-text.tsx` (medição).

### 4.5 Paginação — M
1. **Undo por página** — trocar `historyRef` por `Map<pageId, {past, future}>` (LRU ~5 páginas); `loadTemplate` troca ponteiro em vez de zerar. Hoje trocar de página descarta todo o histórico.
2. **Coalescing de histórico** (`coalesceKey` em `applyDesign`, janela ~800ms): digitação e sliders viram 1 undo por gesto — sem isso o limite de 50 snapshots esvazia rápido.
3. **Botões flutuantes** duplicar/adicionar página no canto do canvas (handlers já existem no `PagesBar`; extrair `usePageActions()`).
4. **Robustez do PageSync**: manter as guardas anti-vazamento; adicionar teste de troca rápida de página com edição pendente (flush antes de trocar já existe — cobrir com teste).
5. **Thumbnails**: conferir atualização após mudanças de background/canvas (hoje é fire-and-forget pós-save de layers).

Arquivos: `template-editor-context.tsx`, `page-sync-wrapper.tsx`, `multi-page-context.tsx`, `template-editor-shell.tsx`.

---

## 5. Fase 2 — Imagem e formas ✅ CONCLUÍDA (28/07/2026)

1. ✅ **Reenquadramento in-canvas por duplo clique** — a **moldura não se mexe** (a área que a imagem ocupa é o contrato do layout): quem se move é a imagem por dentro, como no Canva. Arrastar reposiciona, alças nos cantos da imagem aproximam/afastam (escala pelo centro da moldura), botões de zoom e Redefinir na barra, e a imagem é obrigada a cobrir a moldura (sem buraco). Overlay em coordenadas do canvas (zoom/scroll de graça); `croppingLayerId` no context bloqueia marquee/atalhos/transformer; confirma em UM `updateLayer` gravando **só** `style.crop` em frações — `position`/`size` intactos. Grade 3×3 do painel limpa o crop manual.
2. ✅ **Formas svg-path (~35) + linhas com setas** — `shapeType: 'svg-path'` + `pathData` (viewBox 0 0 100 100); editor via `sceneFunc` (stroke não distorce), render via `Path2D` do @napi-rs/canvas; painel "Formas" único com busca e categorias substituindo os órfãos; case `icon` do render pelo mesmo caminho.
3. ✅ **Máscara de forma + flip + toolbar de imagem** — wrapper `Group` com `clipFunc` (replay do path pelo `Konva.Path.parsePathData`), flip por scale negativo no node INTERNO; toolbar `[Recortar][Remover][Flip H][Flip V][Ajustar à página][Máscara ▾][Opacidade]`.

**Limitações fechadas em 28/07/2026** (§ 5.1): filtros de imagem, blur e texto curvo, `richTextStyles` por segmento. Resta só a camada `video`, que é corte assumido (§ 6).

### 5.1 Paridade dos filtros e efeitos no render server ✅ (28/07/2026)

O render server desenha o que o editor mostra nestes pontos:

1. **Filtros de imagem** (exposure/brightness, contrast, highlights/shadows,
   whites/blacks, saturation, blur, vignette + legados grayscale/sepia/invert):
   pixel loops compartilhados em `src/lib/konva/filters/apply.ts` (isomórfico —
   não importa `konva` nem `@napi-rs/canvas`). Os 3 filtros custom viraram
   wrappers Konva sobre o apply; os do Konva core foram copiados 1:1 (MIT) e
   **validados byte a byte** contra o node_modules. No `drawImage`, o conteúdo
   (crop/flip/radius/borda) vai para um canvas offscreen (o cache do Konva),
   a cadeia roda na MESMA ordem do useMemo do ImageNode e a máscara é aplicada
   depois, como o clipFunc do Group. `options.imageCache` continua com a
   imagem CRUA por URL (filtro é por camada — não cachear bitmap filtrado).
2. **Blur de texto**: offscreen com pixelRatio 2 e client rect expandido por
   sombra/contorno, replicando o cache do editor. O raio NÃO é dividido pelo
   pixelRatio (o Konva também não divide) — blur visual = raio/2.
3. **Texto curvo**: caractere a caractere com a geometria exata do editor
   (espaçamento uniforme por índice — largura de glifo não entra —, rotação
   tangente, arco deslocado em -radius·cos como no editor). Blur é ignorado
   de propósito: no editor os chars não são cacheados, o filtro nunca roda.
   Curved ligado com curvature 0 desenha como texto normal (fundo incluso).
4. **richTextStyles**: quebra com o estilo base (padding 6, wrap word),
   segmento medido cru + letterSpacing×length, desenho por segmento com cor,
   fonte, sombra, faux-bold (stroke da própria cor, `fillAfterStrokeEnabled`)
   e textDecoration na métrica do Konva (underline a +round(fs/2) do meio,
   traço fs/15). Sem truncamento por altura — o Group do editor não recorta.

**Injeção**: `RenderOptions.createCanvas` (napi no server, DOM no browser),
mesmo padrão do `createPath2D` — injetado em `lib/canvas-renderer.ts`,
`lib/rendering/canvas-renderer.ts` (generate-creatives) e `generateThumbnail`.

**Validação**: `scripts/.tmp-parity-filtros.ts` (loops byte a byte + grade
visual) e `scripts/.tmp-parity-filtros-ab.mjs` (A/B contra o Konva REAL no
Chromium, wiring do editor, diff por região). Cadeia de filtros de imagem:
média 0,34/255 (idêntica na prática). Texto: diff só de antialiasing/kerning
de glifo entre Skia-Chrome e Skia-napi, sem deslocamento estrutural — é a
mesma classe de divergência aceita do letterSpacing (~1px por par kernado).

**Divergência restante conhecida**: camada `video` (corte assumido) e o
kerning acima.

---

## 6. Backlog sob demanda e cortes

**Sob demanda** (implementar quando o uso pedir, specs completas na rev. 1 via git): grupos com Cmd+G · copy style · Position dropdown · registro central de atalhos · magic resize · zoom por scroll/pinça + pan · export multi-página/PDF raster · AI write · gradiente universal + color picker unificado + eyedropper · presets de filtro com thumbnail. (Os "filtros server-side completos" saíram desta lista: entregues em 28/07/2026, § 5.1.)

**Cortados** (não fazer, justificativa mantida da rev. 1): draw tool · fundos Unsplash · presets Facebook/YouTube/LinkedIn/Twitter · PDF vetorial server-side · blend modes · busca de templates estilo Polotno · render de camada `video`.

---

## 7. Regras transversais (checklist de todo PR)

1. Feature visual só está completa quando `render-engine.ts` desenha igual; marco de render fecha com A/B + `rerender-agendados.ts` pós-deploy.
2. Campo novo que afeta desenho entra em `assinaturaRender` (`konva-editable-text.tsx`) e nas deps de cache do `ImageNode`.
3. Entrelinha sempre via `patchLineHeight` (dois campos).
4. `handleTransformEnd` reseta scale → flip/efeitos nunca no scale do node.
5. Interações contínuas commitam 1 snapshot por gesto.
6. Mudanças de canvas (width/height/background) no MESMO PATCH dos layers — nunca dois writers concorrentes.
7. Campos novos também precisam funcionar no caminho `generate-creatives` (`generation-utils.ts`), não só no `story-renderer`.
8. Troca de `fontFamily`/métrica re-mede a caixa; fonte de projeto exige TTF estático no banco.
