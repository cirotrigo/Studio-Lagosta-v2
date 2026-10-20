import type Konva from 'konva'
import { segmentosDoPath, tracarSegmentos, type CtxDeTraco } from '@/lib/vetor/tracar'

/**
 * Reaplica um SVG path (atributo `d`) no contexto do Konva pelo traçado único
 * (src/lib/vetor/tracar), para usar dentro de `clipFunc` (máscara de forma em
 * imagem). O render server-side faz o equivalente com
 * `Path2D` do @napi-rs/canvas; os dois lados consomem o MESMO path congelado
 * em `layer.style.mask.path` (viewBox 0 0 100 100).
 */
export function traceSvgPath(ctx: Konva.Context, d: string): void {
  tracarSegmentos(ctx as unknown as CtxDeTraco, segmentosDoPath(d))
}
