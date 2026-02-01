---
status: draft
generated: 2026-01-31
updated: 2026-02-01
agents:
  - type: "feature-developer"
    role: "Integrate Photoroom API for background removal"
  - type: "frontend-specialist"
    role: "Build Gerar Criativo wizard UI (mobile-first)"
phases:
  - id: "phase-1"
    name: "Photoroom API Integration"
    prevc: "P"
  - id: "phase-2"
    name: "Gerar Criativo Wizard UI"
    prevc: "E"
  - id: "phase-3"
    name: "Integration & Testing"
    prevc: "V"
---

# Gerar Criativo - Implementation Plan

> Atalho direto no menu principal para gerar e agendar criativos, otimizado para uso mobile.

## Task Snapshot

- **Primary goal:** Criar um fluxo completo de geração de criativos acessível diretamente do menu principal, permitindo gerar e agendar conteúdo em poucos toques.
- **Success signal:** Usuário consegue, a partir do menu principal, selecionar projeto → template → página modelo → imagem → ajustes → agendar publicação, tudo em uma única jornada fluida.
- **Key benefit:** Reduz drasticamente os cliques necessários para criar e agendar conteúdo, especialmente no celular.

## Scope Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **Image Generation** | ✅ Exists | Nano Banana via `/api/ai/generate-image` |
| **Dynamic Layer System** | ✅ Exists | `isDynamic: true` flag on layers |
| **Create from Template** | ✅ Exists | `/api/templates/[id]/create-from-template` |
| **PostComposer Modal** | ✅ Exists | `src/components/posts/post-composer.tsx` |
| **Background Removal** | 🔲 New | Photoroom API ($0.02/img) |
| **Gerar Criativo Wizard** | 🔲 New | 6-step mobile-first wizard |
| **Menu Item** | 🔲 New | Adicionar em `sidebar.tsx` |

---

## Important: Schema Changes NOT Required

**RecraftBrandStyle model from previous plan is NOT being created.**
No Prisma schema changes are required for this feature.

---

## Menu Integration

### Sidebar Update

File: `src/components/app/sidebar.tsx`

```typescript
// ANTES (linha 34-44):
export const navigationItems = [
  { name: "Painel", href: "/studio", icon: Home },
  { name: "Projetos", href: "/projects", icon: FolderOpen },
  // ...
];

// DEPOIS:
import { Sparkles } from "lucide-react";

export const navigationItems = [
  { name: "Painel", href: "/studio", icon: Home },
  { name: "Gerar Criativo", href: "/gerar-criativo", icon: Sparkles },  // ← NOVO
  { name: "Projetos", href: "/projects", icon: FolderOpen },
  // ...
];
```

### Route

- **Path:** `/gerar-criativo` (top-level, fora de `/projects`)
- **File:** `src/app/(protected)/gerar-criativo/page.tsx`

---

## User Flow (6 Steps)

```
┌─────────────────────────────────────────────────────────────┐
│  GERAR CRIATIVO - FLUXO COMPLETO (Mobile-First)             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📁 STEP 1: Selecionar Projeto                              │
│     └── Grid de projetos do usuário                         │
│     └── Card com thumbnail e nome                           │
│                                                             │
│  📄 STEP 2: Selecionar Template                             │
│     └── Grid de templates do projeto selecionado            │
│     └── Filtro por tipo (Stories como padrão)               │
│                                                             │
│  📑 STEP 3: Selecionar Página Modelo                        │
│     └── Carrossel horizontal das model pages                │
│     └── Preview em tamanho maior ao selecionar              │
│                                                             │
│  🖼️ STEP 4: Escolher Imagem                                 │
│     ├── [Tab] Galeria do Projeto                            │
│     ├── [Tab] Google Drive                                  │
│     ├── [Tab] Upload / Câmera                               │
│     └── [Botão] ✨ Gerar com IA (Nano Banana)               │
│                                                             │
│  ✏️ STEP 5: Ajustes                                         │
│     ├── Preview do criativo montado                         │
│     ├── Editar textos dinâmicos (se houver)                 │
│     ├── [Opcional] Remover fundo (3 créditos)               │
│     ├── Reordenar camadas (drag & drop)                     │
│     └── [Botão] Gerar Criativo                              │
│         └── Salva em AICreativeGeneration do projeto        │
│                                                             │
│  📅 STEP 6: Agendar Publicação                              │
│     └── Abre PostComposer modal com:                        │
│         - postType: 'STORY' (padrão)                        │
│         - mediaUrls: [URL do criativo]                      │
│         - generationIds: [ID do criativo]                   │
│         - scheduleType: 'SCHEDULED'                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

### Key Concept: isDynamic Layer Replacement

Templates have layers marked as `isDynamic: true`. These are the **replaceable** layers:

```
Template Model Page (isTemplate: true)
├── Layer: Background (fixed)
├── Layer: Logo (fixed)
├── Layer: "Produto Principal" [isDynamic: true] ← SERÁ SUBSTITUÍDA
├── Layer: Título (text, editable)
└── Layer: Subtítulo (text, editable)

↓ Usuário seleciona/gera imagem

New Creative (salvo em AICreativeGeneration)
├── Layer: Background (same)
├── Layer: Logo (same)
├── Layer: "Produto Principal" [fileUrl: nova_imagem_url] ← SUBSTITUÍDA
├── Layer: Título (text, edited)
└── Layer: Subtítulo (text, edited)
```

### Key Concept: Background Removal DUPLICATES Layer

```
Fluxo de Remoção de Fundo:
1. Usuário seleciona camada de imagem
2. Clica em "Remover Fundo" na toolbar
3. Sistema chama Photoroom API
4. Sistema CRIA NOVA CAMADA:
   - Nome: "{nome_original} (sem fundo)"
   - fileUrl: imagem processada (PNG transparente)
   - isBackgroundRemoved: true
5. Nova camada posicionada ACIMA da original
6. Camada original permanece (pode ocultar/deletar)
7. Custo: 3 créditos
```

#### `addBgRemovedLayer` Internal Logic

```typescript
// In gerar-criativo-context.tsx

function addBgRemovedLayer(originalLayerId: string, newImageUrl: string) {
  setState((prev) => {
    const originalLayer = prev.layers.find(l => l.id === originalLayerId)
    if (!originalLayer || originalLayer.type !== 'image') {
      return prev // No-op if layer not found or not image
    }

    const originalIndex = prev.layers.findIndex(l => l.id === originalLayerId)

    // Create new layer with crypto.randomUUID()
    const newLayer: Layer = {
      id: crypto.randomUUID(),
      name: `${originalLayer.name} (sem fundo)`,
      type: 'image',
      fileUrl: newImageUrl,
      isBackgroundRemoved: true,
      // Copy positioning from original
      x: originalLayer.x,
      y: originalLayer.y,
      width: originalLayer.width,
      height: originalLayer.height,
      rotation: originalLayer.rotation,
      scaleX: originalLayer.scaleX,
      scaleY: originalLayer.scaleY,
    }

    // Insert IMMEDIATELY ABOVE original layer (index + 1)
    const newLayers = [
      ...prev.layers.slice(0, originalIndex + 1),
      newLayer,
      ...prev.layers.slice(originalIndex + 1),
    ]

    return {
      ...prev,
      layers: newLayers,
      selectedLayerId: newLayer.id, // Auto-select the new layer
    }
  })
}
```

**Key behaviors:**
- New layer gets unique ID via `crypto.randomUUID()`
- Explicitly copies: x, y, width, height, rotation, scaleX, scaleY
- `isBackgroundRemoved: true` flag for UI indication
- Inserted directly above original (higher z-index)
- Original layer remains intact (non-destructive)
- New layer is auto-selected for immediate editing

### Layer Management: Visibility Toggle + Delete

**Decision: Provide BOTH visibility toggle and delete, with toggle as primary.**

Rationale:
- Toggle is non-destructive (preferred for workflow)
- Delete needed for BG-removed layers user doesn't want
- Confirmation only for original template layers

**State in GerarCriativoState:**
```typescript
interface GerarCriativoState {
  // ...
  hiddenLayerIds: Set<string>  // Layers hidden via toggle (not deleted)
}
```

**Context actions:**
```typescript
// Toggle visibility (non-destructive)
function toggleLayerVisibility(layerId: string) {
  setState((prev) => {
    const newHidden = new Set(prev.hiddenLayerIds)
    if (newHidden.has(layerId)) {
      newHidden.delete(layerId)
    } else {
      newHidden.add(layerId)
    }
    return { ...prev, hiddenLayerIds: newHidden }
  })
}

// Delete layer (destructive - removes from array)
function deleteLayer(layerId: string) {
  setState((prev) => ({
    ...prev,
    layers: prev.layers.filter(l => l.id !== layerId),
    selectedLayerId: prev.selectedLayerId === layerId ? null : prev.selectedLayerId,
  }))
}
```

**UI Implementation in LayerControls:**
```tsx
// Each layer row shows:
<div className="flex items-center gap-2">
  {/* Visibility toggle */}
  <Button
    variant="ghost"
    size="icon"
    onClick={() => toggleLayerVisibility(layer.id)}
  >
    {!hiddenLayerIds.has(layer.id) ? (
      <Eye className="h-4 w-4" />
    ) : (
      <EyeOff className="h-4 w-4 text-muted-foreground" />
    )}
  </Button>

  {/* Layer name */}
  <span className={cn(
    "flex-1 truncate",
    hiddenLayerIds.has(layer.id) && "opacity-50"
  )}>
    {layer.name}
    {layer.isBackgroundRemoved && (
      <span className="ml-1 text-xs text-muted-foreground">(sem fundo)</span>
    )}
  </span>

  {/* Delete button - only for BG-removed layers, or with confirmation for originals */}
  <Button
    variant="ghost"
    size="icon"
    className="text-destructive hover:text-destructive"
    onClick={() => {
      if (layer.isBackgroundRemoved) {
        deleteLayer(layer.id)  // No confirmation for BG-removed
      } else {
        // Show confirmation dialog for original layers
        setLayerToDelete(layer.id)
      }
    }}
  >
    <Trash2 className="h-4 w-4" />
  </Button>
</div>
```

**Canvas Preview behavior:**
- Layers in `hiddenLayerIds` are NOT rendered
- Deleted layers are removed from array entirely
- Layer list shows hidden layers with reduced opacity

---

### Canvas Preview Implementation: Konva.js (Reuse Existing)

**Decision: Use Konva.js (react-konva) to match the template editor.**

Rationale:
- **Consistency**: Same rendering engine as template editor
- **Pixel-perfect**: Exact visual match with final output
- **Already installed**: react-konva is a project dependency
- **Canvas export**: Easy to render final PNG for upload

**Props:**
```typescript
interface CanvasPreviewProps {
  layers: Layer[]
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  imageValues: Record<string, ImageSource>
  textValues: Record<string, string>
  hiddenLayerIds: Set<string>
  templateWidth?: number   // Default: 1080
  templateHeight?: number  // Default: 1920
}
```

**Rendering logic:**
```tsx
// src/components/gerar-criativo/components/canvas-preview.tsx
'use client'

import { Stage, Layer as KonvaLayer, Image, Text, Rect } from 'react-konva'
import { useImage } from 'react-konva-utils'
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

export function CanvasPreview({
  layers,
  selectedLayerId,
  onSelectLayer,
  imageValues,
  textValues,
  hiddenLayerIds,
  templateWidth = 1080,
  templateHeight = 1920,
}: CanvasPreviewProps) {
  // Calculate scale to fit container
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth
      setScale(containerWidth / templateWidth)
    }
  }, [templateWidth])

  // Filter visible layers (not in hiddenLayerIds)
  const visibleLayers = layers.filter(l => !hiddenLayerIds.has(l.id))

  return (
    <div ref={containerRef} className="w-full">
      <Stage
        width={templateWidth * scale}
        height={templateHeight * scale}
        scaleX={scale}
        scaleY={scale}
        onClick={(e) => {
          // Deselect if clicking stage background
          if (e.target === e.target.getStage()) {
            onSelectLayer(null)
          }
        }}
      >
        <KonvaLayer>
          {visibleLayers.map((layer) => (
            <LayerRenderer
              key={layer.id}
              layer={layer}
              isSelected={layer.id === selectedLayerId}
              onSelect={() => onSelectLayer(layer.id)}
              imageUrl={imageValues[layer.id]?.url}
              textOverride={textValues[layer.id]}
            />
          ))}
        </KonvaLayer>
      </Stage>
    </div>
  )
}

function LayerRenderer({ layer, isSelected, onSelect, imageUrl, textOverride }) {
  // For image layers
  if (layer.type === 'image') {
    const src = imageUrl || layer.fileUrl
    const [image] = useImage(src || '')

    return (
      <Image
        image={image}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        rotation={layer.rotation || 0}
        opacity={layer.opacity ?? 1}
        onClick={onSelect}
        stroke={isSelected ? '#3b82f6' : undefined}
        strokeWidth={isSelected ? 4 : 0}
      />
    )
  }

  // For text layers
  if (layer.type === 'text') {
    const content = textOverride ?? layer.content ?? layer.text ?? ''

    return (
      <Text
        text={content}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        fontSize={layer.fontSize || 16}
        fontFamily={layer.fontFamily || 'sans-serif'}
        fill={layer.color || '#000'}
        align={layer.textAlign || 'left'}
        onClick={onSelect}
      />
    )
  }

  // For shape layers
  if (layer.type === 'shape') {
    return (
      <Rect
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        fill={layer.fill || '#ccc'}
        cornerRadius={layer.cornerRadius || 0}
        onClick={onSelect}
      />
    )
  }

  return null
}
```

**Key behaviors:**
- Layers rendered in array order (z-index = position in array)
- Layers in `hiddenLayerIds` are not rendered
- Fixed layers (logo, fundo): rendered with original data
- Dynamic image layers: apply `imageValues[layerId].url`
- Dynamic text layers: apply `textValues[layerId]`
- BG-removed layers: render normally (already in layers array)
- Aspect ratio: respects template format (9:16 Story, 4:3 Feed)
- Click on layer: calls `onSelectLayer(layerId)`
- Scale: fit-to-container (auto-calculated)

---

### API Decision: NEW Endpoint `/api/gerar-criativo/finalize`

**Decision: Create a NEW endpoint instead of modifying `create-from-template`.**

Rationale:
- `create-from-template` does NOT support custom layers (BG-removed, reordered)
- Avoids breaking existing flows that depend on current behavior
- New endpoint has specific logic for rendering final PNG

Create `src/app/api/gerar-criativo/finalize/route.ts`:

```typescript
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'

const finalizeSchema = z.object({
  templateId: z.number(),
  templatePageId: z.string(),
  images: z.record(z.object({
    type: z.string(),
    url: z.string(),
    aiImageId: z.string().optional(),
  })),
  texts: z.record(z.string()),
  layers: z.array(z.object({
    id: z.string(),
    type: z.string(),
    name: z.string(),
  }).passthrough()),  // Full layer array with reorder + BG-removed
  hiddenLayerIds: z.array(z.string()).default([]),
})

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { templateId, templatePageId, images, texts, layers, hiddenLayerIds } = finalizeSchema.parse(body)

    // 1. Fetch model page and template
    const templatePage = await db.page.findFirst({
      where: { id: templatePageId, isTemplate: true },
      include: { Template: true },
    })

    if (!templatePage) {
      return NextResponse.json({ error: 'Template page not found' }, { status: 404 })
    }

    // 2. Process layers: apply images, texts, remove hidden
    const visibleLayers = layers.filter(l => !hiddenLayerIds.includes(l.id))
    const processedLayers = visibleLayers.map((layer: any) => {
      const newLayer = { ...layer }

      // Apply text overrides
      if (layer.type === 'text' && texts[layer.id]) {
        newLayer.content = texts[layer.id]
        newLayer.text = texts[layer.id]
      }

      // Apply image overrides (for isDynamic layers)
      if (layer.type === 'image' && layer.isDynamic && images[layer.id]) {
        newLayer.fileUrl = images[layer.id].url
      }

      return newLayer
    })

    // 3. Count existing pages for order
    const pageCount = await db.page.count({ where: { templateId } })

    // 4. Create new Page (isTemplate: false)
    const newPage = await db.page.create({
      data: {
        name: `Criativo ${new Date().toLocaleDateString('pt-BR')}`,
        width: templatePage.width,
        height: templatePage.height,
        layers: JSON.stringify(processedLayers),
        background: templatePage.background,
        order: pageCount,
        templateId,
        isTemplate: false,
      },
    })

    // 5. Render canvas to PNG (server-side with node-canvas or puppeteer)
    // For MVP: use first image layer as preview URL
    const previewUrl = processedLayers.find((l: any) => l.type === 'image')?.fileUrl
      || templatePage.thumbnailUrl
      || ''

    // TODO: Implement proper canvas rendering for final PNG
    // const pngBlob = await renderCanvasToPng(processedLayers, templatePage.width, templatePage.height)
    // const { url: resultUrl } = await put(`creative-${newPage.id}.png`, pngBlob, { access: 'public' })

    // 6. Create AICreativeGeneration record
    const creative = await db.aICreativeGeneration.create({
      data: {
        projectId: templatePage.Template.projectId,
        templateId,
        pageId: newPage.id,
        layoutType: `template:${templatePageId}`,
        imageSource: JSON.stringify(images),
        textsData: JSON.stringify(texts),
        creditsUsed: 0,
        createdBy: userId,
        // resultUrl: resultUrl,  // When canvas rendering is implemented
      },
    })

    return NextResponse.json({
      success: true,
      id: creative.id,
      pageId: newPage.id,
      resultUrl: previewUrl,  // For now, use preview URL
    })
  } catch (error) {
    console.error('[Gerar Criativo Finalize] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Falha ao gerar criativo' }, { status: 500 })
  }
}
```

**Key behaviors:**
- Receives full `layers` array (already reordered, with BG-removed layers)
- Filters out layers in `hiddenLayerIds`
- Applies `images` and `texts` overrides
- Creates new Page (isTemplate: false)
- Creates AICreativeGeneration record
- Returns `{ id, pageId, resultUrl }`

---

### Hook: `useGerarCriativoFinalize`

**Note:** This hook REPLACES the previously planned `useCreateFromTemplate` extension.
The existing `useCreateFromTemplate` hook (if it exists) remains unchanged for other flows.

Create `src/hooks/use-gerar-criativo-finalize.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

interface GerarCriativoFinalizeParams {
  templateId: number
  templatePageId: string
  images: Record<string, ImageSource>
  texts: Record<string, string>
  layers: Layer[]  // Full array with reorder + BG-removed
  hiddenLayerIds: string[]
}

interface GerarCriativoFinalizeResult {
  success: boolean
  id: string      // AICreativeGeneration ID
  pageId: string  // Page ID
  resultUrl: string
}

export function useGerarCriativoFinalize() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: GerarCriativoFinalizeParams): Promise<GerarCriativoFinalizeResult> => {
      const response = await api.post<GerarCriativoFinalizeResult>(
        '/api/gerar-criativo/finalize',
        params
      )
      return response
    },
    onSuccess: (data, variables) => {
      // Invalidate template pages
      queryClient.invalidateQueries({
        queryKey: ['template', variables.templateId, 'pages']
      })
      // Invalidate project creatives
      queryClient.invalidateQueries({
        queryKey: ['project-creatives']
      })
    },
  })
}
```

**Usage in AdjustmentsStep:**
```typescript
import { useGerarCriativoFinalize } from '@/hooks/use-gerar-criativo-finalize'
import { useStepper } from '../stepper'

export function AdjustmentsStep() {
  const methods = useStepper()
  const finalize = useGerarCriativoFinalize()
  const {
    selectedTemplateId,
    selectedModelPageId,
    layers,
    imageValues,
    textValues,
    hiddenLayerIds,
    setGeneratedCreative,
  } = useGerarCriativo()

  const handleGenerateCreative = async () => {
    const result = await finalize.mutateAsync({
      templateId: selectedTemplateId!,
      templatePageId: selectedModelPageId!,
      images: imageValues,
      texts: textValues,
      layers,
      hiddenLayerIds: Array.from(hiddenLayerIds),
    })

    setGeneratedCreative({
      id: result.id,
      resultUrl: result.resultUrl,
    })

    methods.next()  // Navigate to Step 6 via stepper
  }
  // ...
}
```

### Key Concept: PostComposer Integration

O `PostComposer` (`src/components/posts/post-composer.tsx`) já existe e aceita:

```typescript
interface PostComposerProps {
  projectId: number
  open: boolean
  onClose: () => void
  initialData?: Partial<PostFormData>  // ← Usamos isso!
  postId?: string
}

// Para abrir com o criativo gerado:
<PostComposer
  projectId={selectedProjectId}
  open={showPostComposer}
  onClose={() => setShowPostComposer(false)}
  initialData={{
    postType: 'STORY',                    // Stories como padrão
    mediaUrls: [creative.resultUrl],      // URL do criativo
    generationIds: [creative.id],         // ID para rastreamento
    scheduleType: 'SCHEDULED',            // Agendar por padrão
  }}
/>
```

---

## Phase 1: Photoroom API Integration

### 1.1 Photoroom API Client

Create `src/lib/photoroom/client.ts`:

```typescript
const PHOTOROOM_API_BASE = 'https://sdk.photoroom.com/v1'

export class PhotoroomAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message)
    this.name = 'PhotoroomAPIError'
  }
}

export class PhotoroomClient {
  constructor(private apiKey: string) {}

  /**
   * Remove background from image
   * @param imageUrl - URL of image to process
   * @returns Blob of processed image (PNG with transparency)
   */
  async removeBackground(imageUrl: string): Promise<Blob> {
    // Fetch image from URL
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new PhotoroomAPIError('Failed to fetch image', imageResponse.status)
    }
    const imageBlob = await imageResponse.blob()

    // Prepare form data
    const formData = new FormData()
    formData.append('image_file', imageBlob, 'image.png')
    formData.append('format', 'png')
    formData.append('size', 'full')

    // Call Photoroom API
    const response = await fetch(`${PHOTOROOM_API_BASE}/segment`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new PhotoroomAPIError(
        error.message || `HTTP ${response.status}`,
        response.status,
        error
      )
    }

    return response.blob()
  }
}

export function getPhotoroomClient(): PhotoroomClient {
  const apiKey = process.env.PHOTOROOM_API_KEY
  if (!apiKey) {
    throw new Error('PHOTOROOM_API_KEY not configured')
  }
  return new PhotoroomClient(apiKey)
}
```

### 1.2 Background Removal Endpoint

Create `src/app/api/ai/remove-background/route.ts`:

```typescript
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { put } from '@vercel/blob'
import { validateCreditsForFeature, deductCreditsForFeature } from '@/lib/credits/deduct'
import { getPhotoroomClient } from '@/lib/photoroom/client'

const BACKGROUND_REMOVAL_CREDITS = 3

const removeBackgroundSchema = z.object({
  imageUrl: z.string().url('URL de imagem inválida'),
  projectId: z.number().int().positive(),
})

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { imageUrl, projectId } = removeBackgroundSchema.parse(body)

    // Validate credits
    await validateCreditsForFeature(userId, 'background_removal', BACKGROUND_REMOVAL_CREDITS, {
      organizationId: orgId ?? undefined,
    })

    // Call Photoroom API
    const photoroom = getPhotoroomClient()
    const resultBlob = await photoroom.removeBackground(imageUrl)

    // Upload to Vercel Blob
    const fileName = `bg-removed-${Date.now()}.png`
    const blob = await put(fileName, resultBlob, {
      access: 'public',
      contentType: 'image/png',
    })

    // Deduct credits
    await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'background_removal',
      quantity: BACKGROUND_REMOVAL_CREDITS,
      details: {
        originalUrl: imageUrl,
        resultUrl: blob.url,
      },
      organizationId: orgId ?? undefined,
      projectId,
    })

    return NextResponse.json({
      success: true,
      url: blob.url,
    })
  } catch (error) {
    console.error('[Remove Background] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    if (error.message?.includes('créditos') || error.message?.includes('credits')) {
      return NextResponse.json({ error: error.message }, { status: 402 })
    }

    return NextResponse.json(
      { error: 'Falha ao remover fundo. Tente novamente.' },
      { status: 500 }
    )
  }
}
```

### 1.3 Credit Configuration

Update `src/lib/credits/feature-config.ts`:

```typescript
export const FEATURE_CREDIT_COSTS = {
  // ... existing ...
  background_removal: 3,  // Photoroom API ($0.02)
} as const
```

### 1.4 Environment Variable

Add to `.env`:
```
PHOTOROOM_API_KEY=your_key_here
```

---

## Phase 2: Gerar Criativo Wizard UI

### 2.1 File Structure

```
src/
├── components/
│   └── gerar-criativo/
│       ├── stepper.ts                      # @stepperize/react step definitions
│       ├── gerar-criativo-context.tsx      # Business state (React Context)
│       ├── steps/
│       │   ├── project-selection-step.tsx  # Step 1: Select project
│       │   ├── template-selection-step.tsx # Step 2: Select template (+ empty state)
│       │   ├── model-page-step.tsx         # Step 3: Select model page (+ empty state)
│       │   ├── image-selection-step.tsx    # Step 4: Choose image
│       │   ├── adjustments-step.tsx        # Step 5: Preview & adjust (+ mobile tabs)
│       │   └── schedule-step.tsx           # Step 6: Schedule (PostComposer)
│       └── components/
│           ├── layer-actions-toolbar.tsx   # BG removal action
│           ├── layer-controls.tsx          # Visibility toggle + delete + z-index
│           ├── generate-image-modal.tsx    # Modal for Nano Banana
│           └── canvas-preview.tsx          # Konva.js canvas preview
│
├── hooks/
│   ├── use-background-removal.ts           # Photoroom mutation hook
│   ├── use-template-model-pages.ts         # Query for model pages
│   ├── use-user-projects.ts                # Query for user's projects
│   └── use-gerar-criativo-finalize.ts      # Mutation for /api/gerar-criativo/finalize
│
└── app/
    ├── (protected)/
    │   └── gerar-criativo/
    │       └── page.tsx
    └── api/
        └── gerar-criativo/
            └── finalize/
                └── route.ts                # NEW endpoint
```

### 2.2 Gerar Criativo Context

Create `src/components/gerar-criativo/gerar-criativo-context.tsx`:

**Note:** Navigation (currentStep, goToStep, nextStep, prevStep) is now managed by
`useStepper` from `@stepperize/react`. The context only holds business state.

```typescript
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

interface GerarCriativoState {
  // Step 1
  selectedProjectId: number | null

  // Step 2
  selectedTemplateId: number | null

  // Step 3
  selectedModelPageId: string | null
  layers: Layer[]

  // Step 4
  imageValues: Record<string, ImageSource>  // layerId → ImageSource

  // Step 5
  textValues: Record<string, string>        // layerId → text
  selectedLayerId: string | null
  hiddenLayerIds: Set<string>               // Layers hidden (not deleted)

  // Step 6 (result)
  generatedCreative: {
    id: string
    resultUrl: string
  } | null
}

interface GerarCriativoActions {
  // Step 1
  selectProject: (projectId: number) => void

  // Step 2
  selectTemplate: (templateId: number) => void

  // Step 3
  selectModelPage: (pageId: string, layers: Layer[]) => void

  // Step 4
  setImageValue: (layerId: string, imageSource: ImageSource) => void

  // Step 5 - Layer management
  setTextValue: (layerId: string, text: string) => void
  selectLayer: (layerId: string | null) => void
  reorderLayers: (newOrder: string[]) => void
  addBgRemovedLayer: (originalLayerId: string, newImageUrl: string) => void
  deleteLayer: (layerId: string) => void
  toggleLayerVisibility: (layerId: string) => void

  // Step 6
  setGeneratedCreative: (creative: { id: string; resultUrl: string }) => void

  // Reset
  reset: () => void
}
```

### 2.3 Stepper: @stepperize/react + shadcn-stepper

**Using shadcn-stepper instead of custom implementation.**

Installation:
```bash
npx shadcn add https://stepperize.vercel.app/r/stepper.json
npm install @stepperize/react
```

Create `src/components/gerar-criativo/stepper.ts`:

```typescript
import { defineStepper } from '@stepperize/react'

export const {
  Stepper,
  useStepper,
  steps,
} = defineStepper(
  { id: 'projeto', label: 'Projeto', description: 'Selecione o projeto' },
  { id: 'template', label: 'Template', description: 'Escolha o template' },
  { id: 'pagina', label: 'Página', description: 'Selecione a página modelo' },
  { id: 'imagem', label: 'Imagem', description: 'Escolha ou gere imagens' },
  { id: 'ajustes', label: 'Ajustes', description: 'Edite textos e camadas' },
  { id: 'agendar', label: 'Agendar', description: 'Agende a publicação' },
)
```

**Navigation is now managed by useStepper:**
- `methods.next()` - Go to next step
- `methods.prev()` - Go to previous step
- `methods.goTo('ajustes')` - Go to specific step by ID

**In step components:**
```typescript
import { useStepper } from '../stepper'

export function ProjectSelectionStep() {
  const methods = useStepper()

  const handleSelect = (projectId: number) => {
    selectProject(projectId)
    methods.next()  // Instead of nextStep() from context
  }
  // ...
}
```

**Variants:**
- Desktop: `variant="horizontal"` with labels
- Mobile: `variant="circle"` for compact indicator (e.g., "3/6")

### 2.4 Step 1: Project Selection

Create `src/components/gerar-criativo/steps/project-selection-step.tsx`:

```typescript
import { useStepper } from '../stepper'

export function ProjectSelectionStep() {
  const { selectProject } = useGerarCriativo()
  const methods = useStepper()
  const { data: projects, isLoading } = useUserProjects()

  const handleSelect = (projectId: number) => {
    selectProject(projectId)
    methods.next()
  }

  if (isLoading) {
    return <ProjectSelectionSkeleton />
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Selecione o Projeto</h2>
        <p className="text-sm text-muted-foreground">
          Escolha o projeto onde o criativo será salvo
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects?.map((project) => (
          <Card
            key={project.id}
            className="cursor-pointer hover:border-primary transition-colors p-4"
            onClick={() => handleSelect(project.id)}
          >
            <div className="flex items-center gap-3">
              {project.thumbnailUrl ? (
                <img
                  src={project.thumbnailUrl}
                  alt={project.name}
                  className="w-12 h-12 rounded object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  {project._count?.templates || 0} templates
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

### 2.5 Step 2: Template Selection

Create `src/components/gerar-criativo/steps/template-selection-step.tsx`:

```typescript
import { useStepper } from '../stepper'

export function TemplateSelectionStep() {
  const { selectedProjectId, selectTemplate } = useGerarCriativo()
  const methods = useStepper()
  const { data: templates, isLoading } = useProjectTemplates(selectedProjectId!)

  // Filter templates - prioritize Story format
  const storyTemplates = templates?.filter(t => t.type === 'STORY') || []
  const otherTemplates = templates?.filter(t => t.type !== 'STORY') || []

  const handleSelect = (templateId: number) => {
    selectTemplate(templateId)
    methods.next()
  }

  // EMPTY STATE
  if (!isLoading && (!templates || templates.length === 0)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => methods.prev()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Selecione o Template</h2>
          </div>
        </div>
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Nenhum template encontrado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Este projeto não possui templates. Crie um template primeiro.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/projects/${selectedProjectId}/templates/new`}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Template
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => methods.prev()}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Selecione o Template</h2>
          <p className="text-sm text-muted-foreground">
            Stories são recomendados para publicação rápida
          </p>
        </div>
      </div>

      {/* Story templates first */}
      {storyTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span>⭐</span> Stories (Recomendado)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {storyTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => handleSelect(template.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Other templates */}
      {otherTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Outros Formatos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {otherTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => handleSelect(template.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

### 2.6 Step 3: Model Page Selection

Create `src/components/gerar-criativo/steps/model-page-step.tsx`:

```typescript
import { useStepper } from '../stepper'

export function ModelPageStep() {
  const { selectedTemplateId, selectModelPage } = useGerarCriativo()
  const methods = useStepper()
  const { data: modelPages, isLoading } = useTemplateModelPages(selectedTemplateId!)

  const handleSelect = (page: Page) => {
    selectModelPage(page.id, page.layers as Layer[])
    methods.next()
  }

  // EMPTY STATE
  if (!isLoading && (!modelPages || modelPages.length === 0)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => methods.prev()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Selecione a Página Modelo</h2>
          </div>
        </div>
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <FileImage className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Nenhuma página modelo encontrada</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Este template não possui páginas modelo (isTemplate: true).
                Crie uma página modelo no editor de templates.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/templates/${selectedTemplateId}/editor`}>
                <Pencil className="w-4 h-4 mr-2" />
                Abrir Editor
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => methods.prev()}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Selecione a Página Modelo</h2>
          <p className="text-sm text-muted-foreground">
            Escolha o layout base para seu criativo
          </p>
        </div>
      </div>

      {/* Horizontal carousel for mobile */}
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible">
        {modelPages?.map((page) => (
          <Card
            key={page.id}
            className="flex-shrink-0 w-[200px] md:w-auto cursor-pointer hover:border-primary transition-colors snap-center"
            onClick={() => handleSelect(page)}
          >
            <div className="aspect-[9/16] bg-muted rounded-t overflow-hidden">
              {/* Preview thumbnail */}
              <img
                src={page.thumbnailUrl || '/placeholder-page.png'}
                alt={page.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3">
              <p className="font-medium text-sm truncate">{page.name}</p>
              <p className="text-xs text-muted-foreground">
                {(page.layers as Layer[]).filter(l => l.isDynamic).length} campos dinâmicos
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

### 2.7 Step 4: Image Selection

Create `src/components/gerar-criativo/steps/image-selection-step.tsx`:

```typescript
import { useStepper } from '../stepper'

export function ImageSelectionStep() {
  const {
    selectedProjectId,
    layers,
    imageValues,
    setImageValue,
  } = useGerarCriativo()
  const methods = useStepper()
  const queryClient = useQueryClient()
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)

  // Filter dynamic image layers
  const dynamicImageLayers = layers.filter(
    layer => layer.type === 'image' && layer.isDynamic === true
  )

  // Check if all dynamic layers have images
  const allLayersHaveImages = dynamicImageLayers.every(
    layer => imageValues[layer.id]
  )

  const handleGenerateComplete = async (aiImage: AIGeneratedImage) => {
    // Refetch gallery
    await queryClient.invalidateQueries({
      queryKey: ['project-images', selectedProjectId]
    })

    // Auto-select the generated image
    if (activeLayerId) {
      setImageValue(activeLayerId, {
        type: 'gallery',
        url: aiImage.fileUrl,
        aiImageId: aiImage.id,
      })
    }

    setIsGenerateModalOpen(false)
    setActiveLayerId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => methods.prev()}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Escolha as Imagens</h2>
          <p className="text-sm text-muted-foreground">
            Selecione ou gere imagens para cada campo dinâmico
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {dynamicImageLayers.map(layer => (
          <Card key={layer.id} className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Label className="font-medium">{layer.name}</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveLayerId(layer.id)
                  setIsGenerateModalOpen(true)
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar com IA
              </Button>
            </div>

            {/* Image Source Tabs */}
            <ImageSourceTabs
              projectId={selectedProjectId!}
              onImageSelected={(imageSource) => setImageValue(layer.id, imageSource)}
            />

            {/* Selected preview */}
            {imageValues[layer.id] && (
              <div className="mt-4 flex items-center gap-3 p-2 bg-muted rounded">
                <img
                  src={imageValues[layer.id].url}
                  alt="Preview"
                  className="w-16 h-16 rounded object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">Imagem selecionada</p>
                  <p className="text-xs text-muted-foreground">
                    {imageValues[layer.id].type === 'gallery' ? 'Da galeria' :
                     imageValues[layer.id].type === 'upload' ? 'Upload' : 'Google Drive'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setImageValue(layer.id, null as any)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Continue button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={() => methods.next()}
          disabled={!allLayersHaveImages}
        >
          Continuar
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Generate Image Modal */}
      <GenerateImageModal
        open={isGenerateModalOpen}
        onOpenChange={setIsGenerateModalOpen}
        projectId={selectedProjectId!}
        onComplete={handleGenerateComplete}
      />
    </div>
  )
}
```

### 2.8 Step 5: Adjustments

**Mobile Layout Note:** On mobile (< 1024px), use Tabs or Accordion instead of sidebar grid:
- Tab 1: Canvas Preview (fullscreen)
- Tab 2: Layer Controls (reorder, visibility)
- Tab 3: Text Fields (edit dynamic texts)
- Floating action button for "Gerar Criativo"
- BG removal button appears as floating overlay when image layer selected

```tsx
// Mobile layout approach in adjustments-step.tsx
const isMobile = useMediaQuery('(max-width: 1023px)')

if (isMobile) {
  return (
    <Tabs defaultValue="preview">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="layers">Camadas</TabsTrigger>
        <TabsTrigger value="texts">Textos</TabsTrigger>
      </TabsList>
      <TabsContent value="preview">
        <CanvasPreview ... />
        {/* Floating BG removal button when image selected */}
      </TabsContent>
      <TabsContent value="layers">
        <LayerControls ... />
      </TabsContent>
      <TabsContent value="texts">
        {/* Dynamic text fields */}
      </TabsContent>
    </Tabs>
  )
}
```

Create `src/components/gerar-criativo/steps/adjustments-step.tsx`:

```typescript
import { useStepper } from '../stepper'
import { useGerarCriativoFinalize } from '@/hooks/use-gerar-criativo-finalize'

export function AdjustmentsStep() {
  const {
    selectedProjectId,
    selectedTemplateId,
    selectedModelPageId,
    layers,
    selectedLayerId,
    selectLayer,
    reorderLayers,
    addBgRemovedLayer,
    imageValues,
    textValues,
    setTextValue,
    setGeneratedCreative,
    hiddenLayerIds,
  } = useGerarCriativo()

  const methods = useStepper()
  const finalize = useGerarCriativoFinalize()

  const handleGenerateCreative = async () => {
    const result = await finalize.mutateAsync({
      templateId: selectedTemplateId!,
      templatePageId: selectedModelPageId!,
      images: imageValues,
      texts: textValues,
      layers,
      hiddenLayerIds: Array.from(hiddenLayerIds),
    })

    setGeneratedCreative({
      id: result.id,
      resultUrl: result.resultUrl,
    })

    methods.next()
  }

  // Dynamic text layers
  const dynamicTextLayers = layers.filter(
    layer => layer.type === 'text' && layer.isDynamic === true
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => methods.prev()}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Ajustes Finais</h2>
          <p className="text-sm text-muted-foreground">
            Edite textos, reordene camadas e remova fundos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Canvas Preview - Full width on mobile, 8 cols on desktop */}
        <div className="lg:col-span-8">
          <Card className="p-4">
            <CanvasPreview
              layers={layers}
              selectedLayerId={selectedLayerId}
              onSelectLayer={selectLayer}
              imageValues={imageValues}
              textValues={textValues}
              hiddenLayerIds={hiddenLayerIds}
            />
          </Card>
        </div>

        {/* Sidebar - 4 cols on desktop */}
        <div className="lg:col-span-4 space-y-4">
          {/* Layer Actions (when image selected) */}
          {selectedLayerId && (
            <LayerActionsToolbar
              layer={layers.find(l => l.id === selectedLayerId)!}
              projectId={selectedProjectId!}
              onBackgroundRemoved={(newUrl) => {
                addBgRemovedLayer(selectedLayerId, newUrl)
              }}
            />
          )}

          {/* Layer Z-Index Controls */}
          <LayerControls
            layers={layers}
            selectedLayerId={selectedLayerId}
            onSelectLayer={selectLayer}
            onReorder={reorderLayers}
            hiddenLayerIds={hiddenLayerIds}
          />

          {/* Dynamic Text Fields */}
          {dynamicTextLayers.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-3">Textos Editáveis</h3>
              <div className="space-y-3">
                {dynamicTextLayers.map(layer => (
                  <div key={layer.id}>
                    <Label className="text-xs">{layer.name}</Label>
                    <Input
                      value={textValues[layer.id] || layer.text || ''}
                      onChange={(e) => setTextValue(layer.id, e.target.value)}
                      placeholder={layer.text}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Generate Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleGenerateCreative}
            disabled={finalize.isPending}
          >
            {finalize.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Gerar Criativo
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

### 2.9 Step 6: Schedule (PostComposer Integration)

Create `src/components/gerar-criativo/steps/schedule-step.tsx`:

```typescript
export function ScheduleStep() {
  const {
    selectedProjectId,
    generatedCreative,
    reset,
    prevStep,
  } = useGerarCriativo()
  const router = useRouter()
  const [showPostComposer, setShowPostComposer] = useState(true)

  const handleClose = () => {
    setShowPostComposer(false)
  }

  const handlePostCreated = () => {
    toast.success('Criativo agendado com sucesso!')
    reset()
    router.push('/agenda')
  }

  if (!generatedCreative) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Nenhum criativo gerado.</p>
        <Button variant="outline" onClick={prevStep} className="mt-4">
          Voltar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Criativo Gerado!</h2>
        <p className="text-muted-foreground mt-1">
          Agora agende a publicação
        </p>
      </div>

      {/* Creative Preview */}
      <div className="flex justify-center">
        <img
          src={generatedCreative.resultUrl}
          alt="Criativo gerado"
          className="max-w-[300px] rounded-lg shadow-lg"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          size="lg"
          onClick={() => setShowPostComposer(true)}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Agendar Publicação
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            reset()
            router.push('/gerar-criativo')
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Criar Outro
        </Button>
      </div>

      {/* PostComposer Modal */}
      <PostComposer
        projectId={selectedProjectId!}
        open={showPostComposer}
        onClose={handleClose}
        initialData={{
          postType: 'STORY',  // Stories como padrão
          mediaUrls: [generatedCreative.resultUrl],
          generationIds: [generatedCreative.id],
          scheduleType: 'SCHEDULED',  // Agendar por padrão
        }}
      />
    </div>
  )
}
```

### 2.10 Main Page

Create `src/app/(protected)/gerar-criativo/page.tsx`:

```typescript
'use client'

import { GerarCriativoProvider } from '@/components/gerar-criativo/gerar-criativo-context'
import { Stepper, useStepper, steps } from '@/components/gerar-criativo/stepper'
import { ProjectSelectionStep } from '@/components/gerar-criativo/steps/project-selection-step'
import { TemplateSelectionStep } from '@/components/gerar-criativo/steps/template-selection-step'
import { ModelPageStep } from '@/components/gerar-criativo/steps/model-page-step'
import { ImageSelectionStep } from '@/components/gerar-criativo/steps/image-selection-step'
import { AdjustmentsStep } from '@/components/gerar-criativo/steps/adjustments-step'
import { ScheduleStep } from '@/components/gerar-criativo/steps/schedule-step'
import { useMediaQuery } from '@/hooks/use-media-query'

function WizardContent() {
  const methods = useStepper()
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4">
      {/* Stepper Navigation - responsive variant */}
      <Stepper.Navigation variant={isMobile ? 'circle' : 'horizontal'} />

      {/* Step Content - using switch pattern */}
      <div className="mt-6">
        {methods.switch({
          projeto: () => <ProjectSelectionStep />,
          template: () => <TemplateSelectionStep />,
          pagina: () => <ModelPageStep />,
          imagem: () => <ImageSelectionStep />,
          ajustes: () => <AdjustmentsStep />,
          agendar: () => <ScheduleStep />,
        })}
      </div>
    </div>
  )
}

export default function GerarCriativoPage() {
  return (
    <GerarCriativoProvider>
      <Stepper.Provider>
        <WizardContent />
      </Stepper.Provider>
    </GerarCriativoProvider>
  )
}
```

---

## Phase 3: Integration & Testing

### 3.1 Testing Checklist

**Phase 1 (Photoroom):**
- [ ] Photoroom API client returns Blob correctly
- [ ] Remove background endpoint: auth, validation, credits
- [ ] Remove background endpoint: deducts 3 credits
- [ ] Environment variable configured

**Phase 2 (Wizard UI):**
- [ ] Menu item appears after "Painel"
- [ ] Step 1: Project selection works
- [ ] Step 2: Template selection shows Stories first
- [ ] Step 3: Model page carousel works on mobile
- [ ] Step 4: Image selection with 3 tabs + AI generation
- [ ] Step 4: Gallery refetches after AI generation
- [ ] Step 5: Canvas preview renders correctly
- [ ] Step 5: Layer z-index reordering works
- [ ] Step 5: Background removal duplicates layer
- [ ] Step 5: Dynamic text editing works
- [ ] Step 5: "Gerar Criativo" saves to project
- [ ] Step 6: PostComposer opens with correct initialData
- [ ] Step 6: postType defaults to 'STORY'
- [ ] Mobile: All steps usable on small screens
- [ ] Mobile: Touch interactions work

**E2E:**
- [ ] Full flow: Project → Template → Page → Image → Adjustments → Schedule
- [ ] Verify: Creative saved to correct project
- [ ] Verify: Post created with creative attached
- [ ] Verify: Credit deduction correct

### 3.2 Sidebar Integration

- [ ] Update `src/components/app/sidebar.tsx`
- [ ] Add "Gerar Criativo" item after "Painel"
- [ ] Use Sparkles icon

---

## Credit Costs

| Operation | API Cost | Internal Credits | Notes |
|-----------|----------|------------------|-------|
| Nano Banana generation | ~$0.10 | 10 credits | Existing |
| Nano Banana Pro generation | ~$0.15-0.30 | 15-30 credits | Existing |
| Background removal | $0.02 | 3 credits | Photoroom (per layer) |

---

## Implementation Checklist

### Phase 1: Photoroom Integration
- [ ] Create `src/lib/photoroom/client.ts`
- [ ] Create `src/app/api/ai/remove-background/route.ts`
- [ ] Update `src/lib/credits/feature-config.ts`
- [ ] Add `PHOTOROOM_API_KEY` to `.env`
- [ ] Test endpoint manually

### Phase 2: Gerar Criativo Wizard

**Dependencies:**
- [ ] Install `@stepperize/react`
- [ ] Add shadcn-stepper: `npx shadcn add https://stepperize.vercel.app/r/stepper.json`

**Sidebar & Routes:**
- [ ] Update `src/components/app/sidebar.tsx` (add "Gerar Criativo" after "Painel")
- [ ] Create `src/app/(protected)/gerar-criativo/page.tsx`

**Stepper:**
- [ ] Create `src/components/gerar-criativo/stepper.ts` (defineStepper)

**Context:**
- [ ] Create `src/components/gerar-criativo/gerar-criativo-context.tsx`
  - Business state only (no navigation - handled by stepper)
  - Include `hiddenLayerIds: Set<string>`

**Steps:**
- [ ] Create `src/components/gerar-criativo/steps/project-selection-step.tsx`
- [ ] Create `src/components/gerar-criativo/steps/template-selection-step.tsx` (with empty state)
- [ ] Create `src/components/gerar-criativo/steps/model-page-step.tsx` (with empty state)
- [ ] Create `src/components/gerar-criativo/steps/image-selection-step.tsx`
- [ ] Create `src/components/gerar-criativo/steps/adjustments-step.tsx` (with mobile tabs)
- [ ] Create `src/components/gerar-criativo/steps/schedule-step.tsx`

**Components:**
- [ ] Create `src/components/gerar-criativo/components/layer-actions-toolbar.tsx`
- [ ] Create `src/components/gerar-criativo/components/layer-controls.tsx` (visibility + delete)
- [ ] Create `src/components/gerar-criativo/components/generate-image-modal.tsx`
- [ ] Create `src/components/gerar-criativo/components/canvas-preview.tsx` (Konva.js)

**Hooks:**
- [ ] Create `src/hooks/use-user-projects.ts`
- [ ] Create `src/hooks/use-background-removal.ts`
- [ ] Create `src/hooks/use-template-model-pages.ts`
- [ ] Create `src/hooks/use-gerar-criativo-finalize.ts`

**API:**
- [ ] Create `src/app/api/gerar-criativo/finalize/route.ts`

### Phase 3: Integration & Testing
- [ ] Test full flow on desktop
- [ ] Test full flow on mobile
- [ ] Test with different template types
- [ ] Verify creative saved to project
- [ ] Verify PostComposer integration
- [ ] Test layer visibility toggle
- [ ] Test layer delete (with confirmation for originals)
- [ ] Test BG removal layer duplication

---

## Mobile-First Design Principles

| Aspect | Implementation |
|--------|---------------|
| **Touch targets** | Minimum 44x44px for all interactive elements |
| **Navigation** | Swipe gestures + back button |
| **Forms** | Large inputs, appropriate keyboard types |
| **Images** | Lazy loading, optimized sizes |
| **Preview** | Fullscreen option with pinch-to-zoom |
| **Progress** | Visible stepper, clear indication |
| **Feedback** | Toast notifications, loading states |

---

## Environment Variables

```env
# Existing
REPLICATE_API_TOKEN=...  # For Nano Banana
VERCEL_BLOB_READ_WRITE_TOKEN=...

# New
PHOTOROOM_API_KEY=...  # For background removal
```
