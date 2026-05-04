'use client'

import * as React from 'react'
import Image from 'next/image'
import { Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useImproveQueueStore } from '@/stores/improve-queue-store'

interface ImproveTarget {
  id: string
  projectId: number
  resultUrl: string | null
  templateName?: string | null
}

interface ImproveCreativeModalProps {
  generation: ImproveTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MIN_CHARS = 3
const MAX_CHARS = 500
const PLACEHOLDER =
  'Ex: Mude o texto para Happy Hour, das 16h às 20h e adicione pessoas brindando'

export function ImproveCreativeModal({
  generation,
  open,
  onOpenChange,
}: ImproveCreativeModalProps) {
  const { toast } = useToast()
  const addJob = useImproveQueueStore((s) => s.addJob)
  const [userRequest, setUserRequest] = React.useState('')

  const handleClose = () => {
    setUserRequest('')
    onOpenChange(false)
  }

  const handleConfirm = () => {
    if (!generation) return
    const trimmed = userRequest.trim()
    if (trimmed.length < MIN_CHARS) return

    addJob({
      generationId: generation.id,
      projectId: generation.projectId,
      generationThumbnailUrl: generation.resultUrl,
      generationLabel: generation.templateName ?? 'Criativo',
      userRequest: trimmed,
    })

    toast({
      title: 'Adicionado à fila',
      description: 'A melhoria começa em instantes — você pode adicionar mais.',
    })
    setUserRequest('')
    onOpenChange(false)
  }

  const isDisabled = userRequest.trim().length < MIN_CHARS

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Melhorar com IA
          </DialogTitle>
          <DialogDescription>
            A IA mantém o fundo, fontes, logo e cores da arte original. Ela ajusta hierarquia,
            espaçamentos e textos conforme o seu pedido. Custa 25 créditos por melhoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {generation?.resultUrl && (
            <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 p-3">
              <div className="relative h-20 w-20 overflow-hidden rounded-md bg-background flex-shrink-0">
                <Image
                  src={generation.resultUrl}
                  alt={generation.templateName ?? 'Criativo original'}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Original</p>
                <p className="text-sm font-medium truncate">
                  {generation.templateName ?? 'Criativo'}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="user-request">Seu pedido</Label>
              <span className="text-xs text-muted-foreground">
                {userRequest.length}/{MAX_CHARS}
              </span>
            </div>
            <Textarea
              id="user-request"
              placeholder={PLACEHOLDER}
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value.slice(0, MAX_CHARS))}
              rows={5}
              className="resize-none"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Acompanhe o status no indicador flutuante do canto inferior direito.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isDisabled}>
            <Sparkles className="mr-2 h-4 w-4" />
            Adicionar à fila (25 créditos)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
