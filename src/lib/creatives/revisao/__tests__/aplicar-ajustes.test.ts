import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { camadaDeGradiente, CURVA_DE_LEITURA } from '@/lib/compositor/gradiente-de-leitura'
import { aplicarAjustes } from '../aplicar-ajustes'

const W = 1080
const H = 1920
const canvas = { width: W, height: H }

/** Medidor falso: linhas × corpo × entrelinha + o padding do desenho (o mesmo formato do servidor). */
const medir = (l: Layer) => {
  if (l.type !== 'text') return null
  const linhas = String(l.content ?? '').split('\n').length
  const entrelinha = l.textboxConfig?.autoWrap?.lineHeight ?? l.style?.lineHeight ?? 1.2
  return Math.round(linhas * (l.style?.fontSize ?? 16) * entrelinha + 12)
}

function texto(id: string, y: number, fontSize: number, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: 1,
    content: 'Linha',
    position: { x: 100, y },
    size: { width: 800, height: Math.round(fontSize * 1.2 + 12) },
    style: { fontSize, lineHeight: 1.2, textAlign: 'left' },
    ...extra,
  } as Layer
}

const fotoDeFundo = {
  id: 'bg-foto',
  name: 'foto',
  type: 'image',
  visible: true,
  locked: false,
  order: 0,
  position: { x: 0, y: 0 },
  size: { width: W, height: H },
} as Layer

describe('aplicarAjustes — corpo e pilha', () => {
  it('só a MESMA COLUNA é empurrada: texto abaixo noutra coluna fica parado (REV-01)', () => {
    const g = { groupId: 'g1' }
    const a = texto('a', 300, 100, { metadata: g, position: { x: 100, y: 300 }, size: { width: 200, height: 132 } } as Partial<Layer>)
    const b = texto('b', 450, 30, { metadata: g, position: { x: 700, y: 450 }, size: { width: 200, height: 48 } } as Partial<Layer>)
    const c = texto('c', 500, 30, { metadata: g, position: { x: 100, y: 500 }, size: { width: 200, height: 48 } } as Partial<Layer>)
    const r = aplicarAjustes([fotoDeFundo, a, b, c], [{ tipo: 'fonte', camadas: ['a'], fontSize: 80 }], { canvas, medir })
    const depois = new Map(r.camadas.map((l) => [l.id, l]))
    expect(depois.get('a')!.size.height).toBe(108)
    expect(depois.get('b')!.position.y).toBe(450)
    expect(depois.get('c')!.position.y).toBe(476)
  })

  it('encolher o título de um bloco de rodapé mantém a BASE do bloco, e o ícone acompanha', () => {
    const g = { groupId: 'g1' }
    const titulo = texto('headline', 1500, 100, { metadata: g })
    const servico = texto('servico', 1650, 30, { metadata: g })
    const icone = {
      id: 'icone',
      name: 'icone',
      type: 'image',
      visible: true,
      locked: false,
      order: 2,
      position: { x: 60, y: 1656 },
      size: { width: 30, height: 30 },
      metadata: g,
    } as Layer
    const r = aplicarAjustes([titulo, servico, icone], [{ tipo: 'fonte', camadas: ['headline'], escala: 0.8 }], { canvas, medir })
    const p = new Map(r.camadas.map((l) => [l.id, l]))
    expect(p.get('headline')!.style!.fontSize).toBe(80)
    expect(p.get('headline')!.position.y).toBe(1524)
    expect(p.get('servico')!.position.y + p.get('servico')!.size.height).toBe(1698)
    expect(p.get('icone')!.position.y).toBe(1656)
    expect(r.alteradas).toEqual(['headline'])
  })

  it('no bloco do topo o título encolhe para cima e o que vem abaixo sobe junto', () => {
    const g = { groupId: 'g2' }
    const r = aplicarAjustes(
      [texto('headline', 300, 100, { metadata: g }), texto('apoio', 450, 40, { metadata: g })],
      [{ tipo: 'fonte', camadas: ['headline'], fontSize: 80 }],
      { canvas, medir },
    )
    const p = new Map(r.camadas.map((l) => [l.id, l]))
    expect(p.get('headline')!.position.y).toBe(300)
    expect(p.get('apoio')!.position.y).toBe(426)
  })

  it('no rich text escala os trechos e o encaixe da voz 2 junto com o corpo', () => {
    const rico = texto('headline', 400, 100, {
      type: 'rich-text',
      richTextStyles: [
        { start: 0, end: 3, fontSize: 100, fill: '#ff0000' },
        { start: 4, end: 6, fill: '#00ff00' },
      ],
      metadata: { compositor: { papel: 'headline', encaixe: 20 } },
    } as Partial<Layer>)
    const l = aplicarAjustes([rico], [{ tipo: 'fonte', camadas: ['headline'], escala: 0.5 }], { canvas, medir }).camadas[0]
    expect(l.style!.fontSize).toBe(50)
    expect(l.richTextStyles![0].fontSize).toBe(50)
    expect(l.richTextStyles![1].fontSize).toBeUndefined()
    expect((l.metadata as { compositor: { encaixe: number } }).compositor.encaixe).toBe(10)
    expect(l.size.height).toBe(72)
  })

  it('a entrelinha é escrita nos DOIS campos quando a caixa tem autoWrap', () => {
    const t = texto('apoio', 600, 40, {
      content: 'a\nb',
      size: { width: 800, height: 140 },
      style: { fontSize: 40, lineHeight: 1.6 },
      textboxConfig: { autoWrap: { lineHeight: 1.6, breakMode: 'word', autoExpand: true } },
    } as Partial<Layer>)
    const l = aplicarAjustes([t], [{ tipo: 'fonte', camadas: ['apoio'], entrelinha: 1.2 }], { canvas, medir }).camadas[0]
    expect(l.style!.lineHeight).toBe(1.2)
    expect(l.textboxConfig!.autoWrap!.lineHeight).toBe(1.2)
    expect(l.style!.fontSize).toBe(40)
    expect(l.size.height).toBe(Math.round(2 * 40 * 1.2 + 12))
  })

  it('o delta sai do MESMO medidor dos dois lados: altura gravada pelo editor não vira deslocamento', () => {
    const g = { groupId: 'g4' }
    // O editor gravou 160; o medidor do servidor diz 140 antes e 108 depois.
    const apoio = texto('apoio', 600, 40, {
      content: 'a\nb',
      size: { width: 800, height: 160 },
      style: { fontSize: 40, lineHeight: 1.6 },
      metadata: g,
    } as Partial<Layer>)
    const cta = texto('cta', 770, 30, { metadata: g })
    const r = aplicarAjustes([apoio, cta], [{ tipo: 'fonte', camadas: ['apoio'], entrelinha: 1.2 }], { canvas, medir })
    const p = new Map(r.camadas.map((l) => [l.id, l]))
    expect(p.get('apoio')!.size.height).toBe(160 - 32)
    expect(p.get('apoio')!.position.y).toBe(600)
    expect(p.get('cta')!.position.y).toBe(770 - 32)
  })

  it('o elemento preso ao texto pelo compositor acompanha o SEU texto (filete abaixo da manchete)', () => {
    const g = 'g3'
    const titulo = texto('headline', 300, 100, { metadata: { groupId: g } })
    const filete = {
      id: 'filete',
      name: 'filete',
      type: 'shape',
      visible: true,
      locked: false,
      order: 2,
      position: { x: 100, y: 440 },
      size: { width: 200, height: 4 },
      metadata: { groupId: g, compositor: { elementoDe: 'headline', lado: 'abaixo' } },
    } as Layer
    const apoio = texto('apoio', 460, 40, { metadata: { groupId: g } })
    const r = aplicarAjustes([titulo, filete, apoio], [{ tipo: 'fonte', camadas: ['headline'], fontSize: 80 }], { canvas, medir })
    const p = new Map(r.camadas.map((l) => [l.id, l]))
    expect(p.get('headline')!.position.y).toBe(300)
    expect(p.get('filete')!.position.y).toBe(416)
    expect(p.get('apoio')!.position.y).toBe(436)
  })
})

describe('aplicarAjustes — gradiente desenhado à mão', () => {
  const desenhado = {
    id: 'desenhado',
    name: 'gradiente da equipe',
    type: 'gradient',
    visible: true,
    locked: false,
    order: 1,
    position: { x: 0, y: 1100 },
    size: { width: W, height: 820 },
    style: {
      gradientStops: [
        { id: '0', position: 0, color: '#000000', opacity: 0.3 },
        { id: '1', position: 1, color: '#000000', opacity: 0 },
      ],
    },
  } as Layer

  it('sem id, o gradiente da equipe nunca é alterado: a borda ganha um de leitura', () => {
    const r = aplicarAjustes([fotoDeFundo, desenhado], [{ tipo: 'gradiente', borda: 'rodape', forca: 0.7 }], { canvas, medir })
    expect(r.camadas).toHaveLength(3)
    expect(r.camadas.find((l) => l.id === 'desenhado')!.style).toEqual(desenhado.style)
  })

  it('apontado pelo id, ele é o alvo e a curva dele se mantém', () => {
    const r = aplicarAjustes(
      [fotoDeFundo, desenhado],
      [{ tipo: 'gradiente', borda: 'rodape', camadas: ['desenhado'], forca: 0.6 }],
      { canvas, medir },
    )
    expect(r.camadas).toHaveLength(2)
    const stops = (r.camadas.find((l) => l.id === 'desenhado')!.style as { gradientStops: Array<{ opacity: number }> }).gradientStops
    expect(stops.map((s) => s.opacity)).toEqual([0.6, 0])
    expect(r.aplicados[0].camadas).toEqual(['desenhado'])
  })

  it('id que não é gradiente é recusado com o motivo', () => {
    const r = aplicarAjustes(
      [fotoDeFundo, desenhado],
      [{ tipo: 'gradiente', borda: 'rodape', camadas: ['bg-foto'], forca: 0.6 }],
      { canvas, medir },
    )
    expect(r.aplicados).toHaveLength(0)
    expect(r.recusados[0].motivo).toMatch(/não é um gradiente/)
  })
})

describe('aplicarAjustes — gradiente, posição, visibilidade e caixa', () => {
  it('muda a força do gradiente pelas paradas, e a altura nova prende a faixa no rodapé', () => {
    const gradiente = { ...camadaDeGradiente({ borda: 'rodape', W, H, altura: 700, cor: '#111111', curva: CURVA_DE_LEITURA, forca: 0.5 }), order: 1 }
    const l = aplicarAjustes([gradiente], [{ tipo: 'gradiente', borda: 'rodape', forca: 0.8, altura: 900 }], { canvas, medir }).camadas[0]
    expect(l.metadata!.forca).toBe(0.8)
    expect((l.style as { gradientStops: Array<{ opacity: number }> }).gradientStops[0].opacity).toBeCloseTo(0.8, 3)
    expect(l.size.height).toBe(900)
    expect(l.position.y).toBe(H - 900)
  })

  it('borda sem gradiente ganha um, logo acima da foto de fundo, com a ordem renumerada', () => {
    const r = aplicarAjustes(
      [fotoDeFundo, texto('headline', 300, 90, { order: 1 })],
      [{ tipo: 'gradiente', borda: 'topo', forca: 0.6, altura: 800, cor: '#222222' }],
      { canvas, medir },
    )
    expect(r.camadas.map((l) => l.id)).toEqual(['bg-foto', 'gradiente-leitura-topo', 'headline'])
    expect(r.camadas.map((l) => l.order)).toEqual([0, 1, 2])
    const g = r.camadas[1]
    expect(g.position.y).toBe(0)
    expect((g.style as { gradientStops: Array<{ color: string }> }).gradientStops.every((s) => s.color === '#222222')).toBe(true)
  })

  it('mover desloca, visibilidade esconde, caixa alarga preservando o centro do texto', () => {
    const apoio = texto('apoio', 600, 40, { style: { fontSize: 40, lineHeight: 1.2, textAlign: 'center' } } as Partial<Layer>)
    const logo = {
      id: 'logo',
      name: 'logo',
      type: 'logo',
      visible: true,
      locked: false,
      order: 2,
      position: { x: 900, y: 1700 },
      size: { width: 100, height: 100 },
    } as Layer
    const r = aplicarAjustes(
      [apoio, logo],
      [
        { tipo: 'mover', camadas: ['logo'], dx: -800 },
        { tipo: 'visibilidade', camadas: ['logo'], visivel: false },
        { tipo: 'caixa', camadas: ['apoio'], largura: 900 },
      ],
      { canvas, medir },
    )
    const p = new Map(r.camadas.map((l) => [l.id, l]))
    expect(p.get('logo')!.position).toEqual({ x: 100, y: 1700 })
    expect(p.get('logo')!.visible).toBe(false)
    expect(p.get('apoio')!.size.width).toBe(900)
    expect(p.get('apoio')!.position.x).toBe(50)
    expect(r.aplicados.map((a) => a.tipo)).toEqual(['mover', 'visibilidade', 'caixa'])
  })

  it('recusa o que não pode aplicar, com o motivo, sem aplicar nada pela metade', () => {
    const apoio = texto('apoio', 600, 40)
    const r = aplicarAjustes(
      [apoio, fotoDeFundo],
      [
        { tipo: 'fonte', camadas: ['nao-existe'], escala: 0.9 },
        { tipo: 'fonte', camadas: ['apoio'] },
        { tipo: 'fonte', camadas: ['bg-foto'], escala: 0.9 },
        { tipo: 'caixa', camadas: ['apoio', 'bg-foto'], largura: 300 },
      ],
      { canvas, medir },
    )
    expect(r.aplicados).toHaveLength(0)
    expect(r.recusados.map((x) => x.indice)).toEqual([0, 1, 2, 3])
    expect(r.camadas).toEqual([apoio, fotoDeFundo])
  })
})
