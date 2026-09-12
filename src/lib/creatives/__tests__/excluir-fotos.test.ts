import { describe, expect, it } from 'vitest'
import { diaDoUso, excluirFotos, identidadeDaExclusao, normalizarExclusao } from '../excluir-fotos'

const lista = ['a', 'b', 'c', 'd'].map((id) => ({ imagem: { driveFileId: id }, score: 1 }))
const usos = new Map([
  ['b', '2026-09-15T10:00:00.000Z'],
  ['c', '2026-09-01T10:00:00.000Z'],
])

describe('a exclusão de fotos da lista ranqueada', () => {
  it('sem pedido, nada muda e nada é declarado', () => {
    const r = excluirFotos(lista, {}, usos)
    expect(r.pedida).toBe(false)
    expect(r.mantidas).toBe(lista)
  })
  it('por id: as escolhidas saem, na ordem que estavam; id que não está na lista é declarado', () => {
    const r = excluirFotos(lista, { ids: ['a', 'zz', ' d '] }, usos)
    expect(r.mantidas.map((m) => m.imagem.driveFileId)).toEqual(['b', 'c'])
    expect(r.resumo).toEqual({ porId: 2, porUso: 0, naoEncontrados: ['zz'] })
  })
  it('por uso: só a foto usada A PARTIR da data sai; sem uso registrado fica', () => {
    const r = excluirFotos(lista, { usadasDesde: '2026-09-10' }, usos)
    expect(r.mantidas.map((m) => m.imagem.driveFileId)).toEqual(['a', 'c', 'd'])
    expect(r.resumo.porUso).toBe(1)
    expect(excluirFotos(lista, { usadasDesde: '2026-09-15' }, usos).resumo.porUso).toBe(1)
    expect(excluirFotos(lista, { usadasDesde: '2026-09-16' }, usos).resumo.porUso).toBe(0)
  })
  it('dia que NÃO existe no calendário também não exclui (2026-02-31 passa no regex e o Date levaria para março)', () => {
    const r = excluirFotos(lista, { usadasDesde: '2026-02-31' }, usos)
    expect(r.mantidas).toHaveLength(lista.length)
    expect(r.pedida).toBe(false)
  })
  it('a exclusão normalizada (a que entra na chave da proposta): ids únicos em ordem, data só se existe', () => {
    expect(normalizarExclusao({ ids: [' b ', 'a', 'b', ''], usadasDesde: '2026-09-01' })).toEqual({ ids: ['a', 'b'], desde: '2026-09-01' })
    expect(normalizarExclusao({ ids: ['a', 'b'] })).toEqual(normalizarExclusao({ ids: ['b', 'a'] }))
    expect(normalizarExclusao({ usadasDesde: '2026-02-31' })).toEqual({ ids: [], desde: null })
    expect(normalizarExclusao({ usadasDesde: '01/09/2026' }).desde).toBeNull()
    expect(normalizarExclusao({})).toEqual({ ids: [], desde: null })
  })
  it('o corte de uso compara o DIA EM BRASÍLIA (R18): 02:30Z de segunda é domingo à noite aqui — não sai com "desde segunda"; 03:30Z já é segunda; data pura do legado fica', () => {
    expect(diaDoUso('2026-09-14T02:30:00.000Z')).toBe('2026-09-13')
    expect(diaDoUso('2026-09-14T03:30:00.000Z')).toBe('2026-09-14')
    expect(diaDoUso('2026-09-01')).toBe('2026-09-01')
    expect(diaDoUso(null)).toBeNull()
    const usosNaVirada = new Map([['a', '2026-09-14T02:30:00.000Z'], ['b', '2026-09-14T03:30:00.000Z']])
    const r = excluirFotos(lista, { usadasDesde: '2026-09-14' }, usosNaVirada)
    expect(r.mantidas.map((m) => m.imagem.driveFileId)).toEqual(['a', 'c', 'd'])
    expect(r.resumo.porUso).toBe(1)
  })
  it('a identidade da exclusão preserva a CAIXA dos ids (R17): "AbC" ≠ "abc"; ordem, duplicata e espaço externo não contam; sem exclusão é nula', () => {
    expect(identidadeDaExclusao({ ids: ['AbC'] })).not.toBe(identidadeDaExclusao({ ids: ['abc'] }))
    expect(identidadeDaExclusao({ ids: ['b', ' a ', 'a'] })).toBe(identidadeDaExclusao({ ids: ['a', 'b'] }))
    expect(identidadeDaExclusao({ ids: ['a'], usadasDesde: '2026-09-01' })).not.toBe(identidadeDaExclusao({ ids: ['a'] }))
    expect(identidadeDaExclusao({})).toBeNull()
    expect(identidadeDaExclusao({ ids: [], usadasDesde: '2026-02-31' })).toBeNull()
  })
  it('data inválida não exclui nada (quem chama avisa)', () => {
    expect(excluirFotos(lista, { usadasDesde: '15/09/2026' }, usos).mantidas).toHaveLength(4)
  })
  it('id e uso juntos: cada foto conta uma vez', () => {
    const r = excluirFotos(lista, { ids: ['b'], usadasDesde: '2026-09-10' }, usos)
    expect(r.mantidas.map((m) => m.imagem.driveFileId)).toEqual(['a', 'c', 'd'])
    expect(r.resumo).toEqual({ porId: 1, porUso: 0, naoEncontrados: [] })
  })
})
