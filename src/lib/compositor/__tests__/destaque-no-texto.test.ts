/**
 * Destaque por marcação na camada `text` (05/11/2026): `content` limpo +
 * `destaques` (offsets) + `destaque` (estilo). Os colchetes só existem nas
 * bordas (caixa do editor, MCP): ida por `lerDestaquesDoTexto`, volta por
 * `linhasComColchetes`, desenho por `segmentosDoTexto`.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { destaqueDaCamada, lerDestaquesDoTexto, linhasComColchetes, segmentosDoTexto, segmentosNoTextoTransformado, trocarConteudo } from '../destaques'

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

  it('comEfeitos (editor): os trechos cobrem o conteúdo inteiro, com sombra e contorno da camada por segmento', () => {
    const camada = texto({
      destaques: [{ inicio: 8, fim: 16 }],
      destaque: { fill: '#e63946' },
      effects: {
        shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 4, shadowOpacity: 0.5 },
        stroke: { enabled: true, strokeColor: '#ffffff', strokeWidth: 3 },
      },
    })
    const sombra = { color: 'rgba(0,0,0,0.5)', blur: 10, offset: { x: 2, y: 4 } }
    const stroke = { color: '#ffffff', width: 3 }
    expect(segmentosDoTexto(camada, { comEfeitos: true })).toEqual([
      { start: 0, end: 8, shadow: sombra, stroke },
      { start: 8, end: 16, fill: '#e63946', shadow: sombra, stroke },
    ])
    // O servidor não pede os efeitos: sombra no ctx e contorno por linha, como no texto comum
    expect(segmentosDoTexto(camada)).toEqual([{ start: 8, end: 16, fill: '#e63946' }])
  })

  it('sombra desligada não entra', () => {
    const camada = texto({
      destaques: [{ inicio: 0, fim: 7 }],
      destaque: { fill: '#e63946' },
      effects: { shadow: { enabled: false, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 0, shadowOffsetY: 4, shadowOpacity: 1 } },
    })
    expect(segmentosDoTexto(camada, { comEfeitos: true })).toEqual([{ start: 0, end: 7, fill: '#e63946' }])
  })

  it('sem destaque gravado: a família mais pesada da mesma família quando há lista; sem estilo nenhum, null (nunca um destaque invisível)', () => {
    const camada = texto({ destaques: [{ inicio: 8, fim: 16 }] })
    expect(segmentosDoTexto(camada, { familias: ['StageGrotesk Thin', 'StageGrotesk Medium', 'Branley GC'] })).toEqual([
      { start: 8, end: 16, fontFamily: 'StageGrotesk Medium' },
    ])
    expect(segmentosDoTexto(camada, { familias: ['Branley GC'] })).toBeNull()
    expect(segmentosDoTexto(camada)).toBeNull()
  })

  it('segmentosNoTextoTransformado: fatia no cru e transforma por pedaço (ß → SS não desloca o destaque)', () => {
    // 'straße bem feita': "bem" em 7..10 no cru; "STRASSE " tem uma letra a mais
    const r = segmentosNoTextoTransformado([{ start: 7, end: 10, fill: '#e63946' }], 'straße bem feita', (s) => s.toUpperCase())
    expect(r.texto).toBe('STRASSE BEM FEITA')
    expect(r.segmentos).toEqual([{ start: 8, end: 11, fill: '#e63946' }])
    expect(r.texto.slice(8, 11)).toBe('BEM')
  })
})

describe('trocarConteudo é o único jeito de trocar o content', () => {
  it('texto com colchetes grava content limpo + destaques; sem colchetes apaga os destaques antigos', () => {
    const camada = texto({ destaques: [{ inicio: 8, fim: 16 }] })
    expect(trocarConteudo(camada, 'Nossa [picanha] na brasa')).toEqual({ content: 'Nossa picanha na brasa', destaques: [{ inicio: 6, fim: 13 }], problema: null })
    // Digitou "Nossa " na frente pelo painel: os offsets antigos cobririam "a na br"
    expect(trocarConteudo(camada, 'Nossa Picanha na brasa')).toEqual({ content: 'Nossa Picanha na brasa', destaques: undefined, problema: null })
    expect(trocarConteudo(camada, 'Vem [pro Real').problema).toMatch(/sem fechar/)
  })

  it('camada que não é text só troca o conteúdo', () => {
    expect(trocarConteudo({ type: 'rich-text' }, 'a [b]')).toEqual({ content: 'a [b]', destaques: undefined, problema: null })
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
