# Smart Guides - Guias de Alinhamento Inteligentes

Sistema completo de guias de alinhamento para Konva.js, inspirado em editores profissionais como Figma, Canva e Adobe XD.

## ✨ Funcionalidades

### Alinhamento Automático
- ✅ **Canvas**: Bordas (esquerda, direita, topo, fundo) e centro (horizontal/vertical)
- ✅ **Objetos**: Alinhamento com bordas e centros de outros objetos
- ✅ **Snap Automático**: Objetos "grudam" automaticamente quando próximos
- ✅ **Feedback Visual**: Linhas guia aparecem durante o drag

### Customização
- 🎨 Cor das guias (padrão: `#FF00FF` magenta)
- 📏 Threshold de snap ajustável (padrão: 5px)
- 👁️ Toggle on/off de guias visuais
- ⚡ Desabilitar temporariamente com tecla `Alt`
- 🎛️ Configuração granular (snap to stage, snap to objects, etc.)

### Performance
- 🚀 Otimizado para grandes quantidades de objetos
- 💾 Cálculos eficientes com early-exit
- 🎯 Rendering condicional de guias
- ⚡ `perfectDrawEnabled: false` para máxima performance

## 📦 Arquitetura

```
src/
├── lib/
│   └── konva-smart-guides.ts    # Biblioteca principal
├── hooks/
│   └── use-smart-guides.ts      # Hook React para gerenciar configuração
└── components/
    └── templates/
        └── konva-editor-stage.tsx  # Implementação no editor
```

## 🚀 Uso Básico

### 1. Importar a biblioteca

```typescript
import {
  computeAlignmentGuides,
  type RectInfo,
  type GuideLine,
  type SnapConfig,
  DEFAULT_SNAP_CONFIG,
} from '@/lib/konva-smart-guides'
```

### 2. Usar no drag handler

```typescript
const handleDragMove = (event) => {
  const node = event.target

  // Objeto sendo arrastado
  const movingRect: RectInfo = {
    id: 'object-1',
    x: node.x(),
    y: node.y(),
    width: node.width(),
    height: node.height(),
  }

  // Outros objetos no canvas
  const otherRects: RectInfo[] = [
    { id: 'object-2', x: 100, y: 100, width: 50, height: 50 },
    { id: 'object-3', x: 200, y: 150, width: 60, height: 40 },
  ]

  // Computar guias e snap
  const result = computeAlignmentGuides(
    movingRect,
    otherRects,
    canvasWidth,
    canvasHeight,
    DEFAULT_SNAP_CONFIG
  )

  // Aplicar snap
  if (result.position.x !== movingRect.x || result.position.y !== movingRect.y) {
    node.position(result.position)
  }

  // Atualizar guias visuais
  setGuides(result.guides)
}

const handleDragEnd = () => {
  setGuides([]) // Limpar guias
}
```

### 3. Renderizar guias

```tsx
<Layer name="guides-layer" listening={false}>
  {guides.map((guide, index) => (
    <Line
      key={`${guide.orientation}-${index}`}
      points={
        guide.orientation === 'vertical'
          ? [guide.position, 0, guide.position, canvasHeight]
          : [0, guide.position, canvasWidth, guide.position]
      }
      stroke="#FF00FF"
      strokeWidth={1}
      dash={[4, 6]}
      opacity={0.8}
      listening={false}
      perfectDrawEnabled={false}
    />
  ))}
</Layer>
```

## 🎛️ Configuração Avançada

### Usando o Hook

```typescript
import { useSmartGuides } from '@/hooks/use-smart-guides'

function MyEditor() {
  const {
    config,
    toggleEnabled,
    setThreshold,
    setGuideColor,
  } = useSmartGuides({
    threshold: 8,
    guideColor: '#6366F1',
  })

  return (
    <div>
      <button onClick={toggleEnabled}>
        Toggle Snap: {config.enabled ? 'ON' : 'OFF'}
      </button>
      <input
        type="range"
        min="1"
        max="20"
        value={config.threshold}
        onChange={(e) => setThreshold(Number(e.target.value))}
      />
    </div>
  )
}
```

### Opções de Configuração

```typescript
interface SnapConfig {
  enabled: boolean           // Habilitar/desabilitar sistema
  threshold: number          // Distância de snap (px)
  snapToStage: boolean       // Snap nas bordas do canvas
  snapToObjects: boolean     // Snap em outros objetos
  showGuides: boolean        // Mostrar linhas guia
  guideColor: string         // Cor das guias (#hex)
  guideDash: [number, number] // Padrão de tracejado
  showDimensions: boolean    // Detectar dimensões iguais
  guideWidth: number         // Espessura da linha
  guideOpacity: number       // Opacidade (0-1)
}
```

### Configuração Padrão

```typescript
const DEFAULT_SNAP_CONFIG: SnapConfig = {
  enabled: true,
  threshold: 5,
  snapToStage: true,
  snapToObjects: true,
  showGuides: true,
  guideColor: '#FF00FF',
  guideDash: [4, 6],
  showDimensions: false,
  guideWidth: 1,
  guideOpacity: 0.8,
}
```

## ⌨️ Atalhos de Teclado

- **Alt**: Desabilitar snap temporariamente (segurar durante o drag)
- **Ctrl/Cmd + 0**: Reset zoom para 100%
- **Ctrl/Cmd + +**: Aumentar zoom
- **Ctrl/Cmd + -**: Diminuir zoom

## 🎯 Tipos de Alinhamento Detectados

### Canvas (Stage)
- ⬅️ Borda esquerda (`x = 0`)
- ➡️ Borda direita (`x = canvasWidth`)
- ⬆️ Borda superior (`y = 0`)
- ⬇️ Borda inferior (`y = canvasHeight`)
- ↔️ Centro horizontal (`x = canvasWidth / 2`)
- ↕️ Centro vertical (`y = canvasHeight / 2`)

### Objetos
- ⬅️ Borda esquerda com borda esquerda
- ➡️ Borda direita com borda direita
- ⬆️ Borda superior com borda superior
- ⬇️ Borda inferior com borda inferior
- ↔️ Centro horizontal com centro horizontal
- ↕️ Centro vertical com centro vertical
- 🔄 Alinhamento cruzado (ex: borda de um com centro de outro)

## 🔧 API Reference

### `computeAlignmentGuides()`

Função principal para calcular guias e snap.

```typescript
function computeAlignmentGuides(
  moving: RectInfo,
  others: RectInfo[],
  stageWidth: number,
  stageHeight: number,
  config?: SnapConfig
): {
  guides: GuideLine[]
  position: { x: number; y: number }
  matchedDimensions?: {
    width?: string[]
    height?: string[]
  }
}
```

**Parâmetros:**
- `moving`: Objeto sendo arrastado
- `others`: Outros objetos no canvas
- `stageWidth`: Largura do canvas
- `stageHeight`: Altura do canvas
- `config`: Configurações de snap (opcional)

**Retorna:**
- `guides`: Array de guias a serem desenhadas
- `position`: Nova posição com snap aplicado
- `matchedDimensions`: IDs de objetos com mesma largura/altura (se `showDimensions: true`)

### `getObjectSnappingEdges()`

Extrai bordas de snap de um objeto.

```typescript
function getObjectSnappingEdges(rect: RectInfo): {
  vertical: SnapEdge[]
  horizontal: SnapEdge[]
}
```

### `getStageGuides()`

Retorna guias do canvas.

```typescript
function getStageGuides(stageWidth: number, stageHeight: number): {
  vertical: number[]
  horizontal: number[]
}
```

## 💡 Exemplos Avançados

### Customizar Cor por Tipo de Alinhamento

```typescript
const result = computeAlignmentGuides(moving, others, width, height, config)

guides.map((guide) => (
  <Line
    stroke={guide.snapType === 'center' ? '#FF0000' : '#FF00FF'}
    // ... outras props
  />
))
```

### Mostrar Tooltip com Coordenadas

```typescript
const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)

const handleDragMove = (event) => {
  // ... computar guias
  setTooltip({ x: result.position.x, y: result.position.y })
}

// Renderizar tooltip
{tooltip && (
  <Label x={tooltip.x} y={tooltip.y - 30}>
    <Tag fill="black" />
    <Text text={`X: ${Math.round(tooltip.x)} Y: ${Math.round(tooltip.y)}`} fill="white" />
  </Label>
)}
```

### Detectar Dimensões Iguais

```typescript
const result = computeAlignmentGuides(
  moving,
  others,
  width,
  height,
  { ...config, showDimensions: true }
)

if (result.matchedDimensions?.width) {
  console.log('Mesma largura:', result.matchedDimensions.width)
}
```

## 🎨 Customização Visual

### Temas Personalizados

```typescript
// Tema Figma-like
const figmaTheme = {
  guideColor: '#6366F1',
  guideDash: [4, 4],
  guideOpacity: 1,
}

// Tema Adobe XD-like
const xdTheme = {
  guideColor: '#FF00FF',
  guideDash: [4, 6],
  guideOpacity: 0.8,
}

// Tema Canva-like
const canvaTheme = {
  guideColor: '#00C4CC',
  guideDash: [2, 2],
  guideOpacity: 0.7,
}
```

## 🚀 Performance Tips

1. **Use `perfectDrawEnabled: false`** nas linhas guia
2. **Desabilite `listening`** no layer de guias
3. **Use `React.useDeferredValue`** para layers grandes
4. **Limite o threshold** para evitar muitas comparações
5. **Throttle** o drag handler se necessário

## 🐛 Troubleshooting

### Guias não aparecem
- Verifique se `config.enabled === true`
- Verifique se `config.showGuides === true`
- Certifique-se de que o layer de guias está acima do layer de conteúdo

### Snap não funciona
- Verifique o `threshold` (talvez esteja muito baixo)
- Certifique-se de aplicar `result.position` ao node
- Verifique se `snapToStage` e `snapToObjects` estão habilitados

### Performance ruim
- Reduza o número de objetos em `others`
- Use `React.useDeferredValue` para guias
- Aumente o `threshold` para reduzir comparações

## 📚 Referências

- [Konva.js Docs - Objects Snapping](https://konvajs.org/docs/sandbox/Objects_Snapping.html)
- [Figma - Smart Selection](https://www.figma.com/community/file/1234567890)
- [Adobe XD - Alignment Guides](https://helpx.adobe.com/xd/help/alignment-guides.html)

## 📝 License

MIT - Faça o que quiser com este código!

---

**Criado com ❤️ para Studio Lagosta**
