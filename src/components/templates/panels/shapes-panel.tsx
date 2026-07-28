"use client"

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { SHAPES_LIBRARY, SHAPE_CATEGORIES, type ShapeDefinition } from '@/lib/assets/shapes-library'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'

/**
 * Painel "Formas" único (estilo Polotno): busca + categorias (básicas, setas,
 * linhas, decorativas). Substitui os antigos painéis órfãos de formas/ícones.
 */
export function ShapesPanel() {
  const { addLayer, design } = useTemplateEditor()
  const [query, setQuery] = React.useState('')

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SHAPES_LIBRARY
    return SHAPES_LIBRARY.filter(
      (shape) =>
        shape.label.toLowerCase().includes(q) ||
        shape.keywords?.some((k) => k.toLowerCase().includes(q)),
    )
  }, [query])

  const handleAddShape = React.useCallback(
    (definition: ShapeDefinition) => {
      const base = createDefaultLayer('shape')
      const aspect = definition.aspect ?? 1
      const baseWidth = Math.min(360, Math.round(design.canvas.width * 0.33)) || 240
      const width = baseWidth
      const height = definition.shapeType === 'line' ? 40 : Math.round(baseWidth / aspect)

      addLayer({
        ...base,
        name: definition.label,
        size: { width, height },
        position: {
          x: Math.max(0, Math.round((design.canvas.width - width) / 2)),
          y: Math.max(0, Math.round((design.canvas.height - height) / 2)),
        },
        style: {
          ...base.style,
          shapeType: definition.shapeType,
          fill: definition.fill,
          strokeColor: definition.strokeColor,
          strokeWidth: definition.strokeWidth ?? base.style?.strokeWidth,
          pathData: definition.pathData,
          pathFillRule: definition.pathFillRule,
          lineStyle: definition.lineStyle,
          lineStartCap: definition.lineStartCap,
          lineEndCap: definition.lineEndCap,
        },
      })
    },
    [addLayer, design.canvas.width, design.canvas.height],
  )

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Formas</h3>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar forma..."
          className="h-8 text-xs"
        />
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 pr-2">
          {SHAPE_CATEGORIES.map((category) => {
            const shapes = filtered.filter((shape) => shape.category === category.id)
            if (shapes.length === 0) return null
            return (
              <div key={category.id}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {category.label}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {shapes.map((shape) => (
                    <button
                      key={shape.id}
                      type="button"
                      onClick={() => handleAddShape(shape)}
                      title={shape.label}
                      className="flex aspect-square items-center justify-center rounded-lg border border-border/40 bg-muted/40 p-2 transition hover:border-primary hover:bg-muted"
                    >
                      <ShapePreview shape={shape} />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma forma encontrada.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function ShapePreview({ shape }: { shape: ShapeDefinition }) {
  const fill = 'currentColor'

  if (shape.shapeType === 'svg-path' && shape.pathData) {
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
        <path d={shape.pathData} fill={fill} fillRule={shape.pathFillRule ?? 'nonzero'} />
      </svg>
    )
  }

  if (shape.shapeType === 'line') {
    const dash = shape.lineStyle === 'dashed' ? '10 7' : shape.lineStyle === 'dotted' ? '0.5 8' : undefined
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
        {shape.lineStartCap === 'arrow' && <path d="M2 50 L20 40 V60 Z" fill={fill} />}
        {shape.lineEndCap === 'arrow' && <path d="M98 50 L80 40 V60 Z" fill={fill} />}
        <line
          x1={shape.lineStartCap === 'arrow' ? 18 : 5}
          y1={50}
          x2={shape.lineEndCap === 'arrow' ? 82 : 95}
          y2={50}
          stroke={fill}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      </svg>
    )
  }

  switch (shape.shapeType) {
    case 'rectangle':
      return <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground"><rect x="8" y="18" width="84" height="64" fill={fill} /></svg>
    case 'rounded-rectangle':
      return <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground"><rect x="8" y="18" width="84" height="64" rx="14" fill={fill} /></svg>
    case 'circle':
      return <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground"><circle cx="50" cy="50" r="42" fill={fill} /></svg>
    case 'triangle':
      return <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground"><path d="M50 8 L92 88 H8 Z" fill={fill} /></svg>
    case 'star':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
          <path d="M50 5 L61 38 L96 38 L68 59 L79 92 L50 72 L21 92 L32 59 L4 38 L39 38 Z" fill={fill} />
        </svg>
      )
    case 'arrow':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
          <path d="M5 50 H65 V38 L95 50 L65 62 V50" stroke={fill} strokeWidth="8" fill={fill} strokeLinejoin="round" />
        </svg>
      )
    default:
      return null
  }
}
