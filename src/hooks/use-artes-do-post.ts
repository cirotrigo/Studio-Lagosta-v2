'use client'

/**
 * As artes do post, slide a slide, do lado do navegador.
 *
 * Existe para a revisão da agenda saber QUAL arte está na tela: num carrossel,
 * `SocialPost.generationId` responde sempre pelo primeiro slide, e a barra
 * gravava o "Gostei" do slide 5 na arte do slide 1.
 *
 * ⚠️ Falha nunca vira toast — a lista volta vazia e a barra some, do mesmo
 * jeito que o post sem arte registrada. É telemetria de revisão, não a arte.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { ArteDoPost } from '@/lib/posts/artes-do-post'

interface Resposta {
  artes: ArteDoPost[]
}

export function chaveDasArtesDoPost(postId: string | null | undefined) {
  return ['artes-do-post', postId] as const
}

export function useArtesDoPost(postId: string | null | undefined) {
  return useQuery<Resposta>({
    queryKey: chaveDasArtesDoPost(postId),
    queryFn: () => api.get<Resposta>(`/api/posts/${postId}/artes`),
    enabled: !!postId,
    // O vínculo arte↔slide só muda quando alguém troca a arte do post, e essas
    // ações já invalidam as consultas do post.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

/**
 * O `generationId` do slide visível.
 *
 * A coluna do post é o fallback do PRIMEIRO slide (e só dele): usá-la nos
 * demais devolveria a arte da capa com cara de arte do slide aberto.
 */
export function arteDoSlide(
  artes: ArteDoPost[] | undefined,
  indice: number,
  generationIdDoPost: string | null | undefined,
): string | null {
  const arte = artes?.find((a) => a.indice === indice)
  if (arte) return arte.generationId
  return indice === 0 ? (generationIdDoPost ?? null) : null
}
