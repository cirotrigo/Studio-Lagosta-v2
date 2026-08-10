'use client'

/**
 * Prévia da arte pronta, antes de agendar.
 *
 * O card mostra miniaturas de 44px — bom para saber o que já ficou pronto,
 * inútil para JULGAR a arte. E agendar sem ver é exatamente o que a casa não
 * faz: a conferência visual é passo do checklist.
 *
 * No carrossel, a navegação entre slides é o ponto: o que se avalia não é
 * cada peça isolada, é a série lado a lado.
 */

import * as React from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface PreviewSlide {
  ordem: number
  url: string
  legenda?: string
}

interface Props {
  slides: PreviewSlide[]
  /** Slide inicial (ordem). */
  inicial?: number
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo?: string
}

export function BancadaPreview({ slides, inicial, open, onOpenChange, titulo }: Props) {
  const ordenados = React.useMemo(
    () => slides.slice().sort((a, b) => a.ordem - b.ordem),
    [slides],
  )
  const [indice, setIndice] = React.useState(0)

  // Ao abrir, começa no slide que a pessoa clicou.
  React.useEffect(() => {
    if (!open) return
    const alvo = ordenados.findIndex((s) => s.ordem === inicial)
    setIndice(alvo >= 0 ? alvo : 0)
  }, [open, inicial, ordenados])

  const ir = React.useCallback(
    (passo: number) => {
      setIndice((i) => {
        const proximo = i + passo
        if (proximo < 0) return ordenados.length - 1
        if (proximo >= ordenados.length) return 0
        return proximo
      })
    },
    [ordenados.length],
  )

  // Setas do teclado: é como se navega um carrossel, e sem isso a pessoa
  // precisa mirar em botões pequenos para comparar dois slides.
  React.useEffect(() => {
    if (!open || ordenados.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') ir(1)
      if (e.key === 'ArrowLeft') ir(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, ordenados.length, ir])

  const atual = ordenados[indice]
  if (!atual) return null
  const varios = ordenados.length > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">
            {titulo ?? 'Prévia'}
            {varios && (
              <span className="ml-2 font-normal text-muted-foreground">
                slide {atual.ordem} de {ordenados.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex items-center justify-center">
          {varios && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute left-1 z-10 h-9 w-9 rounded-full opacity-90"
              onClick={() => ir(-1)}
              title="Slide anterior (←)"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}

          {/* max-h em vh: medido como classe que GERA css neste repo, ao
              contrário de h-[…vh] (ver a nota de classes mortas). */}
          <div className="relative max-h-[70vh] w-full">
            <Image
              src={atual.url}
              alt={`Slide ${atual.ordem}`}
              width={1080}
              height={1350}
              className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
              unoptimized
            />
          </div>

          {varios && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-1 z-10 h-9 w-9 rounded-full opacity-90"
              onClick={() => ir(1)}
              title="Próximo slide (→)"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}
        </div>

        {atual.legenda && (
          <p className="text-center text-xs text-muted-foreground">{atual.legenda}</p>
        )}

        {varios && (
          <div className="flex justify-center gap-1.5">
            {ordenados.map((s, i) => (
              <button
                key={s.ordem}
                type="button"
                onClick={() => setIndice(i)}
                title={`Slide ${s.ordem}`}
                className={cn(
                  'relative h-16 w-12 overflow-hidden rounded border-2 transition-colors',
                  i === indice ? 'border-primary' : 'border-border/40 opacity-70 hover:opacity-100',
                )}
              >
                <Image
                  src={s.url}
                  alt={`Slide ${s.ordem}`}
                  fill
                  sizes="48px"
                  className="object-cover"
                  unoptimized
                />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
