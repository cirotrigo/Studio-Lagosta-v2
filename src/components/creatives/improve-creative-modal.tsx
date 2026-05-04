'use client'

import * as React from 'react'
import Image from 'next/image'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Loader2 } from 'lucide-react'
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
import { api, ApiError } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'

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
  onSuccess?: () => void
}

const MIN_CHARS = 3
const MAX_CHARS = 500
const PLACEHOLDER =
  'Ex: Mude o texto para Happy Hour, das 16h às 20h e adicione pessoas brindando'

interface ImproveResponse {
  success: boolean
  creditsRemaining: number
  generation: { id: string; resultUrl: string | null; fileName: string | null }
}

export function ImproveCreativeModal({
  generation,
  open,
  onOpenChange,
  onSuccess,
}: ImproveCreativeModalProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [userRequest, setUserRequest] = React.useState('')

  const mutation = useMutation<ImproveResponse, ApiError, string>({
    mutationFn: (request) =>
      api.post<ImproveResponse>(`/api/generations/${generation?.id}/improve`, {
        userRequest: request,
      }),
    onSuccess: () => {
      if (generation) {
        queryClient.invalidateQueries({ queryKey: ['generations', generation.projectId] })
      }
      queryClient.invalidateQueries({ queryKey: ['all-generations'] })
      toast({
        title: 'Criativo melhorado',
        description: 'A nova versão já está disponível na galeria.',
      })
      setUserRequest('')
      onOpenChange(false)
      onSuccess?.()
    },
    onError: (error) => {
      const description =
        error.status === 402
          ? 'Créditos insuficientes para melhorar criativos.'
          : error.message || 'Não foi possível melhorar o criativo.'
      toast({ title: 'Falha na melhoria', description, variant: 'destructive' })
    },
  })

  const handleClose = () => {
    if (mutation.isPending) return
    setUserRequest('')
    onOpenChange(false)
  }

  const handleConfirm = () => {
    const trimmed = userRequest.trim()
    if (trimmed.length < MIN_CHARS) return
    mutation.mutate(trimmed)
  }

  const isDisabled =
    mutation.isPending || userRequest.trim().length < MIN_CHARS

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
              disabled={mutation.isPending}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Descreva o que você quer alterar. Pode incluir mudanças de texto, ajustes de
              hierarquia ou novos elementos visuais.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isDisabled}>
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Melhorando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Melhorar (25 créditos)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
