/**
 * Destaque por marcação na camada `text` (05/11/2026): `content` limpo +
 * `destaques` (offsets) + `destaque` (estilo). Os colchetes só existem nas
 * bordas (caixa do editor, MCP): ida por `lerDestaquesDoTexto`, volta por
 * `linhasComColchetes`, desenho por `segmentosDoTexto`.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { destaqueDaCamada, lerDestaquesDoTexto, linhasComColchetes, segmentosDoTexto } from '../destaques'

const texto = (extra: Partial<Layer> = {}): Layer => ({
  id: 't1',
  type: 'text',
  name: 'Manchete',
  visible: true,
  locked: false,
  order: 0,
  position: { x: 0, y: 0 },
  size: { width: 600, height: 200 },
  content: 'Picanha na brasa',
  style: { fontFamily: 'StageGrotesk Thin', fontSize: 64, color: '#ffffff' },
  ...extra,
})

describe('ida e volta dos colchetes', () => {
  it('a caixa grava content limpo e offsets; a volta recoloca os colchetes', () => {
    const lido = lerDestaquesDoTexto('Picanha [na brasa]')
    expect(lido).toEqual({ texto: 'Picanha na brasa', trechos: [{ inicio: 8, fim: 16 }], problema: null })
    const camada = texto({ destaques: lido.trechos })
    expect(linhasComColchetes(camada)).toEqual(['Picanha [na brasa]'])
  })

  it('várias linhas: offsets no texto inteiro, com as quebras', () => {
    const lido = lerDestaquesDoTexto('Terça é dia\nde [rodízio]')
    expect(lido.texto).toBe('Terça é dia\nde rodízio')
    expect(lido.texto.slice(lido.trechos[0].inicio, lido.trechos[0].fim)).toBe('rodízio')
    expect(linhasComColchetes(texto({ content: lido.texto, destaques: lido.trechos }))).toEqual(['Terça é dia', 'de [rodízio]'])
  })

  it('colchete sem par é aviso, nunca erro — e não vira destaque', () => {
    const lido = lerDestaquesDoTexto('Vem [pro Real')
    expect(lido.texto).toBe('Vem pro Real')
    expect(lido.trechos).toEqual([])
    expect(lido.problema).toMatch(/sem fechar/)
  })

  it('texto sem destaques e rich-text seguem como antes', () => {
    expect(linhasComColchetes(texto())).toBeNull()
    expect(linhasComColchetes(texto({ destaques: [] }))).toBeNull()
    const rich = texto({ type: 'rich-text', richTextStyles: [{ start: 8, end: 16, fill: '#ff0000' }] })
    expect(linhasComColchetes(rich)).toEqual(['Picanha [na brasa]'])
  })
})

describe('segmentosDoTexto', () => {
  it('texto sem destaques (e rich-text) devolve null: nada muda no desenho', () => {
    expect(segmentosDoTexto(texto())).toBeNull()
    expect(segmentosDoTexto(texto({ destaques: [] }))).toBeNull()
    expect(segmentosDoTexto(texto({ destaques: [{ inicio: 20, fim: 30 }] }))).toBeNull()
    expect(segmentosDoTexto(texto({ type: 'rich-text', destaques: [{ inicio: 8, fim: 16 }] }))).toBeNull()
  })

  it('sem sombra: só o trecho destacado, com o estilo gravado', () => {
    const camada = texto({ destaques: [{ inicio: 8, fim: 16 }], destaque: { fill: '#e63946', fontFamily: 'StageGrotesk Medium' } })
    expect(segmentosDoTexto(camada)).toEqual([{ start: 8, end: 16, fill: '#e63946', fontFamily: 'StageGrotesk Medium' }])
  })

  it('com sombra: os trechos cobrem o conteúdo inteiro e a sombra vai por segmento, com o offset X da camada', () => {
    const camada = texto({
      destaques: [{ inicio: 8, fim: 16 }],
      destaque: { fill: '#e63946' },
      effects: { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 4, shadowOpacity: 0.5 } },
    })
    const sombra = { color: 'rgba(0,0,0,0.5)', blur: 10, offset: { x: 2, y: 4 } }
    expect(segmentosDoTexto(camada)).toEqual([
      { start: 0, end: 8, shadow: sombra },
      { start: 8, end: 16, fill: '#e63946', shadow: sombra },
    ])
  })

  it('sombra desligada não entra', () => {
    const camada = texto({
      destaques: [{ inicio: 0, fim: 7 }],
      destaque: { fill: '#e63946' },
      effects: { shadow: { enabled: false, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 0, shadowOffsetY: 4, shadowOpacity: 1 } },
    })
    expect(segmentosDoTexto(camada)).toEqual([{ start: 0, end: 7, fill: '#e63946' }])
  })

  it('sem destaque gravado: a família mais pesada da mesma família quando há lista; sem lista, só o trecho', () => {
    const camada = texto({ destaques: [{ inicio: 8, fim: 16 }] })
    expect(segmentosDoTexto(camada, ['StageGrotesk Thin', 'StageGrotesk Medium', 'Branley GC'])).toEqual([
      { start: 8, end: 16, fontFamily: 'StageGrotesk Medium' },
    ])
    expect(segmentosDoTexto(camada, ['Branley GC'])).toEqual([{ start: 8, end: 16 }])
    expect(segmentosDoTexto(camada)).toEqual([{ start: 8, end: 16 }])
  })
})

describe('destaqueDaCamada lê a camada text da página de assinatura', () => {
  it('devolve o que difere da base; igual à base ou sem trechos, null', () => {
    expect(destaqueDaCamada(texto({ destaques: [{ inicio: 0, fim: 7 }], destaque: { fill: '#e63946', fontFamily: 'StageGrotesk Thin' } }))).toEqual({ fill: '#e63946' })
    expect(destaqueDaCamada(texto({ destaques: [{ inicio: 0, fim: 7 }], destaque: { fill: '#FFFFFF' } }))).toBeNull()
    expect(destaqueDaCamada(texto({ destaque: { fill: '#e63946' } }))).toBeNull()
    expect(destaqueDaCamada(texto())).toBeNull()
  })
})
