import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export interface ProjectElement {
  id: number
  name: string
  fileUrl: string
  category: string | null
  projectId: number
  uploadedBy: string
  createdAt: string
}

export function useProjectElements(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<ProjectElement[]>({
    queryKey: ['project-elements', projectId],
    queryFn: async () => {
      try {
        return await api.get<ProjectElement[]>(`/api/projects/${projectId}/elements`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    enabled: !!projectId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}
