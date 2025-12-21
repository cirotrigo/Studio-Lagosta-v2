'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { toast } from '@/hooks/use-toast'

interface ToggleTemplateData {
  pageId: string
  isTemplate: boolean
}

interface PageResponse {
  id: string
  name: string
  width: number
  height: number
  layers: unknown
  background: string | null
  order: number
  thumbnail: string | null
  templateId: number
  isTemplate: boolean
  templateName: string | null
  createdAt: string
  updatedAt: string
}

export function useToggleTemplate(templateId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pageId, isTemplate }: ToggleTemplateData) => {
      const response = await api.patch(
        `/api/templates/${templateId}/pages/${pageId}/toggle-template`,
        { isTemplate }
      )
      return response
    },
    onSuccess: (updatedPage: PageResponse, variables) => {
      // Atualizar cache manualmente para garantir UI atualizada imediatamente
      queryClient.setQueryData(['page', templateId, variables.pageId], updatedPage)

      // Atualizar a página na lista de páginas
      queryClient.setQueryData(['pages', templateId], (oldPages: PageResponse[] | undefined) => {
        if (!oldPages) return oldPages

        return oldPages.map((page) =>
          page.id === variables.pageId
            ? { ...page, isTemplate: variables.isTemplate }
            : page
        )
      })

      // Invalidar template-pages para atualizar seletor de modelos
      queryClient.invalidateQueries({ queryKey: ['template-pages', templateId] })

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