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
    // `api.get` devolve TEXTO quando a resposta não é JSON — foi assim que um
    // redirect para /sign-in (HTML, 200) virou `colors.map is not a function`
    // e derrubou o editor inteiro (02/09/2026). Cor de marca é lista ou nada.
    queryFn: async () => {
      const data = await api.get<unknown>(`/api/projects/${projectId}/colors`)
      return Array.isArray(data) ? (data as BrandColor[]) : []
    },
    enabled: typeof projectId === 'number' && projectId > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}
