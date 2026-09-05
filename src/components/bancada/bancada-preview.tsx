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
import { FeedbackDeArte } from '@/components/creatives/feedback-de-arte'
import { ImproveCreativeModal } from '@/components/creatives/improve-creative-modal'
import { useBancadaStore } from '@/stores/bancada-store'
import { useMelhoriaDoItemDaBancada } from '@/stores/improve-queue-store'
import type { ViaDoItem } from '@/lib/planos/vocabulario'
import { Sparkles } from 'lucide-react'

export interface PreviewSlide {
  ordem: number
  url: string
  legenda?: string
}

/**
 * De qual arte é esta imagem — resolvido pela própria fila.
 *
 * A prévia recebe URLs, não ids, e o feedback precisa da Generation (é ela que
 * guarda o prompt que produziu a peça). Em vez de pedir mais um campo a quem
 * chama, o dado é procurado onde ele já está: a fila da bancada guarda
 * `generationId` e `projectId` em cada item e em cada slide de carrossel.
 *
 * URL que não pertence à fila (nada hoje) simplesmente não mostra o rodapé —
 * arte sem Generation não tem prompt para aprender.
 */
function useArteDaFila(url: string | undefined) {
  const itens = useBancadaStore((s) => s.itens)
  return React.useMemo(() => {
    if (!url) return null
    for (const item of itens) {
      if (item.resultUrl === url && item.generationId) {
        return {
          generationId: item.generationId,
          projectId: item.projectId,
          itemDePlanoId: item.itemDePlanoId ?? null,
          planoId: item.planoId ?? null,
          slideOrdem: null as number | null,
          titulo: item.tema ?? null,
          via: item.via ?? null,
        }
      }
      for (const slide of item.slides ?? []) {
        if (slide.resultUrl === url && slide.generationId) {
          return {
            generationId: slide.generationId,
            projectId: item.projectId,
            itemDePlanoId: item.itemDePlanoId ?? null,
            planoId: item.planoId ?? null,
            slideOrdem: slide.ordem ?? null,
            titulo: item.tema ?? null,
            via: item.via ?? null,
          }
        }
      }
    }
    return null
  }, [itens, url])
}

/**
 * A origem da arte da bancada, DERIVADA da via do item — a fila não guarda o
 * `fieldValues.source` da Generation, só o id. O mapa segue o que cada via
 * grava ao persistir: `compor` → `compositor` (persistencia.ts), `template` →
 * `arte-rapida` (createArteRapida), `ia` → `arte-ia` (creative-generation-runner).
 * Serve para o modo padrão da melhoria (05/09/2026): a peça do compositor
 * preserva a diagramação; as outras duas redesenham.
 */
function origemPelaVia(via: ViaDoItem | null): { source: string | null } {
  if (via === 'compor') return { source: 'compositor' }
  if (via === 'template') return { source: 'arte-rapida' }
  if (via === 'ia') return { source: 'arte-ia' }
  return { source: null }
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
  // Hook antes de qualquer saída antecipada — a prévia sem slides ainda monta.
  const arte = useArteDaFila(atual?.url)
  const [melhorarAberto, setMelhorarAberto] = React.useState(false)
  const melhoriaEmAndamento = useMelhoriaDoItemDaBancada(arte?.itemDePlanoId)
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

        {/* O julgamento da peça, no rodapé: é aqui que a arte é olhada de
            verdade antes de ir para a agenda. Um clique resolve; o texto só
            aparece em "preciso melhorar". */}
        {arte && (
          <div className="flex flex-col gap-3">
            <FeedbackDeArte generationId={arte.generationId} superficie="bancada" projectId={arte.projectId} />
            {/*
              A porta da BANCADA para a melhoria (F3, 02/09/2026): a mesma
              melhoria da agenda, com a mesma régua. Só existe quando o card
              veio do plano — item local nunca esteve no servidor, e não há
              como o runner reapontar o que não existe lá.
            */}
            {arte.itemDePlanoId && arte.planoId && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!melhoriaEmAndamento}
                  onClick={() => setMelhorarAberto(true)}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {melhoriaEmAndamento ? 'Melhorando…' : 'Melhorar com IA'}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
      {arte && arte.itemDePlanoId && arte.planoId && (
        <ImproveCreativeModal
          generation={{
            id: arte.generationId,
            projectId: arte.projectId,
            resultUrl: atual.url,
            templateName: arte.titulo ?? titulo ?? 'Arte da bancada',
            applyToItemDePlanoId: arte.itemDePlanoId,
            applyToPlanoId: arte.planoId,
            applyToSlideOrdem: arte.slideOrdem,
            origem: origemPelaVia(arte.via),
          }}
          open={melhorarAberto}
          onOpenChange={setMelhorarAberto}
        />
      )}
    </Dialog>
  )
}
