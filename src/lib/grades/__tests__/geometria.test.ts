/**
 * G0 · geometria (§3.1–§3.2 do plano): espaçamento só interno por meia-calha, piso de 8 px por célula, gEfetivo
 * inteiro, raio limitado e ordem de leitura. Caixas esperadas calculadas à mão nos comentários.
 */
import { describe, expect, it } from 'vitest'
import { layoutDoCatalogo } from '../catalogo'
import { celulasDaGrade, ordemDeLeitura, raioDaCelula } from '../geometria'

const L = (id: string) => layoutDoCatalogo(id, 1)!
const FEED = { x: 0, y: 0, w: 1080, h: 1350 }
const STORY = { x: 0, y: 0, w: 1080, h: 1920 }

function ok(r: ReturnType<typeof celulasDaGrade>) {
  if (!r.ok) throw new Error(JSON.stringify(r.diagnosticos))
  return r.valor
}

describe('celulasDaGrade — os 5 casos do §3.1', () => {
  it('Feed 1080×1350, 2/1/2, g=100: linha do meio 450−100 = 350', () => {
    // linhas de 450: [0,450-50]=400 · [450+50, 900-50]=350 · [900+50, 1350]=400
    // colunas de 540: [0, 490] · [590, 1080]
    const v = ok(celulasDaGrade(L('2-1-2'), FEED, 100))
    expect(v.espacamento).toBe(100)
    expect(v.celulas).toEqual([
      { x: 0, y: 0, w: 490, h: 400 },
      { x: 590, y: 0, w: 490, h: 400 },
      { x: 0, y: 500, w: 1080, h: 350 },
      { x: 0, y: 950, w: 490, h: 400 },
      { x: 590, y: 950, w: 490, h: 400 },
    ])
  })

  it('Story 1080×1920, 2/1/2, g=100: linha do meio 640−100 = 540', () => {
    const v = ok(celulasDaGrade(L('2-1-2'), STORY, 100))
    expect(v.espacamento).toBe(100)
    expect(v.celulas[2]).toEqual({ x: 0, y: 690, w: 1080, h: 540 })
    expect(v.celulas[0]).toEqual({ x: 0, y: 0, w: 490, h: 590 })
    expect(v.celulas[4]).toEqual({ x: 590, y: 1330, w: 490, h: 590 })
  })

  it('Feed 1080×1350, 2×3, g=100: aceito sem redução', () => {
    const v = ok(celulasDaGrade(L('2x3'), FEED, 100))
    expect(v.espacamento).toBe(100)
    expect(v.celulas[2]).toEqual({ x: 0, y: 500, w: 490, h: 350 })
    expect(v.celulas[3]).toEqual({ x: 590, y: 500, w: 490, h: 350 })
  })

  it('200×200, 2×3, g=100: clamp pela linha do meio (66,67 − g ≥ 8) ⇒ gEfetivo 58', () => {
    const v = ok(celulasDaGrade(L('2x3'), { x: 0, y: 0, w: 200, h: 200 }, 100))
    expect(v.espacamento).toBe(58)
    // meio: y0 = 200/3 + 29 = 95,667; y1 = 400/3 − 29 = 104,333 → 8,667 ≥ 8
    expect(v.celulas[2].h).toBeCloseTo(200 / 3 - 58, 9)
    expect(v.celulas[2].h).toBeGreaterThanOrEqual(8)
  })

  it('20×20, 2×3, g=0: recusa GRADE_PEQUENA_DEMAIS', () => {
    const r = celulasDaGrade(L('2x3'), { x: 0, y: 0, w: 20, h: 20 }, 0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.diagnosticos[0].codigo).toBe('GRADE_PEQUENA_DEMAIS')
  })
})

describe('celulasDaGrade — bordas e entradas', () => {
  it('g=0 em 2 colunas: metades exatas, borda externa colada', () => {
    const v = ok(celulasDaGrade(L('2-colunas'), FEED, 0))
    expect(v.celulas).toEqual([
      { x: 0, y: 0, w: 540, h: 1350 },
      { x: 540, y: 0, w: 540, h: 1350 },
    ])
  })

  it('espaçamento só interno e caixa deslocada: a borda de fora fica na caixa', () => {
    // 2 colunas, g=10, caixa em (100,200) 400×300: [100, 100+200-5] · [100+200+5, 500]
    const v = ok(celulasDaGrade(L('2-colunas'), { x: 100, y: 200, w: 400, h: 300 }, 10))
    expect(v.celulas).toEqual([
      { x: 100, y: 200, w: 195, h: 300 },
      { x: 305, y: 200, w: 195, h: 300 },
    ])
  })

  it('g fracionário vira floor; negativo vira 0; acima de 100 vira 100', () => {
    expect(ok(celulasDaGrade(L('2-colunas'), FEED, 10.9)).espacamento).toBe(10)
    expect(ok(celulasDaGrade(L('2-colunas'), FEED, -5)).espacamento).toBe(0)
    expect(ok(celulasDaGrade(L('2-colunas'), FEED, 1000)).espacamento).toBe(100)
  })

  it('piso 8 também vale no layout de 1 célula (n=0) e no eixo sem borda interna', () => {
    const r = celulasDaGrade(L('1-celula'), { x: 0, y: 0, w: 7, h: 100 }, 10)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.diagnosticos[0].codigo).toBe('GRADE_PEQUENA_DEMAIS')
    // 1 célula 8×8 é o mínimo aceito; espaçamento não se aplica (sem borda interna)
    expect(ok(celulasDaGrade(L('1-celula'), { x: 0, y: 0, w: 8, h: 8 }, 50)).celulas).toEqual([{ x: 0, y: 0, w: 8, h: 8 }])
    // 2 colunas 400×7: eixo y sem borda interna, 7 < 8
    const r2 = celulasDaGrade(L('2-colunas'), { x: 0, y: 0, w: 400, h: 7 }, 0)
    expect(r2.ok).toBe(false)
  })

  it.each([
    ['espaçamento NaN', FEED, Number.NaN],
    ['espaçamento Infinity', FEED, Number.POSITIVE_INFINITY],
    ['caixa com NaN', { x: Number.NaN, y: 0, w: 1080, h: 1350 }, 10],
    ['caixa com Infinity', { x: 0, y: 0, w: Number.POSITIVE_INFINITY, h: 1350 }, 10],
    ['caixa de largura 0', { x: 0, y: 0, w: 0, h: 1350 }, 10],
    ['caixa de altura negativa', { x: 0, y: 0, w: 1080, h: -1 }, 10],
  ])('%s: recusa ENTRADA_INVALIDA', (_n, caixa, g) => {
    const r = celulasDaGrade(L('2-colunas'), caixa, g)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.diagnosticos[0].codigo).toBe('ENTRADA_INVALIDA')
  })

  it('nunca devolve largura ou altura ≤ 0 nos 14 layouts, em Story/Feed, g 0..100', () => {
    for (const id of ['1-celula', '2-colunas', '2-linhas', '2-60-40', '3-linhas', '1-cima-2-baixo', '2-cima-1-baixo',
      '1-esquerda-2-direita', '2x2', '1-cima-3-baixo', '2-1-2', '1-grande-4-pequenas', '2x3', '3x2']) {
      for (const caixa of [FEED, STORY]) {
        for (const g of [0, 10, 100]) {
          for (const c of ok(celulasDaGrade(L(id), caixa, g)).celulas) {
            expect(c.w).toBeGreaterThanOrEqual(8)
            expect(c.h).toBeGreaterThanOrEqual(8)
          }
        }
      }
    }
  })
})

describe('raioDaCelula', () => {
  it('limita à metade do lado menor e a ≥ 0', () => {
    expect(raioDaCelula(1000, { w: 490, h: 400 })).toBe(200)
    expect(raioDaCelula(12, { w: 490, h: 400 })).toBe(12)
    expect(raioDaCelula(-3, { w: 490, h: 400 })).toBe(0)
    expect(raioDaCelula(0, { w: 490, h: 400 })).toBe(0)
  })
})

describe('ordemDeLeitura', () => {
  it('de cima para baixo, da esquerda para a direita', () => {
    const caixas = [
      { x: 590, y: 0, w: 490, h: 400 },
      { x: 0, y: 500, w: 1080, h: 350 },
      { x: 0, y: 0, w: 490, h: 400 },
      { x: 590, y: 950, w: 490, h: 400 },
      { x: 0, y: 950, w: 490, h: 400 },
    ]
    expect(ordemDeLeitura(caixas)).toEqual([2, 0, 1, 4, 3])
  })

  it('1 grande à esquerda + 2 à direita: a grande vem antes da de cima à direita', () => {
    const caixas = [
      { x: 545, y: 680, w: 535, h: 670 },
      { x: 0, y: 0, w: 535, h: 1350 },
      { x: 545, y: 0, w: 535, h: 670 },
    ]
    expect(ordemDeLeitura(caixas)).toEqual([1, 2, 0])
  })

  it('não muta a entrada', () => {
    const caixas = [{ x: 10, y: 10, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 }]
    const copia = structuredClone(caixas)
    ordemDeLeitura(caixas)
    expect(caixas).toEqual(copia)
  })
})
