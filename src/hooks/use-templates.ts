"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { DesignData, DynamicField } from '@/types/template'

export interface TemplateListItem {
  id: number
  name: string
  type: string
  dimensions: string
  projectId: number
  thumbnailUrl?: string | null
  category?: string | null
  tags?: string[]
  isPublic?: boolean
  isPremium?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface TemplateDetail extends TemplateListItem {
  designData: DesignData
  dynamicFields: DynamicField[]
}

interface UseTemplatesParams {
  projectId?: number | null
  category?: string | null
  search?: string | null
  limit?: number
  includeDesign?: boolean
  publicOnly?: boolean
  enabled?: boolean
}

export interface CreateTemplateData {
  name: string
  type: string
  dimensions: string
  designData: DesignData
  dynamicFields?: DynamicField[]
  thumbnailUrl?: string
  category?: string
  tags?: string[]
  isPublic?: boolean
  isPremium?: boolean
  projectId: number
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

  if (params.publicOnly) {
    query.set('publicOnly', 'true')
  }

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

/**
 * Hook para listar templates
 */
export function useTemplates(params: UseTemplatesParams = {}) {
  const queryKey = [
    'templates',
    {
      projectId: params.projectId ?? null,
      category: params.category ?? null,
      search: params.search ?? null,
      limit: params.limit ?? null,
      includeDesign: Boolean(params.includeDesign),
      publicOnly: Boolean(params.publicOnly),
    },
  ] as const

  const queryString = buildQueryString(params)

  const enabled =
    typeof params.enabled === 'boolean'
      ? params.enabled
      : params.projectId === undefined || params.projectId === null || Number.isFinite(params.projectId)

  return useQuery<TemplateListItem[]>({
    queryKey,
    enabled,
    queryFn: () => api.get(`/api/templates${queryString}`),
    staleTime: 5 * 60_000, // 5 minutos
    gcTime: 10 * 60_000, // 10 minutos
  })
}

/**
 * Hook para obter um template específico com designData
 */
export function useTemplate(id: number | null) {
  return useQuery<TemplateDetail>({
    queryKey: ['templates', id],
    queryFn: () => api.get(`/api/templates/${id}?includeDesign=true`),
    enabled: !!id,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}

/**
 * Hook para criar um novo template
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTemplateData) => api.post<TemplateDetail>('/api/templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

/**
 * Hook para gerar thumbnail de um design
 */
export function useGenerateThumbnail() {
  return useMutation({
    mutationFn: (data: { designData: DesignData; width?: number; height?: number }) =>
      api.post<{ thumbnailUrl: string }>('/api/templates/generate-thumbnail', data),
  })
}

/**
 * Hook para salvar o template atual como um template de biblioteca
 */
export function useSaveAsTemplateLibrary() {
  const createTemplate = useCreateTemplate()
  const generateThumbnail = useGenerateThumbnail()

  return useMutation({
    mutationFn: async (data: CreateTemplateData) => {
      // Gerar thumbnail automaticamente se não fornecido
      let thumbnailUrl = data.thumbnailUrl

      if (!thumbnailUrl && data.designData) {
        const thumbnailResult = await generateThumbnail.mutateAsync({
          designData: data.designData,
          width: 400,
          height: 300,
        })
        thumbnailUrl = thumbnailResult.thumbnailUrl
      }

      // Criar o template com o thumbnail
      return createTemplate.mutateAsync({
        ...data,
        thumbnailUrl,
      })
    },
  })
}
