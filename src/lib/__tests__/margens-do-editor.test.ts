/**
 * L0 das linhas-guia (29/10/2026): `margensDoEditor` é a FONTE ÚNICA das margens do editor. A faixa da interface vem
 * de `interfaceDoStory` (piso 160/160 desde 29/10, nunca afrouxa) e a margem da marca de `NUMEROS_PADRAO` + `Project.assinatura`,
 * pela mesma mesclagem do compositor (`pisoDoProjetoDe`, `geometria.ts`).
 */
import { describe, expect, it } from 'vitest'

import { CANVAS_MARGIN, margensDoEditor, marginsForAxis } from '@/lib/canvas-margin'
import { montarAssinatura, NUMEROS_PADRAO } from '@/lib/compositor/assinatura'
import { GEOMETRIA_PADRAO, pisoDoProjetoDe } from '@/lib/compositor/geometria'
import { interfaceDoStory as doGate, PISO_DE_INTERFACE_DO_STORY as pisoDoGate } from '@/lib/creatives/revisao/gate'
import { limitesDoEditor } from '@/lib/creatives/revisao/regras'
import { limitesDaAreaSegura } from '@/lib/creatives/text-geometry'
import type { Layer } from '@/types/template'
import { interfaceDoStory, PISO_DE_INTERFACE_DO_STORY } from '@/lib/creatives/revisao/interface-do-story'

const story = { largura: 1080, altura: 1920 }
const feed = { largura: 1080, altura: 1350 }

describe('margensDoEditor — padrão da casa', () => {
  it('Story: marca 64/160/160 (linhas) e faixa da interface 160/160 (decisão do owner, 29/10)', () => {
    const m = margensDoEditor({ formato: 'story', assinatura: null, ...story })
    expect(m).toEqual({
      interface: { topo: 160, rodape: 160 },
      marca: { topo: 160, base: 1920 - 160, esquerda: 64, direita: 1080 - 64 },
      origem: 'padrao',
    })
  })

  it('Feed 4:5: marca 64/72/72 e SEM faixa da interface', () => {
    const m = margensDoEditor({ formato: 'feed', assinatura: undefined, ...feed })
    expect(m).toEqual({
      interface: null,
      marca: { topo: 72, base: 1350 - 72, esquerda: 64, direita: 1016 },
      origem: 'padrao',
    })
  })

  it('Quadrado (não decidido em 29/10) segue 92/120/104 e não tem faixa', () => {
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
    expect(s.interface).toEqual({ topo: 160, rodape: 160 })
    expect(s.origem).toBe('marca')
    const f = margensDoEditor({ formato: 'feed', assinatura, ...feed })
    expect(f.marca).toEqual({ topo: 120, base: 1350 - 100, esquerda: 96, direita: 984 })
    expect(f.interface).toBeNull()
    expect(f.origem).toBe('marca')
  })

  it('marca mais frouxa que o piso no Story (100/90, lateral 60): a margem da marca afrouxa, a faixa da interface NÃO', () => {
    const m = margensDoEditor({ formato: 'story', assinatura: { geometria: { story: { margemH: 60, safeTopo: 100, safeRodape: 90 } } }, ...story })
    expect(m.marca).toEqual({ topo: 100, base: 1920 - 90, esquerda: 60, direita: 1020 })
    expect(m.interface).toEqual({ topo: 160, rodape: 160 })
    expect(m.origem).toBe('marca')
  })

  it('a assinatura de um formato não vaza para o outro', () => {
    const m = margensDoEditor({ formato: 'feed', assinatura: { geometria: { story: { margemH: 60 } } }, ...feed })
    expect(m.marca.esquerda).toBe(64)
    expect(m.origem).toBe('padrao')
  })

  it('NaN, string e negativo nunca afrouxam: caem no padrão e não contam como marca', () => {
    const m = margensDoEditor({
      formato: 'story',
      assinatura: { geometria: { story: { margemH: 'x', safeTopo: NaN, safeRodape: -5 } } },
      ...story,
    })
    expect(m.marca).toEqual({ topo: 160, base: 1920 - 160, esquerda: 64, direita: 1016 })
    expect(m.interface).toEqual({ topo: 160, rodape: 160 })
    expect(m.origem).toBe('padrao')
  })

  it('assinatura que não é objeto (string, número) é tratada como ausente', () => {
    expect(margensDoEditor({ formato: 'story', assinatura: 'lixo', ...story }).origem).toBe('padrao')
    expect(margensDoEditor({ formato: 'story', assinatura: 7, ...story }).marca.topo).toBe(160)
  })
})

describe('margensDoEditor — página fora do tamanho canônico', () => {
  it('escala por largura/1080, como o revisor (story 540×960: metade de tudo)', () => {
    const m = margensDoEditor({ formato: 'story', assinatura: null, largura: 540, altura: 960 })
    expect(m.marca).toEqual({ topo: 80, base: 960 - 80, esquerda: 32, direita: 508 })
    expect(m.interface).toEqual({ topo: 80, rodape: 80 })
  })

  it('story 2160×3840 dobra; a base e a direita saem da ALTURA e da LARGURA pedidas', () => {
    const m = margensDoEditor({ formato: 'story', assinatura: null, largura: 2160, altura: 3840 })
    expect(m.marca).toEqual({ topo: 320, base: 3840 - 320, esquerda: 128, direita: 2160 - 128 })
    expect(m.interface).toEqual({ topo: 320, rodape: 320 })
  })

  it.each([
    ['largura NaN', { largura: NaN, altura: 1350 }],
    ['altura NaN', { largura: 1080, altura: NaN }],
    ['largura Infinity', { largura: Infinity, altura: 1350 }],
    ['altura Infinity', { largura: 1080, altura: Infinity }],
    ['largura negativa', { largura: -1, altura: 1350 }],
    ['altura zero', { largura: 1080, altura: 0 }],
  ])('dimensão inválida (%s) cai na canônica do formato: as QUATRO linhas saem finitas (Codex R1)', (_n, dims) => {
    const m = margensDoEditor({ formato: 'feed', assinatura: null, ...dims })
    expect(m.marca).toEqual({ topo: 72, base: 1350 - 72, esquerda: 64, direita: 1016 })
  })

  it('dimensão inválida no Story: a faixa também sai do canônico', () => {
    const m = margensDoEditor({ formato: 'story', assinatura: null, largura: NaN, altura: NaN })
    expect(m).toEqual({ interface: { topo: 160, rodape: 160 }, marca: { topo: 160, base: 1760, esquerda: 64, direita: 1016 }, origem: 'padrao' })
  })
})

describe('os consumidores antigos delegam', () => {
  it('CANVAS_MARGIN é o padrão do Story de margensDoEditor (D1 + margens de 29/10: 64/160/160 no lugar de 70/120/100)', () => {
    expect(CANVAS_MARGIN).toEqual({ top: 160, right: 64, bottom: 160, left: 64 })
    expect(marginsForAxis('x')).toEqual({ start: 64, end: 64 })
    expect(marginsForAxis('y')).toEqual({ start: 160, end: 160 })
    const g = NUMEROS_PADRAO.geometria.story
    expect(CANVAS_MARGIN).toEqual({ top: g.safeTopo, right: g.margemH, bottom: g.safeRodape, left: g.margemH })
  })

  it('o revisor (limitesDoEditor), o text-geometry e o autofix leem os MESMOS números, pelo formato do canvas (L5 antecipado em 29/10)', () => {
    expect(limitesDoEditor({ width: 1080, height: 1920 })).toEqual({ topo: 160, base: 1760, esquerda: 64, direita: 1016 })
    expect(limitesDoEditor({ width: 540, height: 960 })).toEqual({ topo: 80, base: 880, esquerda: 32, direita: 508 })
    expect(limitesDoEditor({ width: 1080, height: 1350 })).toEqual({ topo: 72, base: 1278, esquerda: 64, direita: 1016 })
    expect(limitesDaAreaSegura({ width: 1080, height: 1350 })).toEqual({ top: 72, bottom: 1278, left: 64, right: 1016 })
    expect(limitesDaAreaSegura({ width: 1080, height: 1080 })).toEqual({ top: 120, bottom: 976, left: 92, right: 988 })
  })

  it('o gate reexporta a MESMA interfaceDoStory do módulo puro (fonte única dos 188/224)', () => {
    expect(doGate).toBe(interfaceDoStory)
    expect(pisoDoGate).toBe(PISO_DE_INTERFACE_DO_STORY)
    expect(interfaceDoStory({ topo: 100, rodape: NaN })).toEqual({ topo: 160, rodape: 160 })
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
    expect(m.interface).toEqual({ topo: 160, rodape: 160 })
  })

  it('com PÁGINA de assinatura: a derivação reescreve numeros.geometria, mas o pisoDoProjeto continua o de pisoDoProjetoDe', () => {
    const texto = (id: string, x: number, y: number, w: number, h: number): Layer =>
      ({ id, name: id, type: 'text', visible: true, locked: false, order: 0, rotation: 0, content: id, position: { x, y }, size: { width: w, height: h },
        style: { fontFamily: 'Montserrat', fontSize: 40, lineHeight: 1.1, color: '#FFFFFF', textAlign: 'left' }, metadata: { groupId: 'principal' } }) as unknown as Layer
    const assinatura = montarAssinatura({
      pagina: { id: 'p', name: 'Modelo · story', tags: ['story'], width: 1080, height: 1920, layers: [texto('headline', 116, 173, 700, 217), texto('servico', 71, 1684, 700, 47)], background: '#000' },
      formatoDaPagina: 'story',
      numerosDoProjeto: WINE,
      logoDoProjeto: null,
    })
    expect(assinatura.numeros.geometria.story.safeTopo).toBe(173) // derivado da página
    expect(assinatura.pisoDoProjeto).toEqual(pisoDoProjetoDe(WINE)) // o piso não
    expect(assinatura.pisoDoProjeto!.story.safeTopo).toBe(200)
  })

  it('sem JSON a mesclagem copia só o mapa externo (identidade dos formatos preservada, como antes)', () => {
    expect(pisoDoProjetoDe(null).story).toBe(GEOMETRIA_PADRAO.story)
    expect(pisoDoProjetoDe({}).story).not.toBe(GEOMETRIA_PADRAO.story)
    expect(pisoDoProjetoDe({})).toEqual(GEOMETRIA_PADRAO)
  })

  it('a mesclagem não altera o padrão (sem mutação)', () => {
    pisoDoProjetoDe(REAL)
    expect(GEOMETRIA_PADRAO.story).toEqual({ margemH: 64, safeTopo: 160, safeRodape: 160, gapEntreBlocos: 14, escalaDeFonte: 1 })
  })
})
