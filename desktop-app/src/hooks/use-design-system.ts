import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export interface DesignSystemImportData {
  fileUrl: string
  fileName: string
  sourceType: 'html' | 'zip'
  sizeBytes?: number
  notes?: string
  uploadedAt: string
  uploadedBy: string
}

interface DesignSystemResponse {
  designSystemImport: DesignSystemImportData | null
  storageMode?: 'design_system' | 'legacy_elements'
}

export interface SaveDesignSystemPayload {
  fileUrl: string
  fileName: string
  sourceType: 'html' | 'zip'
  sizeBytes?: number
  notes?: string
}

interface ProjectElement {
  id: number
  name: string
  fileUrl: string
  category: string | null
  uploadedBy: string
  createdAt: string
}

function inferSourceTypeFromName(value: string): 'html' | 'zip' {
  const lower = value.toLowerCase()
  return lower.endsWith('.zip') ? 'zip' : 'html'
}

function mapLegacyElementToImport(element: ProjectElement): DesignSystemImportData {
  return {
    fileUrl: element.fileUrl,
    fileName: element.name,
    sourceType: inferSourceTypeFromName(element.name || element.fileUrl),
    uploadedAt: element.createdAt,
    uploadedBy: element.uploadedBy,
  }
}

async function fetchLegacyDesignSystem(projectId: number): Promise<DesignSystemImportData | null> {
  const elements = await api.get<ProjectElement[]>(`/api/projects/${projectId}/elements`)
  const ds = elements.find((item) => item.category === 'design_system')
  if (!ds) return null
  return mapLegacyElementToImport(ds)
}

async function deleteLegacyDesignSystemElements(projectId: number): Promise<void> {
  const elements = await api.get<ProjectElement[]>(`/api/projects/${projectId}/elements`)
  const dsElements = elements.filter((item) => item.category === 'design_system')
  await Promise.all(
    dsElements.map((item) => api.delete<{ success: boolean }>(`/api/projects/${projectId}/elements/${item.id}`)),
  )
}

export function useDesignSystem(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<DesignSystemResponse>({
    queryKey: ['design-system', projectId],
    queryFn: async () => {
      try {
        return await api.get<DesignSystemResponse>(`/api/projects/${projectId}/design-system`)
      } catch (error) {
        // Endpoint can be unavailable on older web deployments.
        // Fallback to legacy "elements" storage to keep desktop compatible.
        if (error instanceof ApiError && error.status === 404) {
          const legacyImport = await fetchLegacyDesignSystem(projectId as number)
          return {
            designSystemImport: legacyImport,
            storageMode: 'legacy_elements',
          }
        }
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    enabled: !!projectId,
    staleTime: 3 * 60_000,
    gcTime: 10 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}

export function useSaveDesignSystem(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()

  return useMutation({
    mutationFn: async (payload: SaveDesignSystemPayload) => {
      try {
        return await api.patch<DesignSystemResponse>(`/api/projects/${projectId}/design-system`, payload)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          await deleteLegacyDesignSystemElements(projectId as number)
          await api.post<ProjectElement>(`/api/projects/${projectId}/elements`, {
            url: payload.fileUrl,
            name: payload.fileName,
            category: 'design_system',
          })
          const legacyImport = await fetchLegacyDesignSystem(projectId as number)
          return {
            designSystemImport: legacyImport,
            storageMode: 'legacy_elements' as const,
          }
        }
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-system', projectId] })
    },
  })
}

export function useDeleteDesignSystem(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()

  return useMutation({
    mutationFn: async () => {
      try {
        return await api.delete<{ success: boolean }>(`/api/projects/${projectId}/design-system`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          await deleteLegacyDesignSystemElements(projectId as number)
          return { success: true }
        }
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-system', projectId] })
    },
  })
}
