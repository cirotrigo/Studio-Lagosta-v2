import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

interface GerarCriativoFinalizeParams {
  templateId: number
  templatePageId: string
  dataUrl: string // Base64 encoded image from frontend Konva rendering
  images: Record<string, ImageSource>
  texts: Record<string, string>
  layers: Layer[]
  hiddenLayerIds: string[]
}

interface GerarCriativoFinalizeResult {
  success: boolean
  id: string
  pageId: string
  resultUrl: string
}

export function useGerarCriativoFinalize() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: GerarCriativoFinalizeParams): Promise<GerarCriativoFinalizeResult> => {
      return api.post<GerarCriativoFinalizeResult>('/api/gerar-criativo/finalize', params)
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['template', variables.templateId, 'pages'],
      })
      queryClient.invalidateQueries({
        queryKey: ['project-creatives'],
      })
    },
  })
}
