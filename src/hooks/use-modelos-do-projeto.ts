import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

/**
 * Um modelo do cliente (página `isTemplate: true`), como o
 * `GET /api/projects/[id]/modelos` devolve — sem as camadas, que a escolha
 * não precisa e dominariam o payload.
 */
export interface ModeloDoProjeto {
  id: string
  name: string
  thumbnail: string | null
  width: number
  height: number
  tags: string[]
  templateId: number
  templateName: string
  /** O tipo da PASTA dona da página — não é o formato (modelo de feed mora em pasta story). */
  tipo: 'STORY' | 'FEED' | 'SQUARE'
  /** A pasta é a da Assinatura (nome, categoria ou tag), pela mesma regra da guarda do servidor. */
  assinatura: boolean
  /** O formato pelo TAMANHO da página. É por ele que se filtra. */
  formato: 'story' | 'feed' | 'quadrado'
  /** Presente quando uma tag de formato da página discorda do tamanho. */
  formatoDivergente?: true
  usedCount: number
  lastUsedAt: string | null
}

/**
 * Os modelos do projeto, na ordem da ROTAÇÃO (menos usado primeiro) — a mesma
 * que decide quando ninguém escolhe. O primeiro da lista de um formato é o que
 * a rotação usaria agora.
 */
export function useModelosDoProjeto(projectId: number, opcoes: { enabled?: boolean } = {}) {
  return useQuery<ModeloDoProjeto[]>({
    queryKey: ['modelos', projectId],
    queryFn: async () => {
      const r = await api.get<{ modelos: ModeloDoProjeto[] }>(
        `/api/projects/${projectId}/modelos`,
      )
      return r.modelos ?? []
    },
    enabled: (opcoes.enabled ?? true) && Number.isFinite(projectId) && projectId > 0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
}

/** A cópia criada pelo "Usar" ou pelo "Duplicar" (`POST /api/projects/[id]/modelos/[pageId]/usar|duplicar`). */
export interface CopiaDeModelo {
  pageId: string
  templateId: number
  pastaNome: string
  editorUrl: string
}

function useCopiarModelo(projectId: number, acao: 'usar' | 'duplicar') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ pageId, destinoTemplateId }: { pageId: string; destinoTemplateId?: number }) =>
      api.post<CopiaDeModelo>(
        `/api/projects/${projectId}/modelos/${encodeURIComponent(pageId)}/${acao}`,
        acao === 'usar' && destinoTemplateId ? { destinoTemplateId } : {},
      ),
    onSuccess: (copia) => {
      queryClient.invalidateQueries({ queryKey: ['modelos', projectId] })
      // Por prefixo: o seletor de modelos do gerador de criativo no editor (use-template-pages.ts).
      queryClient.invalidateQueries({ queryKey: ['template-pages'] })
      queryClient.invalidateQueries({ queryKey: ['pages', copia.templateId] })
      // O "Usar" pode criar a pasta "Avulsas · mês": a aba Pastas precisa saber (prefixo, como useCreateModelo).
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

/** "Usar": página de CONTEÚDO nova, copiada do modelo (Avulsas do formato ou `destinoTemplateId`). */
export const useUsarModelo = (projectId: number) => useCopiarModelo(projectId, 'usar')

/** "Duplicar": outro modelo na mesma pasta (só o curador). */
export const useDuplicarModelo = (projectId: number) => useCopiarModelo(projectId, 'duplicar')
