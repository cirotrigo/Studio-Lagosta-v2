/**
 * Custom hooks for music stem processing
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface StemJobStatus {
  id: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  mvsepStatus: string | null
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

interface MusicStemStatusResponse {
  musicId: number
  hasPercussionStem: boolean
  percussionUrl: string | null
  stemsProcessedAt: string | null
  job: StemJobStatus | null
}

/**
 * Hook para obter o status do processamento de stems de uma música
 * Faz polling automático quando está processando
 */
export function useMusicStemStatus(musicId: number | null | undefined) {
  return useQuery<MusicStemStatusResponse>({
    queryKey: ['music-stem-status', musicId],
    queryFn: () => api.get(`/api/biblioteca-musicas/${musicId}/stem-status`),
    enabled: !!musicId, // Só executar se musicId estiver definido
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data?.job) return false

      // Polling a cada 5 segundos se estiver processando
      if (data.job.status === 'processing') return 5000

      // Polling a cada 30 segundos se estiver pendente
      if (data.job.status === 'pending') return 30000

      // Não fazer polling se completo ou falhou
      return false
    },
    staleTime: 5000,
    gcTime: 10 * 60_000, // 10 minutos
  })
}

/**
 * Hook para reprocessar stems de uma música (retry)
 */
export function useReprocessStem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (musicId: number) =>
      api.post(`/api/biblioteca-musicas/${musicId}/reprocess-stem`),
    onSuccess: (_, musicId) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: ['music-stem-status', musicId] })
      queryClient.invalidateQueries({ queryKey: ['music', musicId] })
      queryClient.invalidateQueries({ queryKey: ['music-library'] })
    },
  })
}
