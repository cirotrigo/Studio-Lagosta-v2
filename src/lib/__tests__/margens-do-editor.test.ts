/**
 * L0 das linhas-guia (29/10/2026): `margensDoEditor` é a FONTE ÚNICA das margens do editor. A faixa da interface vem
 * de `interfaceDoStory` (piso 188/224, nunca afrouxa) e a margem da marca de `NUMEROS_PADRAO` + `Project.assinatura`,
 * pela mesma mesclagem do compositor (`pisoDoProjetoDe`, `geometria.ts`).
 */
import { describe, expect, it } from 'vitest'

import { CANVAS_MARGIN, MARGEM_LEGADA_DO_REVISOR, margensDoEditor, marginsForAxis } from '@/lib/canvas-margin'
import { montarAssinatura, NUMEROS_PADRAO } from '@/lib/compositor/assinatura'
import { GEOMETRIA_PADRAO, pisoDoProjetoDe } from '@/lib/compositor/geometria'
import { interfaceDoStory as doGate, PISO_DE_INTERFACE_DO_STORY as pisoDoGate } from '@/lib/creatives/revisao/gate'
import { interfaceDoStory, PISO_DE_INTERFACE_DO_STORY } from '@/lib/creatives/revisao/interface-do-story'

const story = { largura: 1080, altura: 1920 }
const feed = { largura: 1080, altura: 1350 }

describe('margensDoEditor — padrão da casa', () => {
  it('Story: marca 92/188/224 (linhas) e faixa da interface 188/224', () => {
    const m = margensDoEditor({ formato: 'story', assinatura: null, ...story })
    expect(m).toEqual({
      interface: { topo: 188, rodape: 224 },
      marca: { topo: 188, base: 1920 - 224, esquerda: 92, direita: 1080 - 92 },
      origem: 'padrao',
    })
  })

  it('Feed 4:5: marca 92/120/104 e SEM faixa da interface', () => {
    const m = margensDoEditor({ formato: 'feed', assinatura: undefined, ...feed })
    expect(m).toEqual({
      interface: null,
      marca: { topo: 120, base: 1350 - 104, esquerda: 92, direita: 988 },
      origem: 'padrao',
    })
  })

  it('Quadrado segue o padrão do compositor e não tem faixa', () => {
    const m = margensDoEditor({ formato: 'quadrado', assinatura: {}, largura: 1080, altura: 1080 })
    expect(m.interface).toBeNull()
    expect(m.marca).toEqual({ topo: 120, base: 1080 - 104, esquerda: 92, direita: 988 })
    expect(m.origem).toBe('padrao')
  })
})

describe('margensDoEditor — Project.assinatura', () => {
  it('marca com assinatura própria (Wine: story 96/200/150) manda na margem da marca; a faixa continua a do piso', () => {
    const assinatura = { geometria: { story: { margemH: 96, safeTopo: 200, safeRodape: 150 }, feed: { margemH: 96, safeTopo: 120, safeRodape: 100 } } }
    const s = margensDoEditor({ formato: 'story', assinatura, ...story })
    expect(s.marca).toEqual({ topo: 200, base: 1920 - 150, esquerda: 96, direita: 1080 - 96 })
    expect(s.interface).toEqual({ topo: 188, rodape: 224 })
    expect(s.origem).toBe('marca')
    const f = margensDoEditor({ formato: 'feed', assinatura, ...feed })
    expect(f.marca).toEqual({ topo: 120, base: 1350 - 100, esquerda: 96, direita: 984 })
    expect(f.interface).toBeNull()
    expect(f.origem).toBe('marca')
  })

  it('marca mais frouxa que o piso no Story (100/90, lateral 60): a margem da marca afrouxa, a faixa da interface NÃO', () => {
    const m = margensDoEditor({ formato: 'story', assinatura: { geometria: { story: { margemH: 60, safeTopo: 100, safeRodape: 90 } } }, ...story })
    expect(m.marca).toEqual({ topo: 100, base: 1920 - 90, esquerda: 60, direita: 1020 })
    expect(m.interface).toEqual({ topo: 188, rodape: 224 })
    expect(m.origem).toBe('marca')
  })

  it('a assinatura de um formato não vaza para o outro', () => {
    const m = margensDoEditor({ formato: 'feed', assinatura: { geometria: { story: { margemH: 60 } } }, ...feed })
    expect(m.marca.esquerda).toBe(92)
    expect(m.origem).toBe('padrao')
  })

  it('NaN, string e negativo nunca afrouxam: caem no padrão e não contam como marca', () => {
    const m = margensDoEditor({
      formato: 'story',
      assinatura: { geometria: { story: { margemH: 'x', safeTopo: NaN, safeRodape: -5 } } },
      ...story,
    })
    expect(m.marca).toEqual({ topo: 188, base: 1920 - 224, esquerda: 92, direita: 988 })
    expect(m.interface).toEqual({ topo: 188, rodape: 224 })
    expect(m.origem).toBe('padrao')
  })

  it('assinatura que não é objeto (string, número) é tratada como ausente', () => {
    expect(margensDoEditor({ formato: 'story', assinatura: 'lixo', ...story }).origem).toBe('padrao')
    expect(margensDoEditor({ formato: 'story', assinatura: 7, ...story }).marca.topo).toBe(188)
  })
})

describe('margensDoEditor — página fora do tamanho canônico', () => {
  it('escala por largura/1080, como o revisor (story 540×960: metade de tudo)', () => {
    const m = margensDoEditor({ formato: 'story', assinatura: null, largura: 540, altura: 960 })
    expect(m.marca).toEqual({ topo: 94, base: 960 - 112, esquerda: 46, direita: 494 })
    expect(m.interface).toEqual({ topo: 94, rodape: 112 })
  })

  it('story 2160×3840 dobra; a base e a direita saem da ALTURA e da LARGURA pedidas', () => {
    const m = margensDoEditor({ formato: 'story', assinatura: null, largura: 2160, altura: 3840 })
    expect(m.marca).toEqual({ topo: 376, base: 3840 - 448, esquerda: 184, direita: 2160 - 184 })
    expect(m.interface).toEqual({ topo: 376, rodape: 448 })
  })

  it('largura inválida não gera NaN: escala 1', () => {
    const m = margensDoEditor({ formato: 'feed', assinatura: null, largura: NaN, altura: 1350 })
    expect(m.marca.topo).toBe(120)
    expect(m.marca.esquerda).toBe(92)
  })
})

describe('os consumidores antigos delegam', () => {
  it('CANVAS_MARGIN é o padrão do Story de margensDoEditor (D1: 92/188/224 no lugar de 70/120/100)', () => {
    expect(CANVAS_MARGIN).toEqual({ top: 188, right: 92, bottom: 224, left: 92 })
    expect(marginsForAxis('x')).toEqual({ start: 92, end: 92 })
    expect(marginsForAxis('y')).toEqual({ start: 188, end: 224 })
    const g = NUMEROS_PADRAO.geometria.story
    expect(CANVAS_MARGIN).toEqual({ top: g.safeTopo, right: g.margemH, bottom: g.safeRodape, left: g.margemH })
  })

  it('o revisor, o autofix e os arquétipos continuam com 120/100/70 até o L5', () => {
    expect(MARGEM_LEGADA_DO_REVISOR).toEqual({ top: 120, right: 70, bottom: 100, left: 70 })
  })

  it('o gate reexporta a MESMA interfaceDoStory do módulo puro (fonte única dos 188/224)', () => {
    expect(doGate).toBe(interfaceDoStory)
    expect(pisoDoGate).toBe(PISO_DE_INTERFACE_DO_STORY)
    expect(interfaceDoStory({ topo: 100, rodape: NaN })).toEqual({ topo: 188, rodape: 224 })
    expect(interfaceDoStory({ topo: 250, rodape: 350 })).toEqual({ topo: 250, rodape: 350 })
  })
})

describe('geometria.ts é a MESMA mesclagem do compositor', () => {
  const REAL = { geometria: { story: { margemH: 96, safeTopo: 250, safeRodape: 350 }, feed: { margemH: 96, safeTopo: 120, safeRodape: 100 } } }
  const WINE = { geometria: { story: { margemH: 96, safeTopo: 200, safeRodape: 150 }, feed: { margemH: 96, safeTopo: 120, safeRodape: 100 } } }
  const fixtures: Array<[string, unknown]> = [['Real', REAL], ['Wine', WINE], ['Lagosta (padrão)', null], ['vazio', {}], ['lixo', 'x']]

  it('NUMEROS_PADRAO.geometria é GEOMETRIA_PADRAO', () => {
    expect(NUMEROS_PADRAO.geometria).toBe(GEOMETRIA_PADRAO)
  })

  it.each(fixtures)('%s: pisoDoProjetoDe === pisoDoProjeto de montarAssinatura', (_nome, numerosDoProjeto) => {
    const assinatura = montarAssinatura({ pagina: null, formatoDaPagina: null, numerosDoProjeto })
    expect(pisoDoProjetoDe(numerosDoProjeto)).toEqual(assinatura.pisoDoProjeto)
    expect(pisoDoProjetoDe(numerosDoProjeto)).toEqual(assinatura.numeros.geometria)
  })

  it('Real: story 96/250/350 (legado, mostrado como está até o Ciro passar o número), feed 96/120/100; gap e escala do padrão', () => {
    expect(pisoDoProjetoDe(REAL)).toEqual({
      story: { margemH: 96, safeTopo: 250, safeRodape: 350, gapEntreBlocos: 14, escalaDeFonte: 1 },
      feed: { margemH: 96, safeTopo: 120, safeRodape: 100, gapEntreBlocos: 14, escalaDeFonte: 0.875 },
      quadrado: GEOMETRIA_PADRAO.quadrado,
    })
    const m = margensDoEditor({ formato: 'story', assinatura: REAL, ...story })
    expect(m.marca).toEqual({ topo: 250, base: 1920 - 350, esquerda: 96, direita: 984 })
    expect(m.interface).toEqual({ topo: 188, rodape: 224 })
  })

  it('a mesclagem não altera o padrão (sem mutação)', () => {
    pisoDoProjetoDe(REAL)
    expect(GEOMETRIA_PADRAO.story).toEqual({ margemH: 92, safeTopo: 188, safeRodape: 224, gapEntreBlocos: 14, escalaDeFonte: 1 })
  })
})
