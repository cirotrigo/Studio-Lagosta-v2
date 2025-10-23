'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingZoomControlsProps {
  /** Valor do zoom atual (0.1 a 5.0) */
  zoom: number
  /** Callback para aumentar zoom */
  onZoomIn: () => void
  /** Callback para diminuir zoom */
  onZoomOut: () => void
  /** Callback para resetar zoom (opcional) */
  onZoomReset?: () => void
  /** Classes CSS adicionais */
  className?: string
}

/**
 * FloatingZoomControls - Controles de zoom flutuantes para mobile
 *
 * Funcionalidades:
 * - Botões +/- para zoom in/out
 * - Indicador visual do nível de zoom atual (%)
 * - Botão de reset (fit to screen) opcional
 * - Design mobile-first com touch targets adequados (44x44px)
 * - Posicionamento fixo no canto inferior direito
 *
 * Inspirado em editores mobile como Polotno e Canva
 */
export function FloatingZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  className,
}: FloatingZoomControlsProps) {
  const zoomPercent = Math.round(zoom * 100)

  // Prevenir que o zoom vá para valores muito altos no mobile
  const handleZoomIn = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onZoomIn()
  }

  const handleZoomOut = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onZoomOut()
  }

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onZoomReset) onZoomReset()
  }

  return (
    <div
      className={cn(
        'fixed bottom-20 right-4',
        'flex flex-col gap-2',
        className
      )}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Zoom In Button */}
      <Button
        size="icon"
        variant="secondary"
        className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all"
        onClick={handleZoomIn}
        aria-label="Aumentar zoom"
      >
        <ZoomIn className="h-5 w-5" />
      </Button>

      {/* Zoom Indicator - clicável para reset */}
      <button
        className="h-12 w-12 rounded-full shadow-lg bg-background/95 backdrop-blur
                   flex items-center justify-center text-xs font-semibold
                   hover:bg-muted transition-colors active:scale-95"
        onClick={handleReset}
        aria-label={`Zoom atual: ${zoomPercent}% (clique para resetar)`}
      >
        {zoomPercent}%
      </button>

      {/* Zoom Out Button */}
      <Button
        size="icon"
        variant="secondary"
        className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all"
        onClick={handleZoomOut}
        aria-label="Diminuir zoom"
      >
        <ZoomOut className="h-5 w-5" />
      </Button>

      {/* Zoom Reset Button (optional) - removido pois o indicador já faz isso */}
      {onZoomReset && zoom !== 1 && (
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all"
          onClick={handleReset}
          aria-label="Ajustar à tela"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
