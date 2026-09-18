'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { AssinaturaDaMarcaNaTela, ResumoDosFatos, VozDaMarca } from '@/lib/brand/aba-marca'

export type RespostaDaGravacaoDaVoz = VozDaMarca & { gravada: { versao: number; criada: boolean } }

/** A consulta da voz: exportada para o teste dirigir a MESMA chave e a mesma leitura que a tela. */
export function consultaDaVozDaMarca(projectId: number) {
  return {
    queryKey: ['voz-da-marca', projectId],
    queryFn: () => api.get<VozDaMarca>(`/api/projects/${projectId}/voz`),
    staleTime: 30_000,
  }
}

/** A voz da marca como a aba lê: precedência, registro (versão + voz) e o legado. */
export function useVozDaMarca(projectId: number) {
  return useQuery<VozDaMarca>(consultaDaVozDaMarca(projectId))
}

export function gravacaoDaVozDaMarca(queryClient: QueryClient, projectId: number) {
  return {
    mutationFn: (args: { voz: unknown; versaoEsperada: number | null }) => api.put<RespostaDaGravacaoDaVoz>(`/api/projects/${projectId}/voz`, args),
    onSuccess: async (r: RespostaDaGravacaoDaVoz) => {
      // PR14-15: a resposta do PUT É a leitura depois da escrita — vira o dado da consulta ANTES da releitura. Sem
      // isso, uma releitura que falhava deixava a tela na versão anterior: a edição seguinte ia com a versão velha,
      // tomava VOZ_DIVERGENTE de um salvamento que era dela, e a recuperação pedia descartar o rascunho.
      queryClient.setQueryData<VozDaMarca>(['voz-da-marca', projectId], { contexto: r.contexto, registro: r.registro, legado: r.legado })
      // A releitura é AGUARDADA: `isPending` cobre gravação + releitura, e a tela mantém os campos desabilitados até a
      // resposta chegar (PR14-02).
      await queryClient.invalidateQueries({ queryKey: ['voz-da-marca', projectId] })
      // A voz entra em `brand.voz` do loader único: a prévia do prompt e o DNA lido pela tela acompanham.
      void queryClient.invalidateQueries({ queryKey: ['brand-dna', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['prompt-preview', projectId] })
    },
  }
}

export function useSalvarVozDaMarca(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation(gravacaoDaVozDaMarca(queryClient, projectId))
}

/**
 * Depois do PATCH do DNA (varredura do PR14-15): o que a gravação CONFIRMOU
 * vira o dado da consulta, e só então a releitura — AGUARDADA. Quem chama
 * reinicia os campos DEPOIS disto: com a releitura, do servidor; sem ela, do
 * que foi confirmado. Antes, `BrandDnaSection` reiniciava os campos do cache
 * anterior à gravação (a releitura não era aguardada): o texto salvo voltava
 * ao antigo na tela, com o Salvar aceso para regravar o antigo por cima.
 *
 * Só entram as seções que foram no patch: a resposta traz a linha crua, e as
 * outras seções da consulta podem carregar o que o loader resolve além da
 * coluna (o `visualStyle` cai no `brandStyleDescription` legado).
 */
export async function confirmarGravacaoDoDna(queryClient: QueryClient, projectId: number, patch: Record<string, unknown>, dna: Record<string, string | null>) {
  const chave = ['brand-dna', projectId]
  queryClient.setQueryData<{ dna: Record<string, string | null> }>(chave, (atual) =>
    atual ? { ...atual, dna: { ...atual.dna, ...Object.fromEntries(Object.keys(patch).map((k) => [k, dna[k] ?? null])) } } : atual,
  )
  await queryClient.invalidateQueries({ queryKey: chave })
  void queryClient.invalidateQueries({ queryKey: ['prompt-preview', projectId] })
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
