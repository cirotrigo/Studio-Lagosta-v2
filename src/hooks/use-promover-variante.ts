'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

/** A resposta de `POST /api/templates/[id]/pages/[pageId]/promover-variante` (T5). */
export interface VariantePromovida {
  pageId: string
  assinaturaTemplateId: number
  nome: string
  formato: 'story' | 'feed'
  papeis: string[]
  foraDoRodizio: true
  editorUrl: string
  avisos: string[]
  /** A mesma cópia já existia: nada foi criado (repetir é seguro). */
  jaExistia?: boolean
}

/** Copia a página (do template aberto) como variante da marca, fora do rodízio. */
export function usePromoverVariante(projectId: number, templateId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pageId: string) => api.post<VariantePromovida>(`/api/templates/${templateId}/pages/${encodeURIComponent(pageId)}/promover-variante`, {}),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['assinaturas-da-marca', projectId] })
      queryClient.invalidateQueries({ queryKey: ['pages', r.assinaturaTemplateId] })
    },
  })
}
