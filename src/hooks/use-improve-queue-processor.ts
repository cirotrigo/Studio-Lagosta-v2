'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'
import { useImproveQueueStore } from '@/stores/improve-queue-store'

interface ImproveResponse {
  success: boolean
  generation: { id: string; resultUrl: string | null; fileName: string | null }
}

/**
 * Processa a fila de melhorias serialmente: pega o próximo `pending`, marca
 * como `processing`, chama a API, e ao terminar marca como `completed`/`failed`.
 *
 * Deve ser montado uma única vez (pelo provider) — usa um ref pra evitar dupla
 * execução em re-renders.
 */
export function useImproveQueueProcessor() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const isRunningRef = React.useRef(false)

  // Subscribe a apenas: lista de jobs (referência) + flag de hidratação.
  // Ações são lidas via getState() pra evitar re-runs do effect.
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
      const response = await api.post<ImproveResponse>(
        `/api/generations/${next.generationId}/improve`,
        { userRequest: next.userRequest }
      )

      useImproveQueueStore.getState().markCompleted(next.id, {
        resultGenerationId: response.generation.id,
        resultUrl: response.generation.resultUrl,
      })

      // Invalida queries pra galeria atualizar
      queryClient.invalidateQueries({ queryKey: ['generations', next.projectId] })
      queryClient.invalidateQueries({ queryKey: ['all-generations'] })

      toast({
        title: 'Criativo melhorado',
        description: `"${next.generationLabel}" disponível na galeria.`,
      })
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

  // Dispara processamento sempre que a lista mudar (e não esteja rodando).
  React.useEffect(() => {
    if (!hasHydrated) return
    if (isRunningRef.current) return
    const hasPending = jobs.some((j) => j.status === 'pending')
    if (hasPending) {
      void processNext()
    }
  }, [jobs, hasHydrated, processNext])
}
