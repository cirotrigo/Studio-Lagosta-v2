import { describe, expect, it } from 'vitest'
import { excluirFotos } from '../excluir-fotos'

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
  it('data inválida não exclui nada (quem chama avisa)', () => {
    expect(excluirFotos(lista, { usadasDesde: '15/09/2026' }, usos).mantidas).toHaveLength(4)
  })
  it('id e uso juntos: cada foto conta uma vez', () => {
    const r = excluirFotos(lista, { ids: ['b'], usadasDesde: '2026-09-10' }, usos)
    expect(r.mantidas.map((m) => m.imagem.driveFileId)).toEqual(['a', 'c', 'd'])
    expect(r.resumo).toEqual({ porId: 1, porUso: 0, naoEncontrados: [] })
  })
})
