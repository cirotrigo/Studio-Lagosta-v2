import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface ProjectResponse {
  id: number
  name: string
  description: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  logoUrl: string | null
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectWithLogoResponse extends ProjectResponse {
  Logo?: Array<{
    id: number
    name: string
    fileUrl: string
    isProjectLogo: boolean
  }>
  _count?: {
    Template: number
    Generation: number
  }
}

export interface UpdateProjectSettingsInput {
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
}

export function useProject(projectId: number | null) {
  return useQuery<ProjectResponse | null>({
    queryKey: ['project', projectId],
    enabled: typeof projectId === 'number' && !Number.isNaN(projectId),
    queryFn: async () => {
      if (projectId == null || Number.isNaN(projectId)) {
        return null
      }
      return api.get<ProjectResponse>(`/api/projects/${projectId}`)
    },
  })
}

export function useProjects() {
  return useQuery<ProjectWithLogoResponse[]>({
    queryKey: ['projects'],
    queryFn: () => api.get<ProjectWithLogoResponse[]>('/api/projects'),
    staleTime: 5 * 60_000, // 5 minutes
  })
}

export function useUpdateProjectSettings(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation<ProjectResponse, unknown, UpdateProjectSettingsInput>({
    mutationFn: (input) => api.patch(`/api/projects/${projectId}/settings`, input),
    onSuccess: (project) => {
      queryClient.setQueryData(['project', projectId], project)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
