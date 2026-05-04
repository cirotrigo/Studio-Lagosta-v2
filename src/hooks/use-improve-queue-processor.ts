'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'
import { useImproveQueueStore } from '@/stores/improve-queue-store'

interface StartImproveResponse {
  success: boolean
  generation: { id: string; status: 'PROCESSING' }
}

interface GenerationStatusResponse {
  id: string
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  resultUrl: string | null
  fieldValues?: { error?: string; failedAt?: string } | null
}

const POLL_INTERVAL_MS = 4_000
const MAX_POLL_DURATION_MS = 6 * 60 * 1000 // 6 minutos
const POLL_FETCH_TIMEOUT_MS = 10_000

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
        { userRequest: next.userRequest }
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
        toast({
          title: 'Criativo melhorado',
          description: `"${next.generationLabel}" disponível na galeria.`,
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

/**
 * Faz polling até status virar COMPLETED ou FAILED, ou até estourar o budget.
 * Tolerante a erros transitórios de rede — re-tenta no próximo tick.
 */
async function pollGenerationStatus(generationId: string): Promise<GenerationStatusResponse> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
    await sleep(POLL_INTERVAL_MS)

    try {
      const status = await api.get<GenerationStatusResponse>(
        `/api/generations/${generationId}`,
        { signal: AbortSignal.timeout(POLL_FETCH_TIMEOUT_MS) }
      )

      if (status.status === 'COMPLETED' || status.status === 'FAILED') {
        return status
      }
    } catch (error) {
      // Polling tolera falhas transitórias — só dá log e continua.
      console.warn('[improve-queue] poll error (will retry):', error)
    }
  }

  // Estourou o budget de polling — considera falha sem perder o job no servidor.
  return {
    id: generationId,
    status: 'FAILED',
    resultUrl: null,
    fieldValues: { error: 'Tempo limite de espera excedido (6min). Tente novamente.' },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
