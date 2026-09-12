import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const del = vi.fn()
vi.mock('@upstash/vector', () => ({ Index: class { query = query; delete = del; upsert = vi.fn() } }))

describe('deleteVectorsByEntry — o aborto é conferido ENTRE a consulta e o delete (PR13-22)', () => {
  beforeEach(() => {
    query.mockReset(); del.mockReset()
    process.env.UPSTASH_VECTOR_REST_URL = 'https://x.upstash.io'
    process.env.UPSTASH_VECTOR_REST_TOKEN = 't'
  })
  it('sinal disparado enquanto a consulta esperava: nenhum delete começa e o erro diz a etapa', async () => {
    const { deleteVectorsByEntry } = await import('../vector-client')
    const c = new AbortController()
    query.mockImplementation(async () => { c.abort(new Error('a trava por projeto se perdeu')); return [{ id: 'e:0' }, { id: 'e:1' }] })
    await expect(deleteVectorsByEntry('e', { projectId: 6, userId: 'u' }, { signal: c.signal })).rejects.toThrow(/abortada antes de "apagar vetores": a trava por projeto se perdeu/)
    expect(del).not.toHaveBeenCalled()
  })
  it('sem sinal (ou vivo) apaga como sempre e devolve a contagem', async () => {
    const { deleteVectorsByEntry } = await import('../vector-client')
    query.mockResolvedValue([{ id: 'e:0' }])
    await expect(deleteVectorsByEntry('e', { projectId: 6, userId: 'u' })).resolves.toBe(1)
    expect(del).toHaveBeenCalledWith(['e:0'])
  })
})

describe('deleteVectorsByEntry — a renovação do arrendamento roda ENTRE a consulta e o delete (PR13-41)', () => {
  beforeEach(() => {
    query.mockReset(); del.mockReset()
    process.env.UPSTASH_VECTOR_REST_URL = 'https://x.upstash.io'
    process.env.UPSTASH_VECTOR_REST_TOKEN = 't'
  })
  it('renovação que falha (outra execução tomou a entrada): o delete não começa', async () => {
    const { deleteVectorsByEntry } = await import('../vector-client')
    query.mockResolvedValue([{ id: 'e:0' }])
    const ordem: string[] = []
    const antesDeApagar = vi.fn(async () => { ordem.push('renovar'); throw new Error('outra indexação assumiu a entrada e') })
    await expect(deleteVectorsByEntry('e', { projectId: 6, userId: 'u' }, { antesDeApagar })).rejects.toThrow(/outra indexação assumiu/)
    expect(query).toHaveBeenCalledTimes(1)
    expect(antesDeApagar).toHaveBeenCalledTimes(1)
    expect(del).not.toHaveBeenCalled()
  })
  it('renovação ok: apaga depois dela', async () => {
    const { deleteVectorsByEntry } = await import('../vector-client')
    query.mockResolvedValue([{ id: 'e:0' }])
    const antesDeApagar = vi.fn(async () => undefined)
    await expect(deleteVectorsByEntry('e', { projectId: 6, userId: 'u' }, { antesDeApagar, signal: new AbortController().signal })).resolves.toBe(1)
    expect(antesDeApagar.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0])
  })
})
