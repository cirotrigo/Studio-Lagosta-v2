import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { ResultadoDeRepost } from '@/lib/posts/repostar-service'

/**
 * As artes já publicadas que valem repostar no slot `quando`.
 *
 * A chave arredonda para o minuto: o formulário reemite a cada toque no
 * horário, e a mesma pergunta não precisa ir ao servidor duas vezes.
 */
export function useRepostar(
  projectId: number | null | undefined,
  quando: Date | undefined,
  opcoes: { enabled?: boolean; excluirPostId?: string } = {},
) {
  const iso = quando && !Number.isNaN(quando.getTime()) ? new Date(Math.floor(quando.getTime() / 60_000) * 60_000).toISOString() : null
  return useQuery<ResultadoDeRepost>({
    queryKey: ['repostar', projectId, iso, opcoes.excluirPostId ?? null],
    queryFn: () =>
      api.get(
        `/api/projects/${projectId}/repostar?quando=${encodeURIComponent(iso!)}${opcoes.excluirPostId ? `&excluirPostId=${encodeURIComponent(opcoes.excluirPostId)}` : ''}`,
      ),
    enabled: Boolean(projectId && iso) && opcoes.enabled !== false,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  })
}
