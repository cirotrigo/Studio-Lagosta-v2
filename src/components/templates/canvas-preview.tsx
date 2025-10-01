"use client"

import * as React from 'react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { RenderEngine } from '@/lib/render-engine'

export function CanvasPreview() {
  const { design } = useTemplateEditor()
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  const scale = React.useMemo(() => {
    const maxWidth = 320
    const maxHeight = 320
    const width = design.canvas.width
    const height = design.canvas.height
    const ratio = Math.min(1, maxWidth / width, maxHeight / height)
    return Number.isFinite(ratio) ? ratio : 1
  }, [design.canvas.height, design.canvas.width])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = design.canvas.width
    canvas.height = design.canvas.height

    let cancelled = false

    const render = async () => {
      try {
        await RenderEngine.renderDesign(ctx, design, {}, { scaleFactor: 1 })
      } catch (error) {
        console.error('[CanvasPreview] Failed to render design preview', error)
      }
    }

    if (!cancelled) {
      render()
    }

    return () => {
      cancelled = true
    }
  }, [design])

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-card/60 p-3 shadow-sm">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Preview em tempo real</span>
        <span>
          {design.canvas.width} × {design.canvas.height}
        </span>
      </div>
      <div className="flex items-center justify-center rounded-md border border-dashed border-border/40 bg-muted/40 p-3">
        <canvas
          ref={canvasRef}
          style={{
            width: design.canvas.width * scale,
            height: design.canvas.height * scale,
            maxWidth: '100%',
            borderRadius: 8,
          }}
        />
      </div>
    </div>
  )
}
