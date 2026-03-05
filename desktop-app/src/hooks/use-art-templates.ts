import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export interface ArtTemplate {
  id: string
  name: string
  format: string
  schemaVersion: number
  engineVersion: number
  templateVersion: number
  fingerprint: string
  analysisConfidence: number
  sourceImageUrl: string
  createdAt: string
  templateData: Record<string, any>
}

export interface AnalyzeArtTemplateParams {
  projectId: number
  imageUrl: string
  format: string
  templateName: string
}

export interface AnalyzeArtTemplateResult {
  templateData: Record<string, any>
  preview: Record<string, any>
  fingerprint: string
  analysisConfidence: number
}

export interface CreateArtTemplateParams {
  name: string
  format: string
  sourceImageUrl: string
  templateData: Record<string, any>
  fingerprint: string
  analysisConfidence: number
}

export function useArtTemplates(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<ArtTemplate[]>({
    queryKey: ['art-templates', projectId],
    queryFn: async () => {
      try {
        return await api.get<ArtTemplate[]>(`/api/projects/${projectId}/art-templates`)
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
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}

export function useCreateArtTemplate(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()

  return useMutation({
    mutationFn: async (data: CreateArtTemplateParams) => {
      try {
        return await api.post<ArtTemplate>(`/api/projects/${projectId}/art-templates`, data)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['art-templates', projectId] })
    },
  })
}

export function useDeleteArtTemplate(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()

  return useMutation({
    mutationFn: async (templateId: string) => {
      try {
        return await api.delete(`/api/projects/${projectId}/art-templates?templateId=${templateId}`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['art-templates', projectId] })
    },
  })
}

export function useAnalyzeArtTemplate() {
  return useMutation({
    mutationFn: async (params: AnalyzeArtTemplateParams) => {
      return await api.post<AnalyzeArtTemplateResult>('/api/tools/analyze-art-template', params)
    },
  })
}
