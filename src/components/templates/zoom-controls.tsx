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
import { Button } from '@/components/ui/button'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
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
          'fixed bottom-6 left-1/2 z-50 -translate-x-1/2',
          'flex items-center gap-1 rounded-full border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80',
          !showOnMobile && 'hidden md:flex',
          className
        )}
      >
        {/* Zoom Out */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={handleZoomOut}
              disabled={!canZoomOut}
            >
              <ZoomOut className="h-4 w-4" />
              <span className="sr-only">Diminuir zoom</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Diminuir zoom</p>
            <p className="text-xs text-muted-foreground">Ctrl + -</p>
          </TooltipContent>
        </Tooltip>

        {/* Zoom Percentage */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 min-w-[4rem] rounded-full px-3 text-xs font-medium tabular-nums"
              onClick={handleReset}
            >
              {zoomPercentage}%
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Resetar para 100%</p>
            <p className="text-xs text-muted-foreground">Ctrl + 0</p>
          </TooltipContent>
        </Tooltip>

        {/* Zoom In */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={handleZoomIn}
              disabled={!canZoomIn}
            >
              <ZoomIn className="h-4 w-4" />
              <span className="sr-only">Aumentar zoom</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Aumentar zoom</p>
            <p className="text-xs text-muted-foreground">Ctrl + +</p>
          </TooltipContent>
        </Tooltip>

        {/* Separator */}
        {onFitToScreen && (
          <div className="mx-1 h-6 w-px bg-border" />
        )}

        {/* Fit to Screen */}
        {onFitToScreen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={onFitToScreen}
              >
                <Maximize2 className="h-4 w-4" />
                <span className="sr-only">Ajustar à tela</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Ajustar à tela</p>
              <p className="text-xs text-muted-foreground">Centraliza e ajusta zoom</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Reset View (apenas se zoom != 1) */}
        {zoom !== 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={handleReset}
              >
                <RotateCcw className="h-4 w-4" />
                <span className="sr-only">Resetar visualização</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Resetar para 100%</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

/**
 * Versão compacta para mobile
 */
export function ZoomControlsMobile({
  zoom,
  onZoomChange,
  minZoom = 0.1,
  maxZoom = 5,
  className,
}: Omit<ZoomControlsProps, 'onFitToScreen' | 'showOnMobile'>) {
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
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50',
        'flex flex-col items-center gap-2 rounded-2xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className
      )}
    >
      {/* Zoom In */}
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full"
        onClick={handleZoomIn}
        disabled={!canZoomIn}
      >
        <ZoomIn className="h-5 w-5" />
      </Button>

      {/* Zoom Percentage - clicável para reset */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-10 rounded-full p-0 text-xs font-medium tabular-nums"
        onClick={handleReset}
      >
        {zoomPercentage}%
      </Button>

      {/* Zoom Out */}
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full"
        onClick={handleZoomOut}
        disabled={!canZoomOut}
      >
        <ZoomOut className="h-5 w-5" />
      </Button>
    </div>
  )
}
