import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface ProjectElement {
  id: number
  name: string
  fileUrl: string
  category: string | null
  projectId: number
}

/** Elementos da aba Elementos do projeto (ícones, selos, ornamentos) */
export function useProjectElements(projectId: number | null | undefined) {
  return useQuery<ProjectElement[]>({
    queryKey: ['project-elements', projectId],
    // `api.get` devolve TEXTO quando a resposta não é JSON (redirect para o
    // login, por exemplo): lista ou nada, nunca string no lugar de array
    queryFn: async () => {
      const data = await api.get<unknown>(`/api/projects/${projectId}/elements`)
      return Array.isArray(data) ? (data as ProjectElement[]) : []
    },
    enabled: typeof projectId === 'number' && projectId > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}
