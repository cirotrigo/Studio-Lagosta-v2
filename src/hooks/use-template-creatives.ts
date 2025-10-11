import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface CreativeFieldValues {
  videoExport?: boolean
  originalJobId?: string
  isVideo?: boolean | string
  mimeType?: string
  thumbnailUrl?: string
  [key: string]: unknown
}

export interface Creative {
  id: string
  resultUrl: string
  createdAt: string
  templateName: string
  projectName: string
  width: number
  height: number
  fieldValues?: CreativeFieldValues
  thumbnailUrl?: string
  isVideo?: boolean
  mimeType?: string
}

/**
 * Hook para buscar todos os criativos de um template
 */
export function useTemplateCreatives(templateId: number) {
  return useQuery<Creative[]>({
    queryKey: ['template-creatives', templateId],
    queryFn: () => api.get(`/api/templates/${templateId}/creatives`),
    enabled: Number.isFinite(templateId) && templateId > 0,
    staleTime: 30_000, // 30 segundos
  })
}

/**
 * Hook para deletar um criativo
 */
export function useDeleteCreative(templateId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (creativeId: string) => {
      return api.delete(`/api/templates/${templateId}/creatives?creativeId=${creativeId}`)
    },
    onSuccess: () => {
      // Invalidar cache dos criativos do template
      queryClient.invalidateQueries({ queryKey: ['template-creatives', templateId] })
    },
  })
}
