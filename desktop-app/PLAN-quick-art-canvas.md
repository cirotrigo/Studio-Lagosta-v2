# PLAN: Quick Art — Canvas Scrollável com Auto-Template

**Data**: 2026-03-22
**Status**: Em implementação
**Branch**: claude/sweet-poincare

---

## Contexto

O fluxo atual de "Arte Rápida" (GenerateArtTab) exige 5 passos:
1. Escolher formato (STORY/FEED/SQUARE)
2. Escolher modo de fundo (foto ou IA)
3. **Selecionar template manualmente** no carousel
4. Escrever prompt/texto
5. Gerar

O objetivo é eliminar o passo 3 (seleção manual de template) e entregar as variações num **canvas horizontal scrollável** para ajustes inline e publicação rápida.

**Input mínimo do usuário**: prompt + foto de fundo
**Auto-template**: IA escolhe o layout mais adequado
**Output**: Canvas horizontal scrollável com variações lado a lado, editáveis inline

---

## Arquitetura do Sistema Atual

### Pipeline de Geração (Fluxo Completo)

```
User Input (GenerateArtTab)
        ↓
    GenerationParams
        ↓
useGenerationStore.addJob()
        ↓
processQueuedJob()
        ├── preparePromptBatch()
        │   ├── window.electronAPI.generateAIText()
        │   │   └── POST /api/tools/generate-art (copy variations)
        │   ├── selectTemplate() (auto ou manual)
        │   └── extractTemplateContext()
        │
        ├── generateBackgroundAsset() [se AI mode]
        │   └── POST /api/tools/generate-art (imagem)
        │
        └── Para cada variação:
            ├── renderPromptVariation()
            │   ├── applyCopyToKonvaTemplate()
            │   │   ├── inferSlotBindings()
            │   │   ├── applyTextToLayers()
            │   │   └── applyMediaToPage()
            │   ├── preloadKonvaDocumentFonts()
            │   └── renderPageToDataUrl()
            │
            └── updateVariation() (ready + imageUrl)
```

### Arquivos Críticos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `desktop-app/src/components/project/tabs/GenerateArtTab.tsx` | UI principal de geração (~1400 linhas) |
| `desktop-app/src/lib/automation/prompt-orchestrator.ts` | Pipeline: seleção de template, geração de copy, renderização |
| `desktop-app/src/lib/automation/slot-binder.ts` | Mapeia copy → slots do template |
| `desktop-app/src/lib/automation/template-context-extractor.ts` | Extrai contexto do template para prompts |
| `desktop-app/src/stores/generation.store.ts` | Estado de jobs de geração |
| `desktop-app/src/components/project/generate/TemplateCarousel.tsx` | Carousel de seleção manual |
| `desktop-app/src/pages/EditorPage.tsx` | Página do editor completo |
| `desktop-app/src/components/editor/EditorStage.tsx` | Canvas Konva do editor |
| `desktop-app/src/lib/editor/document.ts` | Criação de documentos Konva |
| `src/app/api/tools/generate-art/route.ts` | Endpoint server-side de geração |

### Interfaces Chave

```typescript
// Input da pipeline
interface PromptOrchestratorInput {
  projectId: number
  prompt: string
  format: ArtFormat
  variations: 1 | 2 | 4
  backgroundMode: 'photo' | 'ai'
  photoUrl?: string
  referenceUrls?: string[]
  manualTemplateId?: string          // ← REMOVER na Fase 1
  selectedPageId?: string            // ← REMOVER na Fase 1
  templates: KonvaTemplateDocument[]
  project?: Pick<Project, 'id' | 'name' | 'logoUrl'>
  brandAssets?: Pick<BrandAssets, ...>
}

// Variação renderizada
interface RenderedPromptVariation {
  id: string
  index: number
  templateId: string
  templateName: string
  fields: ReviewField[]
  fieldValues: Record<SlotFieldKey, string>
  imageUrl: string
  document: KonvaTemplateDocument
  warnings: string[]
}

// Seleção de template (selectTemplate())
// Prioridade atual:
// 1. selectedPageId (manual)
// 2. manualTemplateId (manual)
// 3. Auto-scoring via scoreTemplate()
```

### Scoring de Template Existente

```typescript
function scoreTemplate(template, copies, backgroundMode, prompt): number {
  let score = textCapacityScore + textLayerCount * 12
  // + suporte a footer, badge, CTA
  // + objetivo inferido do prompt (campaign, menu, branding)
  // + photo slot bonus para modo foto
  return score
}
```

---

## Plano de Implementação

### Fase 1: Remover Template Carousel + Forçar Auto-Seleção

**Objetivo**: Eliminar o passo de seleção manual de template. O sistema usa auto-scoring existente.

**Alterações em `GenerateArtTab.tsx`:**
- Remover import e renderização do `TemplateCarousel`
- Remover estado `selectedCarouselDesign`
- Remover passagem de `manualTemplateId` e `selectedPageId` para `GenerationParams`
- O `handleGenerate()` passa sem template selection → pipeline cai no `selectTemplate()` auto

**Alterações em `prompt-orchestrator.ts`:**
- Na função `selectTemplate()`: quando não há `manualTemplateId` nem `selectedPageId`, melhorar o scoring automático
- (Opcional) Adicionar log/warning indicando qual template foi auto-selecionado

**Resultado**: Mesmo fluxo visual, mas sem o carousel. O botão "Gerar" funciona direto.

---

### Fase 2: Canvas Scrollável de Variações

**Objetivo**: Substituir a exibição de resultados por um canvas horizontal scrollável.

**Novo: `desktop-app/src/components/project/generate/VariationCanvas.tsx`**
- Container com `overflow-x: auto` e `scroll-snap-type: x mandatory`
- Exibe variações como cards lado a lado
- Scroll suave com indicadores de navegação (setas laterais)
- Responsivo: 1 card visível em tela pequena, 2-3 em tela grande

**Novo: `desktop-app/src/components/project/generate/VariationCard.tsx`**
- Preview da imagem gerada (full-size)
- Overlay com botões de ação:
  - "Editar" → expande para editor inline (Fase 3)
  - "Salvar" → exporta para ArtsPage/Scheduler
  - "Regenerar" → nova variação com mesmo prompt
  - "Download" → baixa a imagem
- Badge mostrando "Template: {nome}" e "Auto-selecionado"
- Campos editáveis inline (título, descrição, CTA) com live preview

**Alterações em `GenerateArtTab.tsx`:**
- Substituir a exibição atual de resultados por `<VariationCanvas>`
- Passar variações do `useGenerationStore` como props

---

### Fase 3: Edição Inline com Editor Konva

**Objetivo**: Clicar em uma variação abre o editor Konva embeddado para ajustes.

**Novo: `desktop-app/src/components/project/generate/InlineVariationEditor.tsx`**
- Wrapper do `EditorStage` em modo compacto
- Props: `document: KonvaTemplateDocument`, `onSave: (doc) => void`
- Carrega o documento da variação no `useEditorStore`
- Mostra o canvas com layers editáveis
- Barra de ferramentas simplificada (apenas texto, cor, posição)
- Botão "Concluir" → renderiza o documento atualizado, salva como nova imagem

**Alterações em `EditorStage.tsx`:**
- Extrair props opcionais para modo embeddado:
  - `compact?: boolean` — esconde rulers, alignment menu
  - `onSave?: (document) => void` — callback de salvamento
- O componente já é reutilizável, mas precisa de guards para features opcionais

**Alterações em `VariationCard.tsx`:**
- Toggle entre modo "preview" e modo "editor"
- No modo editor, renderiza `<InlineVariationEditor>` no lugar da imagem

---

### Fase 4: Nova Página `/quick-art` (Opcional)

Se as fases 1-3 ficarem muito acopladas ao GenerateArtTab, criar página dedicada:

**Novo: `desktop-app/src/pages/QuickArtPage.tsx`**
- Layout limpo: input + resultados
- Sidebar link "Arte Rápida" aponta para `/quick-art`
- Input simplificado: só prompt + foto + formato toggle
- Resultados: VariationCanvas com edição inline

**Alterações no router:**
- Adicionar rota `/quick-art` → `QuickArtPage`
- Adicionar link na sidebar

---

## Dependências Entre Fases

```
Fase 1 (auto-seleção) → independente, pode ser feita sozinha
Fase 2 (canvas scrollável) → depende de Fase 1 (sem carousel)
Fase 3 (edição inline) → depende de Fase 2 (VariationCard)
Fase 4 (nova página) → depende de Fase 2+3 (componentes prontos)
```

---

## Verificação

### Fase 1
1. Abrir GenerateArtTab — TemplateCarousel NÃO deve aparecer
2. Gerar arte com prompt + foto
3. Sistema deve auto-selecionar template via scoring
4. Resultado deve ter qualidade equivalente à seleção manual

### Fase 2
5. Variações aparecem em scroll horizontal
6. Scroll suave com snap nos cards
7. Botões de ação funcionam (salvar, download, regenerar)

### Fase 3
8. Clicar "Editar" abre editor Konva inline no card
9. Editar texto/posição funciona
10. "Concluir" re-renderiza e volta ao preview

### Geral
11. TypeScript passa (`npx tsc --noEmit` no desktop-app)
12. Web app (`src/`) não foi modificado (exceto se mudar API)
13. Performance OK com 4 variações no canvas
