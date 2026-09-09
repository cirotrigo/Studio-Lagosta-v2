import { calculateImageCrop, type CropPosition } from '@/lib/image-crop-utils'
import type { Rect } from '@/lib/creatives/halo/halo'

export interface AssuntoNormalizado { x0: number; y0: number; x1: number; y1: number }

/** v3 guarda um nome em assunto; nunca interpretar texto como uma caixa. */
export function lerCaixaDoAssunto(valor: unknown): AssuntoNormalizado | null {
  if (!valor || typeof valor !== 'object') return null
  const a = valor as AssuntoNormalizado
  if ([a.x0, a.y0, a.x1, a.y1].some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) return null
  return a.x1 > a.x0 && a.y1 > a.y0 ? { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 } : null
}

/** Mantém a caixa fora do canvas: sua interseção mede o que o corte preservou. */
export function assuntoEmPixels(a: AssuntoNormalizado, foto: { width: number; height: number }, canvas: { width: number; height: number }, posicao: CropPosition): Rect {
  const crop = calculateImageCrop(foto, canvas, posicao)
  const sx = canvas.width / crop.cropWidth
  const sy = canvas.height / crop.cropHeight
  return { x: (a.x0 * foto.width - crop.cropX) * sx, y: (a.y0 * foto.height - crop.cropY) * sy, width: (a.x1 - a.x0) * foto.width * sx, height: (a.y1 - a.y0) * foto.height * sy }
}

export function fracaoVisivelDoAssunto(a: Rect, canvas: { width: number; height: number }): number {
  const w = Math.max(0, Math.min(canvas.width, a.x + a.width) - Math.max(0, a.x))
  const h = Math.max(0, Math.min(canvas.height, a.y + a.height) - Math.max(0, a.y))
  return a.width > 0 && a.height > 0 ? w * h / (a.width * a.height) : 0
}
