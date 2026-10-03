/**
 * O post é de VÍDEO: a marca persistente (`SocialPost.videoDaPagina`, gravada
 * quando a mídia nasce como MP4 da página) ou qualquer mídia de vídeo.
 *
 * Puro de propósito. É a pergunta que toda porta que poderia trocar a mídia
 * pelo render da página precisa fazer ANTES de agir — aprovação, invalidação,
 * `renderPostArt`, o executor e as tools do MCP local. A marca é o que segura o
 * post cuja mídia foi limpa à mão: `mediaUrls: []` sozinho parece "post de
 * imagem à espera do render", e o render publicaria uma foto parada.
 */
import { isVideoUrl } from '@/lib/media-type'

export interface PostParaVideo {
  videoDaPagina?: boolean | null
  mediaUrls?: string[] | null
}

export function postDeVideo(post: PostParaVideo): boolean {
  if (post.videoDaPagina === true) return true
  return (post.mediaUrls ?? []).some((url) => typeof url === 'string' && isVideoUrl(url))
}

/** A Generation é um export de vídeo do editor (a fila de vídeo grava `isVideo`/`videoExport`). */
export function ehExportDeVideo(fieldValues: unknown): boolean {
  if (!fieldValues || typeof fieldValues !== 'object' || Array.isArray(fieldValues)) return false
  const fv = fieldValues as Record<string, unknown>
  return fv.isVideo === true || fv.isVideo === 'true' || fv.videoExport === true
}

/** O motivo de recusa que as portas de render mostram para o post de vídeo sem a mídia. */
export const MOTIVO_VIDEO_REMOVIDO = 'O vídeo deste post foi removido — gere de novo no editor.'
