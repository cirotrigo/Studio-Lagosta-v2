import { describe, expect, it } from 'vitest'
import type Konva from 'konva'
import { desenharSvgPath, pinturaDoSvgPath, shapeKonvaDoSvgPath, type CtxDePintura } from '../desenhar'
import { segmentosDoPath } from '../tracar'

/** Contexto gravador: cada chamada e cada atribuição de estado vira uma linha. */
function gravador() {
  const ops: string[] = []
  const r = (n: number) => Math.round(n * 1000) / 1000
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_, nome: string) =>
      nome === 'ops' ? ops : (...args: unknown[]) => ops.push(`${nome}(${args.map((a) => (typeof a === 'number' ? r(a) : a)).join(',')})`),
    set: (_, nome: string, valor) => {
      ops.push(`${nome}=${valor}`)
      return true
    },
  })
  return { ctx, ops }
}

/**
 * O que o `fillStrokeShape` do Konva 9 faz com os atributos da forma (Shape._fillFunc /
 * Context._fill / _stroke): preenche com a regra do atributo e contorna com lineWidth =
 * strokeWidth. Emulado aqui só para comparar SEQUÊNCIAS; a prova com o Konva real está em
 * paridade-pixel.test.ts.
 */
function konvaFalso(attrs: ReturnType<typeof shapeKonvaDoSvgPath>, largura: number, altura: number) {
  const { ctx, ops } = gravador()
  const fillStrokeShape = () => {
    ctx.fillStyle = attrs.fill
    ;(ctx.fill as (r?: string) => void)(attrs.fillRule)
    if (attrs.stroke && attrs.strokeWidth > 0) {
      ctx.strokeStyle = attrs.stroke
      ctx.lineWidth = attrs.strokeWidth
      ctx.lineJoin = attrs.lineJoin
      ctx.lineCap = attrs.lineCap
      ;(ctx.stroke as () => void)()
    }
  }
  const kctx = new Proxy(ctx, { get: (alvo, nome) => (nome === 'fillStrokeShape' ? fillStrokeShape : alvo[nome as string]) })
  const shape = { width: () => largura, height: () => altura } as unknown as Konva.Shape
  attrs.sceneFunc(kctx as unknown as Konva.Context, shape)
  return ops
}

const ANEL = 'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z M50 25 A25 25 0 1 0 50 75 A25 25 0 1 0 50 25 Z'

describe('desenharSvgPath × adaptador do editor', () => {
  it('servidor e editor emitem a MESMA sequência (traçado + pintura) por construção', () => {
    for (const [d, estilo, cores, w, h] of [
      [ANEL, { pathFillRule: 'evenodd' as const }, { fill: '#1a3987', strokeWidth: 0 }, 200, 200],
      ['M10 10 L90 10 L90 90 L10 90 Z', {}, { fill: 'transparent', stroke: '#000', strokeWidth: 8 }, 300, 100],
      ['M10 10 L90 10', { tracoPontas: 'round' as const }, { fill: 'transparent', stroke: '#f00', strokeWidth: 4 }, 100, 300],
    ] as const) {
      const pintura = pinturaDoSvgPath(estilo, cores)
      const { ctx, ops } = gravador()
      desenharSvgPath(ctx as unknown as CtxDePintura, d, undefined, w, h, pintura)
      expect(konvaFalso(shapeKonvaDoSvgPath(d, undefined, pintura), w, h)).toEqual(ops)
    }
  })

  it('escala só no traçado e restaura antes de pintar: contorno em px da camada, sem dividir pela escala', () => {
    const { ctx, ops } = gravador()
    const pintura = pinturaDoSvgPath({}, { fill: 'transparent', stroke: '#000', strokeWidth: 8 })
    desenharSvgPath(ctx as unknown as CtxDePintura, 'M10 10 L90 10 L90 90 Z', [0, 0, 100, 100], 300, 100, pintura)
    expect(ops.slice(0, 4)).toEqual(['save()', 'scale(3,1)', 'translate(0,0)', 'beginPath()'])
    const restore = ops.indexOf('restore()')
    expect(restore).toBeLessThan(ops.indexOf('fill(nonzero)'))
    expect(ops).toContain('lineWidth=8')
    expect(ops.slice(restore)).toEqual([
      'restore()', 'fillStyle=transparent', 'fill(nonzero)', 'strokeStyle=#000', 'lineWidth=8', 'lineJoin=round', 'lineCap=butt', 'stroke()',
    ])
  })

  it('fillRule e pontas: evenodd e round só quando pedidos; sem contorno não contorna', () => {
    expect(pinturaDoSvgPath({ pathFillRule: 'evenodd' }, { fill: '#000', strokeWidth: 0 }).fillRule).toBe('evenodd')
    expect(pinturaDoSvgPath({}, { fill: '#000', strokeWidth: 0 }).fillRule).toBe('nonzero')
    expect(pinturaDoSvgPath({ tracoPontas: 'round' }, { fill: '#000', strokeWidth: 0 }).lineCap).toBe('round')
    expect(pinturaDoSvgPath({}, { fill: '#000', strokeWidth: 0 }).lineCap).toBe('butt')
    const { ctx, ops } = gravador()
    desenharSvgPath(ctx as unknown as CtxDePintura, 'M0 0 L10 0 L10 10 Z', undefined, 50, 50,
      pinturaDoSvgPath({}, { fill: '#000', stroke: '#fff', strokeWidth: 0 }))
    expect(ops).not.toContain('stroke()')
  })

  it('viewBox deslocado e de largura zero seguem a regra antiga (translate -vx,-vy; divisor 1)', () => {
    const { ctx, ops } = gravador()
    desenharSvgPath(ctx as unknown as CtxDePintura, 'M10 10 L20 20', [5, 7, 0, 50], 100, 100,
      pinturaDoSvgPath({}, { fill: '#000', strokeWidth: 0 }))
    expect(ops.slice(0, 3)).toEqual(['save()', 'scale(100,2)', 'translate(-5,-7)'])
  })

  it('parse memoizado: o mesmo d devolve o mesmo array; lixo vira lista vazia sem lançar', () => {
    expect(segmentosDoPath(ANEL)).toBe(segmentosDoPath(ANEL))
    expect(segmentosDoPath('hello')).toEqual([])
    expect(segmentosDoPath('')).toEqual([])
  })
})
