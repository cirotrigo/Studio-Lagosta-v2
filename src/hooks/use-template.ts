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
