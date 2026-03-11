import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export interface ProjectLogo {
  id: number
  name: string
  fileUrl: string
  projectId: number
  uploadedBy: string
  createdAt: string
}

export function useProjectLogos(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<ProjectLogo[]>({
    queryKey: ['project-logos', projectId],
    queryFn: async () => {
      try {
        return await api.get<ProjectLogo[]>(`/api/projects/${projectId}/logos`)
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
