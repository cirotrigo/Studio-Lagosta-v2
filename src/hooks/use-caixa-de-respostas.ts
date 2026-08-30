import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { CaixaDeRespostas } from '@/lib/caixa/itens'

export function useCaixaDeRespostas() {
  return useQuery<CaixaDeRespostas>({
    queryKey: ['caixa-de-respostas'],
    queryFn: () => api.get('/api/caixa-de-respostas'),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  })
}

export function useProporRascunho() {
  return useMutation({
    mutationFn: (dados: { projectId: number; reviewId?: string; texto?: string; autor?: string; legendaDoPost?: string }) =>
      api.post<{ rascunho: string; origem: string }>('/api/caixa-de-respostas/rascunho', dados),
  })
}

export function useSalvarResposta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: { projectId: number; reviewId: string; mensagem: string }) =>
      api.post<{ ok: boolean }>('/api/caixa-de-respostas/salvar-resposta', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caixa-de-respostas'] })
    },
  })
}

export function useIgnorarItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: { projectId: number; comentarioId?: string; reviewId?: string }) =>
      api.post<{ ok: boolean }>('/api/caixa-de-respostas/ignorar', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caixa-de-respostas'] })
    },
  })
}

export function useResponderComentario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: { projectId: number; comentarioId: string; mensagem: string }) =>
      api.post<{ ok: boolean }>('/api/caixa-de-respostas/responder', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caixa-de-respostas'] })
    },
  })
}
