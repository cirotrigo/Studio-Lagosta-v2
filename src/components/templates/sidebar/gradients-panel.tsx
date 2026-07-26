"use client"

import * as React from 'react'
import { GRADIENTS_LIBRARY } from '@/lib/assets/gradients-library'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { GradientEditor } from '@/components/templates/gradient-editor'

export function GradientsPanel() {
  const { addLayer, design, selectedLayerId } = useTemplateEditor()

  // Verifica se há uma layer de gradiente selecionada
  const selectedLayer = React.useMemo(
    () => design.layers.find((layer) => layer.id === selectedLayerId && (layer.type === 'gradient' || layer.type === 'gradient2')),
    [design.layers, selectedLayerId]
  )

  const handleAddGradient = React.useCallback(
    (gradientId: string) => {
      const definition = GRADIENTS_LIBRARY.find((item) => item.id === gradientId)
      if (!definition) return

      const base = createDefaultLayer('gradient')
      addLayer({
        ...base,
        name: `Gradiente - ${definition.label}`,
        position: { x: 0, y: 0 },
        size: { width: design.canvas.width, height: design.canvas.height },
        style: {
          ...base.style,
          gradientType: definition.gradientType,
          gradientAngle: definition.gradientAngle,
          gradientStops: definition.gradientStops,
        },
      })
    },
    [addLayer, design.canvas.width, design.canvas.height],
  )

  return (
    <div className="space-y-4">
      {/* Controles de edição (se houver gradiente selecionado) */}
      {selectedLayer && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-primary">Editar Gradiente Selecionado</h3>
            <p className="text-xs text-muted-foreground">Ajuste as propriedades do gradiente</p>
          </div>
          <GradientEditor layerId={selectedLayer.id} />
        </div>
      )}

      {/* Templates pré-definidos */}
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Templates de Gradientes</h3>
          <p className="text-xs text-muted-foreground">Clique para adicionar ao canvas (tamanho completo)</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {GRADIENTS_LIBRARY.map((gradient) => (
            <button
              key={gradient.id}
              type="button"
              onClick={() => handleAddGradient(gradient.id)}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border/40 bg-muted/40 p-3 transition hover:border-primary hover:shadow-md"
            >
              <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded bg-white">
                <GradientPreview gradient={gradient} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{gradient.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface GradientPreviewProps {
  gradient: typeof GRADIENTS_LIBRARY[0]
}

function GradientPreview({ gradient }: GradientPreviewProps) {
  const stops = [...gradient.gradientStops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => {
      const r = parseInt(stop.color.slice(1, 3), 16)
      const g = parseInt(stop.color.slice(3, 5), 16)
      const b = parseInt(stop.color.slice(5, 7), 16)
      return `rgba(${r}, ${g}, ${b}, ${stop.opacity}) ${stop.position * 100}%`
    })
    .join(', ')

  const gradientStyle =
    gradient.gradientType === 'linear'
      ? `linear-gradient(${gradient.gradientAngle}deg, ${stops})`
      : `radial-gradient(circle, ${stops})`

  return (
    <div
      className="h-full w-full"
      style={{
        background: gradientStyle,
      }}
    />
  )
}
