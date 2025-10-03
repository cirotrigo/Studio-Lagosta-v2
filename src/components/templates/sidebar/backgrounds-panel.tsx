"use client"

import * as React from 'react'
import { BACKGROUND_PRESETS } from '@/lib/assets/background-presets'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'

export function BackgroundsPanel() {
  const { design, updateCanvas, addLayer } = useTemplateEditor()

  const handleApplyBackground = React.useCallback(
    (presetId: string) => {
      const preset = BACKGROUND_PRESETS.find((item) => item.id === presetId)
      if (!preset) return

      if (preset.type === 'solid') {
        updateCanvas({ backgroundColor: preset.value })
        return
      }

      const base = createDefaultLayer('gradient')
      addLayer({
        ...base,
        name: `Background - ${preset.label}`,
        position: { x: 0, y: 0 },
        size: { width: design.canvas.width, height: design.canvas.height },
        style: {
          ...base.style,
          gradientType: preset.value === 'radial' ? 'radial' : 'linear',
          gradientStops: preset.gradientStops,
          gradientAngle: preset.value === 'linear' ? 180 : base.style?.gradientAngle,
        },
      })
    },
    [addLayer, design.canvas.height, design.canvas.width, updateCanvas],
  )

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Fundos</h3>
        <p className="text-xs text-muted-foreground">Aplique cores sólidas ou gradientes ao canvas.</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="grid gap-3 pr-2 md:grid-cols-2">
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleApplyBackground(preset.id)}
              className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/30 p-3 transition hover:border-primary"
            >
              <div className="h-20 w-full rounded-md" style={getPreviewStyle(preset)} />
              <span className="text-xs font-medium text-muted-foreground">{preset.label}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
      <Button variant="ghost" size="sm" onClick={() => updateCanvas({ backgroundColor: '#ffffff' })}>
        Resetar background
      </Button>
    </div>
  )
}

function getPreviewStyle(preset: (typeof BACKGROUND_PRESETS)[number]) {
  if (preset.type === 'solid') {
    return { backgroundColor: preset.value }
  }
  if (preset.value === 'radial' && preset.gradientStops) {
    const stops = preset.gradientStops
      .map((stop) => `${stop.color} ${(stop.position ?? 0) * 100}%`)
      .join(', ')
    return {
      backgroundImage: `radial-gradient(circle, ${stops})`,
    }
  }
  if (preset.gradientStops) {
    const stops = preset.gradientStops
      .map((stop) => `${stop.color} ${(stop.position ?? 0) * 100}%`)
      .join(', ')
    return {
      backgroundImage: `linear-gradient(180deg, ${stops})`,
    }
  }
  return { backgroundColor: '#f4f4f5' }
}
