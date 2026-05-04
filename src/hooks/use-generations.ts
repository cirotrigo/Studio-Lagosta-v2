import { useInfiniteQuery } from '@tanstack/react-query'
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

interface UseAllGenerationsOptions {
  projectId?: number | null
  weekdays?: number[]
  pageSize?: number
}

export function useAllGenerations(options: UseAllGenerationsOptions = {}) {
  const { projectId, weekdays, pageSize = 60 } = options
  // Serializa weekdays ordenados pra estabilidade do queryKey
  const weekdaysParam = (weekdays ?? []).slice().sort((a, b) => a - b).join(',')

  return useInfiniteQuery<AllGenerationsResponse>({
    queryKey: ['all-generations', projectId ?? 'all', weekdaysParam],
    initialPageParam: 1,
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(pageSize),
      })
      if (projectId) {
        params.set('projectId', String(projectId))
      }
      if (weekdaysParam) {
        params.set('weekdays', weekdaysParam)
      }
      return api.get(`/api/generations?${params.toString()}`)
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}
