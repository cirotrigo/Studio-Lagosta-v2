'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { AssinaturaDaMarcaNaTela, ResumoDosFatos, VozDaMarca } from '@/lib/brand/aba-marca'

/** A voz da marca como a aba lê: precedência, registro (versão + voz) e o legado. */
export function useVozDaMarca(projectId: number) {
  return useQuery<VozDaMarca>({
    queryKey: ['voz-da-marca', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/voz`),
    staleTime: 30_000,
  })
}

export function useSalvarVozDaMarca(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { voz: unknown; versaoEsperada: number | null }) => api.put<VozDaMarca & { gravada: { versao: number; criada: boolean } }>(`/api/projects/${projectId}/voz`, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voz-da-marca', projectId] })
      // A voz entra em `brand.voz` do loader único: a prévia do prompt e o DNA lido pela tela acompanham.
      queryClient.invalidateQueries({ queryKey: ['brand-dna', projectId] })
      queryClient.invalidateQueries({ queryKey: ['prompt-preview', projectId] })
    },
  })
}

export function useFatosDaCasa(projectId: number) {
  return useQuery<ResumoDosFatos>({
    queryKey: ['fatos-da-casa', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/fatos`),
    staleTime: 60_000,
  })
}

export function useAssinaturasDaMarca(projectId: number) {
  return useQuery<AssinaturaDaMarcaNaTela>({
    queryKey: ['assinaturas-da-marca', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/assinatura`),
    staleTime: 60_000,
  })
}
