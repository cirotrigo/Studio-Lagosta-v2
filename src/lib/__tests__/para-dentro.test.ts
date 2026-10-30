/**
 * L3 das linhas-guia (29/10/2026): o encaixe pela seleção inteira, o resize proporcional que encaixa e o
 * "Trazer para dentro" — a MESMA conta do revisor (`ajusteParaDentro`), nunca copiada.
 */
import { describe, expect, it } from 'vitest'

import { margensDoEditor } from '@/lib/canvas-margin'
import { computeAlignmentGuides, DEFAULT_SNAP_CONFIG } from '@/lib/konva-smart-guides'
import { alcaDeCanto, avisosDeMargem, caixaDaSelecao, encaixeProporcional, paradasDeEncaixe, retangulosDosOutros, retangulosDeEncaixe } from '@/lib/margens-no-editor'
import { ajusteParaDentro, limitesDaFaixa } from '@/lib/creatives/revisao/para-dentro'
import type { Layer } from '@/types/template'

const camada = (id: string, type: Layer['type'], x: number, y: number, w: number, h: number, visible = true): Layer =>
  ({ id, name: id, type, visible, locked: false, order: 0, position: { x, y }, size: { width: w, height: h } }) as unknown as Layer

const story = margensDoEditor({ formato: 'story', assinatura: null, largura: 1080, altura: 1920 })
const LIM = story.marca // 92 / 1696 / 188 / 988

describe('ajusteParaDentro — a conta do revisor', () => {
  it('dentro, com folga de 2 px: nenhum lado, nada a mover', () => {
    expect(ajusteParaDentro({ x: 92, y: 188, width: 500, height: 100 }, LIM)).toEqual({ lados: [], dx: 0, dy: 0, maior: 0, vertical: false, horizontal: false })
    expect(ajusteParaDentro({ x: 90.5, y: 186.5, width: 500, height: 100 }, LIM).lados).toEqual([]) // 1,5 px é folga
  })

  it('passa do topo em 26 px → desce 28 (ceil(26 + 2)); da direita em 10 → dx −12; dos dois → dx e dy', () => {
    expect(ajusteParaDentro({ x: 100, y: 162, width: 500, height: 100 }, LIM)).toMatchObject({ lados: ['topo'], dx: 0, dy: 28, maior: 26 })
    expect(ajusteParaDentro({ x: 598, y: 300, width: 400, height: 100 }, LIM)).toMatchObject({ lados: ['direita'], dx: -12, dy: 0, maior: 10 })
    expect(ajusteParaDentro({ x: 80, y: 1650, width: 400, height: 100 }, LIM)).toMatchObject({ lados: ['base', 'esquerda'], dx: 14, dy: -56 })
  })

  it('maior que a área num eixo: avisa, mas não move nesse eixo (encurtar o texto ou reduzir a fonte)', () => {
    const a = ajusteParaDentro({ x: 92, y: 100, width: 500, height: 1800 }, LIM)
    expect(a.vertical).toBe(true)
    expect(a.dy).toBe(0)
    expect(a.lados).toEqual(['topo', 'base'])
    expect(a.horizontal).toBe(false)
  })

  it('a faixa da interface só tem topo e base: texto em y = 100 na faixa de 188 → desce 90; na de baixo → sobe', () => {
    const c = { x: 300, y: 100, width: 400, height: 60 }
    expect(ajusteParaDentro(c, limitesDaFaixa(c, story.interface!, 1920))).toMatchObject({ lados: ['topo'], dy: 90, dx: 0 })
    const b = { x: 300, y: 1750, width: 400, height: 60 } // base 1810 > 1696 em 114
    expect(ajusteParaDentro(b, limitesDaFaixa(b, story.interface!, 1920))).toMatchObject({ lados: ['base'], dy: -116, dx: 0 })
  })
})

describe('encaixe pela seleção inteira', () => {
  const layers = [camada('a', 'text', 100, 300, 200, 50), camada('b', 'text', 150, 400, 300, 50), camada('oculta', 'text', 0, 0, 50, 50, false), camada('c', 'shape', 600, 900, 100, 100)]

  it('caixaDaSelecao é a união das selecionadas VISÍVEIS; sem visível, null', () => {
    expect(caixaDaSelecao(layers, ['a', 'b', 'oculta'])).toEqual({ id: 'selecao', x: 100, y: 300, width: 350, height: 150 })
    expect(caixaDaSelecao(layers, ['oculta'])).toBeNull()
    expect(caixaDaSelecao(layers, ['x'])).toBeNull()
  })

  it('retangulosDosOutros ignora as invisíveis e a própria seleção (a posição antiga do grupo não é alvo)', () => {
    expect(retangulosDosOutros(layers, ['a', 'b']).map((r) => r.id)).toEqual(['c'])
  })

  it('o conjunto a 3 px da margem do topo encaixa em 188 pela caixa inteira (não pela camada agarrada)', () => {
    const selecao = caixaDaSelecao(layers, ['a', 'b'])!
    const movendo = { ...selecao, y: 191 }
    const r = computeAlignmentGuides(movendo, [...retangulosDosOutros(layers, ['a', 'b']), ...retangulosDeEncaixe(LIM, 1080, 1920)], 1080, 1920, { ...DEFAULT_SNAP_CONFIG, enabled: true, threshold: 5 })
    expect(r.position.y).toBe(188)
  })
})

describe('encaixeProporcional (foto, logo, elemento com proporção travada)', () => {
  const paradas = paradasDeEncaixe(LIM) // v [92, 988], h [188, 1696]
  const antiga = { x: 300, y: 500, width: 400, height: 200 } // 2:1

  it('arrastando o canto inferior direito, a direita a 3 px de 988 encaixa e a altura segue a proporção; o topo-esquerda fica', () => {
    const nova = { x: 300, y: 500, width: 685, height: 342.5 }
    const r = encaixeProporcional(antiga, nova, paradas, 5)!
    expect(r.guia).toEqual({ orientation: 'vertical', position: 988, snapType: 'end' })
    expect(r.caixa).toEqual({ x: 300, y: 500, width: 688, height: 344 })
  })

  it('arrastando o canto superior esquerdo, o topo a 3 px de 188 encaixa (anda mais na vertical); a base e a direita ficam', () => {
    const nova = { x: 250, y: 191, width: 450, height: 509 } // esquerda andou 50, topo andou 309
    const r = encaixeProporcional(antiga, nova, paradas, 5)!
    expect(r.guia).toEqual({ orientation: 'horizontal', position: 188, snapType: 'start' })
    expect(r.caixa.y).toBe(188)
    expect(r.caixa.height).toBe(700 - 188)
    expect(r.caixa.width).toBeCloseTo((700 - 188) * 2, 6)
    expect(r.caixa.x + r.caixa.width).toBeCloseTo(700, 6)
    expect(r.caixa.y + r.caixa.height).toBe(700)
  })

  it('longe das paradas, ou sem borda andando, não encaixa', () => {
    expect(encaixeProporcional(antiga, { x: 300, y: 500, width: 600, height: 300 }, paradas, 5)).toBeNull()
    expect(encaixeProporcional(antiga, antiga, paradas, 5)).toBeNull()
  })
})

describe('avisosDeMargem — avisa, nunca bloqueia', () => {
  it('texto na faixa da interface → aviso "interface" com o dy que o tira; forma cruzando a margem → "margem"; foto sangrando → nada', () => {
    const layers = [
      camada('titulo', 'text', 100, 120, 500, 60),
      camada('forma', 'shape', 60, 500, 200, 100),
      camada('foto', 'image', 0, 0, 1080, 1920),
      camada('dentro', 'text', 100, 300, 500, 60),
      camada('oculta', 'text', 0, 0, 500, 60, false),
    ]
    const avisos = avisosDeMargem(layers, story, 1920)
    expect(avisos.map((a) => [a.layerId, a.tipo])).toEqual([
      ['titulo', 'interface'],
      ['forma', 'margem'],
    ])
    expect(avisos[0].ajuste).toMatchObject({ dy: 70, dx: 0 })
    expect(avisos[1].ajuste).toMatchObject({ dx: 34, dy: 0 })
  })

  it('no Feed não há faixa: texto no topo só avisa pela margem da marca', () => {
    const feed = margensDoEditor({ formato: 'feed', assinatura: null, largura: 1080, altura: 1350 })
    const avisos = avisosDeMargem([camada('t', 'text', 100, 100, 500, 60)], feed, 1350)
    expect(avisos.map((a) => a.tipo)).toEqual(['margem'])
    expect(avisos[0].ajuste.dy).toBe(22)
  })
})

describe('avisosDeMargem — um clique resolve faixa E margem', () => {
  it('Wine (marca topo 200 > faixa 188): a logo na faixa sai com o dy até a MARGEM (200), não só até a faixa', () => {
    const WINE = { geometria: { story: { margemH: 96, safeTopo: 200, safeRodape: 150 } } }
    const wine = margensDoEditor({ formato: 'story', assinatura: WINE, largura: 1080, altura: 1920 })
    const avisos = avisosDeMargem([camada('logo', 'logo', 420, 150, 240, 100)], wine, 1920)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('interface')
    expect(avisos[0].ajuste).toMatchObject({ dy: 52, dx: 0 }) // 200 − 150 = 50, +2 de folga; na faixa seria 40
  })

  it('Real (marca rodapé 350 > faixa 224): texto na faixa de baixo sobe até a margem da marca', () => {
    const REAL = { geometria: { story: { margemH: 96, safeTopo: 250, safeRodape: 350 } } }
    const real = margensDoEditor({ formato: 'story', assinatura: REAL, largura: 1080, altura: 1920 })
    const avisos = avisosDeMargem([camada('t', 'text', 100, 1720, 500, 60)], real, 1920)
    expect(avisos[0].tipo).toBe('interface')
    expect(avisos[0].ajuste.dy).toBe(-(1780 - 1570 + 2)) // base 1780 contra a linha 1920 − 350 = 1570
  })
})

describe('avisosDeMargem — ajustes da revisão R1', () => {
  it('camada travada avisa, mas vem marcada (o botão não a move)', () => {
    const travada = { ...camada('t', 'text', 60, 500, 300, 60), locked: true } as Layer
    const avisos = avisosDeMargem([travada], story, 1920)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].travada).toBe(true)
    expect(avisosDeMargem([camada('t', 'text', 60, 500, 300, 60)], story, 1920)[0].travada).toBe(false)
  })

  it('forma mais larga que a área (1000 > 896) não ganha dx: o botão não oscila; a conta do revisor fica como está', () => {
    const avisos = avisosDeMargem([camada('f', 'shape', 92, 500, 1000, 100)], story, 1920)
    expect(avisos[0].ajuste).toMatchObject({ dx: 0, horizontal: true, lados: ['direita'] })
    expect(ajusteParaDentro({ x: 92, y: 500, width: 1000, height: 100 }, LIM).dx).toBe(-106) // o revisor continua propondo
  })

  it('texto em (60,100) no Story padrão: UM ajuste resolve esquerda e faixa', () => {
    const avisos = avisosDeMargem([camada('t', 'text', 60, 100, 300, 60)], story, 1920)
    expect(avisos[0].tipo).toBe('interface')
    expect(avisos[0].ajuste).toMatchObject({ dx: 34, dy: 90 })
  })

  it('alcaDeCanto: só as quatro alças de canto do Transformer', () => {
    expect(alcaDeCanto('top-left')).toBe(true)
    expect(alcaDeCanto('bottom-right')).toBe(true)
    expect(alcaDeCanto('middle-right')).toBe(false)
    expect(alcaDeCanto('top-center')).toBe(false)
    expect(alcaDeCanto(undefined)).toBe(false)
  })
})
