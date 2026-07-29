import { api } from '@/lib/api-client'

export interface GenerationStatusResponse {
  id: string
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  resultUrl: string | null
  fieldValues?: { error?: string; failedAt?: string } | null
}

const POLL_INTERVAL_MS = 4_000
const MAX_POLL_DURATION_MS = 6 * 60 * 1000 // 6 minutos
const POLL_FETCH_TIMEOUT_MS = 10_000

/**
 * Faz polling em GET /api/generations/{id} até o status virar COMPLETED ou
 * FAILED, ou até estourar o budget de 6 minutos.
 *
 * A rota de melhoria responde 202 e processa em background (`after()`), então
 * este é o único jeito de saber o desfecho. Tolerante a erros transitórios de
 * rede — re-tenta no tick seguinte em vez de desistir.
 *
 * Estourar o budget devolve FAILED para o chamador, mas **não cancela o job no
 * servidor**: ele pode terminar depois e o criativo aparece na galeria.
 */
export async function pollGenerationStatus(
  generationId: string,
): Promise<GenerationStatusResponse> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
    await sleep(POLL_INTERVAL_MS)

    try {
      const status = await api.get<GenerationStatusResponse>(
        `/api/generations/${generationId}`,
        { signal: AbortSignal.timeout(POLL_FETCH_TIMEOUT_MS) },
      )

      if (status.status === 'COMPLETED' || status.status === 'FAILED') {
        return status
      }
    } catch (error) {
      console.warn('[poll-generation] erro no polling (vai tentar de novo):', error)
    }
  }

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
