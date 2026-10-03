/**
 * A ARTE de uma página: a Generation mais recente que a desenha como IMAGEM.
 *
 * Puro. Toda leitura de "qual é a arte desta página" (recomposição, trava do
 * revisor, faixa da agenda no editor) passa por aqui, e o critério exclui
 * vídeo: o export de vídeo da página e a Generation `post-schedule` que
 * `ensurePostGeneration` cria para um post de vídeo têm `resultUrl` MP4 — e
 * tomá-las por arte faria a recomposição "refazer" um vídeo como PNG, a trava
 * do revisor marcar a Generation errada e a faixa chamar de slide o próprio
 * post de vídeo.
 */
import { isVideoUrl } from '@/lib/media-type'
import { ehExportDeVideo } from '@/lib/posts/post-de-video'

export interface GeracaoCandidata {
  resultUrl: string | null
  fieldValues: unknown
  createdAt?: Date | string
}

export function ehArteDaPagina(gen: GeracaoCandidata, pageId?: string): boolean {
  const fv = gen.fieldValues
  if (!fv || typeof fv !== 'object' || Array.isArray(fv)) return false
  if (pageId !== undefined && (fv as Record<string, unknown>).pageId !== pageId) return false
  if (ehExportDeVideo(fv)) return false
  return !gen.resultUrl || !isVideoUrl(gen.resultUrl)
}

/** A mais recente entre as que são arte (a lista pode vir em qualquer ordem). */
export function arteDaPagina<T extends GeracaoCandidata>(geracoes: T[], pageId?: string): T | null {
  let melhor: T | null = null
  for (const g of geracoes) {
    if (!ehArteDaPagina(g, pageId)) continue
    if (!melhor) { melhor = g; continue }
    const a = g.createdAt ? new Date(g.createdAt).getTime() : 0
    const b = melhor.createdAt ? new Date(melhor.createdAt).getTime() : 0
    if (a > b) melhor = g
  }
  return melhor
}
