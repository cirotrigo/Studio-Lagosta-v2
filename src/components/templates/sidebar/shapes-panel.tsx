"use client"

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'

export function ShapesPanel() {
  const { addLayer } = useTemplateEditor()

  const handleAddShape = React.useCallback(
    (shapeId: string) => {
      const definition = SHAPES_LIBRARY.find((item) => item.id === shapeId)
      if (!definition) return

      const base = createDefaultLayer('shape')
      addLayer({
        ...base,
        name: `Forma - ${definition.label}`,
        style: {
          ...base.style,
          fill: definition.fill,
          strokeColor: definition.strokeColor,
          strokeWidth: definition.strokeWidth ?? base.style?.strokeWidth,
          shapeType: definition.shapeType,
        },
      })
    },
    [addLayer],
  )

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Formas</h3>
        <p className="text-xs text-muted-foreground">Adicione formas vetoriais simples.</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="grid gap-3 pr-2 md:grid-cols-2">
          {SHAPES_LIBRARY.map((shape) => (
            <button
              key={shape.id}
              type="button"
              onClick={() => handleAddShape(shape.id)}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border/40 bg-muted/40 p-4 transition hover:border-primary"
            >
              <div className="flex h-20 w-full items-center justify-center bg-background">
                <ShapePreview shapeId={shape.id} fill={shape.fill} stroke={shape.strokeColor} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{shape.label}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

interface ShapePreviewProps {
  shapeId: string
  fill: string
  stroke?: string
}

function ShapePreview({ shapeId, fill, stroke }: ShapePreviewProps) {
  switch (shapeId) {
    case 'rectangle':
      return <div className="h-12 w-12" style={{ backgroundColor: fill, border: stroke ? `2px solid ${stroke}` : undefined }} />
    case 'rounded':
      return (
        <div
          className="h-12 w-12 rounded-xl"
          style={{ backgroundColor: fill, border: stroke ? `2px solid ${stroke}` : undefined }}
        />
      )
    case 'circle':
      return (
        <div
          className="h-12 w-12 rounded-full"
          style={{ backgroundColor: fill, border: stroke ? `2px solid ${stroke}` : undefined }}
        />
      )
    case 'triangle':
      return (
        <div
          className="h-0 w-0"
          style={{
            borderLeft: '24px solid transparent',
            borderRight: '24px solid transparent',
            borderBottom: `48px solid ${fill}`,
          }}
        />
      )
    case 'star':
      return (
        <div className="relative h-12 w-12">
          <svg viewBox="0 0 24 24" className="h-full w-full" fill={fill} stroke={stroke ?? 'none'}>
            <path d="M12 2l2.92 5.91 6.53.95-4.72 4.59 1.12 6.53L12 17.77l-5.85 3.21 1.12-6.53-4.72-4.59 6.53-.95L12 2z" />
          </svg>
        </div>
      )
    case 'arrow':
      return (
        <div className="relative h-12 w-12">
          <svg viewBox="0 0 24 24" className="h-full w-full" fill={fill}>
            <path d="M4 12h11.17l-3.58-3.59L13 7l6 6-6 6-1.41-1.41L15.17 13H4z" />
          </svg>
        </div>
      )
    case 'line':
      return (
        <div
          className="h-1 w-12 rounded"
          style={{ backgroundColor: fill }}
        />
      )
    default:
      return null
  }
}
