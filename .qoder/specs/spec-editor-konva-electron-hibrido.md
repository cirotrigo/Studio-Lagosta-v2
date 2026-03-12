# Especificação: Editor Konva Completo para Electron

## Contexto

O Studio Lagosta possui um **editor Konva.js web completo** com 61 componentes, sistema multi-page, 9 tipos de layers, 7 tipos de shapes, e integração com API.

**Objetivo:** Criar uma **cópia melhorada** do editor completo no Electron para:
1. Criar e editar criativos/artes localmente
2. Sincronizar com API web (offline-first)
3. Exportar para PNG/JPEG/SVG
4. Suportar paginação (carrossel, múltiplas artes)
5. Sistema de lines e shapes inspirado no Polotno

**Abordagem:**
- Copiar máximo de código do web
- Melhorar arquitetura (Zustand vs Context)
- Adicionar features avançadas (grouping, histórico em árvore)
- Sincronização offline-first
- Performance otimizada

---

## Análise do Editor Web Existente

### Estrutura (61 componentes)

```
src/components/templates/
├── template-editor-shell.tsx           (56.2 KB) - Shell principal
├── konva-editor-stage.tsx              (33.2 KB) - Canvas Konva
├── konva-layer-factory.tsx             (32.1 KB) - Factory de layers
├── properties-panel.tsx                (59.9 KB) - Propriedades
├── konva-editable-text.tsx             (41.0 KB) - Texto inline
├── editor-toolbar.tsx                  (36.6 KB) - Toolbar principal
├── ai-images-panel.tsx                 (73.7 KB) - Geração IA
├── sidebar/                            (12 componentes) - Painéis laterais
├── panels/                             (12 componentes) - Painéis direitos
├── layers/                             (4 componentes) - Gerenciamento
├── modals/                             (4 componentes) - Modais
└── ...                                 (21 componentes auxiliares)

src/contexts/
├── template-editor-context.tsx         (47.0 KB) - Estado global
└── multi-page-context.tsx              - Sistema de páginas

src/types/
└── template.ts                         - DesignData, Layer, Page, etc.
```

### Tipos de Layers (9)

| Tipo | Descrição | Props Principais |
|------|-----------|------------------|
| `text` | Texto simples | fontSize, fontFamily, color, textAlign |
| `rich-text` | Múltiplos estilos | richTextStyles[] |
| `image` | Imagem | fileUrl, objectFit, filtros |
| `gradient` | Gradiente linear | gradientStops, gradientAngle |
| `gradient2` | Gradiente radial | gradientStops |
| `shape` | Forma geométrica | shapeType, fill, stroke |
| `icon` | Ícone SVG | iconId, fill |
| `logo` | Logo especial | logoId |
| `element` | Elemento decorativo | elementId |
| `video` | Vídeo | fileUrl, videoMetadata |

### Tipos de Shapes (7)

```typescript
type ShapeType = 
  | 'rectangle' 
  | 'rounded-rectangle' 
  | 'circle' 
  | 'triangle' 
  | 'star' 
  | 'arrow' 
  | 'line'
```

### Sistema Multi-Page

```typescript
interface Page {
  id: string
  name: string
  width: number
  height: number
  layers: Layer[]
  background?: string
  order: number
  thumbnail?: string
}

interface MultiPageDesignData {
  pages: Page[]
  currentPageId: string
  templateId?: number
}
```

---

## Comparação: Web vs Polotno

| Aspecto | Web Atual | Polotno | Proposta Electron |
|---------|-----------|---------|-------------------|
| State Management | Context API | MobX | **Zustand** |
| Multi-Page | ✅ Custom | ✅ Nativo | ✅ Melhorado |
| Shapes | 7 tipos | 8+ tipos | ✅ + Custom shapes |
| Lines | Básico | Avançado | ✅ Melhorado |
| Undo/Redo | Linear (50) | Linear | **Árvore (Git-like)** |
| Grouping | ❌ | ✅ | ✅ **Novo** |
| Offline | ❌ | ❌ | ✅ **Offline-first** |
| Export | PNG/JPEG | Multi-formato | ✅ PNG/JPEG/SVG |
| Performance | Boa | Excelente | ✅ Otimizada |

---

## Arquitetura Proposta

### Diagrama

```
┌─────────────────────────────────────────────────────────────────┐
│                    ELECTRON MAIN PROCESS                        │
├─────────────────────────────────────────────────────────────────┤
│  IPC Handlers                                                   │
│  ├── template:load/save     → SQLite local + API web           │
│  ├── file:open/save         → File system                      │
│  ├── export:png/jpeg/svg    → Sharp + Canvas                   │
│  └── sync:pull/push         → REST API                         │
│                                                                 │
│  Services                                                       │
│  ├── JsonStorage            → Persistência local (JSON files)   │
│  ├── FileSystem             → Acesso a disco                   │
│  └── APIClient              → Comunicação web                  │
└─────────────────────────────────────────────────────────────────┘
                              ↕ IPC
┌─────────────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS (React)                     │
├─────────────────────────────────────────────────────────────────┤
│  Stores (Zustand)                                               │
│  ├── editor.store           → Design, layers, selection        │
│  ├── pages.store            → Multi-page management            │
│  ├── history.store          → Undo/redo em árvore              │
│  ├── sync.store             → Sincronização web                │
│  └── gallery.store          → Galeria local                    │
│                                                                 │
│  Components (copiados do web + melhorias)                       │
│  ├── EditorShell            → Layout principal                 │
│  ├── KonvaEditorStage       → Canvas Konva                     │
│  ├── KonvaLayerFactory      → Renderização de layers           │
│  ├── PropertiesPanel        → Propriedades                     │
│  ├── LayersPanel            → Lista de camadas                 │
│  ├── PagesBar               → Navegação de páginas             │
│  └── Toolbars               → Ferramentas                      │
│                                                                 │
│  Hooks                                                          │
│  ├── useEditor              → Acesso ao store                  │
│  ├── useIpc                 → Comunicação main                 │
│  └── useSync                → Sincronização                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estrutura de Arquivos

### Cópia do Web (adaptar)

```
src/components/templates/
  → desktop-app/src/components/editor/

Arquivos a copiar:
├── konva-editor-stage.tsx      → EditorStage.tsx
├── konva-layer-factory.tsx     → LayerFactory.tsx
├── konva-editable-text.tsx     → EditableText.tsx
├── konva-transformer.tsx       → Transformer.tsx
├── properties-panel.tsx        → PropertiesPanel.tsx
├── editor-toolbar.tsx          → EditorToolbar.tsx
├── alignment-toolbar.tsx       → AlignmentToolbar.tsx
├── text-toolbar.tsx            → TextToolbar.tsx
├── layers-panel-advanced.tsx   → LayersPanel.tsx
├── sidebar/*.tsx               → panels/*.tsx
├── panels/*.tsx                → panels/*.tsx
└── modals/*.tsx                → dialogs/*.tsx

src/types/template.ts
  → desktop-app/src/types/template.ts (copiar direto)

src/contexts/template-editor-context.tsx
  → desktop-app/src/stores/editor.store.ts (converter para Zustand)

src/contexts/multi-page-context.tsx
  → desktop-app/src/stores/pages.store.ts (converter para Zustand)
```

### Novos Arquivos (criar)

```
desktop-app/src/
├── stores/
│   ├── editor.store.ts             # Estado do editor (Zustand)
│   ├── pages.store.ts              # Multi-page (Zustand)
│   ├── history.store.ts            # Undo/redo em árvore
│   ├── sync.store.ts               # Sincronização web
│   └── gallery.store.ts            # Galeria local
│
├── hooks/
│   ├── use-editor.ts
│   ├── use-ipc.ts
│   ├── use-sync.ts
│   └── use-local-storage.ts
│
├── lib/
│   ├── storage/
│   │   └── json-storage.ts          # JSON file persistence
│   ├── sync/
│   │   ├── api-client.ts
│   │   ├── offline-queue.ts
│   │   └── conflict-resolver.ts
│   └── export/
│       ├── png-exporter.ts
│       ├── jpeg-exporter.ts
│       └── batch-exporter.ts
│
├── pages/
│   ├── EditorPage.tsx              # Página do editor
│   ├── TemplatesPage.tsx           # Lista de templates
│   └── GalleryPage.tsx             # Galeria local
│
└── types/
    ├── template.ts                 # Copiado do web
    └── electron.ts                 # IPC contracts

desktop-app/electron/
├── ipc/
│   ├── template-handlers.ts
│   ├── file-handlers.ts
│   ├── export-handlers.ts
│   └── sync-handlers.ts
└── services/
    └── json-storage.ts
```

---

## Melhorias Propostas

### 1. Zustand vs Context API

**Web atual:**
```typescript
// Context com 100+ métodos
interface TemplateEditorContextValue {
  design, setDesign, selectedLayerIds, selectLayer,
  addLayer, updateLayer, removeLayer, undo, redo,
  // ... 90+ métodos
}
```

**Electron proposto:**
```typescript
// Zustand com slices modulares
const useEditorStore = create(
  persist(
    immer((set, get) => ({
      // Design slice
      ...createDesignSlice(set, get),
      // Selection slice
      ...createSelectionSlice(set, get),
      // Layers slice
      ...createLayersSlice(set, get),
      // History slice
      ...createHistorySlice(set, get),
    }))
  )
)
```

### 2. Histórico em Árvore (Git-like)

**Web atual:** Linear (past/future arrays)

**Electron proposto:**
```typescript
interface HistoryNode {
  id: string
  design: DesignData
  timestamp: number
  label: string              // "Add text layer", "Move image", etc.
  parent: string | null
  children: string[]
}

interface HistoryState {
  nodes: Map<string, HistoryNode>
  current: string
  branches: string[]         // Múltiplos branches
  
  // Actions
  commit: (design: DesignData, label: string) => void
  checkout: (nodeId: string) => void
  branch: (name: string) => void
  merge: (branchId: string) => void
}
```

### 3. Grouping de Layers

**Novo feature:**
```typescript
interface LayerGroup {
  id: string
  name: string
  layerIds: string[]
  visible: boolean
  locked: boolean
  collapsed: boolean
}

// Actions
addGroup(layerIds: string[]): LayerGroup
ungroup(groupId: string): void
moveToGroup(layerId: string, groupId: string): void
```

### 4. Shapes Customizados (Polotno-style)

```typescript
interface CustomShape {
  id: string
  name: string
  category: string
  pathData: string          // SVG path
  previewUrl: string
  defaultFill: string
  defaultStroke: string
  resizable: boolean
}

// Registry
const customShapesRegistry = new Map<string, CustomShape>()

// Render
function renderCustomShape(shape: CustomShape, props: ShapeProps) {
  return <Path data={shape.pathData} {...props} />
}
```

### 5. Sincronização Offline-First

```typescript
interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'conflict'
  pendingChanges: Change[]
  lastSyncAt: number
  
  // Actions
  pull: () => Promise<void>
  push: () => Promise<void>
  resolveConflict: (resolution: 'local' | 'remote') => void
}

// Workflow
1. Editar offline → mudanças em queue local
2. Reconectar → sync automático
3. Conflito → usuário escolhe resolução
4. Sucesso → notificação
```

### 6. Exportação Batch

```typescript
interface ExportOptions {
  pages: Page[]
  format: 'png' | 'jpeg' | 'svg'
  quality: 'low' | 'medium' | 'high'
  scale: number
  outputDir: string
  naming: 'page-{n}' | 'template-{name}-{n}'
}

// Main process
async function exportBatch(options: ExportOptions): Promise<string[]> {
  const paths: string[] = []
  for (const page of options.pages) {
    const buffer = await renderToBuffer(page, options)
    const path = await saveToDisk(buffer, options)
    paths.push(path)
  }
  return paths
}
```

---

## Organização no Electron

### Navegação

```
Sidebar
├── 🗓️ Agendador (/scheduler) ✅
├── 🎨 Editor (/editor) ✅ NOVO - Editor completo
├── 📁 Templates (/templates) ✅ NOVO - Lista de templates
├── 🖼️ Galeria (/gallery) ✅ NOVO - Arquivos locais
├── ✨ Projeto (/project) ✅
└── ⚙️ Configurações (/settings)
```

### Página Editor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Arquivo  Editar  Ver  Inserir  Ajuda          [Projeto: Cliente X] [Sync] │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌───────────┐  ┌─────────────────────────────────────┐  ┌───────────────┐ │
│  │ Páginas   │  │                                     │  │ Propriedades  │ │
│  │ ┌─────┐   │  │                                     │  │ ───────────── │ │
│  │ │ [1] │   │  │         [Canvas Konva]              │  │ Tipo: Text    │ │
│  │ └─────┘   │  │                                     │  │ Fonte: Inter  │ │
│  │ ┌─────┐   │  │         1080x1350                   │  │ Tamanho: 48   │ │
│  │ │ [2] │   │  │                                     │  │ Cor: #111     │ │
│  │ └─────┘   │  │                                     │  │ ───────────── │ │
│  │ ┌─────┐   │  │                                     │  │ 🤖 Slot       │ │
│  │ │ [+] │   │  │                                     │  │ Label: Título │ │
│  │ └─────┘   │  │                                     │  │ Constraints   │ │
│  │           │  └─────────────────────────────────────┘  │ maxLines: 3   │ │
│  │ Layers    │                                           └───────────────┘ │
│  │ ├─ Text 1 │  ┌─────────────────────────────────────┐                    │
│  │ ├─ Image  │  │ [T] [I] [S] [G] [L]    Zoom: 100%   │                    │
│  │ └─ Shape  │  └─────────────────────────────────────┘                    │
│  └───────────┘                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Plano de Implementação

### Fase 1: Infraestrutura (Semana 1-2)

1. Configurar Zustand stores
2. Copiar tipos de `src/types/template.ts`
3. Implementar IPC contracts
4. Setup SQLite local storage
5. Converter context para stores

**Critérios:**
- [ ] Stores funcionando
- [ ] Tipos compilam
- [ ] IPC básico funciona
- [ ] SQLite operacional

### Fase 2: Core Editor (Semana 3-4)

1. Copiar `KonvaEditorStage.tsx`
2. Copiar `KonvaLayerFactory.tsx`
3. Copiar `PropertiesPanel.tsx`
4. Copiar `LayersPanel.tsx`
5. Copiar toolbars

**Critérios:**
- [ ] Canvas renderiza
- [ ] Layers funcionam
- [ ] Seleção funciona
- [ ] Propriedades editam

### Fase 3: Multi-Page (Semana 5)

1. Implementar `pages.store.ts`
2. Criar `PagesBar.tsx`
3. Drag-to-reorder páginas
4. Thumbnails automáticos
5. Navegação entre páginas

**Critérios:**
- [ ] Múltiplas páginas
- [ ] Navegação funciona
- [ ] Thumbnails geram
- [ ] Drag reorder

### Fase 4: Shapes & Lines (Semana 6)

1. Copiar shapes library
2. Implementar custom shapes
3. Lines avançadas
4. Editor de gradientes

**Critérios:**
- [ ] 7 shapes funcionam
- [ ] Custom shapes API
- [ ] Lines melhoradas

### Fase 5: Sincronização (Semana 7-8)

1. API client offline-first
2. Pull/Push sync
3. Conflict resolution
4. Offline queue
5. Progress indicators

**Critérios:**
- [ ] Pull do web funciona
- [ ] Push para web funciona
- [ ] Offline funciona
- [ ] Conflitos resolvem

### Fase 6: Exportação (Semana 9)

1. PNG exporter via Sharp
2. JPEG exporter
3. Batch export
4. Save to disk

**Critérios:**
- [ ] Export PNG funciona
- [ ] Export JPEG funciona
- [ ] Batch export funciona

### Fase 7: Features Avançadas (Semana 10-11)

1. Grouping de layers
2. Histórico em árvore
3. Slot binding para automação
4. Constraints

**Critérios:**
- [ ] Grupos funcionam
- [ ] Histórico árvore funciona
- [ ] Slots configuram

### Fase 8: Polish (Semana 12)

1. Performance optimization
2. Keyboard shortcuts
3. Dark mode
4. Testes
5. Documentação

**Critérios:**
- [ ] Performance OK
- [ ] Atalhos funcionam
- [ ] Docs atualizadas

---

## Persistência Local: JSON Files

### Decisão Arquitetural

**Escolha:** JSON Files (sem SQLite)

**Motivos:**
- ✅ Zero dependências nativas → build simples
- ✅ Funciona em Mac/Windows/Linux sem recompilação
- ✅ electron-builder empacota sem configuração extra
- ✅ Fácil debug (arquivos legíveis)
- ✅ Backup simples (copiar pasta)

### Estrutura de Arquivos Locais

```
~/Library/Application Support/LagostaTools/    (macOS)
%APPDATA%/LagostaTools/                        (Windows)

├── projects/
│   └── {projectId}/
│       ├── settings.json          # Configurações do projeto
│       └── templates/
│           ├── {templateId}.json  # Template completo
│           └── {templateId}/
│               └── thumbnail.png  # Preview
│
├── gallery/
│   └── {fileId}.json              # Metadados + thumbnail base64
│
├── sync/
│   ├── queue.json                 # Mudanças pendentes
│   └── last-sync.json             # Timestamp última sincronização
│
└── config.json                    # Configurações globais
```

### Template JSON Structure

```json
// templates/{templateId}.json
{
  "id": 123,
  "projectId": 456,
  "name": "Promoção Sábado",
  "type": "STORY",
  "dimensions": "1080x1920",
  "designData": {
    "canvas": { "width": 1080, "height": 1920, "backgroundColor": "#000000" },
    "layers": [
      { "id": "bg-1", "type": "image", "position": { "x": 0, "y": 0 }, ... },
      { "id": "text-1", "type": "text", "content": "Título", ... }
    ]
  },
  "dynamicFields": [
    { "layerId": "text-1", "fieldType": "text", "label": "Título" }
  ],
  "pages": [
    { "id": "page-1", "name": "Página 1", "layers": [...] }
  ],
  "thumbnail": "data:image/png;base64,...",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T12:30:00Z",
  "syncedAt": "2024-01-15T12:35:00Z",
  "isDirty": false
}
```

### Storage Service

```typescript
// desktop-app/src/lib/storage/json-storage.ts
import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

export class JsonStorage {
  private basePath: string

  constructor() {
    this.basePath = path.join(app.getPath('userData'), 'LagostaTools')
  }

  async init() {
    // Criar estrutura de pastas
    await fs.mkdir(path.join(this.basePath, 'projects'), { recursive: true })
    await fs.mkdir(path.join(this.basePath, 'gallery'), { recursive: true })
    await fs.mkdir(path.join(this.basePath, 'sync'), { recursive: true })
  }

  // Templates
  async saveTemplate(projectId: number, template: Template): Promise<void> {
    const dir = path.join(this.basePath, 'projects', String(projectId), 'templates')
    await fs.mkdir(dir, { recursive: true })
    
    const filePath = path.join(dir, `${template.id}.json`)
    await fs.writeFile(filePath, JSON.stringify(template, null, 2))
  }

  async loadTemplate(projectId: number, templateId: number): Promise<Template | null> {
    const filePath = path.join(
      this.basePath, 'projects', String(projectId), 'templates', `${templateId}.json`
    )
    try {
      const data = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  async listTemplates(projectId: number): Promise<Template[]> {
    const dir = path.join(this.basePath, 'projects', String(projectId), 'templates')
    try {
      const files = await fs.readdir(dir)
      const templates: Template[] = []
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(dir, file), 'utf-8')
          templates.push(JSON.parse(data))
        }
      }
      return templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    } catch {
      return []
    }
  }

  // Sync Queue
  async addToSyncQueue(change: Change): Promise<void> {
    const queuePath = path.join(this.basePath, 'sync', 'queue.json')
    let queue: Change[] = []
    try {
      const data = await fs.readFile(queuePath, 'utf-8')
      queue = JSON.parse(data)
    } catch {}
    queue.push({ ...change, timestamp: Date.now() })
    await fs.writeFile(queuePath, JSON.stringify(queue, null, 2))
  }

  async getSyncQueue(): Promise<Change[]> {
    const queuePath = path.join(this.basePath, 'sync', 'queue.json')
    try {
      const data = await fs.readFile(queuePath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return []
    }
  }

  async clearSyncQueue(): Promise<void> {
    const queuePath = path.join(this.basePath, 'sync', 'queue.json')
    await fs.writeFile(queuePath, '[]')
  }
}
```

---

## Distribuição: Builds Locais

### Configuração electron-builder

```json
// desktop-app/package.json
{
  "build": {
    "appId": "com.studiolagosta.tools",
    "productName": "Lagosta Tools",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "dist-electron/**/*",
      "package.json"
    ],
    "mac": {
      "target": [
        { "target": "dmg", "arch": ["x64", "arm64"] }
      ],
      "category": "public.app-category.productivity"
    },
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] }
      ]
    },
    "linux": {
      "target": ["AppImage"]
    }
  }
}
```

### Comandos de Build

```bash
# Desenvolvimento
npm run dev

# Build para Mac (gera .dmg)
npm run build:mac

# Build para Windows (gera .exe)
npm run build:win

# Build para todas as plataformas
npm run build:all
```

### Saída

```
desktop-app/release/
├── Lagosta Tools-1.0.0.dmg           # macOS (Intel + Apple Silicon)
├── Lagosta Tools-1.0.0-x64.exe       # Windows
└── Lagosta Tools-1.0.0-x64.AppImage  # Linux
```

### Distribuição para Equipe

1. **Gerar build:** `npm run build:mac` (ou `build:win`)
2. **Enviar arquivo:** Upload para Google Drive/Dropbox
3. **Equipe instala:** Duplo clique no .dmg/.exe

---

## Dependências (Sem Nativos)

```json
{
  "dependencies": {
    "konva": "^9.3.0",
    "react-konva": "^18.2.10",
    "use-image": "^1.1.1",
    "zustand": "^4.5.0",
    "immer": "^10.0.0",
    "sharp": "^0.33.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0"
  }
}
```

**Nota:** Sharp já está no projeto e funciona bem com electron-builder (tem binaries pré-compilados).

---

## Arquivos Críticos

### Para Copiar

| Web | Electron |
|-----|----------|
| `src/types/template.ts` | `desktop-app/src/types/template.ts` |
| `src/components/templates/konva-editor-stage.tsx` | `desktop-app/src/components/editor/EditorStage.tsx` |
| `src/components/templates/konva-layer-factory.tsx` | `desktop-app/src/components/editor/LayerFactory.tsx` |
| `src/components/templates/properties-panel.tsx` | `desktop-app/src/components/editor/PropertiesPanel.tsx` |
| `src/components/templates/layers-panel-advanced.tsx` | `desktop-app/src/components/editor/LayersPanel.tsx` |
| `src/components/templates/editor-toolbar.tsx` | `desktop-app/src/components/editor/EditorToolbar.tsx` |
| `src/contexts/template-editor-context.tsx` | `desktop-app/src/stores/editor.store.ts` |

### Para Criar

| Arquivo | Propósito |
|---------|-----------|
| `desktop-app/src/stores/editor.store.ts` | Estado do editor (Zustand) |
| `desktop-app/src/stores/pages.store.ts` | Multi-page (Zustand) |
| `desktop-app/src/stores/history.store.ts` | Histórico em árvore |
| `desktop-app/src/stores/sync.store.ts` | Sincronização web |
| `desktop-app/electron/ipc/template-handlers.ts` | IPC handlers |
| `desktop-app/src/lib/storage/json-storage.ts` | JSON file persistence |
| `desktop-app/src/pages/EditorPage.tsx` | Página do editor |

---

## Verificação

### Comandos

```bash
npm --prefix desktop-app run typecheck
npm --prefix desktop-app run typecheck:electron
npm --prefix desktop-app run dev
```

### Teste Manual

**Editor Básico:**
- [ ] Canvas renderiza layers
- [ ] Add/remove layers
- [ ] Seleção funciona
- [ ] Propriedades editam
- [ ] Zoom funciona

**Multi-Page:**
- [ ] Adicionar página
- [ ] Navegar entre páginas
- [ ] Drag reorder
- [ ] Thumbnails

**Shapes:**
- [ ] 7 shapes renderizam
- [ ] Custom shapes funcionam
- [ ] Lines funcionam

**Sincronização:**
- [ ] Pull do web
- [ ] Push para web
- [ ] Offline funciona
- [ ] Conflitos resolvem

**Exportação:**
- [ ] PNG exporta
- [ ] JPEG exporta
- [ ] Batch exporta

**Features Avançadas:**
- [ ] Grouping funciona
- [ ] Histórico árvore
- [ ] Slot binding
- [ ] Constraints
