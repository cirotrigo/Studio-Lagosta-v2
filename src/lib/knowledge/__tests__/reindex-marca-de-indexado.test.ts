import { beforeEach, describe, expect, it, vi } from 'vitest'

const dubles = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  create: vi.fn(),
  generateEmbeddings: vi.fn(),
  upsertVectors: vi.fn(),
  deleteVectorsByEntry: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { knowledgeBaseEntry: { findUnique: dubles.findUnique, update: dubles.update }, knowledgeChunk: { deleteMany: dubles.deleteMany, create: dubles.create } } }))
vi.mock('../embeddings', () => ({ generateEmbeddings: dubles.generateEmbeddings }))
vi.mock('../vector-client', () => ({ upsertVectors: dubles.upsertVectors, deleteVectorsByEntry: dubles.deleteVectorsByEntry }))

const META = { origem: 'migracao-da-voz', chaveDoFato: 'chave-1', versaoDaPrevia: 'v1', indexadoEm: '2026-09-12T10:00:00.000Z' }
const ENTRADA = { id: 'e1', projectId: 6, content: 'Aniversário só com bolo próprio, e a casa oferece o brinde à escolha do aniversariante.', category: 'ESTABELECIMENTO_INFO', status: 'ACTIVE', metadata: META, chunks: [] }
const tenant = { projectId: 6, userId: 'u' }

describe('reindexEntry — a marca de indexado é INVALIDADA antes das exclusões e REPOSTA só depois dos vetores (PR13-36)', () => {
  beforeEach(() => {
    for (const d of Object.values(dubles)) d.mockReset()
    dubles.deleteMany.mockResolvedValue({ count: 1 })
    dubles.deleteVectorsByEntry.mockResolvedValue(1)
    dubles.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: `c${data.ordinal}` }))
    dubles.upsertVectors.mockResolvedValue(undefined)
    dubles.update.mockResolvedValue({})
  })

  it('embeddings fora do ar DEPOIS das exclusões: a marca já foi invalidada (chave do fato preservada) e não volta — a linha fica incompleta', async () => {
    dubles.findUnique.mockResolvedValue(ENTRADA)
    dubles.generateEmbeddings.mockRejectedValue(new Error('embeddings fora do ar'))
    const { reindexEntry } = await import('../indexer')
    await expect(reindexEntry('e1', tenant)).rejects.toThrow(/embeddings fora do ar/)
    expect(dubles.update).toHaveBeenCalledTimes(1)
    const gravado = dubles.update.mock.calls[0][0].data.metadata
    expect(gravado).toEqual({ origem: 'migracao-da-voz', chaveDoFato: 'chave-1', versaoDaPrevia: 'v1' })
    expect(gravado).not.toHaveProperty('indexadoEm')
    // a invalidação vem ANTES de apagar chunks e vetores
    expect(dubles.update.mock.invocationCallOrder[0]).toBeLessThan(dubles.deleteMany.mock.invocationCallOrder[0])
    expect(dubles.update.mock.invocationCallOrder[0]).toBeLessThan(dubles.deleteVectorsByEntry.mock.invocationCallOrder[0])
  })

  it('reindexação completa: a marca é reposta com instante NOVO, sobre o metadata como está, depois de subir os vetores', async () => {
    const semMarca = { origem: 'migracao-da-voz', chaveDoFato: 'chave-1', versaoDaPrevia: 'v1' }
    dubles.findUnique.mockResolvedValueOnce(ENTRADA).mockResolvedValueOnce({ metadata: { ...semMarca, editadoNoMeio: true } })
    dubles.generateEmbeddings.mockResolvedValue([[0.1, 0.2]])
    const { reindexEntry } = await import('../indexer')
    const antes = Date.now()
    await reindexEntry('e1', tenant)
    expect(dubles.update).toHaveBeenCalledTimes(2)
    expect(dubles.update.mock.calls[0][0].data.metadata).toEqual(semMarca)
    const reposto = dubles.update.mock.calls[1][0].data.metadata
    expect(reposto.chaveDoFato).toBe('chave-1')
    expect(reposto.editadoNoMeio).toBe(true)
    expect(typeof reposto.indexadoEm).toBe('string')
    expect(new Date(reposto.indexadoEm).getTime()).toBeGreaterThanOrEqual(antes)
    expect(reposto.indexadoEm).not.toBe(META.indexadoEm)
    expect(dubles.update.mock.invocationCallOrder[1]).toBeGreaterThan(dubles.upsertVectors.mock.invocationCallOrder[0])
  })

  it('entrada SEM a marca (criação normal, retomada de linha incompleta) não ganha marca aqui: quem a grava é quem fecha a indexação', async () => {
    dubles.findUnique.mockResolvedValue({ ...ENTRADA, metadata: { chaveDoFato: 'chave-1' } })
    dubles.generateEmbeddings.mockResolvedValue([[0.1, 0.2]])
    const { reindexEntry } = await import('../indexer')
    await reindexEntry('e1', tenant)
    expect(dubles.update).not.toHaveBeenCalled()
  })

  it('posse perdida enquanto os vetores subiam: a marca NÃO é reposta e o erro diz a etapa (PR13-23)', async () => {
    dubles.findUnique.mockResolvedValue(ENTRADA)
    dubles.generateEmbeddings.mockResolvedValue([[0.1, 0.2]])
    const c = new AbortController()
    dubles.upsertVectors.mockImplementation(async () => { c.abort(new Error('a trava por projeto se perdeu')) })
    const { reindexEntry } = await import('../indexer')
    await expect(reindexEntry('e1', tenant, { signal: c.signal })).rejects.toThrow(/abortada antes de "repor a marca de indexado"/)
    expect(dubles.update).toHaveBeenCalledTimes(1)
    expect(dubles.update.mock.calls[0][0].data.metadata).not.toHaveProperty('indexadoEm')
  })
})
