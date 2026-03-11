import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'
import type { ArtFormat } from '@/types/template'

export interface ProjectGenerationRecord {
  id: string
  status: 'POSTING' | 'COMPLETED' | 'FAILED' | 'PENDING'
  templateId: number
  fieldValues: Record<string, unknown>
  resultUrl: string | null
  googleDriveFileId?: string | null
  googleDriveBackupUrl?: string | null
  projectId: number
  templateName?: string | null
  projectName?: string | null
  createdBy: string
  createdAt: string
  completedAt?: string | null
  fileName?: string | null
  Template?: {
    id: number
    name: string
    type: string
    dimensions: string
  } | null
}

interface ProjectGenerationsResponse {
  generations: ProjectGenerationRecord[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

interface KonvaProjectExportPayload {
  format: ArtFormat
  dataUrl: string
  fileName: string
  pageId: string
  pageName: string
  documentId: string
  width: number
  height: number
}

interface KonvaProjectExportResponse {
  success: true
  creditsRemaining: number
  generation: {
    id: string
    resultUrl: string | null
    fileName?: string | null
    pageName: string
    format: ArtFormat
  }
}

interface CreditsBalanceResponse {
  creditsRemaining: number
  lastSyncedAt: string | null
}

interface LegacyTemplateRecord {
  id: number
  name: string
  type: 'STORY' | 'FEED' | 'SQUARE'
  dimensions: string
  category?: string | null
}

function getLegacyTemplateType(format: ArtFormat): 'STORY' | 'FEED' | 'SQUARE' {
  switch (format) {
    case 'FEED_PORTRAIT':
      return 'FEED'
    case 'SQUARE':
      return 'SQUARE'
    case 'STORY':
    default:
      return 'STORY'
  }
}

function getLegacyTemplateDimensions(format: ArtFormat, width: number, height: number) {
  switch (format) {
    case 'FEED_PORTRAIT':
      return '1080x1350'
    case 'SQUARE':
      return '1080x1080'
    case 'STORY':
    default:
      return width === 1080 && height === 1920 ? '1080x1920' : `${width}x${height}`
  }
}

async function ensureLegacyKonvaExportTemplate(
  projectId: number,
  payload: KonvaProjectExportPayload,
): Promise<number> {
  const category = '__system_konva_export__'
  const templateType = getLegacyTemplateType(payload.format)
  const dimensions = getLegacyTemplateDimensions(payload.format, payload.width, payload.height)

  const templates = await api.get<LegacyTemplateRecord[]>(
    `/api/templates?projectId=${projectId}&category=${encodeURIComponent(category)}&limit=100`,
  )

  const existing = templates.find(
    (template) =>
      template.name === payload.pageName &&
      template.type === templateType &&
      template.dimensions === dimensions,
  )

  if (existing) {
    return existing.id
  }

  const created = await api.post<LegacyTemplateRecord>('/api/templates', {
    name: payload.pageName,
    type: templateType,
    dimensions,
    designData: {
      canvas: {
        width: payload.width,
        height: payload.height,
        backgroundColor: '#ffffff',
      },
      layers: [],
    },
    dynamicFields: [],
    category,
    tags: ['system', 'konva-export'],
    isPublic: false,
    isPremium: false,
    projectId,
  })

  return created.id
}

async function exportViaLegacyTemplateRoute(
  projectId: number,
  payload: KonvaProjectExportPayload,
): Promise<KonvaProjectExportResponse> {
  const templateId = await ensureLegacyKonvaExportTemplate(projectId, payload)
  const response = await api.post<{
    success: true
    creditsRemaining: number
    generation: {
      id: string
      resultUrl: string | null
    }
  }>(`/api/templates/${templateId}/export`, {
    format: 'jpeg',
    dataUrl: payload.dataUrl,
    fileName: payload.fileName,
  })

  return {
    success: true,
    creditsRemaining: response.creditsRemaining,
    generation: {
      id: response.generation.id,
      resultUrl: response.generation.resultUrl,
      fileName: payload.fileName,
      pageName: payload.pageName,
      format: payload.format,
    },
  }
}

function useAuthErrorHandler() {
  const { logout } = useAuthStore()
  return async (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      await logout()
    }
  }
}

export function useProjectGenerations(projectId: number | undefined, pageSize = 80) {
  const handleAuthError = useAuthErrorHandler()

  return useQuery<ProjectGenerationsResponse>({
    queryKey: ['project-generations', projectId, pageSize],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) {
        throw new Error('Projeto nao selecionado')
      }

      try {
        return await api.get<ProjectGenerationsResponse>(
          `/api/projects/${projectId}/generations?pageSize=${pageSize}`,
        )
      } catch (error) {
        await handleAuthError(error)
        throw error
      }
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}

export function useDeleteGeneration(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const handleAuthError = useAuthErrorHandler()

  return useMutation({
    mutationFn: async (generationId: string) => {
      try {
        return await api.delete<{ success: true }>(`/api/generations/${generationId}`)
      } catch (error) {
        await handleAuthError(error)
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-generations', projectId] })
    },
  })
}

export function useKonvaProjectCreativeExport(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const handleAuthError = useAuthErrorHandler()

  return useMutation({
    mutationFn: async (payload: KonvaProjectExportPayload) => {
      if (!projectId) {
        throw new Error('Projeto nao selecionado')
      }

      try {
        return await api.post<KonvaProjectExportResponse>(
          `/api/projects/${projectId}/generations/konva-export`,
          payload,
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          try {
            return await exportViaLegacyTemplateRoute(projectId, payload)
          } catch (legacyError) {
            await handleAuthError(legacyError)
            throw legacyError
          }
        }
        await handleAuthError(error)
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-generations', projectId] })
      queryClient.invalidateQueries({ queryKey: ['credits-balance'] })
    },
  })
}

export function useCreativeDownloadCost() {
  return useQuery<number>({
    queryKey: ['credit-cost', 'creative_download'],
    queryFn: async () => {
      const response = await api.get<{ featureCosts?: Record<string, number> }>('/api/credits/settings')
      return response.featureCosts?.creative_download ?? 2
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  })
}

export function useCreditsBalance() {
  const handleAuthError = useAuthErrorHandler()

  return useQuery<CreditsBalanceResponse>({
    queryKey: ['credits-balance'],
    queryFn: async () => {
      try {
        return await api.get<CreditsBalanceResponse>('/api/credits/me')
      } catch (error) {
        await handleAuthError(error)
        throw error
      }
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}
