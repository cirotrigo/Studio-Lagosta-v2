'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'
import { useImproveQueueStore } from '@/stores/improve-queue-store'
import { pollGenerationStatus } from '@/lib/ai/poll-generation'

interface StartImproveResponse {
  success: boolean
  generation: { id: string; status: 'PROCESSING' }
}

/**
 * Processa a fila serialmente:
 * 1) POST /improve para iniciar a melhoria (servidor cria Generation PROCESSING e retorna 202)
 * 2) Polling em GET /api/generations/{id} a cada 4s até status virar COMPLETED ou FAILED
 *
 * Usa um ref pra evitar dupla execução em re-renders. Montar uma única vez (provider).
 */
export function useImproveQueueProcessor() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const isRunningRef = React.useRef(false)

  const jobs = useImproveQueueStore((s) => s.jobs)
  const hasHydrated = useImproveQueueStore((s) => s.hasHydrated)

  const processNext = React.useCallback(async () => {
    if (isRunningRef.current) return

    const store = useImproveQueueStore.getState()
    const next = store.jobs.find((j) => j.status === 'pending')
    if (!next) return

    isRunningRef.current = true
    store.setProcessing(true)
    store.markProcessing(next.id)

    try {
      const startResponse = await api.post<StartImproveResponse>(
        `/api/generations/${next.generationId}/improve`,
        {
          userRequest: next.userRequest,
          // O modo só vai quando o modal o escolheu — job antigo (sem o campo)
          // deixa o servidor decidir o padrão (05/09/2026).
          ...(next.modo ? { modo: next.modo } : {}),
          ...(next.instrucaoImagem ? { instrucaoImagem: next.instrucaoImagem } : {}),
          ...(next.backgroundImageUrl ? { backgroundImageUrl: next.backgroundImageUrl } : {}),
          ...(next.selectedLogoIds && next.selectedLogoIds.length > 0
            ? { selectedLogoIds: next.selectedLogoIds }
            : {}),
          ...(next.selectedElementIds && next.selectedElementIds.length > 0
            ? { selectedElementIds: next.selectedElementIds }
            : {}),
          ...(next.applyToPostId ? { applyToPostId: next.applyToPostId } : {}),
          ...(next.sourceImageUrl ? { sourceImageUrl: next.sourceImageUrl } : {}),
          ...(typeof next.applyToPostMediaIndex === 'number'
            ? { applyToPostMediaIndex: next.applyToPostMediaIndex }
            : {}),
          ...(next.applyToItemDePlanoId ? { applyToItemDePlanoId: next.applyToItemDePlanoId } : {}),
          ...(next.applyToPlanoId ? { applyToPlanoId: next.applyToPlanoId } : {}),
          ...(typeof next.applyToSlideOrdem === 'number' ? { applyToSlideOrdem: next.applyToSlideOrdem } : {}),
        }
      )

      const serverGenerationId = startResponse.generation.id
      useImproveQueueStore.getState().attachServerJob(next.id, serverGenerationId)

      // Polling
      const finalStatus = await pollGenerationStatus(serverGenerationId)

      if (finalStatus.status === 'COMPLETED') {
        useImproveQueueStore.getState().markCompleted(next.id, {
          resultGenerationId: finalStatus.id,
          resultUrl: finalStatus.resultUrl,
        })
        queryClient.invalidateQueries({ queryKey: ['generations', next.projectId] })
        queryClient.invalidateQueries({ queryKey: ['all-generations'] })
        // Painel Criativos do editor. Invalidar por prefixo (sem o templateId,
        // que a fila não conhece) atinge o painel aberto sem depender do
        // polling — que o navegador pausa quando a aba está em segundo plano.
        queryClient.invalidateQueries({ queryKey: ['template-creatives'] })
        if (next.applyToItemDePlanoId) {
          // O servidor reapontou o item da fila — a bancada re-hidrata do plano.
          queryClient.invalidateQueries({ queryKey: ['plano', next.projectId] })
          queryClient.invalidateQueries({ queryKey: ['planos', next.projectId] })
        }
        if (next.applyToPostId) {
          // O servidor já aplicou a arte no post — aqui só refresca a agenda.
          queryClient.invalidateQueries({ queryKey: ['social-posts', next.projectId] })
          queryClient.invalidateQueries({ queryKey: ['social-post', next.applyToPostId] })
          queryClient.invalidateQueries({ queryKey: ['agenda-posts', next.projectId] })
        }
        toast({
          title: 'Criativo melhorado',
          description: next.applyToPostId
            ? `"${next.generationLabel}" — a arte do post agendado foi atualizada.`
            : next.applyToItemDePlanoId
              ? `"${next.generationLabel}" — o card da bancada já mostra a arte nova.`
              : `"${next.generationLabel}" disponível na galeria.`,
        })
      } else {
        const errorMessage = finalStatus.fieldValues?.error || 'Falha desconhecida no servidor'
        useImproveQueueStore.getState().markFailed(next.id, errorMessage)
        toast({
          title: 'Falha na melhoria',
          description: `"${next.generationLabel}": ${errorMessage}`,
          variant: 'destructive',
        })
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 402
            ? 'Créditos insuficientes'
            : error.message
          : error instanceof Error
            ? error.message
            : 'Erro desconhecido'

      useImproveQueueStore.getState().markFailed(next.id, message)
      toast({
        title: 'Falha na melhoria',
        description: `"${next.generationLabel}": ${message}`,
        variant: 'destructive',
      })
    } finally {
      isRunningRef.current = false
      useImproveQueueStore.getState().setProcessing(false)
    }
  }, [queryClient, toast])

  React.useEffect(() => {
    if (!hasHydrated) return
    if (isRunningRef.current) return
    const hasPending = jobs.some((j) => j.status === 'pending')
    if (hasPending) {
      void processNext()
    }
  }, [jobs, hasHydrated, processNext])
}
