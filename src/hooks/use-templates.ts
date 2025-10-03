"use client"

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface TemplateListItem {
  id: number
  name: string
  type: string
  dimensions: string
  projectId: number
  thumbnailUrl?: string | null
  createdAt?: string
  updatedAt?: string
}

interface UseTemplatesParams {
  projectId?: number | null
  category?: string | null
  search?: string | null
  limit?: number
  includeDesign?: boolean
}

function buildQueryString(params: UseTemplatesParams) {
  const query = new URLSearchParams()

  if (params.projectId && Number.isFinite(params.projectId)) {
    query.set('projectId', String(params.projectId))
  }

  if (params.category) {
    query.set('category', params.category)
  }

  if (params.search) {
    query.set('search', params.search)
  }

  if (params.limit && Number.isFinite(params.limit)) {
    query.set('limit', String(params.limit))
  }

  if (params.includeDesign) {
    query.set('includeDesign', 'true')
  }

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

export function useTemplates(params: UseTemplatesParams) {
  const queryKey = [
    'templates',
    {
      projectId: params.projectId ?? null,
      category: params.category ?? null,
      search: params.search ?? null,
      limit: params.limit ?? null,
      includeDesign: Boolean(params.includeDesign),
    },
  ] as const

  const queryString = buildQueryString(params)

  return useQuery<TemplateListItem[]>({
    queryKey,
    enabled: params.projectId === undefined || params.projectId === null || Number.isFinite(params.projectId),
    queryFn: () => api.get(`/api/templates${queryString}`),
    staleTime: 30_000,
  })
}
