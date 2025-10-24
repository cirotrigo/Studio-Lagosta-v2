'use client'

import * as React from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileToolsDrawerProps {
  /** Se o drawer está aberto */
  open: boolean
  /** Callback quando o drawer abrir/fechar */
  onOpenChange: (open: boolean) => void
  /** Título do drawer */
  title: string
  /** Conteúdo do drawer */
  children: React.ReactNode
  /** Classes CSS adicionais */
  className?: string
}

/**
 * Mobile Tools Drawer - Bottom Sheet inspirado no Polotno
 *
 * Funcionalidades:
 * - Desliza de baixo para cima
 * - Drag indicator (barra horizontal)
 * - Swipe down para fechar
 * - Altura adaptativa (85vh)
 * - Backdrop escurecido
 */
export function MobileToolsDrawer({
  open,
  onOpenChange,
  title,
  children,
  className,
}: MobileToolsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'h-[85vh] rounded-t-2xl border-t-2 border-border/50',
          'flex flex-col',
          className
        )}
        // Prevenir scroll do body quando drawer está aberto
        onOpenAutoFocus={(e) => {
          e.preventDefault()
        }}
      >
        {/* Drag indicator - barra para indicar que pode arrastar */}
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted-foreground/30" />

        {/* Header com título - botão X já é renderizado automaticamente pelo SheetContent */}
        <SheetHeader className="flex-shrink-0 pb-4">
          <SheetTitle className="text-lg font-semibold">
            {title}
          </SheetTitle>
        </SheetHeader>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {/* Botão fechar fixo no rodapé (opcional) */}
        <div className="flex-shrink-0 border-t border-border/40 pt-4 pb-safe">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            <ChevronDown className="mr-2 h-4 w-4" />
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Variante compacta do drawer - para ferramentas que precisam menos espaço
 */
export function MobileToolsDrawerCompact({
  open,
  onOpenChange,
  title,
  children,
  className,
}: MobileToolsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'h-[60vh] rounded-t-2xl border-t-2 border-border/50',
          'flex flex-col',
          className
        )}
      >
        {/* Drag indicator */}
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted-foreground/30" />

        {/* Header - botão X já é renderizado automaticamente pelo SheetContent */}
        <SheetHeader className="flex-shrink-0 pb-4">
          <SheetTitle className="text-base font-semibold">
            {title}
          </SheetTitle>
        </SheetHeader>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
