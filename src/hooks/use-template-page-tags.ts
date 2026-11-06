'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface UpdateTagsResponse {
  id: string
  tags: string[]
  updatedAt: string
}

interface TirarDosModelosResponse {
  id: string
  isTemplate: boolean
  /** Posts já entregues ao publicador: saem com a arte anterior. */
  congelados: string[]
}

export function useUpdateTemplatePageTags(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pageId, tags }: { pageId: string; tags: string[] }) =>
      api.patch<UpdateTagsResponse>(
        `/api/projects/${projectId}/template-pages/${pageId}/tags`,
        { tags },
      ),
    onSuccess: () => {
      // A vitrine de Modelos lê ['modelos', projectId]. ['template-pages'] (por prefixo) é o seletor de modelos do
      // gerador de criativo no editor (use-template-pages.ts), que ainda lê GET /api/templates/[id]/template-pages.
      queryClient.invalidateQueries({ queryKey: ['modelos', projectId] })
      queryClient.invalidateQueries({ queryKey: ['template-pages'] })
      // The PATCH endpoint also auto-creates ProjectTag entries for any new
      // tag names — invalidate the project tags cache so the suggestion
      // dropdown picks them up immediately.
      queryClient.invalidateQueries({ queryKey: ['projectTags', projectId] })
    },
  })
}

/**
 * "Tirar dos modelos": despromove a página (`isTemplate: false`) em vez de apagá-la — a página continua na pasta e
 * nos posts que a usam. A rota recusa com 409 `MODELO_COM_POSTS` quando um post vivo depende da copy do modelo.
 */
export function useTirarDosModelos(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ templateId, pageId }: { templateId: number; pageId: string }) =>
      api.patch<TirarDosModelosResponse>(
        `/api/templates/${templateId}/pages/${pageId}/toggle-template`,
        { isTemplate: false },
      ),
    onSuccess: (_r, { templateId, pageId }) => {
      queryClient.invalidateQueries({ queryKey: ['template-pages'] })
      queryClient.invalidateQueries({ queryKey: ['modelos', projectId] })
      // Escrita cirúrgica no cache do editor (como page-model-control.tsx): refetch de ['pages'] traria todas as
      // páginas COM layers só por causa de um booleano.
      queryClient.setQueryData(
        ['pages', templateId],
        (paginas: Array<{ id: string }> | undefined) =>
          paginas?.map((p) => (p.id === pageId ? { ...p, isTemplate: false } : p)),
      )
    },
  })
}
