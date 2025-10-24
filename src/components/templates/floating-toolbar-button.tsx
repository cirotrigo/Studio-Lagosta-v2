'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingToolbarButtonProps {
  /** Se o drawer está aberto */
  isOpen: boolean
  /** Callback para alternar drawer */
  onToggle: () => void
  /** Classes CSS adicionais */
  className?: string
}

/**
 * FloatingToolbarButton - Botão flutuante para abrir menu de ferramentas
 *
 * Funcionalidades:
 * - Toggle entre ícone de menu e X
 * - Animação de rotação suave
 * - Touch target adequado (56x56px - Material Design)
 * - Shadow elevada para destacar do canvas
 * - Posicionamento fixo no canto inferior esquerdo
 */
export function FloatingToolbarButton({
  isOpen,
  onToggle,
  className,
}: FloatingToolbarButtonProps) {
  return (
    <Button
      size="icon"
      variant="default"
      className={cn(
        'fixed bottom-20 left-4 z-[10000]',
        'h-14 w-14 rounded-full shadow-xl hover:shadow-2xl',
        'transition-all duration-300',
        isOpen && 'rotate-90',
        className
      )}
      onClick={onToggle}
      aria-label={isOpen ? 'Fechar ferramentas' : 'Abrir ferramentas'}
      style={{ pointerEvents: 'auto' }}
    >
      {isOpen ? (
        <X className="h-6 w-6" />
      ) : (
        <Menu className="h-6 w-6" />
      )}
    </Button>
  )
}
