"use client"

import * as React from 'react'
import type { Layer } from '@/types/template'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { FlipHorizontal2, FlipVertical2, Expand, Shapes, Ban } from 'lucide-react'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { useTemplateEditor } from '@/contexts/template-editor-context'

/**
 * ImageToolbar - Toolbar contextual de imagem (estilo Polotno)
 *
 * [Flip H] [Flip V] [Ajustar à página] | [Máscara ▾] | Opacidade
 * (o botão Recortar chega junto do crop in-canvas)
 */

interface ImageToolbarProps {
  selectedLayer: Layer
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void
}

/** Formas com path disponíveis como máscara (o path fica CONGELADO na camada) */
const MASK_SHAPES = SHAPES_LIBRARY.filter((shape) => shape.shapeType === 'svg-path' && shape.pathData)

export function ImageToolbar({ selectedLayer, onUpdateLayer }: ImageToolbarProps) {
  const { design } = useTemplateEditor()
  const opacity = selectedLayer.style?.opacity ?? 1
  const flipH = selectedLayer.style?.flipH === true
  const flipV = selectedLayer.style?.flipV === true
  const maskId = selectedLayer.style?.mask?.shapeId

  const patchStyle = (patch: Partial<NonNullable<Layer['style']>>) => {
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, ...patch },
    })
  }

  const handleOpacityChange = (values: number[]) => {
    patchStyle({ opacity: values[0] ?? 1 })
  }

  const handleFitToPage = () => {
    // Ocupa a página inteira mantendo cover; crop manual é limpo (o
    // enquadramento anterior deixa de fazer sentido na caixa nova)
    onUpdateLayer(selectedLayer.id, {
      position: { x: 0, y: 0 },
      size: { width: design.canvas.width, height: design.canvas.height },
      style: { ...selectedLayer.style, objectFit: 'cover', crop: undefined },
    })
  }

  return (
    <div className="flex-shrink-0 rounded-lg border border-border/40 bg-card/95 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center gap-2 px-3 py-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {/* Flip + fit */}
        <div className="flex items-center gap-1 pr-2 border-r border-border/40 flex-shrink-0">
          <Button
            size="sm"
            variant={flipH ? 'default' : 'ghost'}
            className="h-8 w-8 p-0"
            title="Espelhar horizontalmente"
            onClick={() => patchStyle({ flipH: !flipH })}
          >
            <FlipHorizontal2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={flipV ? 'default' : 'ghost'}
            className="h-8 w-8 p-0"
            title="Espelhar verticalmente"
            onClick={() => patchStyle({ flipV: !flipV })}
          >
            <FlipVertical2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            title="Ajustar à página (cobre o canvas inteiro)"
            onClick={handleFitToPage}
          >
            <Expand className="h-4 w-4" />
          </Button>
        </div>

        {/* Máscara de forma */}
        <div className="flex items-center gap-1 pr-2 border-r border-border/40 flex-shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={maskId ? 'default' : 'ghost'}
                className="h-8 gap-1.5 px-2"
                title="Máscara de forma"
              >
                <Shapes className="h-4 w-4" />
                <span className="text-xs">Máscara</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Recortar imagem na forma</p>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  title="Sem máscara"
                  onClick={() => patchStyle({ mask: undefined })}
                  className={`flex aspect-square items-center justify-center rounded border p-1.5 transition hover:border-primary ${!maskId ? 'border-primary bg-primary/10' : 'border-border/40'}`}
                >
                  <Ban className="h-4 w-4 text-muted-foreground" />
                </button>
                {MASK_SHAPES.map((shape) => (
                  <button
                    key={shape.id}
                    type="button"
                    title={shape.label}
                    onClick={() => patchStyle({ mask: { shapeId: shape.id, path: shape.pathData! } })}
                    className={`flex aspect-square items-center justify-center rounded border p-1.5 transition hover:border-primary ${maskId === shape.id ? 'border-primary bg-primary/10' : 'border-border/40'}`}
                  >
                    <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
                      <path d={shape.pathData} fill="currentColor" fillRule={shape.pathFillRule ?? 'nonzero'} />
                    </svg>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Opacidade */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Opacidade:</Label>
          <Slider
            value={[opacity]}
            onValueChange={handleOpacityChange}
            min={0}
            max={1}
            step={0.1}
            className="w-24"
            title="Opacidade"
          />
          <span className="text-xs text-muted-foreground w-8">{Math.round(opacity * 100)}%</span>
        </div>
      </div>
    </div>
  )
}
