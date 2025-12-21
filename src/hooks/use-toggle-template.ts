'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { toast } from '@/hooks/use-toast'

interface ToggleTemplateData {
  pageId: string
  isTemplate: boolean
  templateName?: string
}

export function useToggleTemplate(templateId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pageId, isTemplate, templateName }: ToggleTemplateData) => {
      const response = await api.patch(
        `/api/templates/${templateId}/pages/${pageId}/toggle-template`,
        { isTemplate, templateName }
      )
      return response
    },
    onSuccess: (_, variables) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: ['pages', templateId] })
      queryClient.invalidateQueries({ queryKey: ['template-pages', templateId] })
      queryClient.invalidateQueries({ queryKey: ['page', templateId, variables.pageId] })

      // Mostrar mensagem de sucesso
      const message = variables.isTemplate
        ? 'Página marcada como modelo com sucesso'
        : 'Página desmarcada como modelo'

      toast({
        title: 'Sucesso',
        description: message,
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao alterar status de modelo',
        variant: 'destructive',
      })
    },
  })
}