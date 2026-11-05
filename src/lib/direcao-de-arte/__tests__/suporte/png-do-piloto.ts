/** Piloto sintético (§ 2, passo 7) — o PNG FINAL é renderizado PELO PILOTO (o harness do CP5e não produz PNG) e contado à parte. */
import { createHash } from 'node:crypto'
import type { Layer } from '@/types/template'

export async function pngDaPeca(layers: Layer[], canvas: { width: number; height: number }, background: string): Promise<{ png: Buffer; sha256: string }> {
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const png = await new CanvasRenderer(canvas.width, canvas.height).renderDesign({ canvas: { ...canvas, backgroundColor: background }, layers }, {})
  return { png, sha256: createHash('sha256').update(png).digest('hex') }
}
