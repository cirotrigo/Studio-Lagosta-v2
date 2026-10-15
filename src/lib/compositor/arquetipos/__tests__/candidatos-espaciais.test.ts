/**
 * CP2B — a geometria da busca: as faixas do arquétipo, o intervalo de `dy` de cada uma (dentro da zona efetiva, com
 * os ornamentos), os candidatos na ordem fixa dos rótulos e as combinações. Só vertical.
 */
import { describe, expect, it } from 'vitest'
import { NUMEROS_PADRAO } from '../../assinatura'
import { DIMENSOES } from '../../spec'
import { LIMITES_DA_BUSCA, PASSO_MINIMO_PX, type FaixaDeBusca } from '../busca-espacial-tipos'
import { candidatosDasFaixas, combinacoesDasFaixas, faixasDoArquetipo } from '../candidatos-espaciais'
import { verArquetipo } from '../catalogo'
import { materializarArquetipo, type Materializacao, type ProblemaDeMaterializacao } from '../materializar'
import type { ArquetipoDeLayout } from '../tipos'

const TOPO = verArquetipo('minimal-fb-topo-esquerda', 1)!
const BASE = verArquetipo('minimal-fb-base-esquerda', 1)!
const CENTRO = verArquetipo('minimal-fb-centro-optico', 1)!
const problemas = (m: Materializacao): ProblemaDeMaterializacao[] => ('problemas' in m ? m.problemas : [])
const geo = (f: 'story' | 'feed') => {
  const { margemH, safeTopo, safeRodape } = NUMEROS_PADRAO.geometria[f]
  return { margemH, safeTopo, safeRodape }
}
/** Um papel sintético: a zona efetiva e onde a caixa pousou (inteiros, como a `Materializacao` entrega). */
const papel = (zona: [number, number], pos: [number, number]) => ({
  zonaEfetiva: { x: 0, y: zona[0], width: 500, height: zona[1] },
  posicao: { x: 0, y: pos[0], width: 300, height: pos[1] },
})
const semOrnamento = { esquerda: 0, direita: 0, topo: 0, base: 0 }

describe('CP2B · faixas do arquétipo', () => {
  it('topo-esquerda: {pre, headline, apoio} e {servico, logo}, nos dois formatos', () => {
    expect(faixasDoArquetipo(TOPO, 'story')).toEqual([['pre', 'headline', 'apoio'], ['servico', 'logo']])
    expect(faixasDoArquetipo(TOPO, 'feed')).toEqual([['pre', 'headline', 'apoio'], ['servico', 'logo']])
  })

  it('centro-óptico: {headline, apoio} e {servico} — a logo automática fica fora', () => {
    expect(faixasDoArquetipo(CENTRO, 'story')).toEqual([['headline', 'apoio'], ['servico']])
    expect(faixasDoArquetipo(CENTRO, 'feed')).toEqual([['headline', 'apoio'], ['servico']])
  })

  it('base-esquerda (função pura): o fecho transitivo junta headline, apoio e serviço; a logo do topo fica só', () => {
    expect(faixasDoArquetipo(BASE, 'story')).toEqual([['headline', 'apoio', 'servico'], ['logo']])
    expect(faixasDoArquetipo(BASE, 'feed')).toEqual([['headline', 'apoio', 'servico'], ['logo']])
  })
})

describe('CP2B · intervalo e candidatos', () => {
  it('o intervalo é a interseção dos membros, para dentro e descontada a folga do arredondamento', () => {
    // pre: lo 100−141 = −41, hi 300−(141+60) = 99; headline: lo −200, hi 500−(250+100) = 150.
    // → [ceil(−41 + ½), floor(99 − 1½)] = [−40, 97].
    const [f] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: { pre: papel([100, 200], [141, 60]), headline: papel([50, 450], [250, 100]) }, ornamentos: {} })
    expect(f).toEqual({
      indice: 0,
      membros: ['pre', 'headline'],
      intervalo: { min: -40, max: 97 },
      referenciaValida: true,
      candidatos: [
        { rotulo: 'referencia', dy: 0 },
        { rotulo: 'acima', dy: -40 },
        { rotulo: 'meio-acima', dy: -20 },
        { rotulo: 'meio-abaixo', dy: 48 },
        { rotulo: 'abaixo', dy: 97 },
      ],
    })
  })

  it('o ornamento preso ao texto reduz o intervalo (topo e base)', () => {
    const papeis = { pre: papel([100, 200], [141, 60]) }
    const [f] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis, ornamentos: { pre: { ...semOrnamento, topo: 20, base: 30 } } })
    // lo −41 + 20 = −21 → −20; hi 99 − 30 = 69 → 67.
    expect(f.intervalo).toEqual({ min: -20, max: 67 })
    expect(f.candidatos.map((c) => c.dy)).toEqual([0, -20, 33, 67])
  })

  it('faixa sem folga: só a referência', () => {
    const [f] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: { headline: papel([200, 100], [200, 100]) }, ornamentos: {} })
    expect(f.intervalo).toEqual({ min: 0, max: 0 })
    expect(f.candidatos).toEqual([{ rotulo: 'referencia', dy: 0 }])
  })

  it(`passo menor que ${PASSO_MINIMO_PX} px não é alternativa (a referência sempre fica)`, () => {
    // lo −31 → −30 (meio-acima −15 sai); hi 26 → 24 (meio-abaixo 12 sai).
    const [f] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: { headline: papel([169, 257], [200, 200]) }, ornamentos: {} })
    expect(f.intervalo).toEqual({ min: -30, max: 24 })
    expect(f.candidatos).toEqual([
      { rotulo: 'referencia', dy: 0 },
      { rotulo: 'acima', dy: -30 },
      { rotulo: 'abaixo', dy: 24 },
    ])
    // Intervalo inteiro abaixo do passo ([−9, 8]): só a referência.
    const [estreita] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: { headline: papel([190, 120], [200, 100]) }, ornamentos: {} })
    expect(estreita.intervalo).toEqual({ min: -9, max: 8 })
    expect(estreita.candidatos).toEqual([{ rotulo: 'referencia', dy: 0 }])
  })

  it('só os membros presentes; faixa vazia some e os índices se renumeram; logo sem ornamento', () => {
    const faixas = candidatosDasFaixas({
      arquetipo: TOPO,
      formato: 'story',
      papeis: { servico: papel([1382, 313], [1555, 60]), logo: papel([1382, 313], [1575, 95]) },
      // Ornamento de logo não existe: um "logo" aqui seria ignorado.
      ornamentos: { logo: { ...semOrnamento, topo: 500 } } as never,
    })
    expect(faixas.map((f) => [f.indice, f.membros])).toEqual([[0, ['servico', 'logo']]])
    // servico: [−173, 80]; logo: [−193, 25] → [−172, 23].
    expect(faixas[0].intervalo).toEqual({ min: -172, max: 23 })
  })

  it('nunca desloca na horizontal: o candidato é só dy', () => {
    const [f] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: { pre: papel([100, 200], [141, 60]) }, ornamentos: {} })
    expect(f.candidatos.every((c) => Object.keys(c).sort().join() === 'dy,rotulo')).toBe(true)
  })

  it(`mais de ${LIMITES_DA_BUSCA.faixas} faixas é defeito: lança`, () => {
    const formato = TOPO.formatos.story
    const z = (yMin: number, yMax: number) => ({ xMin: 0.085, xMax: 0.65, yMin, yMax })
    const separado = {
      ...TOPO,
      formatos: {
        ...TOPO.formatos,
        story: {
          ...formato,
          papeis: {
            pre: { referencia: { x: 0.085, y: 0.1, w: 0.5, h: 0.03 }, zona: z(0.09, 0.15) },
            headline: { referencia: { x: 0.085, y: 0.2, w: 0.5, h: 0.1 }, zona: z(0.18, 0.32) },
            apoio: { referencia: { x: 0.085, y: 0.4, w: 0.5, h: 0.05 }, zona: z(0.38, 0.5) },
            servico: { referencia: { x: 0.085, y: 0.8, w: 0.5, h: 0.05 }, zona: z(0.78, 0.88) },
          },
        },
      },
    } as unknown as ArquetipoDeLayout
    expect(faixasDoArquetipo(separado, 'story')).toHaveLength(4)
    const p = papel([100, 200], [141, 60])
    expect(() => candidatosDasFaixas({ arquetipo: separado, formato: 'story', papeis: { pre: p, headline: p, apoio: p, servico: p }, ornamentos: {} })).toThrow(/faixas/)
  })
})

describe('CP2B · combinações', () => {
  const faixa = (indice: number, membros: FaixaDeBusca['membros'], dys: number[]): FaixaDeBusca => ({
    indice,
    membros,
    intervalo: { min: Math.min(...dys), max: Math.max(...dys) },
    referenciaValida: true,
    candidatos: dys.map((dy, i) => ({ rotulo: (['referencia', 'acima', 'meio-acima', 'meio-abaixo', 'abaixo'] as const)[i], dy })),
  })

  it('produto cartesiano em ordem lexicográfica (a faixa 0 mais devagar), deslocamentos por membro', () => {
    const combos = combinacoesDasFaixas([faixa(0, ['pre', 'headline'], [0, -40, -20]), faixa(1, ['servico', 'logo'], [0, -80])])
    expect(combos).toHaveLength(6)
    expect(combos.map((c) => c.indice)).toEqual([0, 1, 2, 3, 4, 5])
    expect(combos.map((c) => c.escolhas.map((e) => e.dy))).toEqual([
      [0, 0],
      [0, -80],
      [-40, 0],
      [-40, -80],
      [-20, 0],
      [-20, -80],
    ])
    // O índice 0 é a peça inteira na referência.
    expect(combos[0].deslocamentos).toEqual({ pre: 0, headline: 0, servico: 0, logo: 0 })
    expect(combos[3]).toEqual({
      indice: 3,
      escolhas: [
        { faixa: 0, rotulo: 'acima', dy: -40 },
        { faixa: 1, rotulo: 'acima', dy: -80 },
      ],
      deslocamentos: { pre: -40, headline: -40, servico: -80, logo: -80 },
    })
  })

  it(`mais de ${LIMITES_DA_BUSCA.combinacoesPorCorte} combinações por corte é defeito: lança`, () => {
    const cinco = [0, -40, -20, 20, 40]
    expect(combinacoesDasFaixas([faixa(0, ['headline'], cinco), faixa(1, ['servico'], cinco)])).toHaveLength(25)
    expect(() => combinacoesDasFaixas([faixa(0, ['headline'], cinco), faixa(1, ['servico'], cinco), faixa(2, ['logo'], [0, 30])])).toThrow(/combinações/)
  })
})

describe('CP2B · catálogo real: todo candidato materializa dentro da zona efetiva', () => {
  // Caixas reais pequenas (cabem na capacidade de todas as referências) e um filete sob a manchete.
  const medidas = { pre: { width: 300, height: 40 }, headline: { width: 400, height: 120 }, apoio: { width: 300, height: 50 }, servico: { width: 300, height: 50 } }
  const ornamentos = { headline: { ...semOrnamento, base: 24 } }
  const casos: Array<[ArquetipoDeLayout, 'story' | 'feed']> = [
    [TOPO, 'story'],
    [TOPO, 'feed'],
    [CENTRO, 'story'],
    [CENTRO, 'feed'],
  ]

  for (const [arquetipo, formato] of casos) {
    it(`${arquetipo.id} · ${formato}`, () => {
      const base = { arquetipo, formato, canvas: DIMENSOES[formato], geometria: geo(formato), medidas, ornamentos, logo: { razao: 0.5 } }
      const naReferencia = materializarArquetipo(base)
      expect(problemas(naReferencia)).toEqual([])
      if (!('papeis' in naReferencia)) return
      const faixas = candidatosDasFaixas({ arquetipo, formato, papeis: naReferencia.papeis, ornamentos })
      expect(faixas.map((f) => f.membros)).toEqual(faixasDoArquetipo(arquetipo, formato))
      // Há alternativa de verdade em toda faixa (as caixas pequenas deixam folga na zona).
      expect(faixas.every((f) => f.candidatos.length >= 2 && f.candidatos.length <= LIMITES_DA_BUSCA.candidatosPorFaixa)).toBe(true)
      const combos = combinacoesDasFaixas(faixas)
      expect(combos.length).toBe(faixas.reduce((n, f) => n * f.candidatos.length, 1))
      for (const c of combos) {
        const m = materializarArquetipo({ ...base, deslocamentos: c.deslocamentos })
        expect({ c: c.escolhas, problemas: problemas(m) }).toEqual({ c: c.escolhas, problemas: [] })
        if (!('papeis' in m)) continue
        for (const [membro, dy] of Object.entries(c.deslocamentos)) {
          const ref = naReferencia.papeis[membro as 'pre']!
          const pousou = m.papeis[membro as 'pre']!
          // Só vertical: o x não muda; o y anda o dy (a menos do arredondamento); a referência e a zona não mudam.
          expect(pousou.posicao.x).toBe(ref.posicao.x)
          expect(Math.abs(pousou.posicao.y - (ref.posicao.y + dy))).toBeLessThanOrEqual(1)
          expect(pousou.referencia).toEqual(ref.referencia)
          expect(pousou.zonaEfetiva).toEqual(ref.zonaEfetiva)
        }
      }
    })
  }

  it('topo-esquerda no story: os candidatos esperados', () => {
    const naReferencia = materializarArquetipo({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas, ornamentos, logo: { razao: 0.5 } })
    if (!('papeis' in naReferencia)) throw new Error('não materializou')
    const faixas = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: naReferencia.papeis, ornamentos })
    // pre (230, 40) na zona 188–345 → [−42, 75] → [−41, 73]; a manchete e o apoio folgam mais.
    // servico (1555, 50) e logo (1575, 95) na zona 1382–1695 → [−172, 23].
    expect(faixas.map((f) => [f.intervalo, f.candidatos.map((c) => `${c.rotulo}:${c.dy}`)])).toEqual([
      [{ min: -41, max: 73 }, ['referencia:0', 'acima:-41', 'meio-acima:-20', 'meio-abaixo:36', 'abaixo:73']],
      [{ min: -172, max: 23 }, ['referencia:0', 'acima:-172', 'meio-acima:-86', 'abaixo:23']],
    ])
  })
})

describe('CP2B · resgate da referência (a referência é preferência, não obrigação)', () => {
  const caixa = (y0: number, y1: number, x0 = 92, x1 = 700) => ({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
  const papel = (zona: [number, number], pos: [number, number], x?: [number, number]) => ({ zonaEfetiva: caixa(zona[0], zona[1]), posicao: caixa(pos[0], pos[0] + pos[1], ...(x ?? [])) })

  it('referência acima da zona (área segura do projeto a corta): sem o 0, a partida é a posição válida mais perto', () => {
    // A zona começa em 250; a caixa (50 px) na referência está em 230: precisa descer ≥ 20.
    const [f] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: { pre: papel([250, 346], [230, 50]) }, ornamentos: {}, foraDaZona: new Set(['pre']) })
    expect(f.referenciaValida).toBe(false)
    expect(f.intervalo).toEqual({ min: 21, max: 64 })
    expect(f.candidatos[0]).toEqual({ rotulo: 'acima', dy: 21 })
    expect(f.candidatos.some((c) => c.dy === 0)).toBe(false)
    expect(f.candidatos.every((c) => c.dy >= f.intervalo.min && c.dy <= f.intervalo.max)).toBe(true)
  })

  it('referência abaixo da zona: a partida é a base do intervalo (o mais perto dela)', () => {
    const [f] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: { servico: papel([1382, 1570], [1555, 82]) }, ornamentos: {}, foraDaZona: new Set(['servico']) })
    expect(f.intervalo.max).toBeLessThan(0)
    expect(f.candidatos[0]).toEqual({ rotulo: 'abaixo', dy: f.intervalo.max })
  })

  it('intervalo vazio: nenhum candidato, e o motivo', () => {
    const [f] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: { pre: papel([250, 280], [230, 50]) }, ornamentos: {}, foraDaZona: new Set(['pre']) })
    expect(f.candidatos).toEqual([])
    expect(f.semPosicao?.motivo).toMatch(/nenhuma posição vertical/)
  })

  it('caixa que passa da zona na HORIZONTAL: nenhum dy conserta — sem candidatos', () => {
    const [f] = candidatosDasFaixas({ arquetipo: TOPO, formato: 'story', papeis: { headline: papel([188, 639], [298, 200], [92, 700]) }, ornamentos: { headline: { esquerda: 30, direita: 0, topo: 0, base: 0 } } })
    expect(f.candidatos).toEqual([])
    expect(f.semPosicao?.motivo).toMatch(/horizontal/)
  })
})
