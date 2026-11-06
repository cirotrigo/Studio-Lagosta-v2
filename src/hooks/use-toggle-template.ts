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
  /** Posts já entregues ao publicador: saem com a arte anterior. */
  congelados?: string[]
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

      // A vitrine de Modelos lê ['modelos', projectId]; este hook só conhece o
      // templateId, então invalida por PREFIXO. ['template-pages'] (também por
      // prefixo) é o seletor do gerador de criativo no editor
      // (use-template-pages.ts), cacheado sob outro templateId.
      queryClient.invalidateQueries({ queryKey: ['modelos'] })
      queryClient.invalidateQueries({ queryKey: ['template-pages'] })

      // Mostrar mensagem de sucesso
      const message = variables.isTemplate
        ? 'Página marcada como modelo com sucesso'
        : 'Página desmarcada como modelo'
      const n = updatedPage.congelados?.length ?? 0
      const avisoCongelados =
        n > 0
          ? ` ${n} post${n === 1 ? '' : 's'} já entregue${n === 1 ? '' : 's'} ao publicador sa${n === 1 ? 'i' : 'em'} com a arte anterior.`
          : ''

      toast({
        title: 'Sucesso',
        description: message + avisoCongelados,
        ...(n > 0 ? { duration: 12_000 } : {}),
      })
    },
    // O 409 MODELO_COM_POSTS traz na mensagem quantos e quais posts dependem da página: duração longa para ler.
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao alterar status de modelo',
        variant: 'destructive',
        duration: 12_000,
      })
    },
  })
}