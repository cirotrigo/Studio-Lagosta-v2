/**
 * T1b — os acentos do arquétipo, no módulo puro: a receita vem do asset V2 (canal e papel certos), a posição segue a
 * caixa REAL do texto, o opcional que não cabe sai e o obrigatório recusa, e a receita gravada é lida com rigor.
 */
import { describe, expect, it } from 'vitest'
import { NUMEROS_PADRAO } from '../../assinatura'
import { verArquetipo } from '../catalogo'
import { camadaDoAcento, lerAcentosGravados, obstaculosDosAcentos, posicionarAcentos, receitasDoArquetipo, type ReceitaDoAcento } from '../acentos'
import type { RetanguloPx } from '../materializar'
import { FORMATOS_DO_ARQUETIPO, type ArquetipoDeLayout, type FormatoDoArquetipo, type PapelDeTexto } from '../tipos'

const TOPO = 'minimal-fb-topo-esquerda'
const BASE = 'minimal-fb-base-esquerda'
const CENTRO = 'minimal-fb-centro-optico'
const CANVAS: Record<FormatoDoArquetipo, { width: number; height: number }> = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } }
const piso = (f: FormatoDoArquetipo) => NUMEROS_PADRAO.geometria[f]

/** A referência de cada papel de texto, em px (sem arredondar): onde o texto pousa quando a foto não o move. */
function referencias(a: ArquetipoDeLayout, f: FormatoDoArquetipo): Partial<Record<PapelDeTexto | 'logo', RetanguloPx>> {
  const { width: W, height: H } = CANVAS[f]
  const saida: Partial<Record<PapelDeTexto | 'logo', RetanguloPx>> = {}
  for (const [papel, pos] of Object.entries(a.formatos[f].papeis)) {
    if (pos && 'referencia' in pos) saida[papel as PapelDeTexto] = { x: pos.referencia.x * W, y: pos.referencia.y * H, width: pos.referencia.w * W, height: pos.referencia.h * H }
  }
  return saida
}

function posicionar(id: string, f: FormatoDoArquetipo, mudar: (p: RetanguloPx) => RetanguloPx = (p) => p, obstaculos?: Array<{ id: string; rect: RetanguloPx }>) {
  const a = verArquetipo(id)!
  const refs = referencias(a, f)
  const papeis = Object.fromEntries(Object.entries(refs).map(([papel, r]) => [papel, { posicao: papel === 'headline' ? mudar(r!) : r! }]))
  const outros = Object.entries(refs).filter(([p]) => p !== 'headline').map(([p, r]) => ({ id: p, rect: r! }))
  return posicionarAcentos({ arquetipo: a, formato: f, canvas: CANVAS[f], geometria: piso(f), receitas: receitasDoArquetipo(a).receitas, papeis, obstaculos: obstaculos ?? outros })
}

const caixaDeclarada = (id: string, f: FormatoDoArquetipo) => {
  const a = verArquetipo(id)!
  const e = Object.values(a.formatos[f].elementos!)[0]
  const { width: W, height: H } = CANVAS[f]
  return { x: e.x * W, y: e.y * H, w: e.w * W, h: e.h * H }
}

describe('T1b · a receita é o asset V2 (canal, papel e desenho certos)', () => {
  it('fio = linha no preenchimento (texto); moldura = svg-path no contorno (texto); spark = svg-path travado no preenchimento (destaque)', () => {
    const r = (id: string) => receitasDoArquetipo(verArquetipo(id)!)
    expect(r(TOPO)).toEqual({
      semReceita: [],
      receitas: [{ elemento: 'fio', tipo: 'fio-fino', presoA: 'headline', corPorPapel: 'texto', canal: 'preenchimento', asset: { id: 'fio-fino', versao: 1 }, desenho: { shapeType: 'line', strokeWidth: 2, ajuste: 'livre' } }],
    })
    expect(r(BASE).receitas).toEqual([
      { elemento: 'moldura', tipo: 'moldura-aberta', presoA: 'headline', corPorPapel: 'texto', canal: 'contorno', asset: { id: 'moldura-aberta', versao: 1 }, desenho: { shapeType: 'svg-path', pathData: 'M0 100 L0 0 L100 0', strokeWidth: 2, ajuste: 'livre' } },
    ])
    expect(r(CENTRO).receitas).toEqual([
      { elemento: 'spark', tipo: 'spark-4', presoA: 'headline', corPorPapel: 'destaque', canal: 'preenchimento', asset: { id: 'spark-4', versao: 1 }, desenho: { shapeType: 'svg-path', pathData: 'M50 0 L61 39 L100 50 L61 61 L50 100 L39 61 L0 50 L39 39 Z', ajuste: 'travado' } },
    ])
  })
})

describe('T1b · o acento preso ao texto (3 presets × story e feed)', () => {
  for (const id of [TOPO, BASE, CENTRO]) {
    for (const f of FORMATOS_DO_ARQUETIPO) {
      it(`${id} ${f}: com o texto na referência, o acento pousa na caixa declarada (rente à tinta) e não encosta em nada`, () => {
        const { acentos, omitidos, recusas } = posicionar(id, f)
        expect(omitidos).toEqual([])
        expect(recusas).toEqual([])
        expect(acentos).toHaveLength(1)
        const e = caixaDeclarada(id, f)
        const deslocamentoDaTinta = id === CENTRO ? 0 : 6 // padding de desenho: o texto à esquerda começa 6 px dentro da caixa
        const rect = acentos[0].rect
        expect(rect.x).toBe(Math.round(e.x + deslocamentoDaTinta))
        expect(rect.y).toBe(Math.round(e.y))
        expect(rect.width).toBe(Math.round(e.w))
        expect(rect.height).toBe(Math.round(id === TOPO ? Math.max(e.h, 2) : e.h))
      })

      it(`${id} ${f}: a foto desce a manchete 40 px — o acento acompanha (a moldura só alonga o braço vertical)`, () => {
        const antes = posicionar(id, f).acentos[0].rect
        const depois = posicionar(id, f, (p) => ({ ...p, y: p.y + 40 }), []).acentos[0].rect
        if (id === BASE) {
          expect(depois).toEqual({ ...antes, height: antes.height + 40 })
        } else {
          expect(depois).toEqual({ ...antes, y: antes.y + 40 })
        }
      })
    }
  }

  it('o fio segue o FIM real do texto: manchete de uma linha (caixa 120 px menor) leva o fio 120 px para cima; o spark segue o topo', () => {
    const fio = posicionar(TOPO, 'story').acentos[0].rect
    expect(posicionar(TOPO, 'story', (p) => ({ ...p, height: p.height - 120 }), []).acentos[0].rect).toEqual({ ...fio, y: fio.y - 120 })
    const spark = posicionar(CENTRO, 'story').acentos[0].rect
    expect(posicionar(CENTRO, 'story', (p) => ({ ...p, height: p.height - 60 }), []).acentos[0].rect).toEqual(spark)
  })

  it('no centro óptico o spark fica no centro da caixa REAL da manchete, que a medida estreitou', () => {
    const r = posicionar(CENTRO, 'feed', (p) => ({ ...p, x: p.x + 100, width: p.width - 200 }), []).acentos[0].rect
    expect(Math.abs(r.x + r.width / 2 - 540)).toBeLessThanOrEqual(1)
  })
})

describe('T1b · o que não cabe: o opcional sai, o obrigatório recusa — nada é empurrado', () => {
  it('o fio que encostaria num texto é OMITIDO, com o motivo e a caixa', () => {
    const fio = posicionar(TOPO, 'story').acentos[0].rect
    const r = posicionar(TOPO, 'story', (p) => p, [{ id: 'apoio', rect: { ...fio, y: fio.y + 2 } }])
    expect(r.acentos).toEqual([])
    expect(r.recusas).toEqual([])
    expect(r.omitidos).toEqual([{ elemento: 'fio', tipo: 'fio-fino', opcional: true, rect: fio, motivo: expect.stringMatching(/encosta em apoio/) }])
  })

  it('o spark fora da área segura do projeto é omitido', () => {
    const r = posicionar(CENTRO, 'story', (p) => ({ ...p, y: 200 }), [])
    expect(r.omitidos[0]).toMatchObject({ elemento: 'spark', motivo: expect.stringMatching(/área segura/) })
  })

  it('a moldura obrigatória que encostaria na logo é RECUSA (com o elemento, a caixa e o motivo)', () => {
    const l = posicionar(BASE, 'feed').acentos[0].rect
    const r = posicionar(BASE, 'feed', (p) => p, [{ id: 'logo', rect: { x: l.x + 10, y: l.y - 5, width: 30, height: 30 } }])
    expect(r.acentos).toEqual([])
    expect(r.recusas).toEqual([{ elemento: 'moldura', tipo: 'moldura-aberta', opcional: false, rect: l, motivo: expect.stringMatching(/encosta em logo/) }])
  })

  it('a área segura do projeto que corta o braço de cima o faz descer (dito); o fim continua preso ao texto', () => {
    const a = verArquetipo(BASE)!
    const refs = referencias(a, 'story')
    const geometria = { ...piso('story'), safeTopo: 300 }
    const r = posicionarAcentos({ arquetipo: a, formato: 'story', canvas: CANVAS.story, geometria, receitas: receitasDoArquetipo(a).receitas, papeis: { headline: { posicao: refs.headline! } }, obstaculos: [] })
    const padrao = posicionar(BASE, 'story').acentos[0].rect
    const l = r.acentos[0].rect
    expect([l.x, l.y, l.width]).toEqual([padrao.x, 300, padrao.width])
    expect(Math.abs(l.y + l.height - (padrao.y + padrao.height))).toBeLessThanOrEqual(1) // o fim não se move (arredondamento)
    expect(r.avisos).toEqual([expect.stringMatching(/desceu 89 px/)])
  })

  it('os obstáculos são a caixa de cada unidade COM os ornamentos do arranjo, mais a logo', () => {
    const p = { x: 100, y: 200, width: 300, height: 80 }
    expect(obstaculosDosAcentos([{ papel: 'headline', ornamentos: { esquerda: 10, direita: 0, topo: 0, base: 24 } }], { headline: { posicao: p } }, { x: 1, y: 2, width: 3, height: 4 })).toEqual([
      { id: 'headline', rect: { x: 90, y: 200, width: 310, height: 104 } },
      { id: 'logo', rect: { x: 1, y: 2, width: 3, height: 4 } },
    ])
  })
})

describe('T1b · a receita congelada', () => {
  const receitas = [TOPO, BASE, CENTRO].flatMap((id) => receitasDoArquetipo(verArquetipo(id)!).receitas)

  it('ausente = peça de antes do T1b (`[]`); a receita gravada volta igual, sem os campos de diagnóstico', () => {
    expect(lerAcentosGravados(undefined)).toEqual([])
    expect(lerAcentosGravados(null)).toEqual([])
    const gravadas = JSON.parse(JSON.stringify(receitas.map((r) => ({ ...r, camada: `acento-${r.elemento}`, rect: { x: 0, y: 0, width: 1, height: 1 }, cor: '#ffffff', fonteDaCor: 'texto-do-papel' }))))
    // A receita E a cor congelada (literal e fonte) voltam; a camada e o retângulo de antes, não.
    expect(lerAcentosGravados(gravadas)).toEqual(receitas.map((r) => ({ ...r, cor: '#ffffff', fonteDaCor: 'texto-do-papel' })))
  })

  it('malformada é problema (quem chama recusa): forma, path, canal, papel, espessura, ajuste, cor', () => {
    const fio = { ...receitas[0], cor: '#ffffff', fonteDaCor: 'texto-do-papel' }
    const casos: Array<[unknown, RegExp]> = [
      [{}, /lista/],
      [[{ ...fio, desenho: { ...fio.desenho, shapeType: 'rectangle' } }], /forma/],
      [[{ ...receitas[1], cor: '#ffffff', fonteDaCor: 'x', desenho: { ...receitas[1].desenho, pathData: 'Q 1 2' } }], /pathData/],
      [[{ ...fio, cor: 'transparent' }], /cor congelada/],
      [[{ ...fio, cor: 42 }], /cor congelada/],
      [[{ ...fio, fonteDaCor: undefined }], /fonte da cor/],
      [[{ ...fio, canal: 'sombra' }], /canal/],
      [[{ ...fio, corPorPapel: '#ff0000' }], /corPorPapel/],
      [[{ ...fio, presoA: 'logo' }], /presoA/],
      [[{ ...fio, desenho: { ...fio.desenho, strokeWidth: 900 } }], /espessura/],
      [[{ ...fio, desenho: { ...fio.desenho, ajuste: 'solto' } }], /ajuste/],
      [[{ ...fio, asset: { id: 'fio-fino', versao: 1.5 } }], /asset/],
    ]
    for (const [valor, motivo] of casos) expect(lerAcentosGravados(valor)).toEqual({ problema: expect.stringMatching(motivo) })
  })
})

describe('T1b · a camada do acento', () => {
  const rect = { x: 98, y: 454, width: 194, height: 6 }
  const camada = (r: ReceitaDoAcento) => camadaDoAcento({ receita: r, rect }, { hex: '#f5f5f5', fonte: 'texto-do-papel' }, `${TOPO}@1`)
  const [fio] = receitasDoArquetipo(verArquetipo(TOPO)!).receitas
  const [moldura] = receitasDoArquetipo(verArquetipo(BASE)!).receitas
  const [spark] = receitasDoArquetipo(verArquetipo(CENTRO)!).receitas

  // A cor sai pela canonização do servidor (a mesma da inserção do editor): `rgba(…)`.
  const CANONICA = 'rgba(245, 245, 245, 1)'

  it('shape na caixa, a cor no canal do asset, proveniência só do asset (o Reaplicar não troca a cor da manchete)', () => {
    const c = camada(fio)
    expect(c).toMatchObject({ id: 'acento-fio', type: 'shape', position: { x: 98, y: 454 }, size: { width: 194, height: 6 }, visible: true })
    expect(c.style).toMatchObject({ shapeType: 'line', fill: CANONICA, strokeWidth: 2, vetor: { asset: { id: 'fio-fino', versao: 1 } } })
    expect(c.style?.vetor?.papeis).toBeUndefined()
    expect(c.metadata).toEqual({ compositor: { acento: { elemento: 'fio', tipo: 'fio-fino', presoA: 'headline', corPorPapel: 'texto', fonteDaCor: 'texto-do-papel', arquetipo: `${TOPO}@1` } } })
  })

  it('a moldura pinta o contorno (fill transparente); o spark preenche e trava a proporção', () => {
    expect(camada(moldura).style).toMatchObject({ shapeType: 'svg-path', pathData: 'M0 100 L0 0 L100 0', fill: 'transparent', strokeColor: CANONICA, strokeWidth: 2 })
    expect(camada(moldura).style?.manterProporcao).toBeUndefined()
    expect(camada(spark).style).toMatchObject({ shapeType: 'svg-path', fill: CANONICA, manterProporcao: true })
    expect(camada(spark).style?.strokeColor).toBeUndefined()
  })
})
