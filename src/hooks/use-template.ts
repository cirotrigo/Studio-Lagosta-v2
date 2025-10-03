"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { DesignData, DynamicField } from '@/types/template'

export interface TemplateDto {
  id: number
  name: string
  type: 'STORY' | 'FEED' | 'SQUARE'
  dimensions: string
  designData: DesignData
  dynamicFields: DynamicField[] | null
  projectId: number
  thumbnailUrl?: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
}

export function useTemplate(templateId: number | null) {
  return useQuery<TemplateDto>({
    queryKey: ['template', templateId],
    enabled: Boolean(templateId),
    queryFn: () => api.get(`/api/templates/${templateId}`),
    staleTime: 30_000,
  })
}

interface UpdateTemplateInput {
  id: number
  data: {
    name?: string
    designData?: DesignData
    dynamicFields?: DynamicField[]
    thumbnailUrl?: string | null
  }
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()

  return useMutation<TemplateDto, unknown, UpdateTemplateInput>({
    mutationFn: ({ id, data }) => api.put(`/api/templates/${id}`, data),
    onSuccess: (template) => {
      queryClient.setQueryData(['template', template.id], template)
    },
  })
}

/**
 * Hook para atualizar template com geração automática de thumbnail
 */
export function useUpdateTemplateWithThumbnail() {
  const queryClient = useQueryClient()

  return useMutation<TemplateDto, unknown, UpdateTemplateInput>({
    mutationFn: async ({ id, data }) => {
      let thumbnailUrl = data.thumbnailUrl

      // Gerar thumbnail automaticamente se designData foi modificado e não tem thumbnail
      if (data.designData && !thumbnailUrl) {
        try {
          const thumbnailResponse = await api.post<{ thumbnailUrl: string }>(
            '/api/templates/generate-thumbnail',
            {
              designData: data.designData,
              width: 400,
              height: 300,
            },
          )
          thumbnailUrl = thumbnailResponse.thumbnailUrl
        } catch (error) {
          console.warn('Failed to generate thumbnail:', error)
          // Continuar salvando mesmo se thumbnail falhar
        }
      }

      // Atualizar template com thumbnail
      return api.put(`/api/templates/${id}`, {
        ...data,
        thumbnailUrl,
      })
    },
    onSuccess: (template) => {
      queryClient.setQueryData(['template', template.id], template)
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
