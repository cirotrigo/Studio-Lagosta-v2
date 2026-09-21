import { beforeEach, describe, expect, it, vi } from 'vitest'
import { base, dbFalso } from './fixtures/base-falsa'

vi.mock('@/lib/db', async () => ({ db: (await import('./fixtures/base-falsa')).dbFalso }))
vi.mock('@upstash/vector', async () => ({ Index: (await import('./fixtures/base-falsa')).IndiceFalso }))
vi.mock('../embeddings', () => ({ generateEmbeddings: vi.fn() }))

import { generateEmbeddings } from '../embeddings'
import { reindexEntry } from '../indexer'
import { EXPIRACAO_DO_CICLO } from '../marca-de-indexado'

const META = { origem: 'migracao-da-voz', chaveDoFato: 'chave-1', versaoDaPrevia: 'v1', indexadoEm: '2026-09-12T10:00:00.000Z' }
const SEM_MARCA = { origem: 'migracao-da-voz', chaveDoFato: 'chave-1', versaoDaPrevia: 'v1' }
const CONTEUDO = 'Aniversário só com bolo próprio, e a casa oferece o brinde à escolha do aniversariante.'
const tenant = { projectId: 6, userId: 'u' }
const embeddings = vi.mocked(generateEmbeddings)

describe('reindexEntry — a marca de indexado é INVALIDADA ao adquirir e REPOSTA só depois dos vetores, com a entrada ARRENDADA (PR13-36, PR13-39, PR13-41)', () => {
  beforeEach(() => {
    base.reset()
    vi.clearAllMocks()
    process.env.UPSTASH_VECTOR_REST_URL = 'https://x.upstash.io'
    process.env.UPSTASH_VECTOR_REST_TOKEN = 't'
    embeddings.mockImplementation(async (textos: string[]) => textos.map(() => [0.1, 0.2]))
  })

  it('embeddings fora do ar DEPOIS das exclusões: a marca já caiu (chave do fato preservada, ciclo carimbado), não volta, e o arrendamento é liberado', async () => {
    base.semear({ id: 'e1', content: CONTEUDO, metadata: META })
    embeddings.mockRejectedValue(new Error('embeddings fora do ar'))
    await expect(reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })).rejects.toThrow(/embeddings fora do ar/)
    expect(base.meta('e1')).toEqual({ ...SEM_MARCA, cicloDeIndexacao: 'ciclo-A' })
    expect(dbFalso.knowledgeBaseEntry.updateMany.mock.invocationCallOrder[0]).toBeLessThan(dbFalso.knowledgeChunk.deleteMany.mock.invocationCallOrder[0])
    expect(base.chunks).toHaveLength(0)
    expect(base.vetores.size).toBe(0)
  })

  it('reindexação completa: a marca volta com instante NOVO, sobre o metadata como está (edição alheia no meio preservada), só depois de subir os vetores', async () => {
    base.semear({ id: 'e1', content: CONTEUDO, metadata: META })
    embeddings.mockImplementation(async (textos: string[]) => {
      // outra escrita na linha enquanto os embeddings esperam: avança o updatedAt e mexe no metadata
      await dbFalso.knowledgeBaseEntry.update({ where: { id: 'e1' }, data: { metadata: { ...base.meta('e1'), editadoNoMeio: true } } })
      return textos.map(() => [0.1, 0.2])
    })
    let marcaAoSubir: unknown = 'não subiu'
    base.aoSubir = async () => { marcaAoSubir = base.meta('e1').indexadoEm }
    const antes = Date.now()
    const r = await reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })
    expect(r.ciclo).toBe('ciclo-A')
    expect(marcaAoSubir).toBeUndefined()
    const final = base.meta('e1')
    expect(final.chaveDoFato).toBe('chave-1')
    expect(final.editadoNoMeio).toBe(true)
    expect(final.cicloDeIndexacao).toBe('ciclo-A')
    expect(final[EXPIRACAO_DO_CICLO]).toBeUndefined()
    expect(new Date(final.indexadoEm as string).getTime()).toBeGreaterThanOrEqual(antes)
    expect(final.indexadoEm).not.toBe(META.indexadoEm)
    expect(base.chunks.filter((c) => c.entryId === 'e1')).toHaveLength(r.chunks.length)
    expect(base.vetores.get('e1:0')?.vector).toEqual([0.1, 0.2])
  })

  it('PR13-39/41: outra indexação tomou a entrada no meio — a renovação falha antes de gravar chunks: nada é escrito, a marca NÃO volta e o token da outra fica', async () => {
    base.semear({ id: 'e1', content: CONTEUDO, metadata: META })
    embeddings.mockImplementation(async (textos: string[]) => {
      const m = base.meta('e1')
      await dbFalso.knowledgeBaseEntry.update({ where: { id: 'e1' }, data: { metadata: { ...m, cicloDeIndexacao: 'ciclo-B-da-api', [EXPIRACAO_DO_CICLO]: new Date(Date.now() + 60_000).toISOString() } } })
      return textos.map(() => [0.1, 0.2])
    })
    await expect(reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })).rejects.toMatchObject({ code: 'INDEXACAO_PERDIDA', message: expect.stringMatching(/outra indexação assumiu a entrada e1 antes de "gravar chunks"/) })
    expect(dbFalso.knowledgeChunk.create).not.toHaveBeenCalled()
    expect(base.chamadas.upsert).toBe(0)
    expect(base.meta('e1').cicloDeIndexacao).toBe('ciclo-B-da-api')
    expect(base.meta('e1').indexadoEm).toBeUndefined()
    expect(base.meta('e1')[EXPIRACAO_DO_CICLO]).toBeDefined()
  })

  it('entrada SEM a marca (criação normal, retomada de linha incompleta): recebe o ciclo, não ganha marca aqui, e o arrendamento termina liberado', async () => {
    base.semear({ id: 'e1', content: CONTEUDO, metadata: SEM_MARCA })
    const r = await reindexEntry('e1', tenant)
    expect(typeof r.ciclo).toBe('string')
    expect(base.meta('e1')).toEqual({ ...SEM_MARCA, cicloDeIndexacao: r.ciclo })
  })

  it('posse perdida enquanto os vetores subiam: a marca NÃO é reposta (PR13-23) e o arrendamento NÃO é liberado — a chamada estava em voo', async () => {
    base.semear({ id: 'e1', content: CONTEUDO, metadata: META })
    const ac = new AbortController()
    base.aoSubir = async () => { ac.abort() }
    await expect(reindexEntry('e1', tenant, { signal: ac.signal })).rejects.toThrow(/repor a marca de indexado/)
    expect(base.meta('e1').indexadoEm).toBeUndefined()
    expect(base.meta('e1')[EXPIRACAO_DO_CICLO]).toBeDefined()
  })

  it('a exclusão dos chunks é condicionada ao token no próprio delete', async () => {
    base.semear({ id: 'e1', content: CONTEUDO, metadata: SEM_MARCA })
    await reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })
    expect(dbFalso.knowledgeChunk.deleteMany.mock.calls[0][0].where).toEqual({ entryId: 'e1', entry: { metadata: { path: ['cicloDeIndexacao'], equals: 'ciclo-A' } } })
  })
})
