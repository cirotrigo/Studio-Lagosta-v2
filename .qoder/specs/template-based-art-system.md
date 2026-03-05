# Plano: Sistema de Templates + Text Processing para Geracao de Arte

## Resumo

Mudanca arquitetural completa: de "LLM decide layout" para "LLM decide conteudo, Engine decide design".

1. **Templates**: Criados via GPT-4o Vision a partir de imagens de referencia. Armazenados em DB. Usuario seleciona na geracao. Renderizacao 100% deterministica.
2. **Text Processing**: Camada configuravel de interpretacao de texto ANTES da classificacao nos slots. 4 modos: fiel, correcao gramatical, deteccao de headline, geracao de copy.
3. **Layout Engine**: Posicionamento por ancoras (como Figma), zonas semanticas, controle de densidade, auto-layout adaptativo.

```
ANTES:  Texto → GPT separar+colorir → GPT posicionar → Renderer (tudo no servidor + 1 IPC)

DEPOIS: Texto → processTextForTemplate() → classifyTextIntoSlots() → densityCheck()
              [4 modos configuráveis]    [só quando modos 1-2]  [compress se necessário]
        ────────── SERVIDOR (API Route) ──────────
                              │ JSON response
                              ▼
        ────────── FRONTEND (Electron renderer process) ──────────
        → Layout Engine (2-pass) → Renderer
          [draft → measure → final → render]
```

Pipeline completo (separacao servidor / frontend):
```
┌─── SERVIDOR (API Route — Next.js/Vercel) ───┐
│                                               │
│  User Text → Text Processing → Classify       │
│                   [LLM]          [LLM]         │
│            → default_content → Density Control │
│                                  [LLM se compress] │
│  + Gerar imagem base (Gemini/Ideogram)        │
│                                               │
│  Retorna: { imageUrl, slots, templateData,    │
│             densityResult, fontSources }       │
└───────────────────┬───────────────────────────┘
                    │ HTTP JSON
                    ▼
┌─── FRONTEND (GenerateArtTab.tsx — Electron) ──┐
│                                               │
│  Pass 1: buildDraftLayout()      [JS puro]    │
│  Pass 2: electronAPI.measureTextLayout() [IPC]│
│  Pass 3: resolveLayoutWithMeasurements() [JS] │
│  Pass 4: electronAPI.renderFinalLayout() [IPC]│
│                                               │
│  Fallback web (sem Electron):                 │
│    Usa fluxo antigo (renderText com textLayout│
│    retornado pelo servidor via positionText)   │
└───────────────────────────────────────────────┘
```

REGRA: O Layout Engine (buildDraftLayout + resolveLayoutWithMeasurements) NUNCA chama LLM.
Todo processamento de texto (incluindo compressao) acontece no SERVIDOR, antes de retornar o payload.
O Engine roda no FRONTEND (renderer process do Electron) e e 100% deterministico.

Principio: Servidor = LLM + conteudo | Frontend/Engine = layout | Main Process/Renderer = medicao + renderizacao

---

## Compatibilidade Web vs Desktop

Templates sao feature EXCLUSIVA do desktop app (Electron). Na versao web, o fluxo antigo e mantido.

**Desktop (Electron disponivel):**
- `window.electronAPI?.measureTextLayout` existe → pipeline 2-pass completo
- TemplateSelector visivel na UI
- Frontend orquestra 4 passes: buildDraftLayout → IPC measure → resolve → IPC render

**Web (sem Electron):**
- `window.electronAPI?.measureTextLayout` e undefined → fallback para fluxo antigo
- TemplateSelector NAO renderiza (hidden)
- Usa resultado direto da API: `textLayout` + `window.electronAPI.renderText()` (se disponivel) ou imagem sem texto

**Deteccao no frontend (GenerateArtTab.tsx):**
```typescript
const hasTemplatePipeline = typeof window !== 'undefined' && !!window.electronAPI?.measureTextLayout
```

**Regras:**
- Se `hasTemplatePipeline === false` e usuario tentar usar template → erro com mensagem "Templates requerem o app desktop"
- A API Route SEMPRE retorna dados do template path quando `templateId` presente (nao depende de Electron)
- O frontend decide qual pipeline usar baseado em `hasTemplatePipeline`

---

## Parte A — Sistema de Templates

### A1. Armazenamento

Campo existente `brandVisualElements: Json?` no model Project. Novo campo `artTemplates` dentro do JSON:

```json
{
  "layouts": [...],
  "typography": [...],
  "patterns": [...],
  "textColorPreferences": {...},
  "overlayStyle": "...",
  "artTemplates": [
    {
      "id": "tpl_abc123",
      "name": "Wine Vix Story v1",
      "format": "STORY",
      "schemaVersion": 1,
      "engineVersion": 1,
      "templateVersion": 1,
      "fingerprint": "b81e23aa",
      "analysisConfidence": 0.87,
      "sourceImageUrl": "https://...",
      "createdAt": "2026-03-04T...",
      "templateData": {
        "canvas": {
          "format": "instagram_story",
          "ratio": "9:16",
          "safe_margin": 80,
          "safe_area": { "top": 120, "bottom": 180 }
        },
        "zones": {
          "text_zone": { "x": "6%", "width": "58%" },
          "image_focus_zone": { "x": "50%", "width": "50%" },
          "gradient_zone": { "x": "0%", "width": "60%" }
        },
        "layout": {
          "text_alignment": "left",
          "visual_balance": "left_heavy"
        },
        "overlay": {
          "type": "gradient",
          "direction": "left_to_right",
          "start_color": "#000000",
          "end_opacity": 0
        },
        "typography": {
          "title_font": "...",
          "body_font": "...",
          "font_fallbacks": ["Georgia", "Times New Roman", "serif"],
          "scale": { "xs": 18, "sm": 24, "md": 32, "lg": 48, "xl": 72 }
        },
        "text_density": {
          "ideal_words": 20,
          "max_words": 35
        },
        "colors": {
          "eyebrow": "#D4AF37",
          "title": "#D4AF37",
          "description": "#FFF",
          "cta": "#FFF",
          "footer": "#FFF"
        },
        "default_content": {
          "cta": "Descubra mais",
          "footer": ""
        },
        "slot_priority": ["title", "description", "cta", "eyebrow", "footer"],
        "slot_drop_order": ["footer", "eyebrow", "description"],
        "content_slots": {
          "eyebrow": {
            "type": "label",
            "anchor": "top_fixed",
            "anchor_offset": 14,
            "margin_bottom": 12,
            "max_words": 4,
            "max_characters_per_line": 20,
            "line_break_strategy": "natural",
            "allow_auto_scale": true,
            "font_size": "sm",
            "weight": 700,
            "uppercase": true
          },
          "title": {
            "type": "headline",
            "anchor": "after:eyebrow",
            "margin_top": 12,
            "margin_bottom": 18,
            "max_lines": 2,
            "max_words": 10,
            "max_characters_per_line": 24,
            "line_break_strategy": "balanced",
            "allow_auto_scale": true,
            "font_size": "xl",
            "weight": 700,
            "uppercase": false
          },
          "description": {
            "type": "paragraph",
            "anchor": "after:title",
            "margin_top": 18,
            "margin_bottom": 24,
            "max_lines": 3,
            "max_words": 25,
            "max_characters_per_line": 35,
            "line_break_strategy": "natural",
            "allow_auto_scale": true,
            "font_size": "md",
            "weight": 400,
            "uppercase": false
          },
          "cta": {
            "type": "call_to_action",
            "anchor": "before:footer",
            "margin_bottom": 12,
            "max_words": 6,
            "max_characters_per_line": 24,
            "line_break_strategy": "natural",
            "allow_auto_scale": true,
            "font_size": "lg",
            "weight": 700,
            "uppercase": false
          },
          "footer": {
            "type": "location_or_info",
            "anchor": "bottom_fixed",
            "anchor_offset": 12,
            "margin_top": 12,
            "max_words": 10,
            "max_characters_per_line": 40,
            "line_break_strategy": "natural",
            "allow_auto_scale": false,
            "font_size": "sm",
            "weight": 400,
            "uppercase": false
          }
        },
        "logo": {
          "placement": "center_bottom",
          "size": "medium",
          "anchor_offset": 18,
          "min_margin": 80,
          "max_size_ratio": 0.12
        }
      }
    }
  ]
}
```

**Campos novos vs versao anterior (Parte D — Layout Engine):**

Slot anchors (substitui position absoluto):
- `anchor` — `"top_fixed" | "bottom_fixed" | "after:<slotName>" | "before:<slotName>"` — define de onde o slot herda posicao
- `anchor_offset` — number (ex: 14, nao "14%"). Armazenamento canonico = number (percentual sem sufixo). Se o Vision retornar string "14%", normalizar para 14 no POST de art-templates.
- `margin_top` / `margin_bottom` — px de espaco entre slots encadeados (substitui `spacing`)

Template zones:
- `zones.text_zone` — area permitida para texto (x + width)
- `zones.image_focus_zone` — area principal da foto (engine evita texto aqui)
- `zones.gradient_zone` — area coberta pelo overlay/gradiente

Text density:
- `text_density.ideal_words` — palavra-alvo; acima disso engine tenta comprimir
- `text_density.max_words` — limite absoluto; acima disso erro

Slot priority:
- `slot_priority` — ordem de importancia; quando texto e curto, slots de menor prioridade sao omitidos

Template fingerprint:
- `fingerprint` — hash de (layout+slots+overlay+typography); impede templates duplicados

Analysis confidence:
- `analysisConfidence` — 0.0-1.0 do Vision; UI mostra warning se < 0.7

Logo rules:
- `logo.min_margin` — margem minima em px
- `logo.max_size_ratio` — tamanho maximo como % do width (ex: 0.12 = 12%)
- `logo.anchor_offset` — substitui position.bottom

Campos REMOVIDOS (substituidos por anchors):
- `content_slots.*.position` — substituido por `anchor` + `anchor_offset`
- `spacing` — substituido por `margin_top` / `margin_bottom` nos slots

Limite: 5 templates por formato (max 15 por projeto).

### A2. Prompt do GPT-4o Vision para Analise de Template

```
Voce e um analista de design de artes para Instagram.
Analise esta imagem de referencia e extraia a estrutura de layout como JSON.

FORMATO DA ARTE: {format} ({width}x{height})

EXTRAIA:

1. canvas:
   - safe_margin em pixels (distancia do conteudo ate a borda)
   - safe_area: { top, bottom } em pixels — zonas cobertas pela UI do Instagram (para Stories: top ~120px, bottom ~180px)

2. zones (zonas semanticas da composicao):
   - text_zone: { x%, width% } — area onde o texto esta posicionado
   - image_focus_zone: { x%, width% } — area principal da foto/imagem
   - gradient_zone: { x%, width% } — area coberta pelo gradiente/overlay

3. layout:
   - text_alignment (left/center/right)
   - visual_balance: left_heavy | centered | right_heavy

4. overlay: tipo (gradient/solid/none), direcao (left_to_right, bottom_to_top, etc), cor inicial, opacidade final

5. typography:
   - title_font e body_font (descrever estilo se nao identificar nome)
   - scale: mapa de tamanhos em pixels para xs/sm/md/lg/xl baseado nas proporcoes da arte

6. text_density:
   - ideal_words: contagem ideal de palavras para este layout
   - max_words: maximo antes de ficar lotado

7. colors: cor HEX de cada tipo de texto visivel (eyebrow, title, description, cta, footer)

8. default_content: somente se o texto for claramente fixo ou institucional
   (ex: endereco, horario de funcionamento, slogan permanente).
   Se nao tiver certeza, retorne string vazia "".
   NAO invente defaults — somente extraia se o texto e visivelmente fixo na arte.

9. slot_priority: array ordenado dos slots por importancia visual (titulo primeiro, footer ultimo)

9b. slot_drop_order: array dos slots que devem ser removidos primeiro quando texto nao cabe (footer primeiro, titulo nunca)

10. content_slots: para cada bloco de texto visivel, identifique:
    - tipo (label, headline, paragraph, call_to_action, location_or_info)
    - anchor: "top_fixed" se esta proximo ao topo, "bottom_fixed" se proximo ao fundo, "after:<slotAnterior>" se segue outro bloco abaixo, "before:<slotSeguinte>" se esta acima de outro bloco fixo no fundo
    - anchor_offset: % da borda (SOMENTE para top_fixed/bottom_fixed; NAO usar com after/before)
    - margin_top e margin_bottom em pixels estimados
    - tamanho da fonte mapeado para (xs/sm/md/lg/xl)
    - peso (400/600/700/800)
    - se e uppercase
    - max_words e max_lines estimados
    - max_characters_per_line estimado (conte caracteres visiveis na maior linha)
    - line_break_strategy: balanced (se linhas parecem equilibradas) | natural (se nao)
    - allow_auto_scale: true (padrao)

11. logo: se visivel:
    - placement (center_bottom, bottom_right, etc)
    - anchor_offset: % da borda inferior
    - min_margin estimado em px
    - max_size_ratio estimado (proporcao do logo vs largura da imagem)

12. analysis_confidence: 0.0-1.0 — sua confianca na analise (1.0 = perfeito, <0.7 = precisa revisao)

REGRAS:
- Retorne APENAS JSON valido
- Posicoes em percentual (0-100)
- Cores em HEX
- Nao invente conteudo textual
- Detecte quebras de linha visiveis nos titulos e descricoes
- Estime max_characters_per_line contando caracteres da maior linha visivel
- Para anchors: identifique a CADEIA de slots (eyebrow → title → description) e use "after:" para encadeamento
- Para o rodape (footer): use "bottom_fixed" com anchor_offset
- Para CTA acima do rodape: use "before:footer" (sem anchor_offset)
```

Apos receber o JSON, o backend:
1. Executa `normalizeTemplate(templateData)` (ver C19)
2. Adiciona `schemaVersion: 1`, `engineVersion: 1`, `templateVersion: 1` automaticamente
3. Gera `fingerprint` = SHA256(stableStringify(templateData)).substring(0,8)
   (usa `json-stable-stringify` para ordenacao canonica das chaves — evita fingerprints diferentes para JSON semanticamente identico)
4. Extrai `analysisConfidence` do campo `analysis_confidence`
5. Remove `analysis_confidence` do templateData (fica no nivel do template)
6. Retorna `{ templateData, preview, fingerprint, analysisConfidence }`

---

## Parte B — Sistema de Text Processing

### B1. Tipos e Interface

Arquivo: `src/lib/text-processing.ts`

```typescript
type TextProcessingMode = 'faithful' | 'grammar_correct' | 'headline_detection' | 'generate_copy'

interface TextProcessingConfig {
  mode: TextProcessingMode
  enableHeadlineDetection?: boolean   // para headline_detection
  enablePromoDetection?: boolean      // para headline_detection
  customPrompt?: string               // obrigatorio para generate_copy
}

// Tagged union — permite bifurcacao limpa no pipeline
type TextProcessingResult =
  | { classified: false; text: string }                    // modos 1 e 2
  | { classified: true; slots: Record<string, string> }    // modos 3 e 4
```

### B2. Logica por Modo

**Modo 1 — `faithful` (default):**
- Normaliza whitespace (trim + colapsar multiplos espacos)
- Zero chamadas LLM
- Retorna `{ classified: false, text }`

**Modo 2 — `grammar_correct`:**
- GPT-4o-mini com temperatura 0.1
- Prompt: "Corrija apenas ortografia, pontuacao e gramatica. NAO altere significado, NAO torne mais longo, NAO reescreva estilo."
- Retorna `{ classified: false, text: correctedText }`

**Modo 3 — `headline_detection`:**
- GPT-4o-mini via `generateObject()` com schema Zod
- Schema: `{ eyebrow?, title?, description?, cta?, footer? }` (todos string opcionais)
- **NOTA:** Se o template tiver slots com nomes diferentes, este schema TAMBEM deve ser dinamico —
  construido a partir de `Object.keys(template.templateData.content_slots)`. Ver Furo 4 em item 8.
- Prompt: "Analise o texto e identifique: headline principal, frase promocional, descricao, call to action, localizacao. NAO reescreva."
- Retorna `{ classified: true, slots }` — PULA classifyTextIntoSlots()
- Fallback: se nenhum slot reconhecido → retorna `{ classified: false, text }` para classifyTextIntoSlots() decidir

**Modo 4 — `generate_copy`:**
- Requer `config.customPrompt` (validado no Zod)
- GPT-4o-mini via `generateObject()` com schema Zod
- Schema: `{ eyebrow?, title, description?, cta?, footer? }` (title obrigatorio)
- **NOTA:** Mesmo principio: schema dinamico se template disponivel.
- Prompt: "Crie copy curta para Instagram. Estruture em headline, description, cta, footer. Tom publicitario e conciso."
- **max_tokens: 120** — evita copy gigante que estoura density
- **temperature: 0.7** — criativo mas controlado
- Retorna `{ classified: true, slots }`

### B3. Pipeline de Bifurcacao

```
POST /api/tools/generate-art (SERVIDOR)
  │
  ├─ processTextForTemplate(body.text, textProcessingConfig, template?)
  │   (template passado para modos 3/4 construirem schema dinamico)
  │
  ├─ if (result.classified === false)
  │     └─ classifyTextIntoSlots(result.text, template)  ← GPT-4o-mini (schema dinamico)
  │
  ├─ if (result.classified === true)
  │     └─ result.slots já mapeados  ← PULA classificacao
  │
  ├─ densityCheckAndMaybeCompress(slots, template) ← LLM se compress
  │
  └─ Retorna payload { imageUrl, slots, templateData, fontSources }
      (Frontend orquestra 4-pass localmente)
```

### B4. LLM Budget (Furo 11)

Numero de chamadas LLM por cenario no template path:

| Cenario                                    | Chamadas LLM | Modelos             |
|--------------------------------------------|:------------:|---------------------|
| Sem template (fluxo antigo)                | 3            | GPT-4o-mini + GPT-4o x2 |
| Template + modo 1 (faithful) + classify    | 1            | GPT-4o-mini (classify) |
| Template + modo 2 (grammar_correct) + classify | 2        | GPT-4o-mini x2      |
| Template + modo 3 (headline_detection)     | 1            | GPT-4o-mini (detect+classify) |
| Template + modo 4 (generate_copy)          | 1            | GPT-4o-mini (gerar+classify)  |
| Qualquer modo + compressText (density overflow) | +1      | GPT-4o-mini (compress) |
| Analyze template (Vision)                  | 1            | GPT-4o (Vision)      |

**Regras:**
- `classifyTextIntoSlots()` roda **UMA VEZ** — resultado compartilhado por TODOS os templates em multi-template.
- `processTextForTemplate()` e modo `faithful`? Zero LLM. Cache LRU (C17) pode evitar chamadas repetidas.
- Pior caso (template path): 3 chamadas (modo 2 + classify + compress). Igual ao fluxo antigo.
- Melhor caso (template path): 0 chamadas (modo 1 faithful + classify em cache + sem compress).

**Telemetria (adicionado ao C18):**
- `llmCallCount: number` — quantas chamadas LLM nesta geracao
- `llmTotalLatencyMs: number` — tempo total em chamadas LLM
- `llmCalls: Array<{ model: string, purpose: string, latencyMs: number }>` — detalhamento

### B4. Edge Cases

| Cenario | Tratamento |
|---------|-----------|
| `generate_copy` sem customPrompt | Zod `.refine()` rejeita antes de chegar na funcao |
| `text` vazio em modos 1-3 | Validacao Zod existente `min(1)` captura |
| `text` vazio em modo `generate_copy` | Permitido — conteudo vem do customPrompt |
| GPT retorna texto muito longo em grammar_correct | Truncar para 500 chars |
| headline_detection nao encontra slots | Fallback para `{ classified: false, text }` |
| Erro de LLM em qualquer modo | Throw com mensagem clara; route captura no try/catch |

---

## Parte C — Template Engine (Fidelidade Visual)

### C1. Line Breaking Deterministico

**Responsabilidade unica: RENDERER faz o line breaking. Engine so prepara os parametros.**

A funcao `balanceTextLines()` vive EXCLUSIVAMENTE no Renderer (`text-renderer.ts`).
O Layout Engine (`buildDraftLayout`) NAO quebra linhas — ele apenas calcula:
- `maxWidth` (baseado em text_zone.width)
- `maxCharactersPerLine` (do slot config)
- `lineBreakStrategy` ('balanced' | 'natural' | 'fixed')
- `maxLines` (do slot config)
- `fontSize` (do typography.scale)

Esses valores sao passados no `TextLayoutElement` para o Renderer.

**O Renderer executa o line breaking seguindo esta ordem OBRIGATORIA:**
```
1. Aplicar uppercase se configurado
2. Aplicar max_characters_per_line PRIMEIRO (hard limit por linha — quebra palavras longas se necessario)
3. Aplicar estrategia de quebra (balanced/natural/fixed)
4. Validar maxLines:
   4a. Se strictMode: NAO truncar, NAO auto-scale. Manter TODAS as linhas.
       overflow sera detectado no passo 7 do Pass 2 (lines.length > maxLines).
   4b. Se !strictMode && allow_auto_scale: acionar fitTextToSlot()
   4c. Se !strictMode && !allow_auto_scale: truncar com "..." na linha maxLines
```

**REGRA: strictMode PROIBE truncamento.** Truncar e alterar conteudo, o que viola o contrato
do strictMode. Em strictMode, o renderer preserva TODAS as linhas e sinaliza overflow=true
para que o Pass 3 lance SlotOverflowError.

Estrategias por `line_break_strategy`:
- `natural` — word-wrap baseado em maxWidth (medir texto com canvas ctx)
- `balanced` — divide texto em N linhas de comprimento ~igual (medir com ctx)
- `fixed` — respeita `\n` existentes no texto; nao quebra alem disso

**POR QUE no Renderer:** Line breaking depende de medicao real de texto (ctx.measureText).
O Engine nao tem acesso a canvas context — so o Renderer tem. Colocar no Engine geraria
divergencia entre preview e render final.

**Consequencia para Preview (C15):** O preview TAMBEM usa o Renderer para quebrar linhas,
garantindo que preview e render final produzam resultado identico.

### C2. Escala Tipografica

O mapa `typography.scale` no templateData define tamanhos em pixels concretos para cada categoria:
```json
"scale": { "xs": 18, "sm": 24, "md": 32, "lg": 48, "xl": 72 }
```

Em `buildDraftLayout()`:
```
sizePx = template.templateData.typography.scale[slot.font_size]
```

Se `scale` nao existir (templates legados), fallback para calculo proporcional existente:
```
sizePx = Math.round(formatWidth * SIZE_MULTIPLIERS[slot.font_size])
```

### C3. Layout Anchors (Auto-Layout Inteligente — 2-Pass)

SUBSTITUI posicao absoluta (%). Slots encadeados se adaptam ao conteudo sem sobreposicao.
O sistema usa **100% auto-layout baseado em dependencia de slots** — sem spacing sequencial nem position absoluto.

**PROBLEMA resolvido pelo 2-pass:** Anchors `after:` e `before:` dependem da altura do slot referenciado.
Mas a altura real do texto so e conhecida apos line breaking + auto-scale no Renderer (que precisa de canvas ctx).
Solucao: layout em 2 passes — draft com alturas estimadas, depois final com alturas medidas.

**Safe Area e aplicada ANTES do calculo de anchors** (nao como clamp posterior):
```
usableTop = safeArea.top
usableBottom = canvasHeight - safeArea.bottom
usableHeight = usableBottom - usableTop
```
Todos os offsets sao calculados DENTRO da area util.

4 tipos de anchor:

**`top_fixed`** — baseline provisoria no draft, posicao final apos measure:
```
draft:  slotY = usableTop + (usableHeight * anchor_offset / 100)
final:  slotY = usableTop + (usableHeight * anchor_offset / 100)  // mesma — nao depende de altura
```

**`bottom_fixed`** — baseline provisoria no draft, posicao final usa altura medida:
```
draft:  slotY = usableBottom - (usableHeight * anchor_offset / 100) - estimatedHeight
final:  slotY = usableBottom - (usableHeight * anchor_offset / 100) - measuredHeight
```

**`after:<slotName>`** — posiciona ABAIXO do slot referenciado:
```
draft:  slotY = referencedSlot.bottomY_estimated + margin_top
final:  slotY = referencedSlot.bottomY_measured + margin_top
```

**`before:<slotName>`** — posiciona ACIMA do slot referenciado:
```
draft:  slotY = referencedSlot.topY_estimated - estimatedHeight - margin_bottom
final:  slotY = referencedSlot.topY_measured - measuredHeight - margin_bottom
```

Exemplo correto para Stories:
```
eyebrow  → top_fixed (14%)
title    → after:eyebrow
description → after:title
footer   → bottom_fixed (12%)
cta      → before:footer
```

**FLUXO 2-PASS COMPLETO:**

```
=== PASS 1: DRAFT (Engine — buildDraftLayout) ===
Entrada: slots com texto, templateData, format
Saida: DraftLayout (posicoes estimadas + parametros para medicao)

1. Validar anchors (mesmas regras de grupo — top_group/bottom_group)
2. Estimar altura de cada slot:
   estimatedHeight = maxLines * fontSize * 1.2  // heuristica simples
   (Se max_height_pct definido: estimatedHeight = min(estimatedHeight, usableHeight * max_height_pct/100))
3. Resolver anchors top_group (top→bottom) com alturas estimadas
4. Resolver anchors bottom_group (bottom→top) com alturas estimadas
5. Retornar DraftLayout:
   - Cada elemento tem: text, font, sizePx, maxWidth, x, y_draft, align, color, weight
   - Mais parametros para medicao: lineBreakStrategy, maxCharactersPerLine, maxLines,
     allowAutoScale, uppercase, slotMaxHeight
   - anchorType e anchorRef para recalculo no pass final

=== PASS 2: MEASURE (Renderer — measureTextLayout) ===
Entrada: DraftLayout + canvas context
Saida: MeasuredLayout (alturas reais de cada elemento)

Para cada elemento do draft:
1. Aplicar uppercase se configurado
2. Executar balanceTextLines() com canvas ctx (line breaking real)
3. Se strictMode:
   - NAO executar fitTextToSlot() (auto-scale desativado)
   - adjustedFontSize = sizePx (mantem original)
4. Se !strictMode && allowAutoScale:
   - Executar fitTextToSlot() (auto-scale real)
   - adjustedFontSize = resultado do fitTextToSlot
5. Se !strictMode && !allowAutoScale:
   - adjustedFontSize = sizePx (mantem original)
6. Medir altura final: measuredHeight = lines.length * adjustedFontSize * 1.2
7. Detectar overflow (SEMPRE pos-fit, independente de strictMode/allowAutoScale):
   overflow = (lines.length > maxLines || measuredHeight > slotMaxHeight)
8. Retornar para cada slot:
   { slotName, measuredHeight, adjustedFontSize, lines, overflow, fontFallbackUsed }

=== PASS 3: FINAL (Engine — resolveLayoutWithMeasurements) ===
Entrada: DraftLayout + MeasuredLayout
Saida: FinalLayout (posicoes definitivas)

1. Substituir alturas estimadas pelas alturas medidas
2. Re-resolver anchors top_group com alturas reais
3. Re-resolver anchors bottom_group com alturas reais
4. Substituir fontSize por adjustedFontSize (se auto-scale ativou)
5. Validar pos-calculo:
   - Se slot.topY < usableTop → warning telemetria "slot overflow top"
   - Se slot.bottomY > usableBottom → warning telemetria "slot overflow bottom"
6. Se strictMode e algum slot.overflow → throw SlotOverflowError
7. Retornar FinalLayout com posicoes definitivas

=== PASS 4: RENDER (Renderer — renderFinalLayout) ===
Entrada: FinalLayout (com posicoes definitivas, linhas ja quebradas, fontSize ajustado)
Saida: Imagem renderizada

REGRA: Pass 4 NAO re-calcula NADA. Nao re-quebra linhas, nao re-mede texto,
nao re-resolve anchors, nao re-aplica auto-scale. So desenha dados pre-computados.

1. Para cada elemento: desenhar lines[] nas posicoes (x, y_final) com adjustedFontSize
2. Aplicar overlay/gradiente
3. Aplicar logo
```

**Funcoes novas:**
- `buildDraftLayout(slots, template, format)` — Engine, retorna DraftLayout
- `resolveLayoutWithMeasurements(draft, measurements)` — Engine, retorna FinalLayout
- `measureTextLayout(draft, canvasCtx)` — Renderer, retorna MeasuredLayout
- `renderFinalLayout(final, canvasCtx)` — Renderer, desenha imagem

**Estimativa de altura no draft (heuristica — baseada em caracteres, nao em palavras):**
```
estimatedLines = Math.min(maxLines, Math.ceil(text.length / maxCharactersPerLine))
estimatedHeight = estimatedLines * fontSize * lineHeightMultiplier  // lineHeightMultiplier = 1.2
```
**POR QUE `text.length / maxCharactersPerLine`:** A heuristica anterior (baseada em avgWordLength=6)
subestimava linhas para idiomas com palavras longas (portugues, alemao). Usar caracteres totais
dividido por max chars por linha e mais preciso e independente de idioma.
Esta heuristica so precisa ser "boa o suficiente" para o draft — o pass final corrige.

**Validacao de anchors (mesmas regras de antes):**
```
- top_group: so aceita top_fixed e after:<slot_do_top_group>
- bottom_group: so aceita bottom_fixed e before:<slot_do_bottom_group>
- after:<slot> referenciando bottom_fixed → ERRO
- before:<slot> referenciando top_fixed → ERRO
- Cross-group reference → ERRO
- Circular dependency → ERRO (ver algoritmo abaixo)
- Validacoes rodam na CRIACAO do template (normalizeTemplate) e no buildDraftLayout
```

**Algoritmo de deteccao de dependencia circular (DFS — C9):**
```typescript
function validateAnchorGraph(slots: Record<string, SlotConfig>): void {
  // Build adjacency: cada slot depende do slot que referencia via after:/before:
  const deps = new Map<string, string>()
  for (const [name, config] of Object.entries(slots)) {
    const anchor = config.anchor
    if (anchor.startsWith('after:') || anchor.startsWith('before:')) {
      const ref = anchor.split(':')[1]
      if (!slots[ref]) throw new TemplateValidationError(`Slot '${name}' referencia slot inexistente '${ref}'`)
      deps.set(name, ref)
    }
  }

  // DFS com deteccao de back-edge
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycle = [...path.slice(path.indexOf(node)), node]
      throw new TemplateValidationError(`Dependencia circular detectada: ${cycle.join(' → ')}`)
    }
    if (visited.has(node)) return
    inStack.add(node)
    const dep = deps.get(node)
    if (dep) dfs(dep, [...path, node])
    inStack.delete(node)
    visited.add(node)
  }

  for (const name of Object.keys(slots)) {
    dfs(name, [])
  }
}
```

**Exemplos de ciclos que DEVEM ser rejeitados:**
- `title: after:description`, `description: after:title` → ciclo direto
- `eyebrow: after:cta`, `cta: before:footer`, `footer: after:eyebrow` → ciclo via cadeia

**Quando executar:** Em `normalizeTemplate()` (C19) E no inicio de `buildDraftLayout()`.
Se ciclo detectado na analise Vision → retornar erro com `analysisConfidence: 0`, NAO salvar.

**Regras formais por grupo:**
- `top_group`: usa `after:` para encadear (top→bottom). NUNCA `before:`.
- `bottom_group`: usa `before:` para encadear (bottom→top). NUNCA `after:`.

Isso elimina sobreposicao e adapta o layout ao conteudo real — como Figma auto-layout, mas com precisao de medicao.

### C4. Template Zones (Zonas Semanticas)

Zonas definem ONDE cada tipo de conteudo pode existir:

```json
"zones": {
  "text_zone": { "x": "6%", "width": "58%" },
  "image_focus_zone": { "x": "50%", "width": "50%" },
  "gradient_zone": { "x": "0%", "width": "60%" }
}
```

Uso em `buildDraftLayout()` (Engine — Pass 1):
```
// Converter zone de % para px (valores "crus")
const zoneLeft = (text_zone.x_pct / 100) * canvasWidth
const zoneWidth = (text_zone.width_pct / 100) * canvasWidth

// Clamp geometrico: garantir safe_margin dos dois lados, independente do % escolhido
const xPx = Math.max(zoneLeft, safeMargin)
const maxWidthPx = Math.min(zoneLeft + zoneWidth, canvasWidth - safeMargin) - xPx
```
- Todos os slots de texto usam xPx como x base e maxWidthPx como maxWidth
- O overlay/gradiente cobre `gradient_zone` (ver renderer sec 9)
- O engine NUNCA posiciona texto na `image_focus_zone` (validacao)

**REGRA: safe_margin e aplicado UMA VEZ, no Engine (Pass 1), via clamp geometrico.**
O Renderer recebe x e maxWidth ja com safe_margin embutido e NAO re-aplica offset.
`Math.max/min` garante margem de ambos os lados sem depender de como o % foi definido no template.

**Validacao de zonas na criacao do template:**
Se `text_zone` sobrepor `image_focus_zone` mais de 20%:
```
overlapPct = calculateOverlap(text_zone, image_focus_zone)
if (overlapPct > 20):
  warning: "text_zone sobrepoe image_focus_zone em {overlapPct}%"
```
NAO bloqueia o template — apenas alerta na UI (badge amarelo).

Se `zones` nao existe, fallback para `layout.text_area` (compatibilidade legado).

### C5. Smart Text Density

Controla quantidade de texto para evitar artes lotadas.

**Modulo separado**: `src/lib/density-control.ts` — isolado do text-processing e do layout engine.

```json
"text_density": { "ideal_words": 20, "max_words": 35 }
```

**Interface:**
```typescript
interface DensityResult {
  slots: Record<string, string>
  totalWords: number
  textCompressed: boolean
  droppedSlots: string[]
}

async function densityCheckAndMaybeCompress(
  slots: Record<string, string>,
  densityConfig: { ideal_words: number; max_words: number },
  strictMode: boolean,
  template: TemplateData
): Promise<DensityResult>
```

**Pipeline correto (cada etapa em modulo separado):**
```
Text Processing (text-processing.ts)
      ↓
Slot Classification (generate-art/route.ts)
      ↓
Density Control (density-control.ts)   ← NOVO MODULO
      ↓
Layout Engine (desktop-app/src/lib/layout-engine.ts — buildDraftLayout + resolveLayoutWithMeasurements)
      ↓
Renderer (text-renderer.ts)
```

**REGRA: Layout Engine NUNCA chama LLM. compressText acontece APENAS dentro de density-control.ts.**

**Fluxo interno de `densityCheckAndMaybeCompress()`:**
```
1. totalWords = normalizeWords(allSlotsText).length

2. if totalWords <= ideal_words
     return { slots, totalWords, textCompressed: false, droppedSlots: [] }

3. if ideal_words < totalWords <= max_words
     return slots (warning telemetria, textCompressed: false)

4. if totalWords > max_words:

     4a. if strictMode:
         throw TextOverflowError

     4b. if template.slot_drop_order existe:
         remover slots na ordem slot_drop_order
         recalcular totalWords
         if totalWords <= max_words: return

     4c. if ainda > max_words:
         chamar compressText(slots, densityConfig)
         return { slots: compressed, textCompressed: true, droppedSlots }
```

**Funcao `compressText()`** (em `density-control.ts`):
- Chama GPT-4o-mini com prompt: "Reduza o texto mantendo o sentido. Maximo de {ideal_words} palavras. Nao mude o tom publicitario."
- Schema Zod: mesmos slots de entrada
- max_tokens: 120, temperature: 0.3
- So ativa quando texto ultrapassa `max_words` e strictMode=false

**Funcao `normalizeWords()`** (em `density-control.ts`):
- Substitui hifens por espaco: "vinho-branco" → "vinho branco"
- Substitui barras por espaco: "Chardonnay/Pinot" → "Chardonnay Pinot"
- Remove pontuacao solta
- Split por whitespace, filtra vazios
- Usada SEMPRE antes de contar palavras

### C6. Slot Priority e Drop Order

**slot_priority** — define ordem de importancia para renderizacao:
```json
"slot_priority": ["title", "description", "cta", "eyebrow", "footer"]
```

**slot_drop_order** — define QUAL slot eliminar primeiro quando texto e curto ou denso:
```json
"slot_drop_order": ["footer", "eyebrow", "description"]
```

Dois cenarios de uso:

**Texto curto (poucos slots preenchidos):**
```
filledSlots = slots que tem texto (apos classificacao + default_content)
if (filledSlots.length < totalTemplateSlots):
  // Manter apenas slots que existem no texto
  // Ordem de render segue slot_priority
  // Slots omitidos nao geram elementos no TextLayout
```

**Texto denso (totalWords > max_words, apos compressText falhar ou strictMode):**
```
// Remover slots na ordem de slot_drop_order ate totalWords <= max_words
for (slotName of slot_drop_order):
  if (totalWords <= max_words): break
  remove slot from render
  recalculate totalWords
```

Combinado com `default_content`:
- Texto curto: se slot nao tem texto MAS tem default, ele e mantido.
- Texto denso (drop_order): **drop_order SEMPRE tem prioridade sobre default_content**.
  Slot com default_content PODE ser removido pelo drop_order se necessario para reduzir densidade.
  Isso garante que a densidade possa reduzir texto mesmo com CTA padrao.
- Somente slots sem texto E sem default sao omitidos no cenario de texto curto.

Se `slot_drop_order` nao existe, fallback: inverso de `slot_priority` (ultimo = menos importante).

### C7. Auto-Scale (Reducao Automatica de Fonte)

Auto-scale e executado EXCLUSIVAMENTE no **measure pass** do Renderer (Pass 2).
O Engine NAO estima auto-scale — ele apenas passa os parametros.

Funcao `fitTextToSlot()` no Renderer (chamada durante `measureTextLayout`):

```
fitTextToSlot(text, fontSize, maxWidth, maxLines, slotMaxHeight, canvasCtx): { adjustedFontSize, lines, overflow }
```

**Calculo de `slotMaxHeight`:**
```
if (slot.max_height_pct):
  slotMaxHeight = usableHeight * (slot.max_height_pct / 100)
else:
  slotMaxHeight = maxLines * lineHeight   // lineHeight = fontSize * 1.2
```

Campo opcional nos slots:
```json
"description": {
  "max_height_pct": 22
}
```

Logica (executada no measure pass):
```
while (renderedLines > maxLines || textHeight > slotMaxHeight):
  fontSize *= 0.95  // reduz 5%
  re-calcular linhas com novo fontSize usando ctx.measureText()
  if (fontSize < originalFontSize * 0.6): break  // limite minimo: 60% do original

if (renderedLines > maxLines || textHeight > slotMaxHeight):
  overflow = true  // auto-scale nao foi suficiente
```

Controlado por `allow_auto_scale` no slot:
- `true` (default): ativa reducao automatica no measure pass
- `false`: NAO reduz fonte; se texto exceder, `overflow = true`

O `adjustedFontSize` e `lines` retornados pelo measure pass sao usados pelo Engine no Pass 3
para re-calcular as posicoes finais dos anchors com alturas reais.

### C8. Fallback de Conteudo para Slots Vazios + Ordem no Pipeline

**default_content e aplicado ANTES do density-control.** Isso significa que defaults CONTAM para a contagem de palavras e PODEM ser dropados pelo slot_drop_order.

Posicao no pipeline:
```
1. Text Processing → slots com texto do usuario
2. Slot Classification → slots mapeados
3. default_content → preenche slots vazios     ← AQUI (antes do density)
4. Density Control → conta palavras (incluindo defaults), dropa/comprime se necessario
5. Layout Engine → calcula posicoes
6. Renderer → renderiza
```

Em `densityCheckAndMaybeCompress()` (density-control.ts), ANTES de chamar densityControl:

```
for (slotName of templateSlots):
  if (!slots[slotName] || slots[slotName].trim() === ''):
    slots[slotName] = template.templateData.default_content?.[slotName] ?? ''
```

**Regras:**
- Slots com texto vazio E sem default_content → omitidos (nao renderizados, nao contam para density)
- Slots com default_content → contam para density e PODEM ser dropados pelo slot_drop_order
- drop_order SEMPRE tem prioridade sobre default_content (ver C6)

### C9. Safe Area do Instagram

Safe area e aplicada ANTES dos calculos de anchor (ver C3). NAO como clamp posterior.

```
const safeArea = template.templateData.canvas.safe_area ?? { top: 0, bottom: 0 }
const usableTop = safeArea.top
const usableBottom = canvasHeight - safeArea.bottom
const usableHeight = usableBottom - usableTop
```

Todos os anchor_offset% sao calculados sobre `usableHeight`, nao `canvasHeight`.
Isso garante que nenhum slot e posicionado fora da area visivel, sem necessidade de clamp posterior.

Valores padrao para Stories: `{ top: 120, bottom: 180 }`.
Para Feed e Square: `{ top: 0, bottom: 0 }`.

### C10. Uppercase Forcado

No renderer, ANTES de quebrar linhas:
```
if (slot.uppercase) text = text.toUpperCase()
```
Aplica-se APOS o processamento de texto, garantindo que mesmo texto gerado por IA respeite a config.

### C11. Modo Strict Template

```
strictTemplateMode?: boolean  // default false
```

**Definicao EXATA do que strictMode controla:**

| Comportamento           | strictMode=false (default) | strictMode=true          |
|------------------------|----------------------------|--------------------------|
| auto-scale (fonte)     | Ativo (reduce ate -40%)    | DESATIVADO               |
| compressText (LLM)     | Ativo se > max_words       | DESATIVADO               |
| slot_drop_order         | Ativo se > max_words       | DESATIVADO               |
| default_content         | Ativo (preenche vazios)    | Ativo (preenche vazios)  |
| truncamento ("...")     | Ativo (se !auto_scale)     | DESATIVADO (proibido)    |
| overflow de texto       | Silencioso (trunca/scale)  | ERRO 400                 |
| line breaking           | Normal                     | Normal                   |
| uppercase               | Normal                     | Normal                   |

**Principio: strictMode NUNCA altera conteudo. Apenas impede mecanismos que alteram.**
- Sem compress → texto original mantido
- Sem drop → todos os slots renderizados
- Sem auto-scale → tamanho original da fonte mantido
- Se texto nao cabe → ERRO, nao truncamento silencioso

**Fluxo com strictMode=true no pipeline 2-pass:**
```
1. Text Processing: roda normalmente (modos 1-4)
2. Slot Classification: roda normalmente
3. default_content: preenche vazios normalmente
4. Density Control: so faz contagem
   - se totalWords > max_words → throw TextOverflowError (NAO comprime, NAO dropa)
5. Pass 1 (Draft): Engine calcula draft layout normalmente
6. Pass 2 (Measure): Renderer mede texto SEM auto-scale e SEM truncamento
   - Quebra linhas normalmente, mas NAO corta para maxLines (preserva todas as linhas)
   - Se lines.length > maxLines ou measuredHeight > slotMaxHeight → overflow=true
7. Pass 3 (Final): Engine verifica measurements
   - Se algum slot.overflow === true → throw SlotOverflowError (NAO renderiza)
8. Pass 4 (Render): so executa se pass 3 nao lancou erro
```

**IMPORTANTE: Validacao de overflow acontece no Pass 3 (Engine), baseada nas medicoes reais do Pass 2 (Renderer).**
O Engine NAO estima overflow — ele confia nas medicoes reais.

Mensagens de erro:
- `"Texto excede limite de {max_words} palavras. Reduza o texto ou desative modo estrito."`
- `"Texto excede limite do slot '{slotName}'. Reduza o texto ou desative modo estrito."`

### C12. Template Versioning (Estrutural)

Tres campos de versao, cada um com escopo diferente:

```json
{
  "schemaVersion": 1,
  "engineVersion": 1,
  "templateVersion": 1
}
```

**`schemaVersion`** — versao do formato JSON do template.
- Incrementa quando a ESTRUTURA do templateData muda (campos adicionados/removidos/renomeados).
- Inicia em 1.
- Permite migracao futura de templates legados.

**`engineVersion`** — versao minima do engine que suporta este template.
- Incrementa quando o engine ganha features que templates novos dependem (ex: novo tipo de anchor).
- Inicia em 1.
- Validacao no handler:
```
const SUPPORTED_ENGINE_VERSION = 1
if (template.engineVersion > SUPPORTED_ENGINE_VERSION) {
  throw new Error('Template requires newer engine version. Update the application.')
}
```

**`templateVersion`** — versao do template especifico.
- Incrementa quando o usuario edita o template (via UI ou re-analise Vision).
- Inicia em 1.
- Usado para invalidar caches e detectar mudancas.

**Validacao obrigatoria (no handler, antes do Pass 1):**
```
if (template.engineVersion > SUPPORTED_ENGINE_VERSION):
  throw TemplateEngineVersionError
if (template.schemaVersion > SUPPORTED_SCHEMA_VERSION):
  throw TemplateSchemaVersionError
```

Apos receber o JSON do Vision, o backend:
1. Adiciona `schemaVersion: 1`, `engineVersion: 1`, `templateVersion: 1` automaticamente
2. Na edicao de template existente: incrementa `templateVersion` (+1), mantém `schemaVersion` e `engineVersion`

### C13. Template Fingerprint

Ao criar template, gerar fingerprint com JSON canonico (ordenacao estavel de chaves):
```
import stableStringify from 'json-stable-stringify'
fingerprint = SHA256(stableStringify(templateData)).substring(0, 8)
```

**POR QUE `stableStringify`:** `JSON.stringify()` nao garante ordem de chaves — objetos
semanticamente identicos podem gerar fingerprints diferentes. `json-stable-stringify` ordena
chaves recursivamente, garantindo determinismo.

No POST de art-templates, antes de salvar:
```
if (existingTemplates.some(t => t.fingerprint === newFingerprint)):
  return error 409 "Template duplicado detectado"
```

### C14. Analysis Confidence

`analysisConfidence: number` (0.0-1.0) retornado pelo Vision.

Na UI (ArtTemplatesSection):
- >= 0.7: badge verde "Analise confiavel"
- < 0.7: badge amarelo "Template pode precisar de ajuste manual"

### C15. Template Preview Grid

Antes de salvar template, gerar preview com textos ficticios:

```json
{
  "eyebrow": "TESTE",
  "title": "Titulo do Template",
  "description": "Texto de exemplo para visualizar o layout",
  "cta": "Descubra mais",
  "footer": "Rua Exemplo, 123"
}
```

**Preview usa EXATAMENTE o mesmo fluxo 2-pass do render final.**

Pipeline do preview (identico ao render final):
```
1. Textos ficticios → default_content preenchido (C8)
2. densityCheckAndMaybeCompress() (com strictMode=false)
3. Pass 1: buildDraftLayout() → posicoes estimadas
4. Pass 2: measureTextLayout() → medicao real com canvas ctx
5. Pass 3: resolveLayoutWithMeasurements() → posicoes finais
6. Pass 4: renderFinalLayout() → imagem de preview
```

Isso garante que preview e render final produzam resultado IDENTICO.
O frontend chama o Electron IPC com o mesmo pipeline 2-pass — NAO usa
um renderizador alternativo (CSS, canvas simplificado, etc).

Mostra problemas de layout ANTES de salvar.

### C16. Multi-Template Generation

Novo parametro no request de geracao:
```
templateIds?: string[]  // array de ate 3 templateIds
```

Quando presente, gera a MESMA imagem com cada template aplicado separadamente.
Resultado: usuario ve o mesmo conteudo em layouts diferentes e escolhe o melhor.

**Separacao servidor/frontend no multi-template:**

**No SERVIDOR (API Route):**
```
// classifyTextIntoSlots roda UMA VEZ (resultado compartilhado)
const slots = processedText.classified
  ? processedText.slots
  : await classifyTextIntoSlots(processedText.text, primaryTemplate)

// densityCheck pode variar por template (text_density diferente)
// mas classificacao e compartilhada
const templatesWithFonts = await Promise.all(
  templateIds.map(async (id) => {
    const tpl = loadTemplate(id)
    const density = await densityCheckAndMaybeCompress(slots, tpl.templateData.text_density, ...)
    const fontSources = await resolveFontSources(tpl.templateData, project)
    return { templateId: id, templateData: tpl.templateData, fontSources, slots: density.slots }
  })
)
// Retorna array de templates no payload
```

**No FRONTEND (GenerateArtTab.tsx) — 4-pass por template, com `p-limit(2)`:**
```typescript
import pLimit from 'p-limit'
const limit = pLimit(2)  // max 2 templates renderizando simultaneamente

const processedUrls = await Promise.all(
  result.templates.map(tpl => limit(async () => {
    // Pass 1: Engine (JS puro)
    const draft = buildDraftLayout(tpl.slots, tpl.templateData, result.format, tpl.fontSources, result.strictTemplateMode)

    // Pass 2: Renderer (IPC → main process)
    const measurements = await window.electronAPI.measureTextLayout(draft)

    // Pass 3: Engine (JS puro)
    const finalLayout = resolveLayoutWithMeasurements(draft, measurements, {
      strictMode: result.strictTemplateMode
    })

    // Pass 4: Renderer (IPC → main process)
    const rendered = await window.electronAPI.renderFinalLayout(finalLayout, imageBuffer, result.logo)
    return rendered.ok ? URL.createObjectURL(new Blob([rendered.buffer!], { type: 'image/jpeg' })) : null
  }))
)
```

**POR QUE `p-limit(2)`:** Canvas rendering e CPU-intensive. Sem limite, 3 templates
renderizando em paralelo saturam a CPU do main process. `p-limit(2)` garante max 2 operacoes
pesadas simultaneas. Biblioteca: `p-limit` (https://www.npmjs.com/package/p-limit).
**NOTA:** `p-limit` v6+ e ESM-only. Se incompativel com Electron/CommonJS, implementar limiter manual com contador.

Limite: max 3 templates por geracao.

### C17. Cache de Text Processing

Em `src/lib/text-processing.ts`, cache LRU em memoria:

```
import { LRUCache } from 'lru-cache'

const textProcessingCache = new LRUCache<string, TextProcessingResult>({
  max: 1000,
  ttl: 1000 * 60 * 60,  // 1 hora
})

function getCacheKey(text: string, mode: string, config?: TextProcessingConfig): string {
  const flags = `${config?.enableHeadlineDetection ?? false}|${config?.enablePromoDetection ?? false}`
  return createHash('sha256').update(`${text}|${mode}|${config?.customPrompt ?? ''}|${flags}`).digest('hex')
}
```

**POR QUE LRU em vez de FIFO:** FIFO remove a entrada mais antiga mesmo que seja a mais usada.
LRU (`lru-cache`) remove a entrada menos recentemente acessada, mantendo hot entries vivas.
Biblioteca: `lru-cache` (https://github.com/isaacs/node-lru-cache).

Aplica-se apenas aos modos `grammar_correct`, `headline_detection`, `generate_copy` (modo `faithful` nao chama LLM).

### C18. Telemetria de Qualidade

No final do handler, logar:
```
console.log('[generate-art] telemetry:', JSON.stringify({
  // Identificacao
  templateId, textProcessingMode, strictMode, multiTemplate,

  // Slots e conteudo
  slotsUsed,                    // string[] — quais slots foram preenchidos
  totalWords,                   // number — contagem normalizada de palavras
  textCompressed,               // boolean — se compressText() foi acionado
  droppedSlots,                 // string[] — slots removidos pelo drop_order

  // 2-Pass Layout — medicoes reais (do Pass 2)
  measuredHeights,              // Record<string, number> — { slotName: heightPx }
  adjustedFontSizes,            // Record<string, number> — { slotName: finalFontSizePx }
  overflowDetected,             // boolean — se algum slot reportou overflow no Pass 2
  overflowSlots,                // string[] — quais slots tiveram overflow
  fontAutoScaled,               // boolean — se algum slot teve fontSize reduzido
  autoScaledSlots,              // string[] — quais slots tiveram auto-scale

  // Fontes
  fontFallbackUsed,             // boolean — se alguma fonte primaria nao estava disponivel
  fontFallbackSlots,            // string[] — quais slots usaram fallback

  // Performance
  renderTimeMs,                 // number — tempo total do handler
  draftLayoutMs,                // number — tempo do Pass 1 (buildDraftLayout)
  measureLayoutMs,              // number — tempo do Pass 2 (measureTextLayout via IPC)
  resolveLayoutMs,              // number — tempo do Pass 3 (resolveLayoutWithMeasurements)
  renderFinalMs,                // number — tempo do Pass 4 (renderFinalLayout via IPC)
}))
```

**Campos novos vs versao anterior (2-pass):**
- `measuredHeights` — alturas reais medidas pelo Renderer (substituem estimativas)
- `adjustedFontSizes` — tamanhos finais de fonte (pos auto-scale)
- `overflowSlots` — detalhamento de QUAIS slots tiveram overflow
- `autoScaledSlots` — detalhamento de QUAIS slots tiveram fonte reduzida
- `fontFallbackSlots` — detalhamento de QUAIS slots usaram fallback
- `draftLayoutMs` / `measureLayoutMs` / `resolveLayoutMs` / `renderFinalMs` — timing granular por pass

### C19. Normalizacao de Template (pos-Vision)

Funcao `normalizeTemplate(templateData)` executada APOS receber resposta do Vision e ANTES de salvar.

Arquivo: `src/lib/template-normalize.ts` (NOVO)

```typescript
function normalizeTemplate(raw: Record<string, any>): TemplateData
```

**Responsabilidades (nesta ordem):**

1. **Converter percentuais string para number:**
   - `"6%"` → `6`, `"58%"` → `58`, `"14%"` → `14`
   - Aplica-se a: `anchor_offset`, `zones.*.x`, `zones.*.width`
   - Regex: `/^(\d+(?:\.\d+)?)%$/` → `parseFloat(match[1])`

2. **Garantir tipos numericos para campos obrigatorios:**
   - `canvas.safe_margin` → number (default 0)
   - `canvas.safe_area.top` → number (default 0)
   - `canvas.safe_area.bottom` → number (default 0)
   - `content_slots.*.anchor_offset` → number (se presente)
   - `content_slots.*.margin_top` → number (default 0)
   - `content_slots.*.margin_bottom` → number (default 0)
   - `content_slots.*.max_words` → number
   - `content_slots.*.max_lines` → number (default 3)
   - `content_slots.*.max_characters_per_line` → number (default 30)

3. **Garantir existencia de arrays obrigatorios:**
   - `typography.font_fallbacks` → `string[]` (default `['sans-serif']`)
   - `slot_priority` → `string[]` (default: keys de content_slots)
   - `slot_drop_order` → `string[]` (default: inverso de slot_priority)

4. **Validar limites:**
   - `zones.*.x` entre 0–100 (clamp)
   - `zones.*.width` entre 0–100 (clamp)
   - `zones.*.x + zones.*.width` <= 100 (se exceder, reduzir width)

5. **Remover campos desconhecidos:**
   - Whitelist de campos permitidos em cada nivel (canvas, zones, layout, overlay, typography, content_slots, logo)
   - Campos nao reconhecidos: removidos silenciosamente (Vision pode inventar)

**Pipeline:** Vision response → `normalizeTemplate()` → fingerprint → salvar
Executar ANTES de gerar fingerprint (garante que templates "iguais com formatacao diferente" tenham mesmo fingerprint).

### C20. Normalizacao de Fontes (Renderer)

Funcao `normalizeFontFamily()` no renderer, executada ANTES de construir fontFamily no Pass 2.

```typescript
function normalizeFontFamily(
  primaryFont: string,
  fallbacks: string[]
): string {
  // 1. Trim espacos extras
  const cleaned = primaryFont.trim()
  // 2. Remover aspas envolventes (simples ou duplas)
  const unquoted = cleaned.replace(/^['"]|['"]$/g, '')
  // 3. Construir chain com fallbacks
  return [unquoted, ...fallbacks].join(', ')
}
```

**Exemplo:**
- Input: `"  'Playfair Display'  "`, fallbacks: `["Georgia", "Times New Roman", "serif"]`
- Output: `"Playfair Display, Georgia, Times New Roman, serif"`

Executar no Pass 2 (measureTextLayout) antes de `ctx.font = ...`.
Tambem executar no Pass 4 (renderFinalLayout) para consistencia (usa mesma fontFamily).

### C24. Font Precedence (Furo 7)

Resolucao de fontes para cada slot, em ordem de prioridade:

**Para slots tipo headline (eyebrow, title):**
1. `template.templateData.typography.title_font` (se existir e nao vazio)
2. `project.titleFontFamily` (campo do model Project)
3. `'Inter'` (hardcoded fallback)

**Para slots tipo body (description, cta, footer):**
1. `template.templateData.typography.body_font` (se existir e nao vazio)
2. `project.bodyFontFamily` (campo do model Project)
3. `'Inter'` (hardcoded fallback)

**Fallback chain (para ctx.font):**
```
fallbacks = template.templateData.typography.font_fallbacks ?? ['sans-serif']
```

**Onde aplicar:** No SERVIDOR, na funcao `resolveFontSources()` que constroi o campo `fontSources` do payload.
O `fontSources` inclui `family` + `url` (de CustomFont.fileUrl ou Google Fonts).
O frontend repassa `fontSources` no DraftLayout para que o IPC handler chame `ensureFont()` antes de medir.

**Exemplo de resolucao completa:**
```
Template define: title_font = "Playfair Display"
Project define: titleFontFamily = "Montserrat"
CustomFont existe: { fontFamily: "Playfair Display", fileUrl: "https://blob..." }

Resultado:
  fontSources.title = { family: "Playfair Display", url: "https://blob..." }
  // Project.titleFontFamily ignorado (template tem prioridade)
```

### C21. Validacao de Overflow Visual (Pass 3)

Apos re-resolver anchors com alturas reais no Pass 3, validar que NENHUM slot saiu da safe area:

```
for (element of finalElements):
  if (element.y_final < canvas.usableTop):
    if (strictMode): throw SlotOverflowError(`Slot '${element.slotName}' overflow top`)
    else: telemetry.warnings.push(`slot_overflow_top:${element.slotName}`)

  const bottomY = element.y_final + element.measuredHeight
  if (bottomY > canvas.usableBottom):
    if (strictMode): throw SlotOverflowError(`Slot '${element.slotName}' overflow bottom`)
    else: telemetry.warnings.push(`slot_overflow_bottom:${element.slotName}`)
```

**REGRA:** Esta validacao e ADICIONAL a deteccao de overflow por linhas/altura do Pass 2.
O Pass 2 detecta overflow DENTRO do slot (linhas > maxLines).
O Pass 3 detecta overflow FORA da safe area (posicao final invade zona proibida).
Ambos sao necessarios — um slot pode caber em si mesmo mas ficar fora da area visivel.

### C22. Engine Invariants (Contratos Arquiteturais)

Invariantes que NUNCA podem ser violados. Servem como contratos para code review e testes.

**1. Layout Determinism**
Mesma entrada (slots + template + format) → mesmo FinalLayout.
- Engine NAO usa random, Date.now(), ou qualquer fonte de nao-determinismo.
- Renderer NAO altera posicoes (so desenha).
- Teste: rodar buildDraftLayout + resolveLayoutWithMeasurements 2x com mesma entrada → deepEqual.

**2. Preview Consistency**
Preview e render final usam EXATAMENTE o mesmo pipeline 2-pass.
- Preview NAO usa renderizador alternativo (CSS, canvas simplificado, etc).
- Preview passa pelo mesmo fluxo: buildDraftLayout → measureTextLayout → resolveLayoutWithMeasurements → renderFinalLayout.
- Teste: gerar preview e render final com mesmos inputs → layouts identicos.

**3. LLM Isolation**
Layout Engine (buildDraftLayout, resolveLayoutWithMeasurements) NUNCA chama LLM.
- Todo processamento de texto (incluindo compressao) acontece ANTES do engine.
- Engine recebe slots prontos e produz layout 100% deterministico.
- Teste: mock de LLM que lanca erro → engine funciona normalmente.

**4. Renderer Purity**
Renderer NUNCA altera layout calculado pelo Engine.
- Pass 4 (renderFinalLayout) usa posicoes, linhas e fontes PRE-COMPUTADAS.
- Renderer NAO re-quebra linhas, NAO re-calcula posicoes, NAO re-aplica auto-scale.
- Teste: comparar FinalLayout antes e depois do render → identico.

**5. Group Separation (C10 — Group Overlap Detection)**
top_group bottom edge NUNCA ultrapassa bottom_group top edge em modo strict.
- No Pass 3, APOS resolver ambos os grupos, validar:
  ```
  topGroupBottom = max(y_final + measuredHeight) de todos os slots do top_group
  bottomGroupTop = min(y_final) de todos os slots do bottom_group

  if (topGroupBottom > bottomGroupTop):
    overlapPx = topGroupBottom - bottomGroupTop
    if strictMode: throw GroupOverlapError(`Top e bottom groups se sobrepoem em ${overlapPx}px`)
    else: telemetry.warnings.push(`group_overlap:${overlapPx}px`)
  ```
- Teste: criar template com top_group + bottom_group que somam > 100% da usableHeight → strictMode lanca erro.

**6. Server/Frontend Boundary**
A API Route (servidor) NUNCA executa passes do layout engine.
- buildDraftLayout e resolveLayoutWithMeasurements rodam EXCLUSIVAMENTE no frontend (Electron renderer process).
- measureTextLayout e renderFinalLayout rodam EXCLUSIVAMENTE no main process (via IPC).
- O servidor retorna apenas dados (slots, templateData, fontSources) para o frontend orquestrar.
- Teste: API Route sem acesso a canvas context → retorna payload, nao imagem.

### C23. Golden Layout Tests

Testes de regressao para o layout engine. Garantem que alteracoes futuras nao quebrem layouts existentes.
**NOTA:** Os golden tests importam `buildDraftLayout` e `resolveLayoutWithMeasurements` de `desktop-app/src/lib/layout-engine.ts`.

**Estrutura:**
```
desktop-app/src/__tests__/golden-layouts/
  wine-vix-story.test.ts
  feed-square.test.ts
  fixtures/
    wine-vix-story-input.json     // { template, slots, format }
    wine-vix-story-expected.json  // FinalLayout esperado
```

**Formato do teste:**
```typescript
import { buildDraftLayout, resolveLayoutWithMeasurements } from '../../lib/layout-engine'

test('wine-vix-story golden layout', () => {
  const input = loadFixture('wine-vix-story-input.json')
  const draft = buildDraftLayout(input.slots, input.template, input.format)

  // Mock de measureTextLayout com alturas fixas (determinismo)
  const measurements = mockMeasurements(draft, input.measuredHeights)

  const final = resolveLayoutWithMeasurements(draft, measurements)
  const expected = loadFixture('wine-vix-story-expected.json')

  expect(final).toEqual(expected)
})
```

**Regras:**
- Fixtures sao commitadas no repositorio (golden files).
- Quando o engine muda intencionalmente, atualizar fixtures com `--update-golden`.
- Cada template de exemplo tem 1 golden test.
- Mock de measurements garante que o teste nao depende do renderer (isola engine).
- Rodar em `npm run test` (ou `vitest`).

---

## Arquivos a Criar (13 arquivos novos)

### 1. `src/lib/text-processing.ts` (NOVO)
- Exporta: `processTextForTemplate()`, `TextProcessingConfig`, `TextProcessingResult`, `TextProcessingMode`
- Funcoes internas: `applyFaithful()`, `applyGrammarCorrect()`, `applyHeadlineDetection()`, `applyGenerateCopy()`
- Usa `generateObject()` do Vercel AI SDK + `openai('gpt-4o-mini')`
- Cache LRU (C17): `lru-cache` com max=1000, ttl=1h. Cache key inclui flags (enableHeadlineDetection, enablePromoDetection)

### 1b. `src/lib/density-control.ts` (NOVO)
- Exporta: `densityCheckAndMaybeCompress()`, `DensityResult`, `normalizeWords()`
- Funcoes internas: `compressText()`, `normalizeWords()`
- Isolado do text-processing e do layout engine
- Responsavel por: contagem normalizada de palavras, slot dropping (slot_drop_order), compressao via LLM
- UNICO modulo que pode chamar LLM apos classificacao (compressText)

### 1c. `src/lib/template-normalize.ts` (NOVO)
- Exporta: `normalizeTemplate()`, `validateAnchorGraph()`
- Converte % string para number, garante tipos, valida limites, remove campos desconhecidos (C19)
- Valida anchor graph via DFS topological sort (C9) — detecta ciclos antes de salvar
- Executada apos Vision response e ANTES de fingerprint/salvar

### 1d. `src/__tests__/golden-layouts/` (NOVO — C23)
- Diretorio de testes de regressao para o layout engine
- `wine-vix-story.test.ts` — golden test para template Wine Vix Story
- `feed-square.test.ts` — golden test para template Feed Square
- `fixtures/wine-vix-story-input.json` — entrada fixa: { template, slots, format, measuredHeights }
- `fixtures/wine-vix-story-expected.json` — FinalLayout esperado (golden file)
- `fixtures/feed-square-input.json` — entrada fixa para feed
- `fixtures/feed-square-expected.json` — FinalLayout esperado para feed
- Mock de measureTextLayout com alturas fixas (isola engine do renderer)
- Usa `buildDraftLayout()` + `resolveLayoutWithMeasurements()` diretamente
- Flag `--update-golden` para regenerar fixtures quando engine muda intencionalmente
- Rodar com `vitest` (ou framework de testes do projeto)

### 1e. `desktop-app/src/lib/layout-engine.ts` (NOVO — Furo 2)
- **Layout Engine puro JS** — roda no renderer process do Electron, SEM dependencia de canvas, IPC ou LLM.
- Exporta: `buildDraftLayout()`, `resolveLayoutWithMeasurements()`, `validateAnchorGraph()`
- Exporta tipos: `DraftLayout`, `DraftLayoutElement`, `FinalLayout`, `FinalLayoutElement`, `MeasuredLayout`, `FontSources`
- `buildDraftLayout(slots, templateData, format, fontSources, strictMode)` — Engine Pass 1:
  - 100% deterministico
  - Aplica `default_content` para slots vazios (C8)
  - Resolve `sizePx` via `typography.scale[slot.font_size]` (C2)
  - Estima alturas: `estimatedLines * fontSize * 1.2` (C3 heuristica)
  - Calcula posicoes draft via anchors sobre usableHeight (C3)
  - Aplica zones — text_zone.x como x base, text_zone.width como maxWidth (C4)
  - Safe margin via clamp geometrico (C4)
  - Valida anchor graph (C9 — DFS topological sort)
  - Prepara parametros de medicao para Pass 2
  - Constroi overlay config com direction do template
  - Inclui fontSources no DraftLayout (para ensureFont no Pass 2)
  - Verifica `template.engineVersion <= SUPPORTED_ENGINE_VERSION` (C12)
  - NAO faz density check (ja feito no servidor)
  - NAO faz line breaking (so estima alturas para posicionamento draft)
- `resolveLayoutWithMeasurements(draft, measurements, { strictMode })` — Engine Pass 3:
  - Substitui alturas estimadas por alturas medidas
  - Re-resolve anchors top_group e bottom_group com alturas reais
  - Substitui fontSize por adjustedFontSize (se auto-scale ativou)
  - **Valida group overlap (Furo 10):** topGroupBottom vs bottomGroupTop
  - **Valida overflow visual (C21):** slots dentro da safe area
  - Se strictMode e overflow/overlap → throw erro correspondente
  - Retorna FinalLayout com posicoes definitivas + linhas pre-quebradas
- Inclui: constantes de formato (FORMAT_DIMENSIONS), usableHeight por formato, SUPPORTED_ENGINE_VERSION

### 2. `src/app/api/tools/analyze-art-template/route.ts` (NOVO)
- POST: recebe `{ projectId, imageUrl, format, templateName }`
- Valida URL com HEAD request (padrao de analyze-style)
- **Resize antes do Vision (Furo 15):** Download da imagem → resize para max 1536px (preservando aspect ratio) via `sharp(buffer).resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 })` → enviar buffer redimensionado ao GPT-4o Vision (nao a URL original). Reduz tokens e latencia do Vision tiling.
- Envia imagem para GPT-4o Vision com prompt expandido (A2) que extrai: canvas, layout, overlay, typography.scale, spacing, colors, default_content, content_slots (com line_break_strategy, max_characters_per_line, allow_auto_scale, uppercase), logo
- Parse JSON com 3 niveis de fallback (parse → regex → cleaned text)
- Adiciona `schemaVersion: 1`, `engineVersion: 1`, `templateVersion: 1` automaticamente
- Executa `normalizeTemplate()` (C19) antes de gerar fingerprint
- Retorna `{ templateData, preview }` (C10): preview com detectedSlots, slotPositions, overlayDescription, colorSummary

### 3. `src/app/api/projects/[projectId]/art-templates/route.ts` (NOVO)
- GET: retorna array de templates do projeto (de brandVisualElements.artTemplates)
- POST: adiciona template (valida limite 5/formato, merge JSON preservando campos existentes)
- DELETE: remove template por id (query param `?templateId=xxx`)
- Padrao de merge: ler currentVe → preservar todos campos → adicionar/remover template → escrever

### 4. `desktop-app/src/hooks/use-art-templates.ts` (NOVO)
- `useArtTemplates(projectId)` — GET query, staleTime 5min
- `useCreateArtTemplate(projectId)` — POST mutation, invalida query
- `useDeleteArtTemplate(projectId)` — DELETE mutation, invalida query
- `useAnalyzeArtTemplate()` — POST /api/tools/analyze-art-template

### 5. `desktop-app/src/components/project/identity/ArtTemplatesSection.tsx` (NOVO)
- Sub-secao abaixo de StyleAnalysisSection no IdentityTab
- Tabs por formato (Story | Feed | Square)
- Cards de templates existentes com thumbnail + nome + botao excluir
- Botao "+ Criar Template" abre modal com upload de 1 imagem + nome + formato
- Chama analyze-art-template, mostra preview, salva

### 6. `desktop-app/src/components/project/generate/TemplateSelector.tsx` (NOVO)
- Mostra thumbnails dos templates disponiveis para o formato selecionado
- Opcao "Automatico (IA decide)" como fallback
- Posicionado entre FormatSelector e TextInput no GenerateArtTab

### 7. `desktop-app/src/components/project/generate/TextProcessingSelector.tsx` (NOVO)
- Props: `mode, onModeChange, customPrompt, onCustomPromptChange`
- Select/radio com 4 opcoes: Texto fiel | Correcao gramatical | Detectar estrutura | Gerar copy com IA
- Quando mode=generate_copy: mostra textarea para customPrompt
- Estilo: segue padrao do CompositionEditor (rounded-xl border bg-card/50 p-4)
- Posicionado entre TextInput e Toggles no GenerateArtTab

---

## Arquivos a Modificar (7 arquivos)

### 8. `src/app/api/tools/generate-art/route.ts`

**Adicionar ao schema Zod:**
```typescript
templateId: z.string().optional(),
templateIds: z.array(z.string()).max(3).optional(),
textProcessingMode: z.enum(['faithful', 'grammar_correct', 'headline_detection', 'generate_copy']).default('faithful'),
textProcessingCustomPrompt: z.string().max(500).optional(),
strictTemplateMode: z.boolean().default(false),
```
+ `.refine()`: se mode=generate_copy, customPrompt obrigatorio
+ Regra: se `templateIds` presente → usa array. Se apenas `templateId` → trata como `[templateId]`. Se ambos → `templateIds` tem precedencia.

**Nova funcao `classifyTextIntoSlots(text, template)`:**
- Substitui `separateTextElements()` quando template presente
- **Schema Zod e prompt sao DINAMICOS** — construidos a partir de `Object.keys(template.templateData.content_slots)`:
  ```typescript
  const slotNames = Object.keys(template.templateData.content_slots)
  const schema = z.object(
    Object.fromEntries(slotNames.map(name => {
      const slot = template.templateData.content_slots[name]
      return [name, z.string().optional().describe(`Tipo: ${slot.type}`)]
    }))
  )
  ```
- Prompt tambem e dinamico: "Classifique o texto nos slots: {slotNames.join(', ')}. Tipos: {slotDescriptions}."
- NAO decide cores, posicoes, fontes — so mapeia texto para slots
- **NAO hardcodar `{ eyebrow, title, description, cta, footer }`** — templates podem ter slots diferentes

**IMPORTANTE: Esta API Route NUNCA chama IPC.** Roda em Node.js/Vercel.
A API Route faz APENAS: Text Processing (LLM) + Classify (LLM) + Density Control (LLM se compress) + gerar imagem base.
O layout engine (4 passes) e executado no FRONTEND (Electron renderer process).

**Funcao helper `resolveFontSources(template, project)`:**
- Resolve precedencia de fontes (ver C24 — Font Precedence) e retorna fontSources para o payload
  ```typescript
  function resolveFontSources(template: TemplateData, project: Project): FontSources {
    const titleFont = template.typography.title_font || project.titleFontFamily || 'Inter'
    const bodyFont = template.typography.body_font || project.bodyFontFamily || 'Inter'
    const titleCustomFont = await prisma.customFont.findFirst({ where: { fontFamily: titleFont, projectId } })
    const bodyCustomFont = await prisma.customFont.findFirst({ where: { fontFamily: bodyFont, projectId } })
    return {
      title: { family: titleFont, url: titleCustomFont?.fileUrl ?? null },
      body: { family: bodyFont, url: bodyCustomFont?.fileUrl ?? null }
    }
  }
  ```

**Telemetria (C18):** logar ao final: templateId, mode, slotsUsed, droppedSlots, textCompressed, llmCallCount, llmTotalLatencyMs, renderTimeMs

**Logica do POST handler (template branch — SERVIDOR APENAS):**
```
const startTime = Date.now()
let llmCallCount = 0
let llmTotalLatencyMs = 0

if (body.templateId || body.templateIds) {
  const templateIds = body.templateIds || [body.templateId]
  // Carregar primeiro template para classify (todos compartilham mesma classificacao)
  const primaryTemplate = buscar template do brandVisualElements.artTemplates[templateIds[0]]

  // C12: version check
  if (primaryTemplate.engineVersion > SUPPORTED_ENGINE_VERSION) throw error

  // 1. Text Processing (LLM — modos 2/3/4)
  const llm1Start = Date.now()
  textConfig = { mode: body.textProcessingMode, customPrompt: body.textProcessingCustomPrompt }
  processedText = await processTextForTemplate(body.text, textConfig)  // usa cache C17
  if (textConfig.mode !== 'faithful') { llmCallCount++; llmTotalLatencyMs += Date.now() - llm1Start }

  // 2. Slot Classification (LLM — APENAS quando modo 1 ou 2)
  if (processedText.classified) {
    slots = processedText.slots  // modos 3-4: ja classificado
  } else {
    const llm2Start = Date.now()
    slots = await classifyTextIntoSlots(processedText.text, primaryTemplate)
    llmCallCount++; llmTotalLatencyMs += Date.now() - llm2Start
  }

  // 3. Density Control (LLM se compress necessario)
  const llm3Start = Date.now()
  densityResult = await densityCheckAndMaybeCompress(
    slots,
    primaryTemplate.templateData.text_density,
    body.strictTemplateMode,
    primaryTemplate.templateData
  )
  if (densityResult.textCompressed) { llmCallCount++; llmTotalLatencyMs += Date.now() - llm3Start }

  // 4. Gerar imagem base (Gemini/Ideogram) — pode rodar em paralelo com classify
  imageUrl = await generateBaseImage(...)

  // 5. Resolver font sources para CADA template
  const templatesWithFonts = await Promise.all(
    templateIds.map(async (id) => {
      const tpl = loadTemplate(id)
      const fontSources = await resolveFontSources(tpl.templateData, project)
      return { templateId: id, templateData: tpl.templateData, fontSources }
    })
  )

  // 6. Retornar payload para o FRONTEND orquestrar o layout
  return Response.json({
    // Dados de imagem
    imageUrl,

    // Dados do template path (o frontend usa para orquestrar 4-pass)
    templatePath: true,
    templates: templatesWithFonts,  // array para multi-template
    slots: densityResult.slots,
    densityResult: {
      totalWords: densityResult.totalWords,
      textCompressed: densityResult.textCompressed,
      droppedSlots: densityResult.droppedSlots
    },
    strictTemplateMode: body.strictTemplateMode,
    format,

    // Logo (mesmo formato existente)
    logo: { url: logoUrl, position: logoPosition, sizePct: logoSizePct },

    // Telemetria do servidor
    serverTelemetry: {
      llmCallCount,
      llmTotalLatencyMs,
      textProcessingMode: body.textProcessingMode,
      totalWords: densityResult.totalWords,
      textCompressed: densityResult.textCompressed,
      droppedSlots: densityResult.droppedSlots,
      slotsUsed: Object.keys(densityResult.slots),
      serverTimeMs: Date.now() - startTime
    }
  })
} else {
  // fluxo antigo (separateTextElements + positionTextWithVision)
  // retorna { images: [{imageUrl, textLayout}], fonts, fontUrls, logo }
}
```

**NOTA sobre separacao servidor/frontend:**
- O servidor FAZ: Text Processing, Slot Classification, Density Control, gerar imagem base, resolver font sources
- O servidor NAO FAZ: buildDraftLayout, measureTextLayout, resolveLayoutWithMeasurements, renderFinalLayout
- O frontend (GenerateArtTab.tsx) recebe o payload e orquestra os 4 passes via layout-engine.ts + IPC
- classifyTextIntoSlots roda UMA VEZ no servidor — o resultado e compartilhado por TODOS os templates em multi-template

### 9. `desktop-app/electron/ipc/text-renderer.ts`

**Retrocompatibilidade de overlay/gradiente (C6 — OBRIGATORIO):**
O renderer atual usa gradiente VERTICAL multi-stop baseado em `position` (top/bottom/full).
A nova logica usa gradiente DIRECIONAL com `direction` + `gradient_zone` + `ctx.clip()`.
Para manter o fluxo antigo funcionando:

```
if (overlay.direction) {
  // NOVO: gradiente direcional (template path)
  // Usa direction, startColor, endOpacity, gradient_zone
  // Implementacao com ctx.clip() (ver abaixo)
} else {
  // LEGADO: gradiente vertical (fluxo antigo — positionTextWithVision)
  // Usa position (top/bottom/full) e opacity
  // Mantem logica existente inalterada (multi-stop vertical)
}
```

**Suporte a gradiente direcional (usa endOpacity do template — APENAS quando `direction` presente):**
- `direction?: 'left_to_right' | 'right_to_left' | 'top_to_bottom' | 'bottom_to_top'`
- `left_to_right`: `createLinearGradient(0, 0, width, 0)` — preto esquerda, transparente direita
- **Scope do overlay: SEMPRE respeita `gradient_zone` do template.**
  - O gradiente e desenhado APENAS dentro da regiao definida por `gradient_zone` (x..x+width).
  - Se `gradient_zone` nao existe no template, fallback: overlay cobre imagem inteira (full).
  - Implementacao: usar `ctx.save()` → `ctx.clip()` na regiao do gradient_zone → desenhar gradiente → `ctx.restore()`
  ```
  const zoneX = (gradient_zone?.x_pct ?? 0) / 100 * canvasWidth
  const zoneW = (gradient_zone?.width_pct ?? 100) / 100 * canvasWidth
  ctx.save()
  ctx.beginPath()
  ctx.rect(zoneX, 0, zoneW, canvasHeight)
  ctx.clip()
  const grad = ctx.createLinearGradient(...)  // direction define start/end points
  grad.addColorStop(0, rgba(startColor, opacity))
  grad.addColorStop(1, rgba(endColor ?? startColor, endOpacity ?? 0))
  ctx.fillStyle = grad
  ctx.fillRect(zoneX, 0, zoneW, canvasHeight)
  ctx.restore()
  ```
- **REGRA: `gradient_zone` define ONDE o overlay aparece. `direction` define COMO o gradiente flui dentro dessa zona.**

**safe_margin: aplicado EXCLUSIVAMENTE no Engine (Pass 1).**
O Renderer recebe posicoes ja com safe_margin embutido — NAO re-aplica offset nenhum.
Ver C4 para calculo exato de xPx e maxWidthPx.

**Funcoes do 2-Pass Layout (Renderer):**

O renderer implementa Pass 2 e Pass 4 do fluxo 2-pass. Ambas funcoes sao expostas via IPC handlers:

**Pass 2 — `measureTextLayout(draft, canvasCtx)`:**
- IPC channel: `image:measure-text-layout`
- Entrada: DraftLayout (do Engine Pass 1) + canvas context

**PASSO 0 OBRIGATORIO — Font Registration (C8):**
Antes de qualquer medicao, garantir que fontes estao registradas no canvas:
```typescript
// fontSources vem embutido no DraftLayout (ver interface abaixo)
for (const source of [draft.fontSources.title, draft.fontSources.body]) {
  if (source.family && !registeredFonts.has(source.family)) {
    const fontPath = await ensureFont(source.family, source.url ?? undefined)
    registerFontFromPath(fontPath, source.family)
  }
}
// Verificar disponibilidade POS-registro
for (const element of draft.elements) {
  const available = GlobalFonts.families.some(f => f.family === element.font)
  if (!available) {
    element._fontFallbackUsed = true
    console.warn(`[measure] Font '${element.font}' nao disponivel apos registro. Usando fallback.`)
  }
}
```
**SEM ESSE PASSO, `ctx.measureText()` usa fonte fallback silenciosamente, gerando medicoes incorretas que propagam para Pass 3 e Pass 4.**

- Para cada elemento do draft:
  1. Aplicar uppercase se configurado
  2. Construir fontFamily com `normalizeFontFamily(primaryFont, font_fallbacks)` (C20)
  3. Verificar fonte disponivel: `fontFallbackUsed = !registeredFonts.has(primaryFont)`
  4. Executar `balanceTextLines()` com canvas ctx (line breaking real)
  5. Se `strictMode`: adjustedFontSize = sizePx (NAO roda auto-scale)
     Se `!strictMode && allowAutoScale`: executar `fitTextToSlot()` → adjustedFontSize = resultado
     Se `!strictMode && !allowAutoScale`: adjustedFontSize = sizePx
  6. Medir altura final: `measuredHeight = lines.length * adjustedFontSize * lineHeightMultiplier`
  7. Detectar overflow (SEMPRE pos-fit, independente de strictMode/allowAutoScale):
     `overflow = (lines.length > maxLines || measuredHeight > slotMaxHeight)`
- Retorna MeasuredLayout:
  ```typescript
  interface MeasuredLayout {
    slots: Array<{
      slotName: string
      measuredHeight: number      // altura real em px
      adjustedFontSize: number    // fontSize final (pode ser menor se auto-scale ativou)
      lines: string[]             // linhas ja quebradas (reutilizadas no Pass 4)
      overflow: boolean           // true se texto excede limites
      fontFallbackUsed: boolean   // true se fonte primaria indisponivel
    }>
  }
  ```

**Pass 4 — `renderFinalLayout(finalLayout, imageBuffer, canvasCtx)`:**
- IPC channel: `render-final-layout`
- Entrada: FinalLayout (do Engine Pass 3) + imagem de fundo + canvas context
- Para cada elemento:
  1. Usar posicoes definitivas (x, y_final) do FinalLayout
  2. Usar linhas pre-quebradas do Pass 2 (NAO re-quebra)
  3. Usar adjustedFontSize do Pass 2 (NAO re-calcula)
  4. Aplicar overlay/gradiente com direction do template
  5. Desenhar texto com cor, peso, alinhamento
- Aplica logo se configurado
- Retorna imagem renderizada (Buffer)
- **REGRA: Pass 4 NAO re-calcula nada. So desenha com dados pre-computados.**

**Funcoes auxiliares do renderer (usadas nos passes):**

- **`balanceTextLines(text, strategy, maxCharsPerLine, maxWidth, ctx)`** — Line breaking (C1):
  - `natural`: word-wrap baseado em maxWidth (medir com ctx.measureText)
  - `balanced`: divide texto em N linhas de comprimento ~igual (medir com ctx)
  - `fixed`: respeita `\n` existentes no texto; nao quebra alem disso
  - Aplicar max_characters_per_line ANTES da estrategia (hard limit por linha)

- **`fitTextToSlot(text, fontSize, maxWidth, maxLines, slotMaxHeight, ctx)`** — Auto-scale (C7):
  - Loop: reduz fontSize em 5% enquanto renderedLines > maxLines ou textHeight > slotMaxHeight
  - Limite minimo: 60% do fontSize original
  - Retorna `{ adjustedFontSize, lines, overflow }`
  - Controlado por `allow_auto_scale` no elemento
  - So executa no Pass 2 (measureTextLayout)

- **Uppercase (C10):** Antes de quebrar linhas: `if (el.uppercase) text = text.toUpperCase()`

- **Font Fallback:**
  ```
  const fallbacks = template.typography.font_fallbacks ?? ['sans-serif']
  fontFamily = [primaryFont, ...fallbacks].join(', ')
  ```
  Telemetria `fontFallbackUsed`:
  - Verificar disponibilidade da fonte ANTES de renderizar via registro de fontes carregadas
  - No Electron/node-canvas: checar se a fonte foi registrada com `registerFont()`
  - `fontFallbackUsed = !registeredFonts.has(primaryFont)`
  - NAO depender de deteccao visual pos-render (nao e confiavel)
  - Se a fonte primaria nao estiver registrada, logar warning + usar fallback chain

- **Safe area (C9):** aplicada no Engine (Pass 1/3); Renderer confia nas posicoes recebidas

**Interfaces atualizadas (2-pass):**
```typescript
// === Output do Engine Pass 1 ===
interface DraftLayoutElement {
  slotName: string
  text: string
  font: string
  fontFallbacks: string[]
  sizePx: number
  weight: number
  color: string
  x: number
  y_draft: number              // posicao estimada (pode mudar no Pass 3)
  align: 'left' | 'center' | 'right'
  maxWidth: number
  // Parametros para medicao (Pass 2):
  uppercase: boolean
  lineBreakStrategy: 'balanced' | 'natural' | 'fixed'
  maxCharactersPerLine: number
  maxLines: number
  allowAutoScale: boolean
  slotMaxHeight: number        // px — calculado de max_height_pct ou maxLines*lineHeight
  // Metadados para recalculo (Pass 3):
  anchorType: 'top_fixed' | 'bottom_fixed' | 'after' | 'before'
  anchorRef?: string           // nome do slot referenciado (para after/before)
  anchorOffset?: number        // % para top_fixed/bottom_fixed
  marginTop: number
  marginBottom: number
  estimatedHeight: number      // altura heuristica do Pass 1
}

interface DraftLayout {
  elements: DraftLayoutElement[]
  overlay: {
    enabled: boolean
    type?: 'solid' | 'gradient'
    direction?: 'left_to_right' | 'right_to_left' | 'top_to_bottom' | 'bottom_to_top'
    position: 'top' | 'bottom' | 'full'
    opacity: number              // opacidade inicial (ponto de partida do gradiente)
    startColor?: string          // cor inicial (ex: "#000000")
    endOpacity?: number          // opacidade final (ponto de chegada do gradiente; default 0)
    endColor?: string            // cor final (default = startColor; permite gradientes coloridos)
  }
  fontSources: {                 // C8/C16 — fontes para ensureFont() no Pass 2
    title: { family: string; url: string | null }
    body: { family: string; url: string | null }
  }
  logo?: { placement: string; anchorOffset: string; minMargin: number; maxSizeRatio: number; logoUrl?: string }
  canvas: { width: number; height: number; usableTop: number; usableBottom: number }
  shadow: boolean
  safeMargin?: number
  strictMode: boolean            // propagado para Pass 2 e Pass 3
}

// === Output do Engine Pass 3 ===
interface FinalLayoutElement {
  slotName: string
  text: string
  font: string
  fontFallbacks: string[]
  sizePx: number               // adjustedFontSize (do Pass 2, pode diferir do original)
  weight: number
  color: string
  x: number
  y_final: number              // posicao DEFINITIVA (calculada com alturas reais)
  align: 'left' | 'center' | 'right'
  maxWidth: number
  uppercase: boolean
  lines: string[]              // linhas pre-quebradas (do Pass 2 — reutilizadas no Pass 4)
  measuredHeight: number       // altura real medida (do Pass 2)
  overflow: boolean            // do Pass 2
  fontFallbackUsed: boolean    // do Pass 2
}

interface FinalLayout {
  elements: FinalLayoutElement[]
  overlay: DraftLayout['overlay']
  logo?: DraftLayout['logo']
  canvas: DraftLayout['canvas']
  shadow: boolean
  safeMargin?: number
}
```

**IPC Handlers novos em `main.ts` (registrados no main process, NAO em text-renderer.ts):**
```typescript
// Em desktop-app/electron/main.ts — ao lado do handler 'image:render-text' existente

ipcMain.handle('image:measure-text-layout', async (_event, draftLayout: DraftLayout) => {
  // C8: Font registration ANTES de medir
  for (const source of [draftLayout.fontSources.title, draftLayout.fontSources.body]) {
    if (source.family) {
      const fontPath = await ensureFont(source.family, source.url ?? undefined)
      registerFontFromPath(fontPath, source.family)
    }
  }

  const canvas = createCanvas(draftLayout.canvas.width, draftLayout.canvas.height)
  const ctx = canvas.getContext('2d')
  return measureTextLayout(draftLayout, ctx)
})

ipcMain.handle('image:render-final-layout', async (_event, finalLayout: FinalLayout, imageBuffer: ArrayBuffer) => {
  // Fontes ja registradas no Pass 2 — nao precisa re-registrar
  const canvas = createCanvas(finalLayout.canvas.width, finalLayout.canvas.height)
  const ctx = canvas.getContext('2d')
  return renderFinalLayout(finalLayout, Buffer.from(imageBuffer), ctx)
})
```

### 10. `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`

- Importar TemplateSelector e TextProcessingSelector
- Importar `buildDraftLayout`, `resolveLayoutWithMeasurements` de `@/lib/layout-engine`
- Novos states: `selectedTemplateId`, `textProcessingMode` (default 'faithful'), `textProcessingCustomPrompt`, `strictTemplateMode` (default false)
- TemplateSelector entre FormatSelector e TextInput
- **TemplateSelector so renderiza se `hasTemplatePipeline` (ver Compatibilidade Web vs Desktop)**
- TextProcessingSelector entre TextInput e Toggles
- Novo toggle "Modo estrito" (visivel apenas quando template selecionado) — desativa auto-scale e impede overflow
- handleGenerate: passar `templateId`, `textProcessingMode`, `textProcessingCustomPrompt`, `strictTemplateMode`
- Resetar template quando formato muda
- Quando mode=generate_copy: campo text pode ficar vazio (validacao ajustada)

**Orquestracao do 4-pass no frontend (processResultWithTemplate):**
```typescript
async function processResultWithTemplate(result: TemplatePathResult): Promise<string[]> {
  const processedUrls: string[] = []

  // Download imagem base (mesmo mecanismo existente)
  const downloaded = await window.electronAPI.downloadBlob(result.imageUrl)
  const imageBuffer = downloaded.buffer!

  for (const tpl of result.templates) {
    // Pass 1: Engine gera draft (JS puro — sem IPC)
    const draft = buildDraftLayout(
      result.slots,
      tpl.templateData,
      result.format,
      tpl.fontSources,
      result.strictTemplateMode
    )

    // Pass 2: Renderer mede texto real (IPC → main process com canvas)
    const measurements = await window.electronAPI.measureTextLayout(draft)

    // Pass 3: Engine resolve posicoes finais (JS puro — sem IPC)
    const finalLayout = resolveLayoutWithMeasurements(draft, measurements, {
      strictMode: result.strictTemplateMode
    })

    // Pass 4: Renderer renderiza imagem final (IPC → main process com canvas)
    const rendered = await window.electronAPI.renderFinalLayout(
      finalLayout,
      imageBuffer,
      result.logo
    )

    if (rendered.ok && rendered.buffer) {
      const blob = new Blob([rendered.buffer], { type: 'image/jpeg' })
      processedUrls.push(URL.createObjectURL(blob))
    }
  }

  return processedUrls
}
```

**Em `processResultImages` (funcao existente), adicionar branch:**
```typescript
if (result.templatePath && hasTemplatePipeline) {
  // Novo fluxo: 4-pass no frontend
  return processResultWithTemplate(result)
} else if (result.templatePath && !hasTemplatePipeline) {
  // Web sem Electron — nao deveria chegar aqui (UI impede)
  throw new Error('Templates requerem o app desktop')
} else {
  // Fluxo antigo: renderText com textLayout do servidor
  // (codigo existente inalterado)
}
```

### 11. `desktop-app/src/components/project/tabs/IdentityTab.tsx`
- Importar e renderizar ArtTemplatesSection abaixo de StyleAnalysisSection (com divisor)

### 12. `desktop-app/src/stores/generation.store.ts` + `desktop-app/src/hooks/use-art-generation.ts`
- GenerationParams: + `templateId?: string`, `templateIds?: string[]`, `textProcessingMode?: TextProcessingMode`, `textProcessingCustomPrompt?: string`, `strictTemplateMode?: boolean`
- GenerateArtParams: mesmos campos opcionais

### 13. `desktop-app/electron/preload.ts` (Furo 5)
- Adicionar novos IPC channels na interface `ElectronAPI`:
  ```typescript
  measureTextLayout: (draft: DraftLayout) => ipcRenderer.invoke('image:measure-text-layout', draft)
  renderFinalLayout: (final: FinalLayout, imageBuffer: ArrayBuffer, logo?: LogoConfig) =>
    ipcRenderer.invoke('image:render-final-layout', final, imageBuffer, logo)
  ```
- Handler `renderText` existente permanece inalterado (usado pelo fluxo antigo)

### 14. `desktop-app/electron/main.ts` (Furo 5)
- Registrar novos `ipcMain.handle()`:
  - `'image:measure-text-layout'` — chama `ensureFont()` + `measureTextLayout()` (ver sec 9)
  - `'image:render-final-layout'` — chama `renderFinalLayout()` (ver sec 9)
- Handler `'image:render-text'` existente permanece inalterado (usado pelo fluxo antigo)

---

## Ordem de Implementacao

**Fase 0 — Dependencias (antes de tudo)**
0. Instalar dependencias novas (ver secao "Dependencias a Instalar" abaixo)

**Fase 1 — Bibliotecas core (sem dependencias entre si)**
1. `src/lib/text-processing.ts` — tipos + processTextForTemplate() com 4 modos + cache LRU (C17)
2. `src/lib/density-control.ts` — densityCheckAndMaybeCompress() + normalizeWords() + compressText() (C5)
3. `src/lib/template-normalize.ts` — normalizeTemplate() + validateAnchorGraph() (C19 + C9)

**Fase 2 — APIs backend (dependem da Fase 1)**
4. `src/app/api/tools/analyze-art-template/route.ts` — API Vision com resize (Furo 15) + prompt expandido (A2) + normalizeTemplate() (C19) + validacao zonas (C4) + versioning (C12) + fingerprint estavel (C13) + preview (C15)
5. `src/app/api/projects/[projectId]/art-templates/route.ts` — CRUD com version (C12) + fingerprint (C13)

**Fase 3 — Layout Engine (SEM dependencias de canvas/IPC)**
6. `desktop-app/src/lib/layout-engine.ts` — buildDraftLayout (Pass 1) + resolveLayoutWithMeasurements (Pass 3) + validateAnchorGraph (C9) + group overlap detection (Furo 10) + overflow visual (C21) + tipos (DraftLayout, FinalLayout, MeasuredLayout, FontSources)

**Fase 4 — Renderer 2-pass + IPC (depende das interfaces da Fase 3)**
7. `desktop-app/electron/ipc/text-renderer.ts` — measureTextLayout (Pass 2) + renderFinalLayout (Pass 4) + balanceTextLines (C1) + fitTextToSlot (C7) + uppercase (C10) + normalizeFontFamily (C20) + font registration obrigatorio antes de measure (Furo 8) + gradiente direcional com ctx.clip() + retrocompat overlay (Furo 6)
8. `desktop-app/electron/preload.ts` — novos canais IPC: measureTextLayout, renderFinalLayout (Furo 5)
9. `desktop-app/electron/main.ts` — novos ipcMain.handle com ensureFont() antes de medir (Furo 8)

**Fase 5 — API Route (depende das Fases 1-2)**
10. `src/app/api/tools/generate-art/route.ts` — Zod (templateId + templateIds Furo 14) + classifyTextIntoSlots dinamico (Furo 4) + densityCheck + resolveFontSources (Furo 7/16) + retornar payload para frontend (Furo 1) + telemetria com llmCallCount (Furo 11)

**Fase 6 — Testes de regressao (depende das Fases 3-4)**
11. Setup vitest (Furo 13): instalar, criar config, adicionar scripts
12. `src/__tests__/golden-layouts/` — fixtures + golden layout tests (C23). Valida engine invariants (C22): determinismo, LLM isolation, renderer purity, group separation, server/frontend boundary

**Fase 7 — Frontend orquestracao + UI (depende das Fases 3-5)**
13. `desktop-app/src/hooks/use-art-templates.ts` — hooks de query/mutation
14. `desktop-app/src/components/project/generate/TemplateSelector.tsx` — seletor template (hidden se !hasTemplatePipeline — Furo 3)
15. `desktop-app/src/components/project/generate/TextProcessingSelector.tsx` — seletor modo texto
16. `desktop-app/src/components/project/tabs/GenerateArtTab.tsx` — deteccao web/desktop (Furo 3) + orquestracao 4-pass no frontend (Furo 1) + integracao completa + strictMode toggle
17. `desktop-app/src/components/project/identity/ArtTemplatesSection.tsx` — UI templates com preview
18. `desktop-app/src/components/project/tabs/IdentityTab.tsx` — integracao ArtTemplatesSection
19. `desktop-app/src/stores/generation.store.ts` + `use-art-generation.ts` — templateId(s) + textProcessing + strictMode no state

**Fase 8 — Verificacao final**
20. `npm run typecheck` em ambos projetos
21. Rodar golden layout tests (`vitest run src/__tests__/golden-layouts/`)

---

## Verificacao

### Templates
1. Upload 1 imagem de referencia Wine Vix → template JSON com: gradiente lateral, cores douradas, anchors (top_fixed/after/before/bottom_fixed), zones, `typography.scale`, `safe_area`, `font_fallbacks`, `version: 1`
2. CRUD: Criar, listar, excluir templates. Verificar que brandVisualElements preserva outros campos
3. Verificar fingerprint: template duplicado retorna 409
4. Verificar analysisConfidence: < 0.7 mostra badge amarelo na UI
5. Verificar validacao de zonas: text_zone sobrepondo image_focus_zone > 20% mostra warning
6. Geracao com template: posicoes deterministicas via anchors, cores do template, gradiente lateral visivel
7. Preview (C15): ao analisar template, preview renderiza com texto ficticio sobre imagem de referencia

### Text Processing
8. **Modo faithful**: texto "Direto do Chile para nossa adega" → saida identica
9. **Modo grammar_correct**: texto "direto do chile para nossa adega" → "Direto do Chile para nossa adega"
10. **Modo headline_detection**: texto longo promocional → separado em slots (headline/cta/footer)
11. **Modo generate_copy**: prompt "vinho chileno premium" → copy estruturada gerada (max_tokens: 120)
12. **Cache (C17)**: repetir mesma chamada grammar_correct → resultado instantaneo (sem LLM)

### Density Control
13. **normalizeWords**: "vinho-branco Chardonnay/Pinot" → contagem = 4 palavras
14. **Dentro do limite**: totalWords <= ideal_words → slots inalterados
15. **Acima de max_words**: slot_drop_order acionado primeiro, compressText depois
16. **strictMode + overflow**: throw TextOverflowError
17. **drop_order vs default_content**: CTA com default_content PODE ser removido pelo drop_order

### Fidelidade Visual (Parte C)
18. **Line breaking (C1)**: max_characters_per_line aplicado ANTES da estrategia de quebra
19. **Line breaking balanced (C1)**: titulo longo → linhas equilibradas (~igual comprimento)
20. **Escala tipografica (C2)**: sizePx vem de typography.scale, nao de calculo generico
21. **Anchors (C3)**: eyebrow(top_fixed) → title(after:eyebrow) → description(after:title) → cta(before:footer) → footer(bottom_fixed)
22. **Anchors safe area**: offsets calculados sobre usableHeight, nao canvasHeight
23. **Zones (C4)**: texto posicionado dentro de text_zone, nunca em image_focus_zone
24. **Auto-scale (C7)**: texto muito grande → fonte reduz automaticamente ate caber (max -40%), respeitando max_height_pct
25. **Default content (C8)**: slot CTA vazio → usa default_content.cta do template
26. **Safe area (C9)**: slot proximo da borda inferior do Story → dentro de usableHeight
27. **Uppercase (C10)**: slot com uppercase=true → texto renderizado em MAIUSCULAS
28. **Strict mode (C11)**: texto excede limite do slot → erro 400 com mensagem clara
29. **Font fallback**: fonte primaria indisponivel → fallback chain aplicada, fontFallbackUsed logado

### 2-Pass Layout
30. **Draft vs Final**: posicoes do Pass 1 (draft) DIFEREM das posicoes do Pass 3 (final) quando texto real e maior/menor que estimativa
31. **Measure accuracy**: measuredHeight do Pass 2 reflete line breaking real (nao heuristica)
32. **Auto-scale no measure**: slot com allow_auto_scale=true → adjustedFontSize < sizePx original quando texto excede maxLines
33. **Anchors com alturas reais**: slot `after:title` posicionado abaixo de title usando measuredHeight (nao estimatedHeight)
34. **strictMode no 2-pass**: Pass 2 mede SEM auto-scale → overflow=true → Pass 3 lanca SlotOverflowError
35. **Preview 2-pass**: preview usa identico pipeline (buildDraftLayout → measureTextLayout → resolveLayoutWithMeasurements → renderFinalLayout)
36. **IPC roundtrip**: measure-text-layout e render-final-layout executam no processo Electron via IPC
37. **Telemetria granular**: log inclui measuredHeights, adjustedFontSizes, overflowSlots, timing por pass (draftLayoutMs, measureLayoutMs, resolveLayoutMs, renderFinalMs)

### Overflow test
38. Texto "Morandé Terrarum Reserva Especial Cabernet Sauvignon Safra 2022 Direto do Chile" com auto_scale=true → fonte reduz, texto cabe
39. Mesmo texto com strictMode=true → erro retornado

### Multi-Template
40. templateIds com 3 templates → Promise.all gera 3 variacoes em paralelo (cada uma com 2-pass completo)
41. Cada variacao tem layout diferente mas imageUrl igual

### Integracao
42. Fluxo completo: selecionar template + modo grammar_correct + digitar texto → arte gerada com posicoes do template, texto corrigido, uppercase aplicado, linhas equilibradas
43. Fallback sem template → fluxo antigo funciona (separateTextElements + positionTextWithVision)
44. `npm run typecheck` em ambos projetos (web + desktop)

### Normalizacao de Template (C19)
45. **Percentual string → number**: `normalizeTemplate({ zones: { text_zone: { x: "6%", width: "58%" } } })` → `{ x: 6, width: 58 }`
46. **anchor_offset string → number**: slot com `anchor_offset: "14%"` → normalizado para `14`
47. **Arrays defaults**: template sem `font_fallbacks` → normalizado com `['sans-serif']`
48. **Arrays defaults**: template sem `slot_priority` → gerado a partir de keys de content_slots
49. **Clamp de limites**: `zones.text_zone.x: 120` → clamped para `100`
50. **Campos desconhecidos**: Vision retorna campo `"random_field": true` → removido silenciosamente
51. **Idempotencia**: `normalizeTemplate(normalizeTemplate(data))` === `normalizeTemplate(data)` (mesma saida)

### Normalizacao de Fontes (C20)
52. **Trim + unquote**: `normalizeFontFamily("  'Playfair Display'  ", ["Georgia", "serif"])` → `"Playfair Display, Georgia, serif"`
53. **Sem aspas**: `normalizeFontFamily("Inter", ["sans-serif"])` → `"Inter, sans-serif"`
54. **Consistencia Pass 2/4**: fontFamily usada no measureTextLayout (Pass 2) === fontFamily usada no renderFinalLayout (Pass 4)

### Overflow Visual — Pass 3 (C21)
55. **Overflow top**: slot com `y_final < usableTop` + strictMode → throw SlotOverflowError com mensagem "overflow top"
56. **Overflow bottom**: slot com `bottomY > usableBottom` + strictMode → throw SlotOverflowError com mensagem "overflow bottom"
57. **Warning sem strictMode**: slot com overflow de posicao + strictMode=false → telemetry warning (nao erro)
58. **Complementar ao Pass 2**: slot que cabe em si mesmo (lines <= maxLines) MAS fica fora da safe area → detectado no Pass 3

### Engine Invariants (C22)
59. **Determinismo**: `buildDraftLayout(slots, template, format)` chamado 2x com mesma entrada → `deepEqual` nos dois resultados
60. **LLM isolation**: mock de LLM que lanca erro → `buildDraftLayout` e `resolveLayoutWithMeasurements` executam normalmente
61. **Renderer purity**: FinalLayout antes do `renderFinalLayout()` === FinalLayout depois (objeto nao e mutado)
62. **Preview consistency**: preview e render final com mesmos inputs → FinalLayout identico

### Golden Layout Tests (C23)
63. **Wine Vix Story**: fixture com template, slots e measuredHeights fixos → FinalLayout esperado (golden file). Teste falha se engine produzir layout diferente
64. **Feed Square**: mesma estrutura para formato Feed
65. **Atualizacao de fixtures**: quando engine muda intencionalmente, `--update-golden` regenera expected.json
66. **Isolamento**: testes NAO dependem do renderer (mock de measurements). Testa exclusivamente buildDraftLayout + resolveLayoutWithMeasurements

### Dependencias a Instalar (Furo 12)

**Web (`package.json` raiz):**
```bash
npm install lru-cache                          # Cache LRU para text-processing (C17)
npm install json-stable-stringify               # Fingerprint estavel (C13)
npm install --save-dev @types/json-stable-stringify  # Tipos TS
npm install --save-dev vitest                   # Framework de testes para golden layouts (C23)
```

**Desktop (`desktop-app/package.json`):**
```bash
npm install p-limit                            # Concorrencia em multi-template (C16)
```
**NOTA:** `p-limit` v6+ e ESM-only. Se incompativel com Electron/Vite config, usar v5 (CommonJS) ou implementar limiter manual.

### Configuracao Vitest (Furo 13)

1. Instalar `vitest` no workspace raiz (ja listado acima)
2. Criar `vitest.config.ts` na raiz:
   ```typescript
   import { defineConfig } from 'vitest/config'
   export default defineConfig({
     test: {
       include: ['src/__tests__/**/*.test.ts'],
     },
     resolve: {
       alias: { '@': './src' }
     }
   })
   ```
3. Adicionar scripts no `package.json` raiz:
   ```json
   "test:unit": "vitest run",
   "test:unit:watch": "vitest",
   "test:golden": "vitest run src/__tests__/golden-layouts/"
   ```
4. **Tambem configurar vitest no desktop-app** (golden tests importam layout-engine.ts):
   ```bash
   cd desktop-app && npm install --save-dev vitest
   ```
   Criar `desktop-app/vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config'
   export default defineConfig({
     test: {
       include: ['src/__tests__/**/*.test.ts'],
     },
     resolve: {
       alias: { '@': './src' }
     }
   })
   ```

### Mapa de Furos → Secoes Corrigidas

| Furo | Severidade | Secoes Alteradas |
|------|-----------|-----------------|
| 1 | CRITICO | Resumo (pipeline), Item 8 (route.ts), Item 10 (GenerateArtTab), C16, C22 |
| 2 | CRITICO | Item 1e (layout-engine.ts NOVO), Ordem de Implementacao Fase 3 |
| 3 | CRITICO | Secao "Compatibilidade Web vs Desktop" NOVA, Item 10 (GenerateArtTab) |
| 4 | IMPORTANTE | Item 8 (classifyTextIntoSlots dinamico), B2 modo 3/4, B3 pipeline |
| 5 | IMPORTANTE | Itens 13-14 NOVOS (preload.ts, main.ts), sec 9 IPC handlers |
| 6 | IMPORTANTE | Sec 9 (overlay retrocompat), IPC handler render-final-layout |
| 7 | IMPORTANTE | C24 NOVA (Font Precedence), Item 8 (resolveFontSources) |
| 8 | IMPORTANTE | Sec 9 Pass 2 (Passo 0 font registration), DraftLayout.fontSources |
| 9 | IMPORTANTE | C3 (algoritmo DFS), Item 1c (validateAnchorGraph), Item 1e |
| 10 | IMPORTANTE | C22 invariant 5 (Group Separation), Item 1e (resolveLayout) |
| 11 | IMPORTANTE | B4 NOVA (LLM Budget), C18 (telemetria llmCallCount) |
| 12 | MENOR | Secao "Dependencias a Instalar" NOVA |
| 13 | MENOR | Secao "Configuracao Vitest" NOVA |
| 14 | MENOR | Item 8 (Zod schema templateIds) |
| 15 | MENOR | Item 2 (analyze-art-template resize) |
| 16 | MENOR | Item 8 (fontSources no payload), DraftLayout interface |
