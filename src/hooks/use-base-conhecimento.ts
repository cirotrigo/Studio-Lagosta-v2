/**
 * Base de conhecimento por PROJETO — hooks da tela de correção rápida
 * (`/projects/[id]/base`).
 *
 * Fala com as rotas `/api/knowledge` já existentes (as mesmas da página
 * /knowledge). Duas decisões que vêm do contrato real delas:
 *
 * - **Arquivar é PUT de `status: 'ARCHIVED'`**, nunca o DELETE da rota: o
 *   DELETE apaga a entrada e os vetores de vez (`deleteEntry`), sem volta.
 *   Arquivar é o mecanismo da casa (é o que o cron `archive-expired-knowledge`
 *   e a tool `arquivar-entrada-base` fazem) e preserva o histórico.
 * - **O PUT atualiza só os campos enviados** (spread condicional na rota), e
 *   `expiresAt` tem três estados: ausente = não mexe, null/vazio = LIMPA o
 *   prazo. Por isso a atualização de texto NÃO envia `expiresAt` — enviar
 *   null por engano apagaria a validade de uma campanha em silêncio.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { KnowledgeCategory } from '@prisma/client'
import type {
  KnowledgeBaseEntry,
  KnowledgeListResponse,
} from '@/hooks/admin/use-admin-knowledge'

export type { KnowledgeBaseEntry, KnowledgeListResponse }

export interface AtualizarEntradaInput {
  id: string
  /**
   * O conjunto completo do que a entrada é hoje + o novo texto. A rota até
   * aceita campo a campo, mas mandar o objeto inteiro (lido da própria
   * entrada) garante que nada se perde se o contrato mudar — regra da casa:
   * nunca reduzir a entrada ao salvar.
   */
  title: string
  content: string
  tags: string[]
  category: KnowledgeCategory
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
}

/**
 * Entradas ATIVAS do projeto. Só as ativas: são elas que alimentam os textos,
 * e a tela existe para conferir e corrigir exatamente isso. Entrada vencida
 * que o cron ainda não arquivou continua ACTIVE — é o caso que o banner de
 * prazos pega.
 */
export function useBaseDoProjeto(projectId: number) {
  return useQuery<KnowledgeListResponse>({
    queryKey: ['base-conhecimento', projectId],
    queryFn: () =>
      api.get(`/api/knowledge?projectId=${projectId}&status=ACTIVE&limit=200`),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    enabled: Number.isFinite(projectId),
  })
}

function invalidarBase(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: number,
) {
  queryClient.invalidateQueries({ queryKey: ['base-conhecimento', projectId] })
  // A página /knowledge lista as mesmas entradas sob outra chave.
  queryClient.invalidateQueries({ queryKey: ['org', 'knowledge'] })
}

/** Substitui o texto (e mantém o resto) de uma entrada. */
export function useAtualizarEntradaBase(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: AtualizarEntradaInput) =>
      api.put<KnowledgeBaseEntry>(`/api/knowledge/${id}`, data),
    onSuccess: () => invalidarBase(queryClient, projectId),
  })
}

/** Tira a entrada de cena sem apagar nada — PUT de status, não DELETE. */
export function useArquivarEntradaBase(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.put<KnowledgeBaseEntry>(`/api/knowledge/${id}`, { status: 'ARCHIVED' }),
    onSuccess: () => invalidarBase(queryClient, projectId),
  })
}
