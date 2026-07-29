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
  /**
   * PROCESSING é o valor do enum no banco (GenerationStatus) — é o que a
   * melhoria com IA grava enquanto trabalha. POSTING/PENDING vêm do canal SSE
   * do export de vídeo e não existem no banco.
   */
  status: 'PROCESSING' | 'POSTING' | 'COMPLETED' | 'FAILED'
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
    /**
     * Enquanto houver criativo em PROCESSING, refaz a busca a cada 5s: a
     * melhoria com IA leva 1-2 min e roda no servidor, então sem isso a
     * miniatura só apareceria depois de um refresh manual.
     */
    refetchInterval: (query) =>
      query.state.data?.some((c) => c.status === 'PROCESSING') ? 5_000 : false,
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
