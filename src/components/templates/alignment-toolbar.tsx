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
  Palette,
  LayoutGrid,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
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
  // Rich Text conversion
  selectedLayerType?: 'text' | 'rich-text' | 'image' | 'logo' | 'element' | string
  onConvertToRichText?: () => void
}

/**
 * Toolbar de alinhamento simplificada.
 *
 * Expostos: centralizar no canvas (H/V), ordem de camadas (frente/trás/subir/
 * descer) e conversão para Rich Text. Os alinhamentos de seleção múltipla
 * (esquerda/centro/direita, topo/meio/fundo, distribuição) ficam agrupados em
 * um popover — eles só fazem sentido com 2+ camadas selecionadas.
 */
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
  selectedLayerType,
  onConvertToRichText,
}: AlignmentToolbarProps) {
  const alignDisabled = disabled || selectedCount < 2
  const distributeDisabled = disabled || selectedCount < 3
  const orderDisabled = disabled || selectedCount === 0
  const canvasAlignDisabled = disabled || selectedCount === 0
  const showRichTextButton = selectedLayerType === 'text' && selectedCount === 1

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60', className)}>
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

        <Separator orientation="vertical" className="h-6" />

        {/* Alinhamentos de seleção múltipla - agrupados */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={alignDisabled}
                  className="h-8 w-8 p-0"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Alinhar seleção múltipla</p>
              <p className="text-xs text-muted-foreground">Requer 2+ camadas selecionadas</p>
            </TooltipContent>
          </Tooltip>
          <PopoverContent align="start" className="w-auto space-y-3 p-3">
            <div className="flex items-center gap-2">
              <Label className="w-16 text-xs text-muted-foreground">Alinhar</Label>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="sm" disabled={alignDisabled} onClick={onAlignLeft} className="h-8 w-8 p-0" title="Alinhar à esquerda (Shift+Ctrl+L)">
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={alignDisabled} onClick={onAlignCenterH} className="h-8 w-8 p-0" title="Centralizar horizontalmente (Shift+Ctrl+C)">
                  <AlignCenter className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={alignDisabled} onClick={onAlignRight} className="h-8 w-8 p-0" title="Alinhar à direita (Shift+Ctrl+R)">
                  <AlignRight className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="mx-1 h-6" />
                <Button variant="ghost" size="sm" disabled={alignDisabled} onClick={onAlignTop} className="h-8 w-8 p-0" title="Alinhar ao topo (Shift+Ctrl+T)">
                  <AlignVerticalJustifyStart className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={alignDisabled} onClick={onAlignMiddleV} className="h-8 w-8 p-0" title="Centralizar verticalmente (Shift+Ctrl+M)">
                  <AlignVerticalJustifyCenter className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={alignDisabled} onClick={onAlignBottom} className="h-8 w-8 p-0" title="Alinhar ao fundo (Shift+Ctrl+B)">
                  <AlignVerticalJustifyEnd className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="w-16 text-xs text-muted-foreground">Distribuir</Label>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="sm" disabled={distributeDisabled} onClick={onDistributeH} className="h-8 w-8 p-0" title="Distribuir horizontalmente (Shift+Ctrl+H) — requer 3+ camadas">
                  <AlignHorizontalDistributeCenter className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={distributeDisabled} onClick={onDistributeV} className="h-8 w-8 p-0" title="Distribuir verticalmente (Shift+Ctrl+V) — requer 3+ camadas">
                  <AlignVerticalDistributeCenter className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Rich Text Conversion - só aparece para texto simples */}
        {showRichTextButton && onConvertToRichText && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onConvertToRichText}
                    className="h-8 w-8 p-0"
                  >
                    <Palette className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Converter para Rich Text</p>
                  <p className="text-xs text-muted-foreground">Permite múltiplas cores/fontes</p>
                  <p className="text-xs text-muted-foreground">Duplo-clique no texto para editar</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
