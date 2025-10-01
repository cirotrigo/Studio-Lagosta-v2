"use client"

import * as React from 'react'
import type { DesignData } from '@/types/template'
import type { TemplateDto } from '@/hooks/use-template'
import { RenderEngine } from '@/lib/render-engine'

interface StudioCanvasProps {
  template: TemplateDto
  fieldValues: Record<string, unknown>
}

export function StudioCanvas({ template, fieldValues }: StudioCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const design = template.designData as DesignData
    if (!design?.canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = design.canvas.width
    canvas.height = design.canvas.height

    let cancelled = false

    const render = async () => {
      try {
        await RenderEngine.renderDesign(ctx, design, fieldValues)
      } catch (error) {
        console.error('[StudioCanvas] Failed to render preview', error)
      }
    }

    if (!cancelled) {
      void render()
    }

    return () => {
      cancelled = true
    }
  }, [template, fieldValues])

  const width = template.designData.canvas.width
  const height = template.designData.canvas.height
  const scale = React.useMemo(() => {
    const maxDimension = 520
    return Math.min(1, maxDimension / Math.max(width, height))
  }, [width, height])

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
        Preview em tempo real (renderização unificada)
      </div>
      <div className="flex items-center justify-center rounded-lg border border-border/40 bg-card/60 p-4">
        <canvas
          ref={canvasRef}
          style={{
            width: width * scale,
            height: height * scale,
            maxWidth: '100%',
            borderRadius: 12,
          }}
        />
      </div>
    </div>
  )
}
