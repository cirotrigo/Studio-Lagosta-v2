/**
 * Desenho ÚNICO da camada `shape` + `svg-path` (CP-V0): o editor e o servidor
 * traçam pela mesma função e pintam com a mesma semântica.
 *
 * - `fillRule` (`style.pathFillRule`) respeitado nos dois lados;
 * - contorno em px da camada nos dois eixos (o path é traçado escalado e o
 *   transform é restaurado antes de pintar);
 * - junção redonda; pontas por `style.tracoPontas` (padrão `butt`, o do canvas).
 *
 * As cores (já com a opacidade do canal) continuam vindo de cada renderer.
 */
import type Konva from 'konva'
import type { LayerStyle } from '@/types/template'
import { tracarSvgPathNaCaixa, type CtxDeTraco, type ViewBox } from './tracar'

export interface PinturaDoSvgPath {
  fill: string
  stroke?: string
  strokeWidth: number
  fillRule: 'nonzero' | 'evenodd'
  lineJoin: 'round'
  lineCap: 'butt' | 'round'
}

export function pinturaDoSvgPath(
  style: Pick<LayerStyle, 'pathFillRule' | 'tracoPontas'>,
  cores: { fill: string; stroke?: string; strokeWidth: number },
): PinturaDoSvgPath {
  return {
    fill: cores.fill,
    stroke: cores.stroke,
    strokeWidth: cores.strokeWidth,
    fillRule: style.pathFillRule === 'evenodd' ? 'evenodd' : 'nonzero',
    lineJoin: 'round',
    lineCap: style.tracoPontas === 'round' ? 'round' : 'butt',
  }
}

export interface CtxDePintura extends CtxDeTraco {
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: number
  lineJoin: string
  lineCap: string
  fill(regra?: 'nonzero' | 'evenodd'): void
  stroke(): void
}

/** Servidor: traça e pinta direto no contexto (preenche, depois contorna — a ordem do Konva). */
export function desenharSvgPath(
  ctx: CtxDePintura,
  d: string,
  viewBox: ViewBox | undefined,
  largura: number,
  altura: number,
  pintura: PinturaDoSvgPath,
): void {
  tracarSvgPathNaCaixa(ctx, d, viewBox, largura, altura)
  ctx.fillStyle = pintura.fill
  ctx.fill(pintura.fillRule)
  if (pintura.stroke && pintura.strokeWidth > 0) {
    ctx.strokeStyle = pintura.stroke
    ctx.lineWidth = pintura.strokeWidth
    ctx.lineJoin = pintura.lineJoin
    ctx.lineCap = pintura.lineCap
    ctx.stroke()
  }
}

/**
 * Editor: atributos e `sceneFunc` do `Konva.Shape`. A pintura fica com o Konva
 * (`fillStrokeShape`), que também desenha o canvas de hit com a mesma regra de
 * preenchimento — pintar direto no ctx sujaria o colorKey e quebraria a seleção.
 */
export function shapeKonvaDoSvgPath(d: string, viewBox: ViewBox | undefined, pintura: PinturaDoSvgPath) {
  return {
    fill: pintura.fill,
    stroke: pintura.stroke,
    strokeWidth: pintura.strokeWidth,
    fillRule: pintura.fillRule,
    lineJoin: pintura.lineJoin,
    lineCap: pintura.lineCap,
    sceneFunc: (ctx: Konva.Context, shape: Konva.Shape) => {
      tracarSvgPathNaCaixa(ctx as unknown as CtxDeTraco, d, viewBox, shape.width(), shape.height())
      ctx.fillStrokeShape(shape)
    },
  }
}
