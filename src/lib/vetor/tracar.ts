/**
 * Traçado ÚNICO de path SVG (atributo `d`) — o mesmo para o editor (Konva) e para o
 * servidor (RenderEngine em @napi-rs/canvas). CP-V0 da trilha do editor.
 *
 * Parser: `Konva.Path.parsePathData` (o que o editor sempre usou), importado do
 * arquivo do Path — não do pacote raiz, que no Node exige o `canvas` nativo. Ele
 * devolve só M, L, C, Q, A (arco em parametrização de centro) e z, já absolutos.
 *
 * Onde o parser diverge da especificação SVG (o validador, `validar.ts`, recusa
 * todos esses casos nas portas de escrita):
 * - comando relativo logo depois de `z` sem `m` parte do último ponto desenhado,
 *   não do início do subpath;
 * - flags de arco coladas (`a25 25 0 1010 10`) viram um número só;
 * - número com ponto e expoente sem decimal (`10.e5`) vira dois números;
 * - arco com raio negativo sai com ângulos errados e raio zero sai com NaN. Aqui o
 *   traçado PULA o arco com raio <= 0 ou número não finito (o canvas do navegador
 *   lança IndexSizeError com raio negativo; o SVG desenharia uma reta).
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

/** Espelhamento da forma DENTRO da própria caixa (CP-V1): `style.flipH` → `h`, `style.flipV` → `v`. */
export interface Espelho {
  h: boolean
  v: boolean
}

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
        if (!(rx > 0 && ry > 0) || !p.every(Number.isFinite)) break
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
 *
 * O espelho (CP-V1) também entra no transform restaurado: reflete o path em torno do
 * centro da caixa, então a caixa, a rotação da camada e o contorno ficam como estão.
 * Sem espelho, a sequência de chamadas é exatamente a de antes.
 */
export function tracarSvgPathNaCaixa(
  ctx: CtxDeTraco,
  d: string,
  viewBox: ViewBox | undefined,
  largura: number,
  altura: number,
  espelho?: Espelho,
): void {
  const [vx, vy, vw, vh] = viewBox ?? [0, 0, 100, 100]
  ctx.save()
  try {
    if (espelho?.h || espelho?.v) {
      ctx.translate(espelho.h ? largura : 0, espelho.v ? altura : 0)
      ctx.scale(espelho.h ? -1 : 1, espelho.v ? -1 : 1)
    }
    ctx.scale(largura / (vw || 1), altura / (vh || 1))
    ctx.translate(-vx, -vy)
    ctx.beginPath()
    tracarSegmentos(ctx, segmentosDoPath(d))
  } finally {
    // se algo lançar no meio, a escala do path não vaza para as camadas seguintes
    ctx.restore()
  }
}
