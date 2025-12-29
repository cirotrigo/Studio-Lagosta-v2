'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { toast } from '@/hooks/use-toast'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

interface CreateFromTemplateData {
  templatePageId: string
  images: Record<string, ImageSource> // layerId -> ImageSource (múltiplas imagens)
  texts: Record<string, string> // layerId -> text content
}

interface CreateFromTemplateResponse {
  page: any
  success: boolean
}

export function useCreateFromTemplate(templateId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateFromTemplateData) => {
      const response = await api.post<CreateFromTemplateResponse>(
        `/api/templates/${templateId}/create-from-template`,
        data
      )
      return response
    },
    onSuccess: (data) => {
      // Invalidar queries relacionadas para atualizar lista de páginas
      queryClient.invalidateQueries({ queryKey: ['pages', templateId] })

      toast({
        title: 'Sucesso',
        description: 'Criativo criado com sucesso a partir do modelo',
      })

      return data
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao criar criativo a partir do modelo',
        variant: 'destructive',
      })
    },
  })
}