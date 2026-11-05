/**
 * CP-V1 — espelho (`style.flipH`/`style.flipV`) da forma `svg-path`, pelo traçado único.
 *
 * Sequência (contexto gravador): o espelho entra no transform restaurado antes da escala do
 * path; sem `true` literal, nenhuma chamada a mais; editor e servidor iguais por construção.
 * Pixels (no MESMO canvas de Node, @napi-rs/canvas): servidor (CanvasRenderer → RenderEngine)
 * × Konva real no Node (suporte/konva-no-node.ts). Como no CP-V0, isto NÃO prova o Konva do
 * navegador nem o exportador do editor.
 */
import { describe, expect, it } from 'vitest'
import type Konva from 'konva'
import type { Layer, LayerStyle } from '@/types/template'
import { desenharSvgPath, pinturaDoSvgPath, shapeKonvaDoSvgPath, type CtxDePintura } from '../desenhar'
import { comparar, escuro, maiorCorrida, pixelsDoKonva, pixelsDoServidor, type Pixels } from './suporte/konva-no-node'

function gravador() {
  const ops: string[] = []
  const r = (n: number) => Math.round(n * 1000) / 1000
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_, nome: string) => (...args: unknown[]) => ops.push(`${nome}(${args.map((a) => (typeof a === 'number' ? r(a) : a)).join(',')})`),
    set: (_, nome: string, valor) => {
      ops.push(`${nome}=${valor}`)
      return true
    },
  })
  return { ctx, ops }
}

/** O sceneFunc do editor com o `fillStrokeShape` gravado (a sequência do Konva 9; a prova real é a de pixel abaixo). */
function opsDoEditor(attrs: ReturnType<typeof shapeKonvaDoSvgPath>, largura: number, altura: number) {
  const { ctx, ops } = gravador()
  const kctx = new Proxy(ctx, {
    get: (alvo, nome) =>
      nome === 'fillStrokeShape'
        ? () => {
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
        : alvo[nome as string],
  })
  attrs.sceneFunc(kctx as unknown as Konva.Context, { width: () => largura, height: () => altura } as unknown as Konva.Shape)
  return ops
}

// Seta para a direita: assimétrica em x E em y (a ponta fica acima do meio), então cada espelho muda o desenho.
const SETA = 'M10 20 L70 20 L70 5 L95 35 L70 65 L70 50 L10 50 Z'
const ANEL = 'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z M50 25 A25 25 0 1 0 50 75 A25 25 0 1 0 50 25 Z'
const COR = '#1a3987'

function opsDoServidor(d: string, estilo: Partial<LayerStyle>, w: number, h: number, stroke?: string) {
  const { ctx, ops } = gravador()
  desenharSvgPath(ctx as unknown as CtxDePintura, d, undefined, w, h, pinturaDoSvgPath(estilo, { fill: COR, stroke, strokeWidth: stroke ? 6 : 0 }))
  return ops
}

describe('CP-V1: espelho no traçado (sequência)', () => {
  it('sem true literal NÃO espelha e a sequência é a do CP-V0 (camadas sem os campos não mudam)', () => {
    const base = opsDoServidor(SETA, {}, 300, 100, '#000')
    expect(base.slice(0, 4)).toEqual(['save()', 'scale(3,1)', 'translate(0,0)', 'beginPath()'])
    for (const estilo of [{ flipH: false, flipV: false }, { flipH: undefined }, { flipH: 'true' }, { flipV: 1 }, { flipH: null }] as unknown as Partial<LayerStyle>[]) {
      expect(opsDoServidor(SETA, estilo, 300, 100, '#000')).toEqual(base)
    }
    expect(pinturaDoSvgPath({}, { fill: COR, strokeWidth: 0 }).espelho).toEqual({ h: false, v: false })
  })

  it('H, V e H+V: reflexão em torno do centro da caixa ANTES da escala do path, dentro do save/restore', () => {
    expect(opsDoServidor(SETA, { flipH: true }, 300, 100).slice(0, 5)).toEqual(['save()', 'translate(300,0)', 'scale(-1,1)', 'scale(3,1)', 'translate(0,0)'])
    expect(opsDoServidor(SETA, { flipV: true }, 300, 100).slice(0, 5)).toEqual(['save()', 'translate(0,100)', 'scale(1,-1)', 'scale(3,1)', 'translate(0,0)'])
    expect(opsDoServidor(SETA, { flipH: true, flipV: true }, 300, 100).slice(0, 5)).toEqual(['save()', 'translate(300,100)', 'scale(-1,-1)', 'scale(3,1)', 'translate(0,0)'])
    // o contorno é pintado DEPOIS do restore: espessura em px da camada, igual com ou sem espelho
    const ops = opsDoServidor(SETA, { flipH: true }, 300, 100, '#000')
    expect(ops.indexOf('restore()')).toBeLessThan(ops.indexOf('stroke()'))
    expect(ops.slice(ops.indexOf('restore()'))).toEqual(opsDoServidor(SETA, {}, 300, 100, '#000').slice(opsDoServidor(SETA, {}, 300, 100, '#000').indexOf('restore()')))
  })

  it('editor e servidor emitem a MESMA sequência com espelho, por construção', () => {
    for (const estilo of [{ flipH: true }, { flipV: true }, { flipH: true, flipV: true }, { flipH: true, pathFillRule: 'evenodd' as const, tracoPontas: 'round' as const }]) {
      const pintura = pinturaDoSvgPath(estilo, { fill: COR, stroke: '#000', strokeWidth: 6 })
      const { ctx, ops } = gravador()
      desenharSvgPath(ctx as unknown as CtxDePintura, SETA, undefined, 300, 100, pintura)
      expect(opsDoEditor(shapeKonvaDoSvgPath(SETA, undefined, pintura), 300, 100)).toEqual(ops)
    }
  })
})

// ───────────────────────────── pixels ─────────────────────────────

const FUNDO = '#ffffff'
const W = 300
const H = 100

function camada(estilo: Partial<LayerStyle>, extra: Partial<Layer> = {}, d = SETA): Layer {
  return {
    id: 'seta', type: 'shape', name: 'seta', visible: true, locked: false, order: 0,
    position: { x: 0, y: 0 }, size: { width: W, height: H },
    style: { shapeType: 'svg-path', pathData: d, fill: COR, strokeColor: '#000000', strokeWidth: 6, ...estilo },
    ...extra,
  }
}

function configDoEditor(l: Layer) {
  return {
    x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height, rotation: l.rotation ?? 0,
    ...shapeKonvaDoSvgPath(l.style!.pathData!, undefined, pinturaDoSvgPath(l.style!, { fill: COR, stroke: '#000000', strokeWidth: 6 })),
  }
}

/** Reflexo de uma imagem inteira (a caixa ocupa o canvas todo, então o espelho da caixa é o da imagem). */
function refletir(p: Pixels, h: boolean, v: boolean): Pixels {
  const dados = new Uint8ClampedArray(p.dados.length)
  for (let y = 0; y < p.altura; y++) {
    for (let x = 0; x < p.largura; x++) {
      const de = ((v ? p.altura - 1 - y : y) * p.largura + (h ? p.largura - 1 - x : x)) * 4
      dados.set(p.dados.subarray(de, de + 4), (y * p.largura + x) * 4)
    }
  }
  return { largura: p.largura, altura: p.altura, dados }
}

// tolerância declarada (só onde a geometria passa por outro caminho de ponto flutuante): borda de antisserrilhado
const SO_BORDA = 0.01

describe('CP-V1: espelho em pixels', () => {
  it('H, V e H+V: o desenho espelhado é o reflexo do original, com contorno incluso; servidor = editor', async () => {
    const original = await pixelsDoServidor(W, H, FUNDO, [camada({})])
    for (const [h, v] of [[true, false], [false, true], [true, true]] as const) {
      const l = camada({ flipH: h, flipV: v })
      const servidor = await pixelsDoServidor(W, H, FUNDO, [l])
      const editor = pixelsDoKonva(W, H, FUNDO, configDoEditor(l))
      expect(comparar(servidor, editor)).toEqual({ diferentes: 0, maxDelta: 0, total: W * H })
      const reflexo = comparar(servidor, refletir(original, h, v))
      expect(reflexo.diferentes / reflexo.total).toBeLessThan(SO_BORDA)
    }
    // a ponta: original à direita (x = 95% de 300), espelhada em H à esquerda
    const espelhada = await pixelsDoServidor(W, H, FUNDO, [camada({ flipH: true })])
    expect(escuro(original, 280, 35)).toBe(true)
    expect(escuro(espelhada, 280, 35)).toBe(false)
    expect(escuro(espelhada, 19, 35)).toBe(true)
  })

  it('o contorno mantém 6 px nos dois eixos com espelho (px da camada)', async () => {
    const l = camada({ flipH: true, flipV: true, fill: 'transparent' })
    const servidor = await pixelsDoServidor(W, H, FUNDO, [l])
    const editor = pixelsDoKonva(W, H, FUNDO, { ...configDoEditor(l), fill: 'transparent' })
    // H+V: a haste de y=20..50 vira y=50..80; o fundo dela, em x=10 do viewBox (30 px), vira x=270 (300 − 30)
    for (const p of [servidor, editor]) {
      expect(maiorCorrida(p, 'y', 150, 60, 90)).toBe(6) // lado de baixo da haste espelhada (y = 80)
      expect(maiorCorrida(p, 'x', 65, 250, 290)).toBe(6) // fundo da haste espelhada (x = 270)
    }
  })

  it('fillRule preservado: o anel evenodd espelhado continua vazado nos dois lados', async () => {
    const l = camada({ flipH: true, pathFillRule: 'evenodd', strokeWidth: 0 }, { size: { width: 200, height: 200 } }, ANEL)
    const servidor = await pixelsDoServidor(200, 200, FUNDO, [l])
    const editor = pixelsDoKonva(200, 200, FUNDO, { ...configDoEditor(l), strokeWidth: 0 })
    for (const p of [servidor, editor]) {
      expect(escuro(p, 100, 100)).toBe(false) // o furo
      expect(escuro(p, 100, 10)).toBe(true) // o aro
    }
    expect(comparar(servidor, editor).diferentes).toBe(0)
  })

  it('forma girada: o espelho fica DENTRO da caixa (H+V a 30° = mesma caixa a 210° pelo canto oposto)', async () => {
    const W2 = 400
    const H2 = 400
    const theta = (30 * Math.PI) / 180
    const p = { x: 60, y: 40 } // os quatro cantos da caixa girada ficam dentro dos 400 × 400
    const a = camada({ flipH: true, flipV: true }, { position: p, rotation: 30 })
    // H+V dentro da caixa = meia-volta em torno do centro dela; com a rotação em torno do canto (x, y), como no Konva,
    // isso é a mesma caixa girada 210° a partir do canto oposto: p + R(30°)·(w, h)
    const b = camada({}, {
      position: { x: p.x + W * Math.cos(theta) - H * Math.sin(theta), y: p.y + W * Math.sin(theta) + H * Math.cos(theta) },
      rotation: 210,
    })
    const servidorA = await pixelsDoServidor(W2, H2, FUNDO, [a])
    const servidorB = await pixelsDoServidor(W2, H2, FUNDO, [b])
    const meiaVolta = comparar(servidorA, servidorB)
    expect(meiaVolta.diferentes / meiaVolta.total).toBeLessThan(SO_BORDA)
    // o editor gira o nó (rotation do Konva) e espelha no traçado: mesmo desenho que o servidor
    const editorA = pixelsDoKonva(W2, H2, FUNDO, configDoEditor(a))
    const editorServidor = comparar(servidorA, editorA)
    expect(editorServidor.diferentes / editorServidor.total).toBeLessThan(SO_BORDA)
    // e o espelho girado não é o desenho sem espelho
    const semEspelho = comparar(servidorA, await pixelsDoServidor(W2, H2, FUNDO, [camada({}, { position: p, rotation: 30 })]))
    expect(semEspelho.diferentes).toBeGreaterThan(1000)
  })
})
