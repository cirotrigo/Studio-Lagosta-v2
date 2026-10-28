/**
 * Q1 · grades quadradas de 4 colunas (pedido de 27/10): Story 4×7 (28 fotos) e Feed retrato 4×5 (20 fotos), células
 * iguais 1:1 CONTIDAS e centralizadas na caixa (a sobra é margem; o quadrado nunca estica).
 * Lado s = min((W − 3g)/4, (H − (R−1)g)/R); origem (X + (W − GW)/2, Y + (H − GH)/2). Caixas calculadas à mão:
 * - Story g0: s = min(270, 274,29) = 270, GH = 1890 ⇒ margem vertical 15.
 * - Story g10: s = min(262,5, 265,71) = 262,5, GH = 1897,5 ⇒ margem vertical 11,25.
 * - Story g40: s = min(240, 240) = 240, encaixe exato.
 * - Feed g0: s = 270, encaixe exato. Feed g10: s = min(262,5, 262) = 262, GW = 1078 ⇒ margem horizontal 1.
 * - Feed g40: s = min(240, 238) = 238, GW = 1072 ⇒ margem horizontal 4.
 * Os 14 layouts antigos ficam congelados por impressão digital da geometria (calculada sobre o fonte ANTES do Q1).
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { DesignData, Layer } from '@/types/template'
import { resolveImageSourceRect } from '@/lib/image-fit'
import { CATALOGO_DE_GRADES, layoutDoCatalogo } from '../catalogo'
import { conferirGrade, metadadoDeGrade } from '../conferir'
import { MIN_CELULA, celulasDaGrade, espacamentoInicial } from '../geometria'
import { fundoParaMedir, inserirGradeNoDesign } from '../insercao'
import { criarGrade, preencherCelula } from '../operacoes'
import { planoDePreenchimento } from '../preenchimento'
import { BLOB } from './fixtures'

const STORY = { x: 0, y: 0, w: 1080, h: 1920 }
const FEED = { x: 0, y: 0, w: 1080, h: 1350 }
const Q7 = () => layoutDoCatalogo('4x7-quadrada', 1)!
const Q5 = () => layoutDoCatalogo('4x5-quadrada', 1)!

/** Caixas esperadas em ordem de leitura a partir das colunas/linhas escritas à mão */
const grade = (xs: number[], ys: number[], s: number) => ys.flatMap((y) => xs.map((x) => ({ x, y, w: s, h: s })))

function ok(r: ReturnType<typeof celulasDaGrade>) {
  if (!r.ok) throw new Error(JSON.stringify(r.diagnosticos))
  return r.valor
}

describe('Q1 · catálogo: dois ids novos, os 14 antigos intactos', () => {
  it('Story · 28 fotos quadradas (4×7) e Feed retrato · 20 fotos quadradas (4×5), versão 1, no FIM do catálogo', () => {
    expect(CATALOGO_DE_GRADES.map((l) => l.id).slice(-2)).toEqual(['4x7-quadrada', '4x5-quadrada'])
    expect(CATALOGO_DE_GRADES).toHaveLength(16)
    expect([Q7().nome, Q7().versao, Q7().celulas.length, Q7().divisoes]).toEqual(['Story · 28 fotos quadradas (4×7)', 1, 28, { x: 4, y: 7 }])
    expect([Q5().nome, Q5().versao, Q5().celulas.length, Q5().divisoes]).toEqual(['Feed retrato · 20 fotos quadradas (4×5)', 1, 20, { x: 4, y: 5 }])
    for (const l of [Q7(), Q5()]) {
      expect(l.politica).toBe('quadradas')
      // ordem de leitura: linha a linha, coluna a coluna, uma unidade cada
      expect(l.celulas).toEqual(Array.from({ length: l.celulas.length }, (_, i) => ({ x: i % 4, y: Math.floor(i / 4), w: 1, h: 1 })))
      expect(Object.isFrozen(l) && Object.isFrozen(l.celulas) && l.celulas.every(Object.isFrozen)).toBe(true)
    }
  })

  it('espaçamento inicial: 0 nas duas novas, 10 nos 14 antigos (um só resolvedor)', () => {
    expect([espacamentoInicial(Q7()), espacamentoInicial(Q5())]).toEqual([0, 0])
    for (const l of CATALOGO_DE_GRADES.slice(0, 14)) expect(espacamentoInicial(l)).toBe(10)
  })

  it('os 14 layouts antigos: mesmos ids/versões/nomes/células/chaves e a MESMA geometria (impressão digital pré-Q1)', () => {
    const legado = CATALOGO_DE_GRADES.slice(0, 14)
    const caixas = [STORY, FEED, { x: 37.5, y: -12, w: 200, h: 200 }, { x: 100, y: 50, w: 540, h: 675 }, { x: 3, y: 7, w: 20, h: 20 }, { x: 0, y: 0, w: 1080, h: 200 }]
    const gaps = [0, 10, 40, 58, 100, -5, 1e9]
    const impressao = JSON.stringify(
      legado.map((l) => ({
        l: { id: l.id, versao: l.versao, nome: l.nome, divisoes: l.divisoes, celulas: l.celulas, chaves: Object.keys(l).sort() },
        geo: caixas.flatMap((c) => gaps.map((g) => celulasDaGrade(l, c, g))),
      })),
    )
    expect(createHash('sha256').update(impressao).digest('hex')).toBe(IMPRESSAO_DO_LEGADO)
  })
})

describe('Q1 · geometria quadrada: os seis exemplos do plano', () => {
  it.each([
    ['Story g0', Q7, STORY, 0, grade([0, 270, 540, 810], [15, 285, 555, 825, 1095, 1365, 1635], 270)],
    ['Story g10', Q7, STORY, 10, grade([0, 272.5, 545, 817.5], [11.25, 283.75, 556.25, 828.75, 1101.25, 1373.75, 1646.25], 262.5)],
    ['Story g40', Q7, STORY, 40, grade([0, 280, 560, 840], [0, 280, 560, 840, 1120, 1400, 1680], 240)],
    ['Feed g0', Q5, FEED, 0, grade([0, 270, 540, 810], [0, 270, 540, 810, 1080], 270)],
    ['Feed g10', Q5, FEED, 10, grade([1, 273, 545, 817], [0, 272, 544, 816, 1088], 262)],
    ['Feed g40', Q5, FEED, 40, grade([4, 282, 560, 838], [0, 278, 556, 834, 1112], 238)],
  ] as const)('%s: células iguais, quadradas, centralizadas', (_n, L, caixa, g, esperado) => {
    const v = ok(celulasDaGrade(L(), caixa, g))
    expect(v.espacamento).toBe(g)
    expect(v.celulas).toEqual(esperado)
    for (const c of v.celulas) expect(c.w).toBe(c.h)
  })

  it('margens: Story g0 15/15 em cima e embaixo; Story g10 11,25; Feed g10 1 px de cada lado; Feed g40 4 px', () => {
    const margens = (L: typeof Q7, caixa: typeof STORY, g: number) => {
      const cs = ok(celulasDaGrade(L(), caixa, g)).celulas
      const [p, u] = [cs[0], cs.at(-1)!]
      return [p.x - caixa.x, p.y - caixa.y, caixa.x + caixa.w - (u.x + u.w), caixa.y + caixa.h - (u.y + u.h)]
    }
    expect(margens(Q7, STORY, 0)).toEqual([0, 15, 0, 15])
    expect(margens(Q7, STORY, 10)).toEqual([0, 11.25, 0, 11.25])
    expect(margens(Q7, STORY, 40)).toEqual([0, 0, 0, 0])
    expect(margens(Q5, FEED, 0)).toEqual([0, 0, 0, 0])
    expect(margens(Q5, FEED, 10)).toEqual([1, 0, 1, 0])
    expect(margens(Q5, FEED, 40)).toEqual([4, 0, 4, 0])
  })

  it('caixa deslocada: a mesma grade, transladada (Story g10 em (37, −20))', () => {
    const v = ok(celulasDaGrade(Q7(), { x: 37, y: -20, w: 1080, h: 1920 }, 10))
    const base = ok(celulasDaGrade(Q7(), STORY, 10)).celulas
    expect(v.celulas).toEqual(base.map((c) => ({ ...c, x: c.x + 37, y: c.y - 20 })))
  })

  it('caixa de outra proporção (2000×500): quadrados contidos e centralizados no eixo que sobra, nunca esticados', () => {
    // s = min(2000/4, 500/7) = 71,428…; GW = 285,71… ⇒ sobra horizontal (2000 − GW)/2 de cada lado
    const v = ok(celulasDaGrade(Q7(), { x: 10, y: 20, w: 2000, h: 500 }, 0))
    const s = 500 / 7
    for (const c of v.celulas) {
      expect(c.w).toBe(c.h)
      expect(c.w).toBeCloseTo(s, 9)
      expect(c.x).toBeGreaterThanOrEqual(10)
      expect(c.y).toBeGreaterThanOrEqual(20)
      expect(c.x + c.w).toBeLessThanOrEqual(2010 + 1e-9)
      expect(c.y + c.h).toBeLessThanOrEqual(520 + 1e-9)
    }
    expect(v.celulas[0].x - 10).toBeCloseTo((2000 - 4 * s) / 2, 9)
    expect(v.celulas[0].y).toBeCloseTo(20, 9)
  })

  it('calha alta: limitada a 100 e ao que deixa o lado ≥ 8 px; caixa que não comporta nem com calha 0 é recusada', () => {
    // Story g100 aceita 100: s = min(780/4, 1320/7) = 188,57…
    const alta = ok(celulasDaGrade(Q7(), STORY, 100))
    expect(alta.espacamento).toBe(100)
    expect(alta.celulas[0].w).toBeCloseTo(1320 / 7, 9)
    expect(ok(celulasDaGrade(Q7(), STORY, 1e9)).espacamento).toBe(100)
    // 100×200: gMax = min((100−32)/3, (200−56)/6) = min(22,67, 24) ⇒ g = 22, s = min(34/4, 68/7) = 8,5
    const piso = ok(celulasDaGrade(Q7(), { x: 0, y: 0, w: 100, h: 200 }, 100))
    expect(piso.espacamento).toBe(22)
    expect(piso.celulas[0]).toEqual({ x: 0, y: (200 - (7 * 8.5 + 6 * 22)) / 2, w: 8.5, h: 8.5 })
    for (const c of piso.celulas) expect(c.w).toBeGreaterThanOrEqual(MIN_CELULA)
    // 32×56 g0: s = 8 exato; calha pedida 5 cai para 0
    expect(ok(celulasDaGrade(Q7(), { x: 0, y: 0, w: 32, h: 56 }, 5))).toMatchObject({ espacamento: 0, celulas: expect.arrayContaining([{ x: 24, y: 48, w: 8, h: 8 }]) })
    // 31×56: s = 7,75 < 8 mesmo com calha 0
    const pequena = celulasDaGrade(Q7(), { x: 0, y: 0, w: 31, h: 56 }, 0)
    expect(pequena).toMatchObject({ ok: false, diagnosticos: [{ codigo: 'GRADE_PEQUENA_DEMAIS' }] })
    expect(celulasDaGrade(Q5(), { x: 0, y: 0, w: 32, h: 39 }, 0)).toMatchObject({ ok: false, diagnosticos: [{ codigo: 'GRADE_PEQUENA_DEMAIS' }] })
    // calha negativa ⇒ 0
    expect(ok(celulasDaGrade(Q5(), FEED, -30)).espacamento).toBe(0)
  })

  it('NaN e infinito: recusa de entrada, nunca célula NaN', () => {
    for (const caixa of [{ ...STORY, w: Number.NaN }, { ...STORY, x: Number.POSITIVE_INFINITY }, { ...STORY, h: 0 }]) {
      expect(celulasDaGrade(Q7(), caixa, 0)).toMatchObject({ ok: false, diagnosticos: [{ codigo: 'ENTRADA_INVALIDA' }] })
    }
    expect(celulasDaGrade(Q5(), FEED, Number.NaN)).toMatchObject({ ok: false, diagnosticos: [{ codigo: 'ENTRADA_INVALIDA' }] })
  })
})

describe('Q1 · criar e inserir com o espaçamento inicial do layout', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`)

  it('criarGrade sem espaçamento: 0 nas quadradas, 10 no 2×2; células conferem', () => {
    const q = criarGrade({ layout: '4x7-quadrada', caixa: STORY, idDaGrade: 'g', idsDasCelulas: ids(28) })
    expect(q.ok && q.valor.map((c) => metadadoDeGrade(c)?.espacamento)).toEqual(Array(28).fill(0))
    expect(q.ok && [q.valor[0].position, q.valor[0].size]).toEqual([{ x: 0, y: 15 }, { width: 270, height: 270 }])
    expect(q.ok && conferirGrade(q.valor)).toEqual([])
    const v = criarGrade({ layout: '2x2', caixa: FEED, idDaGrade: 'g', idsDasCelulas: ids(4) })
    expect(v.ok && metadadoDeGrade(v.valor[0])?.espacamento).toBe(10)
  })

  const camada = (id: string, type: Layer['type'], extra: Partial<Layer> = {}) =>
    ({ id, type, name: id, visible: true, locked: false, order: 0, position: { x: 100, y: 100 }, size: { width: 200, height: 80 }, ...extra }) as Layer
  const design = (w: number, h: number, layers: Layer[]) => ({ canvas: { width: w, height: h, backgroundColor: '#ffffff' }, layers: layers.map((l, i) => ({ ...l, order: i })) }) as DesignData
  const pedido = (layout: string, n: number) => ({ layout, idDaGrade: 'grade-nova', idsDasCelulas: Array.from({ length: n }, (_, i) => `cel-${i}`) })
  const texto = camada('titulo', 'text', { content: 'Oi' })

  it.each([
    ['Story', '4x7-quadrada', 28, 1080, 1920, { x: 0, y: 15 }],
    ['Feed', '4x5-quadrada', 20, 1080, 1350, { x: 0, y: 0 }],
  ] as const)('%s: insere %s com %i células 270×270, espaçamento 0, abaixo do texto', (_n, layout, n, w, h, primeira) => {
    const r = inserirGradeNoDesign(design(w, h, [texto]), pedido(layout, n), null)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.celulas).toHaveLength(n)
    expect(r.layers.map((l) => l.id)).toEqual([...Array.from({ length: n }, (_, i) => `cel-${i}`), 'titulo'])
    expect(r.layers[0].position).toEqual(primeira)
    for (const c of r.layers.slice(0, n)) {
      expect(c.size).toEqual({ width: 270, height: 270 })
      expect(c.metadata?.grade).toMatchObject({ layout, versao: 1, espacamento: 0, caixa: { x: 0, y: 0, w, h } })
    }
    expect(conferirGrade(r.layers)).toEqual([])
  })

  it('fundo com recorte manual → célula 1 do Feed 4×5: a mesma escala e o mesmo centro do que o fundo desenhava; camadas intactas', () => {
    const NAT = { width: 2672, height: 4000 }
    const FOTO = `${BLOB}/fotos/fundo.jpg`
    // recorte na proporção da página (0,8): 0,598802…×2672 = 1600 px por 0,5×4000 = 2000 px
    const crop = { x: 0.2, y: 0.25, width: 1600 / 2672, height: 0.5 }
    const fundo = camada('bg-foto', 'image', { position: { x: 0, y: 0 }, size: { width: 1080, height: 1350 }, rotation: 0, fileUrl: FOTO, style: { objectFit: 'cover', crop } })
    const logo = camada('logo', 'logo')
    const d = design(1080, 1350, [fundo, texto, logo])
    const f = fundoParaMedir(d)!
    const r = inserirGradeNoDesign(d, pedido('4x5-quadrada', 20), { camadaId: f.camadaId, impressao: f.impressao, natural: NAT })
    expect(r.ok && r.convertida).toBe('bg-foto')
    if (!r.ok) return
    expect(r.layers.slice(20).map((l) => l.id)).toEqual(['titulo', 'logo'])
    expect(r.layers.slice(20)).toEqual(d.layers.slice(1))
    expect(conferirGrade(r.layers)).toEqual([])
    const cel = r.layers[0]
    expect([cel.fileUrl, cel.size, metadadoDeGrade(cel)?.espacamento]).toEqual([FOTO, { width: 270, height: 270 }, 0])
    const antes = resolveImageSourceRect(NAT, { width: 1080, height: 1350 }, fundo.style)!
    const depois = resolveImageSourceRect(NAT, { width: 270, height: 270 }, cel.style)!
    // escala do fundo: 1080/1600 = 0,675 ⇒ fonte da célula 270/0,675 = 400 px, centrada em (534,4 + 800, 1000 + 1000)
    expect(antes.cropWidth).toBeCloseTo(1600, 6)
    expect(depois.cropWidth).toBeCloseTo(400, 6)
    expect(depois.cropHeight).toBeCloseTo(400, 6)
    expect(depois.cropX + depois.cropWidth / 2).toBeCloseTo(antes.cropX + antes.cropWidth / 2, 6)
    expect(depois.cropY + depois.cropHeight / 2).toBeCloseTo(antes.cropY + antes.cropHeight / 2, 6)
  })
})

describe('Q2 · lotes de até 6 numa grade de 28 (o limite é do lote, não da grade)', () => {
  const IDS = Array.from({ length: 28 }, (_, i) => `q${i}`)
  const grade28 = (cheias: number) => {
    const g = criarGrade({ layout: '4x7-quadrada', caixa: STORY, idDaGrade: 'gq', idsDasCelulas: IDS })
    if (!g.ok) throw new Error(JSON.stringify(g.diagnosticos))
    const layers = g.valor.map((c, i) => (i < cheias ? (preencherCelula(c, `${BLOB}/fotos/q${i}.jpg`) as { valor: Layer }).valor : c))
    return { canvas: { width: 1080, height: 1920, backgroundColor: '#ffffff' }, layers } as DesignData
  }

  it('vazia: lote de 6 nas 6 primeiras em ordem de leitura; 7 recusado; foto única na próxima vazia', () => {
    expect(planoDePreenchimento(grade28(0), IDS, 6)).toMatchObject({ tipo: 'grade', modo: 'lote', alvo: { celulas: IDS.slice(0, 6) } })
    expect(planoDePreenchimento(grade28(0), IDS, 7)).toMatchObject({ tipo: 'recusa', codigo: 'LOTE_INVALIDO' })
    expect(planoDePreenchimento(grade28(13), IDS, 'uma')).toMatchObject({ tipo: 'grade', modo: 'proxima', alvo: { celulas: ['q13'] } })
  })

  it('com 24 cheias: o próximo lote vai até a última (q24…q27); cheia, foto única vira avulsa com aviso', () => {
    expect(planoDePreenchimento(grade28(24), IDS, 4)).toMatchObject({ tipo: 'grade', modo: 'lote', alvo: { celulas: IDS.slice(24) } })
    expect(planoDePreenchimento(grade28(24), IDS, 5)).toMatchObject({ tipo: 'recusa', codigo: 'LOTE_INVALIDO' })
    expect(planoDePreenchimento(grade28(28), IDS, 'uma')).toMatchObject({ tipo: 'avulsa', gradeCheia: true })
  })
})

/** sha256 da impressão dos 14 layouts antigos, calculada sobre o fonte de 27/10 ANTES do Q1 (sem edição) */
const IMPRESSAO_DO_LEGADO = '78d961b0450fa57056b32238e8771810b19f7b12a5a4263cb73bbb03cb5a7d15'
