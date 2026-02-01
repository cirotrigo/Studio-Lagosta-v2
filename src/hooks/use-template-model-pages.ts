import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { Layer } from '@/types/template'

interface TemplatePageResponse {
  id: string
  name: string
  templateName: string | null
  templateId: number
  width: number
  height: number
  layers: Layer[]
  background: string | null
  order: number
  thumbnail: string | null
  createdAt: string
  updatedAt: string
  Template?: {
    name: string
  }
}

export interface ModelPage {
  id: string
  name: string
  width: number
  height: number
  layers: Layer[]
  background: string | null
  order: number
  thumbnail: string | null
  templateId: number
  templateName: string | null
}

export function useTemplateModelPages(templateId: number | null) {
  return useQuery<ModelPage[]>({
    queryKey: ['template', templateId, 'model-pages'],
    enabled: !!templateId,
    queryFn: async () => {
      // Use the dedicated template-pages endpoint that returns pages with isTemplate=true
      const pages = await api.get<TemplatePageResponse[]>(
        `/api/templates/${templateId}/template-pages`
      )
      return pages.map((page) => ({
        id: page.id,
        name: page.name,
        width: page.width,
        height: page.height,
        layers: page.layers || [],
        background: page.background,
        order: page.order,
        thumbnail: page.thumbnail,
        templateId: page.templateId,
        templateName: page.templateName || page.Template?.name || null,
      }))
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}
