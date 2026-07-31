# Editor Konva.js - Studio Lagosta

## 📝 Visão Geral

O Editor Konva é um editor visual completo para criação de designs responsivos para redes sociais. Construído com Konva.js e React Konva, oferece uma experiência similar ao Canva/Figma com funcionalidades profissionais de design.

## 🎨 Arquitetura do Editor

### Componentes Principais

```
TemplateEditorShell (Container principal)
├── TemplateEditorProvider (Context)
├── TemplateEditorContent (Layout)
│   ├── Header (Nome + Actions)
│   ├── VerticalToolbar (Ícones laterais)
│   ├── SidePanel (Panels expansíveis)
│   │   ├── LayersPanel
│   │   ├── TextToolsPanel
│   │   ├── ImagesPanel
│   │   ├── ElementsPanel
│   │   ├── LogoPanel
│   │   ├── ColorsPanel
│   │   ├── GradientsPanel
│   │   └── PropertiesPanel
│   └── EditorCanvas
│       ├── TextToolbar (quando texto selecionado)
│       └── KonvaEditorStage
│           ├── BackgroundLayer
│           ├── ContentLayer (Layers do design)
│           │   └── KonvaLayerFactory (Renderiza cada layer)
│           └── GuidesLayer (Smart Guides)
└── PagesBar (Multi-page support)
```

## 🗄️ Estrutura de Dados

### DesignData
```typescript
interface DesignData {
  canvas: {
    width: number
    height: number
    backgroundColor: string
  }
  layers: Layer[]
}
```

### Layer Types
```typescript
type LayerType =
  | 'text'        // Texto simples (um estilo único)
  | 'rich-text'   // Texto com formatação rica (múltiplas cores/fontes)
  | 'image'
  | 'logo'
  | 'element'
  | 'shape'
  | 'icon'
  | 'gradient'
  | 'gradient2'
  | 'video'

interface Layer {
  id: string
  type: LayerType
  name: string
  visible: boolean
  locked: boolean
  order: number
  position: { x: number; y: number }
  size: { width: number; height: number }
  rotation?: number
  style: LayerStyle
  content?: string // Para textos
  fileUrl?: string // Para imagens/logos
  richTextStyles?: RichTextStyle[] // Para rich-text (estilos por trecho)
}
```

### Rich Text Support

O editor suporta **texto com formatação rica**, permitindo múltiplas cores, fontes e estilos na mesma frase.

**Diferença entre `text` e `rich-text`:**
- **`text`**: Estilo único aplicado a todo o texto (comportamento atual)
- **`rich-text`**: Cada palavra/trecho pode ter cor, fonte e formatação diferentes

**Estrutura de dados:**
```typescript
interface RichTextStyle {
  start: number  // Posição inicial no texto (índice)
  end: number    // Posição final no texto (índice)

  // Estilos do trecho
  fontFamily?: string
  fontSize?: number
  fill?: string
  fontStyle?: 'normal' | 'italic' | 'bold' | 'bold italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  letterSpacing?: number

  // Efeitos inline
  stroke?: { color: string; width: number }
  shadow?: { color: string; blur: number; offset: { x: number; y: number } }
}

// Exemplo de layer com rich text
{
  id: "layer-123",
  type: "rich-text",
  content: "Hello World",
  richTextStyles: [
    { start: 0, end: 5, fill: "#FF0000", fontFamily: "Arial" },      // "Hello" vermelho
    { start: 6, end: 11, fill: "#0000FF", fontFamily: "Times" }      // "World" azul
  ]
}
```

**Conversão de texto simples para rich text:**
```typescript
// Usuário clica em "✨ Converter para Rich Text" na toolbar
updateLayer(layerId, {
  type: 'rich-text',
  richTextStyles: [] // Inicialmente vazio (estilo base aplicado)
})
```

**Documentação completa:**
- Ver `/prompts/plano-texto-konva.md` para plano de implementação detalhado
- Ver `src/types/rich-text.ts` para tipos completos

### Layer Styles
```typescript
interface LayerStyle {
  // Texto
  fontSize?: number
  fontFamily?: string
  fontStyle?: 'normal' | 'italic'
  fontWeight?: string | number
  color?: string
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  lineHeight?: number
  letterSpacing?: number

  // Visual
  opacity?: number
  fill?: string
  strokeColor?: string
  strokeWidth?: number

  // Imagem
  objectFit?: 'cover' | 'contain' | 'fill'
  blur?: number
  brightness?: number
  contrast?: number

  // Gradiente
  gradientType?: 'linear' | 'radial'
  gradientAngle?: number
  gradientStops?: GradientStop[]

  // Shape
  shapeType?: 'rectangle' | 'circle' | 'triangle' | 'star' | 'arrow'

  // Borda
  border?: {
    width: number
    color: string
    radius: number
  }
}
```

## 🎯 Funcionalidades Principais

### 1. Gerenciamento de Layers

#### Adicionar Layer
```typescript
const { addLayer } = useTemplateEditor()

// Adicionar texto
addLayer({
  id: crypto.randomUUID(),
  type: 'text',
  name: 'Novo Texto',
  content: 'Digite aqui',
  position: { x: 100, y: 100 },
  size: { width: 240, height: 120 },
  style: {
    fontSize: 36,
    fontFamily: 'Inter',
    color: '#000000',
  },
  visible: true,
  locked: false,
  order: 0,
})
```

#### Atualizar Layer
```typescript
const { updateLayer } = useTemplateEditor()

updateLayer(layerId, (layer) => ({
  ...layer,
  style: {
    ...layer.style,
    fontSize: 48,
    color: '#ff0000',
  },
}))
```

#### Remover Layer
```typescript
const { removeLayer } = useTemplateEditor()

removeLayer(layerId)
```

#### Reordenar Layers
```typescript
const { reorderLayers } = useTemplateEditor()

// Nova ordem de IDs (index 0 = fundo)
reorderLayers(['layer-1', 'layer-3', 'layer-2'])
```

### 2. Sistema de Seleção

#### Seleção Simples
```typescript
const { selectLayer } = useTemplateEditor()

selectLayer(layerId)
```

#### Seleção Múltipla (Shift/Ctrl)
```typescript
selectLayer(layerId, { additive: true })
```

#### Seleção por Área
```typescript
// Implementado via transformer com shift-drag
```

### 3. Transformações

#### Mover Layer
```typescript
const { moveLayer } = useTemplateEditor()

moveLayer(layerId, deltaX, deltaY)
```

#### Resize e Rotate
- Implementado via `KonvaSelectionTransformer`
- Suporta múltiplos elementos
- Mantém proporções com Shift
- Resize from center com Alt

### 4. Undo/Redo

```typescript
const { undo, redo, canUndo, canRedo } = useTemplateEditor()

// Histórico de 50 estados
// Atalhos: Ctrl+Z (undo), Ctrl+Y/Ctrl+Shift+Z (redo)
```

### 5. Copy/Paste

```typescript
const { copySelectedLayers, pasteLayers } = useTemplateEditor()

// Atalhos: Ctrl+C (copiar), Ctrl+V (colar)
// Offset automático de 24px
```

### 6. Zoom

```typescript
const { zoom, setZoom, zoomIn, zoomOut } = useTemplateEditor()

// Zoom APENAS via botões e atalhos (Ctrl/Cmd +/-, Ctrl/Cmd 0)
// Scroll do mouse = scroll vertical nativo (sem zoom)
// Canvas sempre centralizado horizontalmente
// Range: 10% - 500%
```

**Comportamento:**
- **Scroll do mouse**: Rola verticalmente (sem zoom)
- **Botões de zoom**: Controles no rodapé (ZoomControls component)
- **Atalhos de teclado**: Ctrl/Cmd + Plus (zoom in), Ctrl/Cmd + Minus (zoom out), Ctrl/Cmd + 0 (reset para 100%)
- **Centralização**: Canvas sempre centralizado horizontalmente, scroll vertical disponível quando necessário

## 🎨 Smart Guides

Sistema de guias inteligentes inspirado em Figma/Canva.

### Funcionalidades
- **Snap to Canvas**: Centro horizontal/vertical, bordas
- **Snap to Objects**: Alinhamento com outros elementos
- **Snap to Margins**: margem de segurança de `CANVAS_MARGIN` (`src/lib/canvas-margin.ts`) — 70px nas laterais, 120px no topo e 100px na base
- **Visual Feedback**: Linhas magenta tracejadas

### Configuração
```typescript
const DEFAULT_SNAP_CONFIG: SnapConfig = {
  enabled: true,
  snapToCanvas: true,
  snapToObjects: true,
  snapTolerance: 5, // pixels
  guideColor: '#FF00FF',
  guideDash: [4, 4],
}
```

### Desabilitar Temporariamente
- Segurar **Alt** enquanto arrasta
- Toggle de guias de margem: Tecla **R**

## 📝 Edição de Texto

### Duplo Clique para Editar
1. Duplo clique no texto
2. Textarea HTML aparece sobre o elemento
3. Editar conteúdo
4. **Enter** para salvar, **Escape** para cancelar

### Toolbar de Texto
Aparece automaticamente quando texto é selecionado.

**Controles:**
- Fonte (15 fontes + customizadas)
- Tamanho (8-200px)
- Negrito/Itálico
- Alinhamento (esquerda, centro, direita)
- Cor do texto
- Cor do contorno + espessura
- Altura da linha (0.5-3.0)
- Espaçamento de letras (-10 a 50px)
- Opacidade (0-100%)

Ver [Toolbar de Edição de Texto](./text-editing-toolbar.md) para detalhes.

## 🖼️ Gerenciamento de Imagens

### Upload e Crop
```typescript
// Crop implementado via canvas HTML
const croppedBlob = await cropImage(file, {
  x: 0,
  y: 0,
  width: 500,
  height: 500,
})
```

### Filtros Konva
```typescript
// Aplicados via Konva.Filters
filters: [
  Konva.Filters.Blur,
  Konva.Filters.Brighten,
  Konva.Filters.Contrast,
  Konva.Filters.Grayscale,
  Konva.Filters.Sepia,
  Konva.Filters.Invert,
]
```

### Object Fit
- **cover**: Preenche área, mantém aspect ratio
- **contain**: Cabe dentro da área
- **fill**: Estica para preencher

## 🎭 Gradientes

### Tipos Suportados
- **Linear**: Direção configurável (0-360°)
- **Radial**: Do centro para fora

### Configuração
```typescript
{
  gradientType: 'linear',
  gradientAngle: 180, // de cima para baixo
  gradientStops: [
    { id: '1', color: '#000000', position: 0, opacity: 1 },
    { id: '2', color: '#000000', position: 1, opacity: 0 },
  ]
}
```

### Editor de Gradientes
- Adicionar/remover stops
- Ajustar posição com slider
- Picker de cor por stop
- Controle de opacidade
- Presets prontos

## 🔤 Sistema de Fontes Customizadas

Ver [Sistema de Fontes Customizadas](./custom-fonts.md) para documentação completa.

**Resumo:**
- Upload de .ttf, .otf, .woff, .woff2
- Persistência em localStorage + Database
- Sincronização bidirecional (Assets ↔ Editor)
- Pré-carregamento antes do Konva renderizar
- Fontes aparecem imediatamente no editor

## 💾 Sistema de Salvamento

### Auto-save (via dirty flag)
```typescript
const { dirty, markSaved } = useTemplateEditor()

// dirty = true quando há mudanças não salvas
```

### Thumbnail Automático
```typescript
const { generateThumbnail } = useTemplateEditor()

// Gera JPEG 300px width para preview
const thumbnailUrl = await generateThumbnail(300)
```

### Salvar Template
```typescript
const handleSave = async () => {
  const thumbnailUrl = await generateThumbnail(300)

  await updateTemplate({
    id: templateId,
    data: {
      name,
      designData: design,
      dynamicFields,
      thumbnailUrl,
    },
  })

  markSaved(savedTemplate)
}
```

## 📤 Exportação

### Formatos Suportados
- **PNG**: Sem perda, transparência
- **JPEG**: Compressão, menor tamanho

### Exportar Design
```typescript
const { exportDesign } = useTemplateEditor()

await exportDesign('jpeg') // ou 'png'

// Processo:
// 1. Limpa seleção
// 2. Normaliza zoom para 100%
// 3. Oculta guides
// 4. Oculta layers invisíveis
// 5. Gera imagem em alta resolução (2x pixelRatio)
// 6. Envia para API para salvar e deduzir crédito
// 7. Faz download automático
```

### Otimização de Tamanho
- JPEG: Qualidade ajustável (max 8MB)
- Compressão iterativa se necessário
- Limite de 8MB para uploads

## ⌨️ Atalhos de Teclado

### Navegação
- **Ctrl+Z**: Undo
- **Ctrl+Y** ou **Ctrl+Shift+Z**: Redo
- **Ctrl+C**: Copiar layers selecionados
- **Ctrl+V**: Colar layers

### Zoom
- **Ctrl/Cmd+Plus**: Zoom in
- **Ctrl/Cmd+Minus**: Zoom out
- **Ctrl/Cmd+0**: Reset zoom (100%)
- **Scroll do mouse**: Scroll vertical (zoom desabilitado)

### Ferramentas
- **Alt** (segurar): Desabilita snap temporariamente
- **G**: Toggle guia de teste (debug)
- **R**: Toggle guias de margem
- **C**: Toggle bordas do canvas
- **M**: Toggle máscara da interface do story do Instagram (só em canvas 9:16;
  ligada por padrão) — ver `src/lib/instagram-story-chrome.ts`
- **Shift** (ao arrastar): Seleção múltipla
- **Shift** (ao resize): Mantém proporção

### Edição de Texto
- **Duplo clique**: Entrar em modo de edição
- **Enter**: Finalizar edição
- **Shift+Enter**: Nova linha
- **Escape**: Cancelar edição

## 🔄 Context API

### TemplateEditorContext
Centraliza todo o estado do editor.

**Principais métodos:**
```typescript
interface TemplateEditorContextValue {
  // Estado
  templateId: number
  projectId: number
  name: string
  design: DesignData
  selectedLayerIds: string[]
  dirty: boolean
  zoom: number

  // Layers
  updateLayer: (id: string, updater: (layer: Layer) => Layer) => void
  addLayer: (layer: Layer) => void
  removeLayer: (id: string) => void
  duplicateLayer: (id: string) => void
  reorderLayers: (ids: string[]) => void

  // Seleção
  selectLayer: (id: string | null, options?: SelectOptions) => void
  selectLayers: (ids: string[]) => void
  clearLayerSelection: () => void

  // Canvas
  updateCanvas: (canvas: Partial<Canvas>) => void

  // Histórico
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean

  // Clipboard
  copySelectedLayers: () => void
  pasteLayers: () => void

  // Zoom
  setZoom: (value: number) => void
  zoomIn: () => void
  zoomOut: () => void

  // Export
  generateThumbnail: (maxWidth?: number) => Promise<string | null>
  exportDesign: (format: 'png' | 'jpeg') => Promise<ExportRecord>

  // Stage
  setStageInstance: (stage: Konva.Stage | null) => void
}
```

## 📁 Arquivos Principais

### Core
- `template-editor-shell.tsx` - Container e pré-carregamento de fontes
- `template-editor-context.tsx` - Context API
- `editor-canvas.tsx` - Canvas wrapper com toolbar de texto
- `konva-editor-stage.tsx` - Stage Konva principal

### Layers
- `konva-layer-factory.tsx` - Factory para renderizar layers
- `konva-editable-text.tsx` - Componente de texto editável
- `konva-transformer.tsx` - Transformer de seleção múltipla

### Panels
- `text-panel.tsx` - Adicionar textos predefinidos
- `images-panel.tsx` - Adicionar imagens do projeto
- `elements-panel.tsx` - Adicionar formas/ícones
- `logo-panel.tsx` - Adicionar logo da marca
- `colors-panel.tsx` - Paleta de cores da marca
- `gradients-panel.tsx` - Editor de gradientes
- `layers-panel-advanced.tsx` - Gerenciamento de layers
- `properties-panel.tsx` - Propriedades do elemento selecionado

### Toolbars
- `text-toolbar.tsx` - Toolbar de formatação de texto

### Utilities
- `konva-smart-guides.ts` - Sistema de smart guides
- `image-crop-utils.ts` - Utilitários de crop

## 🐛 Solução de Problemas

### Stage não renderiza
- Verificar se `stageRef` está definido
- Confirmar que `setStageInstance` foi chamado
- Checar erros no console

### Fonts não aparecem
- Ver [Sistema de Fontes Customizadas](./custom-fonts.md)
- Verificar pré-carregamento no `TemplateEditorShell`
- Confirmar `document.fonts.ready`

### Smart guides não funcionam
- Verificar se `snappingEnabled` está true
- Conferir `snapTolerance` (padrão: 5px)
- Checar se está segurando Alt (desabilita snap)

### Performance lenta
- Reduzir número de layers
- Desabilitar `perfectDrawEnabled: false`
- Usar `React.useDeferredValue` para layers
- Otimizar imagens (tamanho e resolução)

### Transformer não aparece
- Verificar se layer não está locked
- Confirmar que layer está visible
- Checar se `selectedLayerIds` contém o ID

### Export falha
- Verificar créditos disponíveis
- Confirmar variáveis de ambiente do Vercel Blob
- Checar tamanho do arquivo (max 8MB)
- Ver logs do servidor

## 📚 Referências

### Documentação do Projeto
- [Sistema de Projetos](./projects-templates.md)
- [Sistema de Fontes Customizadas](./custom-fonts.md)
- [Toolbar de Texto](./text-editing-toolbar.md)
- [Correções de Visualização em Tempo Real](./konva-text-realtime-fixes.md) - **Importante para performance**

### Documentação Externa
- [Konva.js Documentation](https://konvajs.org/)
- [React Konva](https://konvajs.org/docs/react/)
- [Custom Fonts in Konva](https://konvajs.org/docs/sandbox/Custom_Font.html)
