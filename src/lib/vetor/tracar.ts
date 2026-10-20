/**
 * Traçado ÚNICO de path SVG (atributo `d`) — o mesmo para o editor (Konva) e para o
 * servidor (RenderEngine em @napi-rs/canvas). CP-V0 da trilha do editor.
 *
 * Parser: `Konva.Path.parsePathData` (o que o editor sempre usou), importado do
 * arquivo do Path — não do pacote raiz, que no Node exige o `canvas` nativo. Ele
 * devolve só M, L, C, Q, A (arco em parametrização de centro) e z, já absolutos.
 *
 * Diferença conhecida do parser em relação à especificação SVG: comando relativo
 * logo depois de `z` sem `m` parte do último ponto desenhado, não do início do
 * subpath. O validador (`validar.ts`) recusa esse caso nas portas de escrita.
 */
import { Path } from 'konva/lib/shapes/Path'

export interface Segmento {
  command: string
  points: number[]
}

/** O mínimo de contexto 2D que o traçado usa: Konva.Context e o ctx do napi têm os mesmos nomes. */
export interface CtxDeTraco {
  save(): void
  restore(): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void
  quadraticCurveTo(a: number, b: number, c: number, d: number): void
  arc(x: number, y: number, r: number, inicio: number, fim: number, antiHorario?: boolean): void
  translate(x: number, y: number): void
  rotate(angulo: number): void
  scale(x: number, y: number): void
}

export type ViewBox = [number, number, number, number]

const MEMO_MAX = 500
const memo = new Map<string, Segmento[]>()

/** Segmentos do `d`, memoizados. Path que o parser não entende vira lista vazia (nada desenhado). */
export function segmentosDoPath(d: string): Segmento[] {
  let segmentos = memo.get(d)
  if (!segmentos) {
    try {
      segmentos = Path.parsePathData(d) as Segmento[]
    } catch {
      segmentos = []
    }
    // ponytail: ao lotar, esvazia tudo; trocar por LRU se uma página viva passar de 500 paths distintos
    if (memo.size >= MEMO_MAX) memo.clear()
    memo.set(d, segmentos)
  }
  return segmentos
}

/** Reproduz os segmentos no contexto — a mesma tradução do `Konva.Path._sceneFunc`. */
export function tracarSegmentos(ctx: CtxDeTraco, segmentos: Segmento[]): void {
  for (const { command, points: p } of segmentos) {
    switch (command) {
      case 'M':
        ctx.moveTo(p[0], p[1])
        break
      case 'L':
        ctx.lineTo(p[0], p[1])
        break
      case 'C':
        ctx.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5])
        break
      case 'Q':
        ctx.quadraticCurveTo(p[0], p[1], p[2], p[3])
        break
      case 'A': {
        // parsePathData converte o arco de endpoint para center parameterization
        const [cx, cy, rx, ry, theta, dTheta, psi, fs] = p
        const r = rx > ry ? rx : ry
        const scaleX = rx > ry ? 1 : rx / ry
        const scaleY = rx > ry ? ry / rx : 1
        ctx.translate(cx, cy)
        ctx.rotate(psi)
        ctx.scale(scaleX, scaleY)
        ctx.arc(0, 0, r, theta, theta + dTheta, 1 - fs > 0)
        ctx.scale(1 / scaleX, 1 / scaleY)
        ctx.rotate(-psi)
        ctx.translate(-cx, -cy)
        break
      }
      case 'z':
        ctx.closePath()
        break
      default:
        break
    }
  }
}

/**
 * Traça o path JÁ escalado para a caixa (largura × altura da camada) e restaura o
 * transform: quem preenche ou contorna depois trabalha em px da camada, então o
 * contorno tem a mesma espessura nos dois eixos, inclusive em caixa não quadrada.
 */
export function tracarSvgPathNaCaixa(
  ctx: CtxDeTraco,
  d: string,
  viewBox: ViewBox | undefined,
  largura: number,
  altura: number,
): void {
  const [vx, vy, vw, vh] = viewBox ?? [0, 0, 100, 100]
  ctx.save()
  ctx.scale(largura / (vw || 1), altura / (vh || 1))
  ctx.translate(-vx, -vy)
  ctx.beginPath()
  tracarSegmentos(ctx, segmentosDoPath(d))
  ctx.restore()
}
