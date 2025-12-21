import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { toast } from '@/hooks/use-toast'
import type { ApiError } from '@/lib/api-client'

interface GenerateCreativePayload {
  projectId: number
  templateId: number
  layoutId: 'story-promo' | 'story-default' | 'story-minimal'
  imageSource: any
  texts: {
    title?: string
    subtitle?: string
    description?: string
    hours?: string
    cta?: string
    address?: string
  }
}

interface GenerateCreativeResponse {
  success: boolean
  pageId: string
  layerBindings: Array<{ fieldName: string; layerId: string }>
  creditsUsed: number
}

export function useGenerateCreative() {
  const queryClient = useQueryClient()

  return useMutation<
    GenerateCreativeResponse,
    ApiError,
    GenerateCreativePayload
  >({
    mutationFn: (data) => api.post('/api/ai/generate-creative', data),
    onSuccess: (result, variables) => {
      // Invalidar queries do template e das páginas para refetch
      queryClient.invalidateQueries({
        queryKey: ['template', variables.templateId],
      })
      queryClient.invalidateQueries({
        queryKey: ['pages', variables.templateId],
      })

      toast({
        title: 'Sucesso!',
        description: `Criativo adicionado! ${
          result.creditsUsed > 0 ? `(${result.creditsUsed} créditos usados)` : ''
        }`,
      })
    },
    onError: (error) => {
      if (error.status === 402) {
        toast({
          variant: 'destructive',
          title: 'Créditos insuficientes',
          description:
            'Você não tem créditos suficientes para gerar a imagem com IA.',
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: error.message || 'Erro ao gerar criativo',
        })
      }
    },
  })
}
