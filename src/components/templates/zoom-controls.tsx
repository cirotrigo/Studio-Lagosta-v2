/**
 * ZoomControls - Controles flutuantes de zoom
 *
 * Componente de controle de zoom flutuante para facilitar
 * a edição em dispositivos móveis e desktop.
 *
 * Funcionalidades:
 * - Zoom In / Zoom Out
 * - Reset para 100%
 * - Fit to screen
 * - Indicador de zoom atual
 * - Posicionamento flutuante no rodapé
 */

"use client"

import * as React from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ZoomControlsProps {
  /** Zoom atual (0.1 = 10%, 1 = 100%, 5 = 500%) */
  zoom: number
  /** Callback para alterar zoom */
  onZoomChange: (zoom: number) => void
  /** Zoom mínimo permitido */
  minZoom?: number
  /** Zoom máximo permitido */
  maxZoom?: number
  /** Callback para fit to screen */
  onFitToScreen?: () => void
  /** Classe CSS adicional */
  className?: string
  /** Se deve mostrar em mobile */
  showOnMobile?: boolean
}

export function ZoomControls({
  zoom,
  onZoomChange,
  minZoom = 0.1,
  maxZoom = 5,
  onFitToScreen,
  className,
  showOnMobile = true,
}: ZoomControlsProps) {
  const [isHovered, setIsHovered] = React.useState(false)
  const zoomPercentage = Math.round(zoom * 100)

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, maxZoom)
    onZoomChange(newZoom)
  }

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, minZoom)
    onZoomChange(newZoom)
  }

  const handleReset = () => {
    onZoomChange(1)
  }

  const canZoomIn = zoom < maxZoom
  const canZoomOut = zoom > minZoom

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'absolute bottom-20 right-4 z-50',
          'flex flex-col items-center gap-1.5 rounded-2xl border border-border/40 bg-background/70 p-1.5 shadow-xl backdrop-blur-xl',
          'transition-all duration-300',
          isHovered ? 'bg-background/90 scale-105' : 'bg-background/70',
          !showOnMobile && 'hidden md:flex',
          className
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Zoom In */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'h-9 w-9 rounded-full flex items-center justify-center',
                'transition-all duration-200 active:scale-95',
                canZoomIn
                  ? 'text-foreground/80 hover:text-foreground hover:bg-accent/50'
                  : 'text-muted-foreground/30 cursor-not-allowed'
              )}
              onClick={handleZoomIn}
              disabled={!canZoomIn}
            >
              <ZoomIn className="h-4 w-4" />
              <span className="sr-only">Aumentar zoom</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            <p>Aumentar zoom</p>
            <p className="text-[10px] text-muted-foreground">Ctrl + +</p>
          </TooltipContent>
        </Tooltip>

        {/* Zoom Percentage */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'h-7 w-9 rounded-full flex items-center justify-center',
                'text-[10px] font-semibold tabular-nums',
                'text-foreground/70 hover:text-foreground hover:bg-accent/50',
                'transition-all duration-200 active:scale-95'
              )}
              onClick={handleReset}
            >
              {zoomPercentage}%
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            <p>Resetar para 100%</p>
            <p className="text-[10px] text-muted-foreground">Ctrl + 0</p>
          </TooltipContent>
        </Tooltip>

        {/* Zoom Out */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'h-9 w-9 rounded-full flex items-center justify-center',
                'transition-all duration-200 active:scale-95',
                canZoomOut
                  ? 'text-foreground/80 hover:text-foreground hover:bg-accent/50'
                  : 'text-muted-foreground/30 cursor-not-allowed'
              )}
              onClick={handleZoomOut}
              disabled={!canZoomOut}
            >
              <ZoomOut className="h-4 w-4" />
              <span className="sr-only">Diminuir zoom</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            <p>Diminuir zoom</p>
            <p className="text-[10px] text-muted-foreground">Ctrl + -</p>
          </TooltipContent>
        </Tooltip>

        {/* Separator + Fit to Screen */}
        {onFitToScreen && (
          <>
            <div className="my-0.5 h-px w-5 bg-border/40" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center',
                    'text-foreground/80 hover:text-foreground hover:bg-accent/50',
                    'transition-all duration-200 active:scale-95'
                  )}
                  onClick={onFitToScreen}
                >
                  <Maximize2 className="h-4 w-4" />
                  <span className="sr-only">Ajustar à tela</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                <p>Ajustar à tela</p>
                <p className="text-[10px] text-muted-foreground">Reset zoom e centralizar</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

/**
 * Versão compacta e minimalista para mobile
 * Design ultra-clean com opacidade reduzida e interações suaves
 */
export function ZoomControlsMobile({
  zoom,
  onZoomChange,
  minZoom = 0.1,
  maxZoom = 5,
  className,
}: Omit<ZoomControlsProps, 'onFitToScreen' | 'showOnMobile'>) {
  const [isHovered, setIsHovered] = React.useState(false)
  const zoomPercentage = Math.round(zoom * 100)

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, maxZoom)
    onZoomChange(newZoom)
  }

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, minZoom)
    onZoomChange(newZoom)
  }

  const handleReset = () => {
    onZoomChange(0.25) // Reset para fit-to-screen no mobile
  }

  const canZoomIn = zoom < maxZoom
  const canZoomOut = zoom > minZoom

  return (
    <div
      className={cn(
        'fixed bottom-24 right-3 z-[10000]',
        'flex flex-col items-center gap-1.5 rounded-2xl border border-border/40 bg-background/70 p-1.5 shadow-xl backdrop-blur-xl',
        'transition-all duration-300',
        isHovered ? 'bg-background/90 scale-105' : 'bg-background/70',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setTimeout(() => setIsHovered(false), 2000)}
    >
      {/* Zoom In */}
      <button
        className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center',
          'transition-all duration-200',
          'active:scale-95',
          canZoomIn
            ? 'text-foreground/80 hover:text-foreground hover:bg-accent/50'
            : 'text-muted-foreground/30 cursor-not-allowed'
        )}
        onClick={handleZoomIn}
        disabled={!canZoomIn}
        aria-label="Aumentar zoom"
      >
        <ZoomIn className="h-4 w-4" />
      </button>

      {/* Zoom Percentage - clicável para reset */}
      <button
        className={cn(
          'h-7 w-9 rounded-full flex items-center justify-center',
          'text-[10px] font-semibold tabular-nums',
          'text-foreground/70 hover:text-foreground hover:bg-accent/50',
          'transition-all duration-200 active:scale-95'
        )}
        onClick={handleReset}
        aria-label={`Zoom: ${zoomPercentage}% (toque para ajustar)`}
      >
        {zoomPercentage}%
      </button>

      {/* Zoom Out */}
      <button
        className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center',
          'transition-all duration-200',
          'active:scale-95',
          canZoomOut
            ? 'text-foreground/80 hover:text-foreground hover:bg-accent/50'
            : 'text-muted-foreground/30 cursor-not-allowed'
        )}
        onClick={handleZoomOut}
        disabled={!canZoomOut}
        aria-label="Diminuir zoom"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
    </div>
  )
}
