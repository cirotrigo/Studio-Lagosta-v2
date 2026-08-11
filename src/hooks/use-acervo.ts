'use client'

/**
 * Busca no acervo do projeto (`GET /api/projects/[id]/acervo`) — o catálogo
 * semântico do Drive, com fallback para a listagem crua da pasta.
 *
 * O contrato de resposta mora aqui para não ser duplicado em cada superfície
 * (picker da bancada, painel de imagens do editor…). Atenção ao efeito
 * colateral do servidor: cada busca EMITE uma sugestão de foto
 * (`LearningSignal`) — quem consome deve fechar o desfecho na primeira
 * escolha, como faz o `ArteIaImagePicker`. Por isso o hook só consulta com
 * `enabled`, nunca no mount incondicional.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface ImagemDoAcervo {
  driveFileId: string
  fileName: string
  folder: string
  menuItem: string | null
  menuCategory: string | null
  description: string | null
  tags: string[]
  bestFor: string[]
  quality: string | null
  ultimoUso: string
}

export interface RespostaDoAcervo {
  temCatalogo: boolean
  total: number
  acervoCompleto: number
  pastasDisponiveis: string[]
  images: ImagemDoAcervo[]
  aviso?: string
  /** Sinal desta busca (F1) — a lista ranqueada é a proposta. */
  sugestaoId?: string
  /** A foto do topo do ranking, a que o sistema de fato recomendou. */
  propostaTopo?: string | null
}

export interface FiltrosDoAcervo {
  tema?: string
  pasta?: string
  limite?: number
  enabled?: boolean
}

export function useAcervo(
  projectId: number,
  { tema, pasta, limite = 40, enabled = true }: FiltrosDoAcervo = {},
) {
  return useQuery<RespostaDoAcervo>({
    queryKey: ['projeto', projectId, 'acervo', tema ?? '', pasta ?? '', limite],
    enabled: enabled && Number.isFinite(projectId),
    queryFn: () => {
      const qs = new URLSearchParams()
      if (tema) qs.set('tema', tema)
      if (pasta) qs.set('pasta', pasta)
      qs.set('limite', String(limite))
      return api.get<RespostaDoAcervo>(`/api/projects/${projectId}/acervo?${qs.toString()}`)
    },
    staleTime: 2 * 60_000,
    // O "Carregar mais" refaz a consulta com limite maior; sem manter o dado
    // anterior na tela, a grade inteira piscaria para voltar com +80 fotos.
    placeholderData: (anterior) => anterior,
  })
}
