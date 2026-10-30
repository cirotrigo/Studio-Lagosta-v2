/**
 * L1 das linhas-guia (29/10/2026): o editor desenha as duas camadas e encaixa, alinha e redimensiona pela margem da
 * MARCA. Os números do overlay saem de `margensDoEditor`; nada é copiado.
 */
import { describe, expect, it } from 'vitest'

import { margensDoEditor } from '@/lib/canvas-margin'
import { buildStoryChrome } from '@/lib/instagram-story-chrome'
import { alignToCanvas, type AlignmentNode } from '@/lib/konva-alignment'
import { computeAlignmentGuides, DEFAULT_SNAP_CONFIG } from '@/lib/konva-smart-guides'
import { faixasDaInterface, linhasDaMarca, margensDaPagina, margensDoEixo, paradasDeEncaixe, retangulosDeEncaixe } from '@/lib/margens-no-editor'

const WINE = { geometria: { story: { margemH: 96, safeTopo: 200, safeRodape: 150 }, feed: { margemH: 96, safeTopo: 120, safeRodape: 100 } } }
const story = margensDoEditor({ formato: 'story', assinatura: null, largura: 1080, altura: 1920 })
const wine = margensDoEditor({ formato: 'story', assinatura: WINE, largura: 1080, altura: 1920 })
const feed = margensDoEditor({ formato: 'feed', assinatura: WINE, largura: 1080, altura: 1350 })

describe('overlay: os números são os de margensDoEditor', () => {
  it('Story padrão (29/10: 64/160/160): linhas em 64 / 1016 / 160 / 1760; faixas de 160 em cima e embaixo', () => {
    expect(linhasDaMarca(story.marca, 1080, 1920).map((l) => l.points)).toEqual([
      [64, 0, 64, 1920],
      [1016, 0, 1016, 1920],
      [0, 160, 1080, 160],
      [0, 1760, 1080, 1760],
    ])
    expect(faixasDaInterface(story.interface, 1080, 1920)).toEqual([
      { id: 'interface-topo', x: 0, y: 0, width: 1080, height: 160 },
      { id: 'interface-rodape', x: 0, y: 1920 - 160, width: 1080, height: 160 },
    ])
  })

  it('Story da Wine (96/200/150): as linhas azuis seguem a marca; a faixa continua a do piso', () => {
    expect(linhasDaMarca(wine.marca, 1080, 1920).map((l) => l.points)).toEqual([
      [96, 0, 96, 1920],
      [984, 0, 984, 1920],
      [0, 200, 1080, 200],
      [0, 1770, 1080, 1770],
    ])
    expect(faixasDaInterface(wine.interface, 1080, 1920).map((f) => f.height)).toEqual([160, 160])
    expect(wine.origem).toBe('marca')
  })

  it('Feed 4:5 ganha a mesma margem azul (Wine 96/120/100) e NENHUMA faixa', () => {
    expect(linhasDaMarca(feed.marca, 1080, 1350).map((l) => l.points)).toEqual([
      [96, 0, 96, 1350],
      [984, 0, 984, 1350],
      [0, 120, 1080, 120],
      [0, 1250, 1080, 1250],
    ])
    expect(faixasDaInterface(feed.interface, 1080, 1350)).toEqual([])
  })
})

describe('encaixe', () => {
  const config = { ...DEFAULT_SNAP_CONFIG, enabled: true, threshold: 5 }

  it('ao arrastar no Story, uma caixa a 3 px da linha do topo (y = 163) encaixa em y = 160', () => {
    const r = computeAlignmentGuides({ id: 't', x: 300, y: 163, width: 300, height: 50 }, retangulosDeEncaixe(story.marca, 1080, 1920), 1080, 1920, config)
    expect(r.position.y).toBe(160)
    expect(r.guides.some((g) => g.orientation === 'horizontal' && g.position === 160)).toBe(true)
  })

  it('a borda direita a 3 px da linha da direita (x + w = 1013) encaixa em 1016; a 20 px não', () => {
    const perto = computeAlignmentGuides({ id: 't', x: 713, y: 500, width: 300, height: 50 }, retangulosDeEncaixe(story.marca, 1080, 1920), 1080, 1920, config)
    expect(perto.position.x).toBe(716)
    const longe = computeAlignmentGuides({ id: 't', x: 696, y: 500, width: 300, height: 50 }, retangulosDeEncaixe(story.marca, 1080, 1920), 1080, 1920, config)
    expect(longe.position.x).toBe(696)
  })

  it('no Feed da Wine a caixa encaixa na margem da marca (y = 120), não no padrão do Story', () => {
    const r = computeAlignmentGuides({ id: 't', x: 300, y: 123, width: 300, height: 50 }, retangulosDeEncaixe(feed.marca, 1080, 1350), 1080, 1350, config)
    expect(r.position.y).toBe(120)
  })

  it('as paradas do redimensionar são as quatro linhas', () => {
    expect(paradasDeEncaixe(wine.marca)).toEqual({ v: [96, 984], h: [200, 1770] })
  })
})

describe('alinhar pela margem da marca', () => {
  function no(x: number, y: number, width: number, height: number) {
    const pos = { x, y }
    const node = {
      getClientRect: () => ({ x: pos.x, y: pos.y, width, height }),
      x: (v?: number) => (v === undefined ? pos.x : ((pos.x = v), undefined)),
      y: (v?: number) => (v === undefined ? pos.y : ((pos.y = v), undefined)),
    }
    return { node: node as unknown as AlignmentNode['node'], layer: { id: 'l' } as AlignmentNode['layer'], pos }
  }
  const layerInstance = { batchDraw() {} } as unknown as Parameters<typeof alignToCanvas>[1]

  it('margensDoEixo converte linhas em distâncias (Wine Story: y → 200/150; x → 96/96)', () => {
    expect(margensDoEixo(wine.marca, 'y', 1080, 1920)).toEqual({ start: 200, end: 150 })
    expect(margensDoEixo(wine.marca, 'x', 1080, 1920)).toEqual({ start: 96, end: 96 })
  })

  it('topo, base e direita encostam na guia da MARCA (Wine), não no padrão', () => {
    const a = no(300, 500, 200, 100)
    alignToCanvas([a], layerInstance, 'y', 'start', 1920, margensDoEixo(wine.marca, 'y', 1080, 1920))
    expect(a.pos.y).toBe(200)
    alignToCanvas([a], layerInstance, 'y', 'end', 1920, margensDoEixo(wine.marca, 'y', 1080, 1920))
    expect(a.pos.y).toBe(1770 - 100)
    alignToCanvas([a], layerInstance, 'x', 'end', 1080, margensDoEixo(wine.marca, 'x', 1080, 1920))
    expect(a.pos.x).toBe(984 - 200)
  })

  it('sem margens explícitas vale o padrão do Story (compatibilidade): topo 160 desde 29/10', () => {
    const a = no(300, 500, 200, 100)
    alignToCanvas([a], layerInstance, 'y', 'start', 1920)
    expect(a.pos.y).toBe(160)
  })
})

describe('o chrome do Story nasce da faixa da interface', () => {
  it('com faixa 160/160 o cabeçalho cabe nos 160 de cima e a caixa de resposta nos 160 de baixo', () => {
    const c = buildStoryChrome(1920, { topo: 160, rodape: 160 })
    expect(c.progressBar.y + c.progressBar.height).toBeLessThan(160)
    expect(c.avatar.cy + c.avatar.radius).toBeLessThanOrEqual(160)
    expect(c.replyBox.y).toBeGreaterThanOrEqual(1920 - 160)
    expect(c.replyBox.y + c.replyBox.height).toBeLessThanOrEqual(1920)
  })

  it('sem faixa vale o padrão (160/160 desde 29/10): uma faixa de 188/224 daria avatar maior', () => {
    expect(buildStoryChrome(1920, { topo: 188, rodape: 224 }).avatar.radius).toBeGreaterThan(buildStoryChrome(1920).avatar.radius)
    expect(buildStoryChrome(1920).avatar.cy + buildStoryChrome(1920).avatar.radius).toBeLessThanOrEqual(160)
  })
})

describe('margensDaPagina: uma decisão só de formato (Codex R1 do L1)', () => {
  it('o formato sai do tamanho: 1080×1920 e 1080×1800 são Story (faixa presente); 1080×1350 e 1080×1080 não', () => {
    expect(margensDaPagina(null, { width: 1080, height: 1920 }).interface).toEqual({ topo: 160, rodape: 160 })
    expect(margensDaPagina(null, { width: 1080, height: 1800 }).interface).toEqual({ topo: 160, rodape: 160 })
    expect(margensDaPagina(null, { width: 1080, height: 1350 }).interface).toBeNull()
    expect(margensDaPagina(null, { width: 1080, height: 1080 }).interface).toBeNull()
  })

  it('a assinatura que chega depois muda a marca, não a faixa', () => {
    const antes = margensDaPagina(undefined, { width: 1080, height: 1920 })
    const depois = margensDaPagina(WINE, { width: 1080, height: 1920 })
    expect(antes.origem).toBe('padrao')
    expect(depois.origem).toBe('marca')
    expect(depois.marca.topo).toBe(200)
    expect(depois.interface).toEqual(antes.interface)
  })
})
