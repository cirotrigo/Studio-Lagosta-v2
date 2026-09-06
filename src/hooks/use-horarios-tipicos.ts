import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { HorariosTipicos } from '@/lib/posts/horarios-tipicos'

/** Os horários típicos do cliente, por dia da semana — chips do bloco "Quando". */
export function useHorariosTipicos(projectId: number | null | undefined) {
  return useQuery<HorariosTipicos>({
    queryKey: ['horarios-tipicos', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/horarios-tipicos`),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })
}
