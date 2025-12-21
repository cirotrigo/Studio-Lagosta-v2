'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface TemplatePage {
  id: string
  name: string
  templateName: string | null
  templateId: number
  width: number
  height: number
  layers: any[]
  background: string | null
  thumbnail: string | null
  order: number
  createdAt: string
  updatedAt: string
  Template: {
    name: string
  }
}

export function useTemplatePages(templateId: number, enabled = true) {
  return useQuery<TemplatePage[]>({
    queryKey: ['template-pages', templateId],
    queryFn: async () => {
      const response = await api.get<TemplatePage[]>(`/api/templates/${templateId}/template-pages`)
      return response
    },
    staleTime: 5 * 60_000, // 5 minutos - modelos devem persistir em cache
    gcTime: 30 * 60_000, // 30 minutos - manter em cache por mais tempo
    enabled: enabled && !!templateId,
    refetchOnMount: true, // Sempre recarregar ao montar para garantir modelos atualizados
    refetchOnWindowFocus: false, // Não recarregar ao focar janela
  })
}