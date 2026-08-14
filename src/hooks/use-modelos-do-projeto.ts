import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

/**
 * Um modelo do cliente (página `isTemplate: true`), como o
 * `GET /api/projects/[id]/modelos` devolve — sem as camadas, que a escolha
 * não precisa e dominariam o payload.
 */
export interface ModeloDoProjeto {
  id: string
  name: string
  thumbnail: string | null
  width: number
  height: number
  tags: string[]
  templateId: number
  templateName: string
  /** O formato do template dono da página. */
  tipo: 'STORY' | 'FEED' | 'SQUARE'
  usedCount: number
  lastUsedAt: string | null
}

/**
 * Os modelos do projeto, na ordem da ROTAÇÃO (menos usado primeiro) — a mesma
 * que decide quando ninguém escolhe. O primeiro da lista de um formato é o que
 * a rotação usaria agora.
 */
export function useModelosDoProjeto(projectId: number, opcoes: { enabled?: boolean } = {}) {
  return useQuery<ModeloDoProjeto[]>({
    queryKey: ['modelos', projectId],
    queryFn: async () => {
      const r = await api.get<{ modelos: ModeloDoProjeto[] }>(
        `/api/projects/${projectId}/modelos`,
      )
      return r.modelos ?? []
    },
    enabled: (opcoes.enabled ?? true) && Number.isFinite(projectId) && projectId > 0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
}
