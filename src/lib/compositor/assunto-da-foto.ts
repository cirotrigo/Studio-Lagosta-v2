import { calculateImageCrop, type CropPosition } from '@/lib/image-crop-utils'
import type { Rect } from '@/lib/creatives/halo/halo'
import { extractDriveFileId } from '@/lib/ai/fetch-image-source'
import { janelaEmPx, type Janela } from './corte-da-foto'

export interface AssuntoNormalizado { x0: number; y0: number; x1: number; y1: number }

export interface FonteDaFoto {
  id: string | null
  coerente: boolean
  motivo?: 'url-nao-renderizada-pelo-drive' | 'id-diverge-da-url' | 'sem-id'
}

/**
 * O id da foto para o catálogo e se a caixa dele vale sobre a imagem DESENHADA (F2b). A caixa é lida na miniatura, que o
 * Drive renderiza com a orientação aplicada: só vale sobre a cópia dele (`driveFileId`, `s1920`) e a lh3 `/d/<id>`. Segue
 * a precedência do carregamento (`persist.ts:132`): com `url`, a fonte desenhada é a URL, e o proxy e o Blob servem o
 * arquivo original.
 */
export function fonteDaFoto(foto: { url?: string | null; driveFileId?: string | null }): FonteDaFoto {
  if (!foto.url) return foto.driveFileId ? { id: foto.driveFileId, coerente: true } : { id: null, coerente: false, motivo: 'sem-id' }
  const id = extractDriveFileId(foto.url)
  if (!id) return { id: null, coerente: false, motivo: foto.driveFileId ? 'url-nao-renderizada-pelo-drive' : 'sem-id' }
  if (foto.driveFileId && foto.driveFileId !== id) return { id, coerente: false, motivo: 'id-diverge-da-url' }
  if (!/^https:\/\/lh3\.googleusercontent\.com\/d\//.test(foto.url)) return { id, coerente: false, motivo: 'url-nao-renderizada-pelo-drive' }
  return { id, coerente: true }
}

/** v3 guarda um nome em assunto; nunca interpretar texto como uma caixa. */
export function lerCaixaDoAssunto(valor: unknown): AssuntoNormalizado | null {
  if (!valor || typeof valor !== 'object') return null
  const a = valor as AssuntoNormalizado
  if ([a.x0, a.y0, a.x1, a.y1].some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) return null
  return a.x1 > a.x0 && a.y1 > a.y0 ? { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 } : null
}

/** Mantém a caixa fora do canvas: sua interseção mede o que o corte preservou. F2a: a janela (frações) vale como a âncora. */
export function assuntoEmPixels(a: AssuntoNormalizado, foto: { width: number; height: number }, canvas: { width: number; height: number }, posicao: CropPosition | Janela): Rect {
  const crop = typeof posicao === 'string' ? calculateImageCrop(foto, canvas, posicao) : janelaEmPx(posicao, foto)
  const sx = canvas.width / crop.cropWidth
  const sy = canvas.height / crop.cropHeight
  return { x: (a.x0 * foto.width - crop.cropX) * sx, y: (a.y0 * foto.height - crop.cropY) * sy, width: (a.x1 - a.x0) * foto.width * sx, height: (a.y1 - a.y0) * foto.height * sy }
}

export function fracaoVisivelDoAssunto(a: Rect, canvas: { width: number; height: number }): number {
  const w = Math.max(0, Math.min(canvas.width, a.x + a.width) - Math.max(0, a.x))
  const h = Math.max(0, Math.min(canvas.height, a.y + a.height) - Math.max(0, a.y))
  return a.width > 0 && a.height > 0 ? w * h / (a.width * a.height) : 0
}
