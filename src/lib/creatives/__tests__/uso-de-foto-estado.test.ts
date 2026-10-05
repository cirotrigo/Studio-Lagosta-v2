import { beforeEach, describe, expect, it, vi } from 'vitest'

const groupBy = vi.fn()
vi.mock('@/lib/db', () => ({ db: { photoUsage: { groupBy: (...args: unknown[]) => groupBy(...args) } } }))

import { lerUsosDeFoto, lerUsosDeFotoComEstado } from '../uso-de-foto'

describe('lerUsosDeFotoComEstado — "ninguém usou" e "não consegui ler" são fatos diferentes (R24)', () => {
  beforeEach(() => groupBy.mockReset())

  it('consulta que dá certo sem linhas: ok = true e mapa vazio (ninguém usou)', async () => {
    groupBy.mockResolvedValueOnce([])
    const r = await lerUsosDeFotoComEstado(6)
    expect(r).toEqual({ usos: new Map(), ok: true, erro: null })
  })

  it('consulta que falha SÓ no groupBy: ok = false, o erro é dito e o mapa fica vazio — a busca continua de pé', async () => {
    groupBy.mockRejectedValueOnce(new Error('connection reset'))
    const r = await lerUsosDeFotoComEstado(6)
    expect(r.ok).toBe(false)
    expect(r.erro).toBe('connection reset')
    expect(r.usos.size).toBe(0)
    groupBy.mockRejectedValueOnce(new Error('again'))
    expect((await lerUsosDeFoto(6)).size).toBe(0)
  })

  it('consulta com linhas: último uso e vezes por foto', async () => {
    groupBy.mockResolvedValueOnce([{ driveFileId: 'a', _max: { usedAt: new Date('2026-09-10T12:00:00Z') }, _count: { _all: 2 } }, { driveFileId: 'b', _max: { usedAt: null }, _count: { _all: 0 } }])
    const r = await lerUsosDeFotoComEstado(6)
    expect(r.ok).toBe(true)
    expect(r.usos.get('a')).toEqual({ ultimoUso: '2026-09-10T12:00:00.000Z', vezes: 2 })
    expect(r.usos.has('b')).toBe(false)
  })
})
