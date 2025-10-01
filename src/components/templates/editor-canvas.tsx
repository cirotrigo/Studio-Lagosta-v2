"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { TemplateEditorContextValue } from '@/contexts/template-editor-context'

type EditorLayer = TemplateEditorContextValue['design']['layers'][number]

function getLayerStyle(layer: EditorLayer, zoom: number): React.CSSProperties {
  const width = (layer.size?.width ?? 0) * zoom
  const height = (layer.size?.height ?? 0) * zoom
  const transform = `rotate(${layer.rotation ?? 0}deg)`

  const base: React.CSSProperties = {
    position: 'absolute',
    left: (layer.position?.x ?? 0) * zoom,
    top: (layer.position?.y ?? 0) * zoom,
    width,
    height,
    transform,
    transformOrigin: 'top left',
    opacity: layer.visible === false ? 0.3 : 1,
    cursor: layer.locked ? 'not-allowed' : 'grab',
    userSelect: 'none',
  }

  if (layer.type === 'text') {
    return {
      ...base,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: layer.style?.textAlign ?? 'left',
      fontFamily: layer.style?.fontFamily,
      fontSize: (layer.style?.fontSize ?? 16) * zoom,
      fontWeight: layer.style?.fontWeight ?? 'normal',
      fontStyle: layer.style?.fontStyle ?? 'normal',
      color: layer.style?.color ?? '#000000',
      lineHeight: (layer.style?.lineHeight ?? 1.2) as number,
      letterSpacing: layer.style?.letterSpacing ?? undefined,
      padding: 4,
      whiteSpace: 'pre-wrap',
      overflow: 'hidden',
      backgroundColor: 'transparent',
    }
  }

  if (layer.type === 'gradient' || layer.type === 'gradient2') {
    const stops = layer.style?.gradientStops ?? []
    const angle = layer.style?.gradientAngle ?? 0
    const gradientType = layer.style?.gradientType ?? 'linear'
    const gradient =
      gradientType === 'radial'
        ? `radial-gradient(circle, ${stops
            .map((stop) => `${stop.color} ${(stop.position ?? 0) * 100}%`)
            .join(', ')})`
        : `linear-gradient(${angle}deg, ${stops
            .map((stop) => `${stop.color} ${(stop.position ?? 0) * 100}%`)
            .join(', ')})`

    return {
      ...base,
      backgroundImage: gradient,
    }
  }

  const backgroundImage = layer.fileUrl ? `url(${layer.fileUrl})` : undefined
  return {
    ...base,
    backgroundImage,
    backgroundSize: layer.style?.objectFit === 'contain' ? 'contain' : 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    borderRadius: layer.style?.border?.radius ? `${layer.style?.border?.radius}px` : undefined,
    border: layer.style?.border?.width
      ? `${layer.style?.border?.width}px solid ${layer.style?.border?.color ?? '#000000'}`
      : undefined,
    backgroundColor: backgroundImage ? undefined : '#f5f5f5',
  }
}

export function EditorCanvas() {
  const {
    design,
    selectedLayerId,
    selectLayer,
    updateLayer,
    zoom,
  } = useTemplateEditor()
  const boardRef = React.useRef<HTMLDivElement>(null)
  const canvasWidth = design.canvas.width * zoom
  const canvasHeight = design.canvas.height * zoom

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>, layerId: string, locked?: boolean) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.preventDefault()
      selectLayer(layerId)
      if (locked) return

      const startClient = { x: event.clientX, y: event.clientY }
      const pointerId = event.pointerId
      const layer = design.layers.find((l) => l.id === layerId)
      if (!layer) return
      const initialPosition = {
        x: layer.position?.x ?? 0,
        y: layer.position?.y ?? 0,
      }

      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        const deltaX = (moveEvent.clientX - startClient.x) / (zoom || 1)
        const deltaY = (moveEvent.clientY - startClient.y) / (zoom || 1)
        updateLayer(layerId, (current) => {
          const nextX = Math.round(initialPosition.x + deltaX)
          const nextY = Math.round(initialPosition.y + deltaY)
          if (current.position?.x === nextX && current.position?.y === nextY) {
            return current
          }
          return {
            ...current,
            position: {
              x: nextX,
              y: nextY,
            },
          }
        })
      }

      const up = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        try {
          (event.currentTarget as HTMLElement).releasePointerCapture(pointerId)
        } catch {
          // ignore release errors
        }
      }

      try {
        event.currentTarget.setPointerCapture(pointerId)
      } catch {
        // ignore capture errors
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [design.layers, selectLayer, updateLayer, zoom],
  )

  const handleCanvasPointerDown = React.useCallback(() => {
    selectLayer(null)
  }, [selectLayer])

  return (
    <div className="flex h-full w-full flex-1 items-center justify-center overflow-auto rounded-lg border border-border/40 bg-muted/50 p-8">
      <div
        ref={boardRef}
        className="relative flex h-full items-center justify-center"
        style={{ minWidth: canvasWidth + 40, minHeight: canvasHeight + 40 }}
      >
        <div
          role="presentation"
          onPointerDown={handleCanvasPointerDown}
          className="relative"
          style={{
            width: canvasWidth,
            height: canvasHeight,
          }}
        >
          <div
            className="absolute inset-0 rounded-md shadow-lg"
            style={{
              backgroundColor: design.canvas.backgroundColor ?? '#ffffff',
            }}
          />
          <div className="absolute inset-0" role="presentation">
            {design.layers.map((layer) => (
              <div
                key={layer.id}
                role="button"
                tabIndex={-1}
                onPointerDown={(event) => handlePointerDown(event, layer.id, layer.locked)}
                className={cn(
                  'group rounded-sm border border-transparent outline-none transition-all',
                  selectedLayerId === layer.id && 'border-primary shadow-[0_0_0_1px_var(--primary)]',
                  layer.locked && 'pointer-events-auto',
                )}
                style={getLayerStyle(layer, zoom)}
              >
                {layer.type === 'text' ? layer.content : null}
                {selectedLayerId === layer.id && (
                  <div className="pointer-events-none absolute -inset-2 rounded-md border border-primary/50 opacity-70" />
                )}
                {layer.visible === false && (
                  <div className="absolute inset-0 rounded-sm bg-background/60" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
