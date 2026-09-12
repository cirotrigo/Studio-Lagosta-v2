import { describe, expect, it } from 'vitest'
import { MARCA_DE_INDEXADO, comMarcaDeIndexado, semMarcaDeIndexado, temMarcaDeIndexado } from '../marca-de-indexado'

describe('marca de indexado — invalidar e repor preservando o resto do metadata (PR13-36)', () => {
  const meta = { origem: 'migracao-da-voz', chaveDoFato: 'abc', versaoDaPrevia: 'v1', [MARCA_DE_INDEXADO]: '2026-09-12T10:00:00.000Z' }
  it('tem a marca só com string não vazia; metadata que não é objeto plano nunca tem', () => {
    expect(temMarcaDeIndexado(meta)).toBe(true)
    expect(temMarcaDeIndexado({ ...meta, [MARCA_DE_INDEXADO]: '' })).toBe(false)
    expect(temMarcaDeIndexado({ chaveDoFato: 'abc' })).toBe(false)
    expect(temMarcaDeIndexado(null)).toBe(false)
    expect(temMarcaDeIndexado(['x'])).toBe(false)
    expect(temMarcaDeIndexado('indexadoEm')).toBe(false)
  })
  it('sem a marca: a chave do fato e o resto ficam; a marca some', () => {
    const r = semMarcaDeIndexado(meta)
    expect(r).toEqual({ origem: 'migracao-da-voz', chaveDoFato: 'abc', versaoDaPrevia: 'v1' })
    expect(temMarcaDeIndexado(r)).toBe(false)
    expect(semMarcaDeIndexado(null)).toEqual({})
  })
  it('com a marca: grava o instante dado e preserva o resto; sobre metadata vazio cria só a marca', () => {
    const em = new Date('2026-09-12T12:34:56.000Z')
    expect(comMarcaDeIndexado(semMarcaDeIndexado(meta), em)).toEqual({ origem: 'migracao-da-voz', chaveDoFato: 'abc', versaoDaPrevia: 'v1', [MARCA_DE_INDEXADO]: '2026-09-12T12:34:56.000Z' })
    expect(comMarcaDeIndexado(undefined, em)).toEqual({ [MARCA_DE_INDEXADO]: '2026-09-12T12:34:56.000Z' })
  })
})
