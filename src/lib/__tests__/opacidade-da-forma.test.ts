import { describe, expect, it } from 'vitest'
import { canonicalizeShapeStyleForPersistence, estiloComOpacidadeDaForma, opacidadeDaForma } from '../shape-style'

/** CP-V4: a opacidade da forma que o painel e a toolbar leem e gravam (alfa embutido nas cores). */
describe('opacidade da forma', () => {
  it('lê o alfa das cores, não o style.opacity que a canonização zera', () => {
    const salvo = canonicalizeShapeStyleForPersistence({ fill: '#ff0000', strokeColor: '#00ff00', opacity: 0.4 })!
    expect(salvo.opacity).toBe(1)
    expect(opacidadeDaForma(salvo)).toBeCloseTo(0.4)
  })

  it('usa o maior alfa entre os canais presentes e cai no style.opacity sem cor', () => {
    expect(opacidadeDaForma({ fill: 'rgba(0, 0, 0, 0)', strokeColor: 'rgba(0, 0, 0, 0.7)', strokeWidth: 2 })).toBeCloseTo(0.7)
    expect(opacidadeDaForma({ fill: 'rgba(0, 0, 0, 0.3)' })).toBeCloseTo(0.3)
    expect(opacidadeDaForma({ opacity: 0.5 })).toBe(0.5)
    expect(opacidadeDaForma(undefined)).toBe(1)
  })

  it('grava o alfa ABSOLUTO nos dois canais: repetir o mesmo valor é idempotente, sem multiplicar', () => {
    const base = { fill: 'rgba(255, 0, 0, 0.5)', strokeColor: '#00ff00', fillOpacity: 1, strokeOpacity: 1, opacity: 1 }
    const uma = canonicalizeShapeStyleForPersistence({ ...base, ...estiloComOpacidadeDaForma(base, 0.6) })!
    const duas = canonicalizeShapeStyleForPersistence({ ...uma, ...estiloComOpacidadeDaForma(uma, 0.6) })!
    expect(uma.fill).toBe('rgba(255, 0, 0, 0.6)')
    expect(uma.strokeColor).toBe('rgba(0, 255, 0, 0.6)')
    expect(duas).toEqual(uma)
    expect(opacidadeDaForma(duas)).toBeCloseTo(0.6)
  })

  // Revisão Codex rodada 1 (P2): o `transparent` literal dos itens de contorno contava como 100%
  it('preenchimento transparent é alfa 0: moldura com contorno 40% mostra 40%; aplicar e repetir 70% mostra 70%, também ao reabrir', () => {
    const moldura = { shapeType: 'rectangle' as const, fill: 'transparent', strokeColor: 'rgba(11, 11, 11, 0.4)', strokeWidth: 2 }
    expect(opacidadeDaForma(moldura)).toBeCloseTo(0.4)
    expect(opacidadeDaForma({ ...moldura, fill: 'TRANSPARENT' })).toBeCloseTo(0.4)
    const uma = canonicalizeShapeStyleForPersistence({ ...moldura, ...estiloComOpacidadeDaForma(moldura, 0.7) })!
    expect(uma.fill).toBe('transparent')
    expect(uma.strokeColor).toBe('rgba(11, 11, 11, 0.7)')
    expect(opacidadeDaForma(uma)).toBeCloseTo(0.7)
    const duas = canonicalizeShapeStyleForPersistence({ ...uma, ...estiloComOpacidadeDaForma(uma, 0.7) })!
    expect(duas).toEqual(uma)
    // reabrir: o que o autosave grava e o carregamento devolve
    const reaberta = canonicalizeShapeStyleForPersistence(JSON.parse(JSON.stringify(duas)))
    expect(opacidadeDaForma(reaberta)).toBeCloseTo(0.7)
  })

  it('contorno sem espessura não tem tinta: não puxa a leitura para o alfa dele', () => {
    expect(opacidadeDaForma({ fill: 'rgba(37, 99, 235, 0.5)', strokeColor: 'rgba(11, 11, 11, 1)', strokeWidth: 0 })).toBeCloseTo(0.5)
    expect(opacidadeDaForma({ fill: 'rgba(37, 99, 235, 0.5)', strokeColor: 'rgba(11, 11, 11, 1)' })).toBeCloseTo(0.5)
    expect(opacidadeDaForma({ fill: 'transparent', strokeColor: '#000000', strokeWidth: 0 })).toBe(0)
  })

  it('sem contorno, não inventa um', () => {
    const r = estiloComOpacidadeDaForma({ fill: '#000000' }, 0.2)
    expect(r.strokeColor).toBeUndefined()
    expect(r.fill).toBe('rgba(0, 0, 0, 0.2)')
  })
})
