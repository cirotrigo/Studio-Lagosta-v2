/**
 * Detecção de tipo de mídia por URL/nome de arquivo — helper ÚNICO.
 *
 * Antes disto existiam três regexes divergentes (later-scheduler tinha duas,
 * media-upload uma terceira), então um mesmo MP4 podia ser vídeo num ponto do
 * fluxo e imagem em outro. Todo caminho novo deve importar daqui.
 *
 * Isomórfico de propósito (sem deps de Node) — usado no client (post-composer)
 * e no server (scheduler, media-upload).
 */

const VIDEO_EXT_RE = /\.(mp4|mov|avi|webm|m4v|mkv)(\?|#|$)/i
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif)(\?|#|$)/i

export function isVideoUrl(urlOrFilename: string): boolean {
  return detectMediaType(urlOrFilename) === 'video'
}

export function detectMediaType(
  urlOrFilename: string,
): 'image' | 'video' | 'unknown' {
  if (IMAGE_EXT_RE.test(urlOrFilename)) return 'image'
  if (VIDEO_EXT_RE.test(urlOrFilename)) return 'video'

  // Fallback: padrão de MIME type embutido na URL (ex.: data URLs, proxies)
  const lower = urlOrFilename.toLowerCase()
  if (lower.includes('image/')) return 'image'
  if (lower.includes('video/')) return 'video'

  return 'unknown'
}
