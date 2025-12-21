'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface TemplatePage {
  id: string
  name: string
  templateName: string | null
  width: number
  height: number
  layers: any[]
  background: string | null
  thumbnail: string | null
  order: number
  createdAt: string
  updatedAt: string
}

export function useTemplatePages(templateId: number, enabled = true) {
  return useQuery<TemplatePage[]>({
    queryKey: ['template-pages', templateId],
    queryFn: async () => {
      const response = await api.get<TemplatePage[]>(`/api/templates/${templateId}/template-pages`)
      return response
    },
    staleTime: 30_000, // 30 segundos
    gcTime: 10 * 60_000, // 10 minutos
    enabled: enabled && !!templateId,
  })
}