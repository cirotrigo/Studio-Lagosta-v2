import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface BrandColor {
  id: number
  name: string
  hexCode: string
  projectId: number
}

// Cache único por projeto: a paleta aparece em vários seletores de cor ao
// mesmo tempo (propriedades, efeitos, gradiente) e cada um buscava a própria
// cópia via fetch direto.
export function useBrandColors(projectId: number | null | undefined) {
  return useQuery<BrandColor[]>({
    queryKey: ['brand-colors', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/colors`),
    enabled: typeof projectId === 'number' && projectId > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}
