"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  BringToFront,
  SendToBack,
  ArrowUp,
  ArrowDown,
  LayoutPanelTop,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface AlignmentToolbarProps {
  disabled?: boolean
  selectedCount: number
  onAlignLeft: () => void
  onAlignCenterH: () => void
  onAlignRight: () => void
  onAlignTop: () => void
  onAlignMiddleV: () => void
  onAlignBottom: () => void
  onDistributeH: () => void
  onDistributeV: () => void
  onBringToFront: () => void
  onSendToBack: () => void
  onMoveForward: () => void
  onMoveBackward: () => void
  onAlignToCanvasCenterH: () => void
  onAlignToCanvasCenterV: () => void
  className?: string
}

export function AlignmentToolbar({
  disabled = false,
  selectedCount,
  onAlignLeft,
  onAlignCenterH,
  onAlignRight,
  onAlignTop,
  onAlignMiddleV,
  onAlignBottom,
  onDistributeH,
  onDistributeV,
  onBringToFront,
  onSendToBack,
  onMoveForward,
  onMoveBackward,
  onAlignToCanvasCenterH,
  onAlignToCanvasCenterV,
  className,
}: AlignmentToolbarProps) {
  const alignDisabled = disabled || selectedCount < 2
  const distributeDisabled = disabled || selectedCount < 3
  const orderDisabled = disabled || selectedCount === 0
  const canvasAlignDisabled = disabled || selectedCount === 0

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60', className)}>
        {/* Horizontal Alignment */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={alignDisabled}
                onClick={onAlignLeft}
                className="h-8 w-8 p-0"
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Alinhar à esquerda</p>
              <p className="text-xs text-muted-foreground">Shift+Ctrl+L</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={alignDisabled}
                onClick={onAlignCenterH}
                className="h-8 w-8 p-0"
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Centralizar horizontalmente</p>
              <p className="text-xs text-muted-foreground">Shift+Ctrl+C</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={alignDisabled}
                onClick={onAlignRight}
                className="h-8 w-8 p-0"
              >
                <AlignRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Alinhar à direita</p>
              <p className="text-xs text-muted-foreground">Shift+Ctrl+R</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Vertical Alignment */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={alignDisabled}
                onClick={onAlignTop}
                className="h-8 w-8 p-0"
              >
                <AlignVerticalJustifyStart className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Alinhar ao topo</p>
              <p className="text-xs text-muted-foreground">Shift+Ctrl+T</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={alignDisabled}
                onClick={onAlignMiddleV}
                className="h-8 w-8 p-0"
              >
                <AlignVerticalJustifyCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Centralizar verticalmente</p>
              <p className="text-xs text-muted-foreground">Shift+Ctrl+M</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={alignDisabled}
                onClick={onAlignBottom}
                className="h-8 w-8 p-0"
              >
                <AlignVerticalJustifyEnd className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Alinhar ao fundo</p>
              <p className="text-xs text-muted-foreground">Shift+Ctrl+B</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Distribution */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={distributeDisabled}
                onClick={onDistributeH}
                className="h-8 w-8 p-0"
              >
                <AlignHorizontalDistributeCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Distribuir horizontalmente</p>
              <p className="text-xs text-muted-foreground">Shift+Ctrl+H</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={distributeDisabled}
                onClick={onDistributeV}
                className="h-8 w-8 p-0"
              >
                <AlignVerticalDistributeCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Distribuir verticalmente</p>
              <p className="text-xs text-muted-foreground">Shift+Ctrl+V</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Canvas Alignment */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={canvasAlignDisabled}
                onClick={onAlignToCanvasCenterH}
                className="h-8 w-8 p-0"
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Centralizar no canvas (H)</p>
              <p className="text-xs text-muted-foreground">Shift+Alt+C</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={canvasAlignDisabled}
                onClick={onAlignToCanvasCenterV}
                className="h-8 w-8 p-0"
              >
                <AlignVerticalJustifyCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Centralizar no canvas (V)</p>
              <p className="text-xs text-muted-foreground">Shift+Alt+M</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Layer Ordering */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={orderDisabled}
                onClick={onBringToFront}
                className="h-8 w-8 p-0"
              >
                <BringToFront className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Trazer para frente</p>
              <p className="text-xs text-muted-foreground">Ctrl+]</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={orderDisabled}
                onClick={onSendToBack}
                className="h-8 w-8 p-0"
              >
                <SendToBack className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Enviar para trás</p>
              <p className="text-xs text-muted-foreground">Ctrl+[</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={orderDisabled}
                onClick={onMoveForward}
                className="h-8 w-8 p-0"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Mover para frente</p>
              <p className="text-xs text-muted-foreground">Ctrl+Shift+]</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={orderDisabled}
                onClick={onMoveBackward}
                className="h-8 w-8 p-0"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Mover para trás</p>
              <p className="text-xs text-muted-foreground">Ctrl+Shift+[</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
