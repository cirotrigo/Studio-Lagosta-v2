import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'
import type { VERSAO_DA_PREVIA } from '@/lib/gerar-criativo/previa-do-vetor'
import { VERSAO_DA_PREVIA_DE_IMAGEM } from '@/lib/gerar-criativo/previa-da-imagem'

interface GerarCriativoFinalizeParams {
  templateId: number
  templatePageId: string
  dataUrl: string // Base64 encoded image from frontend Konva rendering
  images: Record<string, ImageSource>
  texts: Record<string, string>
  layers: Layer[]
  hiddenLayerIds: string[]
  /** Compatibilidade do cliente que desenha o vetor (não é prova de pixel) */
  previa: typeof VERSAO_DA_PREVIA
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
      // G4.2: este é o envio do CanvasPreview, que desenha recorte manual e grade pelo helper único — a marca de
      // compatibilidade vai sempre daqui (não é prova de pixel).
      return api.post<GerarCriativoFinalizeResult>('/api/gerar-criativo/finalize', { ...params, previaDeImagem: VERSAO_DA_PREVIA_DE_IMAGEM })
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
