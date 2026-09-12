import { beforeEach, describe, expect, it, vi } from 'vitest'

const dubles = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  create: vi.fn(),
  generateEmbeddings: vi.fn(),
  upsertVectors: vi.fn(),
  deleteVectorsByEntry: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { knowledgeBaseEntry: { findUnique: dubles.findUnique, update: dubles.update, updateMany: dubles.updateMany }, knowledgeChunk: { deleteMany: dubles.deleteMany, create: dubles.create } } }))
vi.mock('../embeddings', () => ({ generateEmbeddings: dubles.generateEmbeddings }))
vi.mock('../vector-client', () => ({ upsertVectors: dubles.upsertVectors, deleteVectorsByEntry: dubles.deleteVectorsByEntry }))

const META = { origem: 'migracao-da-voz', chaveDoFato: 'chave-1', versaoDaPrevia: 'v1', indexadoEm: '2026-09-12T10:00:00.000Z' }
const SEM_MARCA = { origem: 'migracao-da-voz', chaveDoFato: 'chave-1', versaoDaPrevia: 'v1' }
const ENTRADA = { id: 'e1', projectId: 6, content: 'Aniversário só com bolo próprio, e a casa oferece o brinde à escolha do aniversariante.', category: 'ESTABELECIMENTO_INFO', status: 'ACTIVE', metadata: META, chunks: [] }
const tenant = { projectId: 6, userId: 'u' }

describe('reindexEntry — a marca de indexado é INVALIDADA antes das exclusões e REPOSTA só depois dos vetores, por compare-and-set no CICLO (PR13-36, PR13-39)', () => {
  beforeEach(() => {
    for (const d of Object.values(dubles)) d.mockReset()
    dubles.deleteMany.mockResolvedValue({ count: 1 })
    dubles.deleteVectorsByEntry.mockResolvedValue(1)
    dubles.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: `c${data.ordinal}` }))
    dubles.upsertVectors.mockResolvedValue(undefined)
    dubles.update.mockResolvedValue({})
    dubles.updateMany.mockResolvedValue({ count: 1 })
  })

  it('embeddings fora do ar DEPOIS das exclusões: a marca já foi invalidada (chave do fato preservada, ciclo carimbado) e não volta — a linha fica incompleta', async () => {
    dubles.findUnique.mockResolvedValueOnce(ENTRADA)
    dubles.generateEmbeddings.mockRejectedValue(new Error('embeddings fora do ar'))
    const { reindexEntry } = await import('../indexer')
    await expect(reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })).rejects.toThrow(/embeddings fora do ar/)
    expect(dubles.update).toHaveBeenCalledTimes(1)
    expect(dubles.update.mock.calls[0][0].data.metadata).toEqual({ ...SEM_MARCA, cicloDeIndexacao: 'ciclo-A' })
    expect(dubles.update.mock.invocationCallOrder[0]).toBeLessThan(dubles.deleteMany.mock.invocationCallOrder[0])
    expect(dubles.updateMany).not.toHaveBeenCalled()
  })

  it('reindexação completa: a marca é reposta com instante NOVO, sobre o metadata como está, depois de subir os vetores — e SÓ onde o ciclo ainda é este', async () => {
    dubles.findUnique.mockResolvedValueOnce(ENTRADA).mockResolvedValueOnce({ metadata: { ...SEM_MARCA, cicloDeIndexacao: 'ciclo-A', editadoNoMeio: true } })
    dubles.generateEmbeddings.mockResolvedValue([[0.1, 0.2]])
    const { reindexEntry } = await import('../indexer')
    const antes = Date.now()
    const r = await reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })
    expect(r.ciclo).toBe('ciclo-A')
    expect(dubles.update).toHaveBeenCalledTimes(1)
    expect(dubles.updateMany).toHaveBeenCalledTimes(1)
    const cas = dubles.updateMany.mock.calls[0][0]
    expect(cas.where).toEqual({ id: 'e1', metadata: { path: ['cicloDeIndexacao'], equals: 'ciclo-A' } })
    const reposto = cas.data.metadata
    expect(reposto.chaveDoFato).toBe('chave-1')
    expect(reposto.editadoNoMeio).toBe(true)
    expect(reposto.cicloDeIndexacao).toBe('ciclo-A')
    expect(typeof reposto.indexadoEm).toBe('string')
    expect(new Date(reposto.indexadoEm).getTime()).toBeGreaterThanOrEqual(antes)
    expect(reposto.indexadoEm).not.toBe(META.indexadoEm)
    expect(dubles.updateMany.mock.invocationCallOrder[0]).toBeGreaterThan(dubles.upsertVectors.mock.invocationCallOrder[0])
  })

  it('PR13-39: outra indexação assumiu a entrada no meio (o ciclo mudou) — o compare-and-set não casa, a marca NÃO é reposta e o erro diz por quê', async () => {
    dubles.findUnique.mockResolvedValueOnce(ENTRADA).mockResolvedValueOnce({ metadata: { ...SEM_MARCA, cicloDeIndexacao: 'ciclo-B-da-api' } })
    dubles.generateEmbeddings.mockResolvedValue([[0.1, 0.2]])
    dubles.updateMany.mockResolvedValue({ count: 0 })
    const { reindexEntry } = await import('../indexer')
    await expect(reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })).rejects.toThrow(/outra indexação assumiu a entrada e1/)
    expect(dubles.updateMany).toHaveBeenCalledTimes(1)
    expect(dubles.updateMany.mock.calls[0][0].where.metadata).toEqual({ path: ['cicloDeIndexacao'], equals: 'ciclo-A' })
    // a marca antiga já tinha saído no começo; nada a repôs
    expect(dubles.update).toHaveBeenCalledTimes(1)
  })

  it('entrada SEM a marca (criação normal, retomada de linha incompleta) recebe o ciclo mas não ganha marca aqui: quem a grava é quem fecha a indexação', async () => {
    dubles.findUnique.mockResolvedValueOnce({ ...ENTRADA, metadata: SEM_MARCA })
    dubles.generateEmbeddings.mockResolvedValue([[0.1, 0.2]])
    const { reindexEntry } = await import('../indexer')
    const r = await reindexEntry('e1', tenant)
    expect(typeof r.ciclo).toBe('string')
    expect(dubles.update).toHaveBeenCalledTimes(1)
    expect(dubles.update.mock.calls[0][0].data.metadata).toEqual({ ...SEM_MARCA, cicloDeIndexacao: r.ciclo })
    expect(dubles.updateMany).not.toHaveBeenCalled()
  })

  it('posse perdida enquanto os vetores subiam: a marca NÃO é reposta e o erro diz a etapa (PR13-23)', async () => {
    dubles.findUnique.mockResolvedValueOnce(ENTRADA)
    dubles.generateEmbeddings.mockResolvedValue([[0.1, 0.2]])
    const ac = new AbortController()
    dubles.upsertVectors.mockImplementation(async () => { ac.abort() })
    const { reindexEntry } = await import('../indexer')
    await expect(reindexEntry('e1', tenant, { signal: ac.signal })).rejects.toThrow(/repor a marca de indexado/)
    expect(dubles.updateMany).not.toHaveBeenCalled()
  })
})
