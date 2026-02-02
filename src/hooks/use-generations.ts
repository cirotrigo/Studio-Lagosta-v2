import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface ProjectInfo {
  id: number
  name: string
  logoUrl: string | null
}

export interface TemplateInfo {
  id: number
  name: string
  type: string
  dimensions: string
}

export interface GenerationRecord {
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
  authorName?: string | null
  createdBy: string
  createdAt: string
  completedAt?: string | null
  // API returns Template with capital T
  Template?: TemplateInfo
  Project?: {
    id: number
    name: string
    logoUrl: string | null
    Logo?: Array<{ fileUrl: string }>
  }
}

export interface AllGenerationsResponse {
  generations: GenerationRecord[]
  projects: ProjectInfo[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export function useAllGenerations(projectId?: number | null) {
  return useQuery<AllGenerationsResponse>({
    queryKey: ['all-generations', projectId ?? 'all'],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '200' })
      if (projectId) {
        params.set('projectId', String(projectId))
      }
      return api.get(`/api/generations?${params.toString()}`)
    },
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  })
}
