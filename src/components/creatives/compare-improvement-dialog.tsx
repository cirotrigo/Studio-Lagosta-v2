'use client'

import * as React from 'react'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { FeedbackDeArte } from '@/components/creatives/feedback-de-arte'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api-client'

export interface CompareTarget {
  id: string
  /** Arte melhorada (a Generation deste card). */
  resultUrl: string | null
  templateName?: string | null
  /** Generation original — vem da coluna sourceGenerationId. */
  sourceGenerationId: string
  /** Pedido usado na melhoria (fieldValues.userRequest), para o "melhorar de novo". */
  userRequest?: string | null
}

interface CompareImprovementDialogProps {
  target: CompareTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Reabre o ImproveCreativeModal pré-preenchido com o pedido gravado.
   * Quem implementa PRECISA montar o ImproveTarget com
   * `origem.ehMelhoria: true`: a arte deste dialog é sempre uma melhoria
   * (tem `sourceGenerationId`), e o modo padrão de quem itera uma melhoria é
   * "só o que eu pedir" (05/09/2026, `docs/PLANO-2026-09-05-ARTES-COMO-O-CHATGPT.md`).
   * Este dialog não monta o modal — só devolve o alvo.
   */
  onImproveAgain?: (target: CompareTarget) => void
}

interface OriginalGeneration {
  id: string
  resultUrl: string | null
  templateName?: string | null
}

/**
 * Antes/depois de uma melhoria com IA: a arte original (via
 * sourceGenerationId) lado a lado com a melhorada. A original pode ter sido
 * apagada — a coluna não tem FK de propósito — então o lado "antes" degrada
 * para um aviso em vez de quebrar o dialog.
 */
export function CompareImprovementDialog({
  target,
  open,
  onOpenChange,
  onImproveAgain,
}: CompareImprovementDialogProps) {
  const sourceId = target?.sourceGenerationId

  const {
    data: original,
    isLoading,
    isError,
  } = useQuery<OriginalGeneration>({
    queryKey: ['generation', sourceId],
    queryFn: () => api.get<OriginalGeneration>(`/api/generations/${sourceId}`),
    enabled: open && !!sourceId,
    staleTime: 5 * 60_000,
    retry: false, // 404 (original apagada) não merece retry
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Antes e depois
          </DialogTitle>
          <DialogDescription>
            {target?.templateName ?? 'Criativo'} — original à esquerda, melhoria com IA à direita.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 overflow-y-auto py-2">
          <figure className="space-y-2">
            <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Antes
            </figcaption>
            {isLoading ? (
              <Skeleton className="aspect-[9/16] w-full rounded-md" />
            ) : isError || !original?.resultUrl ? (
              <div className="flex aspect-[9/16] w-full items-center justify-center rounded-md border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
                A arte original não está mais disponível (criativo apagado).
              </div>
            ) : (
              <Image
                src={original.resultUrl}
                alt="Arte original"
                width={540}
                height={960}
                className="h-auto w-full rounded-md border border-border/40"
              />
            )}
          </figure>

          <figure className="space-y-2">
            <figcaption className="text-xs font-medium uppercase tracking-wide text-primary">
              Depois (melhorada)
            </figcaption>
            {target?.resultUrl ? (
              <Image
                src={target.resultUrl}
                alt="Arte melhorada"
                width={540}
                height={960}
                className="h-auto w-full rounded-md border border-primary/40"
              />
            ) : (
              <div className="flex aspect-[9/16] w-full items-center justify-center rounded-md border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
                Sem imagem disponível.
              </div>
            )}
          </figure>
        </div>

        {target?.userRequest ? (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Pedido usado:</span> {target.userRequest}
          </p>
        ) : null}

        {/* O "como ficou?" logo depois de ver antes/depois — um clique, e é a
            única medida de qualidade da melhoria que não é palpite. */}
        {target ? <FeedbackDeArte generationId={target.id} superficie="galeria" /> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {onImproveAgain && target && (
            <Button onClick={() => onImproveAgain(target)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Melhorar de novo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
