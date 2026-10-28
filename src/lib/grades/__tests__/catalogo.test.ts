/**
 * G0 · catálogo de grades: 14 layouts em unidades inteiras (+ 2 quadrados do Q1 no fim), imutável, cobrindo a caixa
 * sem sobreposição (nas quadradas, a matriz de unidades; o desenho contido é da geometria).
 * As expectativas são escritas à mão (ids, contagens, retângulos); nenhuma sai do próprio algoritmo.
 */
import { describe, expect, it } from 'vitest'
import { CATALOGO_DE_GRADES, VERSAO_DO_CATALOGO, layoutDoCatalogo, fracoesDoLayout } from '../catalogo'

const IDS_ESPERADOS = [
  '1-celula',
  '2-colunas',
  '2-linhas',
  '2-60-40',
  '3-linhas',
  '1-cima-2-baixo',
  '2-cima-1-baixo',
  '1-esquerda-2-direita',
  '2x2',
  '1-cima-3-baixo',
  '2-1-2',
  '1-grande-4-pequenas',
  '2x3',
  '3x2',
]

const CELULAS_ESPERADAS: Record<string, number> = {
  '1-celula': 1,
  '2-colunas': 2,
  '2-linhas': 2,
  '2-60-40': 2,
  '3-linhas': 3,
  '1-cima-2-baixo': 3,
  '2-cima-1-baixo': 3,
  '1-esquerda-2-direita': 3,
  '2x2': 4,
  '1-cima-3-baixo': 4,
  '2-1-2': 5,
  '1-grande-4-pequenas': 5,
  '2x3': 6,
  '3x2': 6,
  '4x7-quadrada': 28,
  '4x5-quadrada': 20,
}

describe('catálogo de grades', () => {
  it('os 14 layouts da pesquisa, na ordem, e depois as 2 grades quadradas do Q1; todos versão 1', () => {
    expect(CATALOGO_DE_GRADES.map((l) => l.id)).toEqual([...IDS_ESPERADOS, '4x7-quadrada', '4x5-quadrada'])
    expect(VERSAO_DO_CATALOGO).toBe(1)
    for (const l of CATALOGO_DE_GRADES) {
      expect(l.versao).toBe(1)
      expect(l.celulas.length).toBe(CELULAS_ESPERADAS[l.id])
    }
  })

  it('os 14 da pesquisa têm no máximo 6 células (um lote); as quadradas se preenchem em vários lotes de até 6', () => {
    for (const l of CATALOGO_DE_GRADES.slice(0, 14)) expect(l.celulas.length).toBeLessThanOrEqual(6)
  })

  it('é imutável em profundidade', () => {
    expect(Object.isFrozen(CATALOGO_DE_GRADES)).toBe(true)
    for (const l of CATALOGO_DE_GRADES) {
      expect(Object.isFrozen(l)).toBe(true)
      expect(Object.isFrozen(l.divisoes)).toBe(true)
      expect(Object.isFrozen(l.celulas)).toBe(true)
      for (const c of l.celulas) expect(Object.isFrozen(c)).toBe(true)
    }
    expect(() => {
      ;(CATALOGO_DE_GRADES[0].celulas[0] as { x: number }).x = 9
    }).toThrow()
  })

  it.each([...IDS_ESPERADOS, '4x7-quadrada', '4x5-quadrada'])('%s cobre a caixa: dentro dos limites, sem interseção par a par, área total = 1', (id) => {
    const l = layoutDoCatalogo(id, 1)!
    expect(l).toBeDefined()
    const { x: dx, y: dy } = l.divisoes
    let area = 0
    for (const c of l.celulas) {
      expect(Number.isInteger(c.x) && Number.isInteger(c.y) && Number.isInteger(c.w) && Number.isInteger(c.h)).toBe(true)
      expect(c.w).toBeGreaterThan(0)
      expect(c.h).toBeGreaterThan(0)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(dx)
      expect(c.y + c.h).toBeLessThanOrEqual(dy)
      area += c.w * c.h
    }
    // inteiros: soma exata
    expect(area).toBe(dx * dy)
    for (let i = 0; i < l.celulas.length; i++) {
      for (let j = i + 1; j < l.celulas.length; j++) {
        const a = l.celulas[i]
        const b = l.celulas[j]
        const sobrepoe = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(sobrepoe, `${id}: células ${i} e ${j} se sobrepõem`).toBe(false)
      }
    }
    // em frações, a soma também fecha em 1 ± 1e-9
    const fr = fracoesDoLayout(l)
    const soma = fr.reduce((s, c) => s + c.w * c.h, 0)
    expect(Math.abs(soma - 1)).toBeLessThanOrEqual(1e-9)
  })

  it('2-1-2 é 2 em cima, 1 larga, 2 embaixo, em linhas de 1/3', () => {
    const l = layoutDoCatalogo('2-1-2', 1)!
    expect(l.divisoes).toEqual({ x: 2, y: 3 })
    expect(l.celulas).toEqual([
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 1, y: 0, w: 1, h: 1 },
      { x: 0, y: 1, w: 2, h: 1 },
      { x: 0, y: 2, w: 1, h: 1 },
      { x: 1, y: 2, w: 1, h: 1 },
    ])
  })

  it('layout ou versão desconhecidos não existem', () => {
    expect(layoutDoCatalogo('mosaico', 1)).toBeUndefined()
    expect(layoutDoCatalogo('2x2', 2)).toBeUndefined()
    expect(layoutDoCatalogo('2x2', 0)).toBeUndefined()
  })
})
