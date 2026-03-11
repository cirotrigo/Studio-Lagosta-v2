import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export interface ProjectColor {
  id: number
  name: string
  hexCode: string
  projectId: number
  uploadedBy: string
  createdAt: string
}

export function useProjectColors(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<ProjectColor[]>({
    queryKey: ['project-colors', projectId],
    queryFn: async () => {
      try {
        return await api.get<ProjectColor[]>(`/api/projects/${projectId}/colors`)
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
