"use client"

import * as React from 'react'
import type { Layer } from '@/types/template'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

/**
 * ImageToolbar - Toolbar de propriedades de imagem para Konva.js
 *
 * Funcionalidades:
 * - Controle de opacidade
 *
 * @component
 */

interface ImageToolbarProps {
  selectedLayer: Layer
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void
}

export function ImageToolbar({ selectedLayer, onUpdateLayer }: ImageToolbarProps) {
  const opacity = selectedLayer.style?.opacity ?? 1

  const handleOpacityChange = (values: number[]) => {
    const value = values[0] ?? 1
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, opacity: value },
    })
  }

  return (
    <div className="flex-shrink-0 border-b border-border/40 bg-card shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {/* Opacidade */}
        <div className="flex items-center gap-2 pr-2 border-r border-border/40 flex-shrink-0">
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
