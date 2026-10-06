/** Opt-in exclusivo para a fixture descartável por socket local; não usa DATABASE_URL. */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { base, barreira, IndiceFalso } from './fixtures/base-falsa'
const control = vi.hoisted(() => ({ beforeWrite: undefined as undefined | (() => Promise<void>) }))
vi.mock('@/lib/db', async () => {
  const { PrismaClient } = await import('../../../../prisma/generated/client')
  const client = new PrismaClient({ datasourceUrl: 'postgresql://marca_fixture@localhost:55439/postgres?host=/tmp/studio-marca-base-cache-pg-socket&schema=marca_fixture' })
  return { db: client.$extends({ query: { knowledgeBaseEntry: { async updateMany({ args, query }) { await control.beforeWrite?.(); return query(args) } } } }) }
})
vi.mock('@upstash/vector', async () => ({ Index: (await import('./fixtures/base-falsa')).IndiceFalso }))
vi.mock('../embeddings', () => ({ generateEmbeddings: vi.fn(async (texts: string[]) => texts.map(() => [1])) }))
vi.mock('../cache', () => ({ invalidateProjectCacheWithReceipt: vi.fn(async (projectId: number) => ({ projectId, status: 'confirmed', version: 1, deletedCount: 0 })) }))
import { db } from '@/lib/db'
import { arquivarEntradaBase, hashDoConteudo, lerEntradaParaArquivamento } from '../archive'
import { adquirirArrendamento, editarEntradaCoordenada } from '../arrendamento'
import { indexEntry, updateEntry, deleteEntry } from '../indexer'
import { generateEmbeddings } from '../embeddings'
import { CICLO_DE_INDEXACAO, EXPIRACAO_DO_CICLO, LIMPEZA_ARQUIVAMENTO_PENDENTE } from '../marca-de-indexado'
const tenant = { projectId: 6, userId: 'u' }
const content = 'Conteúdo da fixture local de PostgreSQL para provar concorrência.'
describe.skipIf(process.env.MARCA_LOCAL_PG_TEST !== '1')('PostgreSQL descartável: serviços reais com Vector/Redis/embeddings doubles', () => {
  beforeEach(async () => {
    vi.restoreAllMocks(); base.reset(); control.beforeWrite = undefined
    vi.stubEnv('UPSTASH_VECTOR_REST_URL', 'https://fake.upstash.io'); vi.stubEnv('UPSTASH_VECTOR_REST_TOKEN', 'fake')
    await db.knowledgeBaseEntry.deleteMany({})
  })
  afterAll(async () => { await db.$disconnect(); vi.unstubAllEnvs() })
  async function seed() {
    return db.knowledgeBaseEntry.create({ data: { id: 'e', projectId: 6, content, title: 'Fixture', category: 'ESTABELECIMENTO_INFO', status: 'ACTIVE', tags: [], createdBy: 'u', userId: 'u', metadata: { origem: 'fixture', chaveDoFato: 'f' } } })
  }
  const args = (e: { id: string; updatedAt: Date; content: string }) => ({ entryId: e.id, projectId: 6, autor: 'u', updatedAt: e.updatedAt, contentHash: hashDoConteudo(e.content) })
  it('dois CAS simultâneos: arquivo e indexador não adquirem a mesma versão', async () => {
    const e = await seed()
    const stop = barreira(); let writes = 0
    control.beforeWrite = async () => {
      if (++writes <= 2) { if (writes === 2) stop.liberar(); await stop.parar() }
    }
    const results = await Promise.allSettled([arquivarEntradaBase(args(e)), adquirirArrendamento(e.id, 'indexador')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const current = await db.knowledgeBaseEntry.findUniqueOrThrow({ where: { id: e.id } })
    expect(current.content).toBe(content)
    if (current.status === 'ACTIVE') expect((current.metadata as Record<string, unknown>)[CICLO_DE_INDEXACAO]).toBe('indexador')
    else expect(current.status).toBe('ARCHIVED')
  })
  it('edição concorrente persistida invalida a versão aprovada; entrada/chunks históricos sobrevivem', async () => {
    const e = await seed()
    await db.knowledgeChunk.create({ data: { id: 'c', entryId: e.id, ordinal: 0, content, vectorId: 'e:0' } })
    await editarEntradaCoordenada(e.id, { content: 'Correção histórica' })
    await expect(arquivarEntradaBase(args(e))).rejects.toMatchObject({ code: 'CONFLITO_ARQUIVAMENTO' })
    const current = await db.knowledgeBaseEntry.findUniqueOrThrow({ where: { id: e.id } })
    const r = await arquivarEntradaBase(args(current))
    expect(r.status).toBe('complete'); expect(await db.knowledgeChunk.count({ where: { entryId: e.id } })).toBe(1)
    const read = await lerEntradaParaArquivamento(e.id, 6); expect(read.status).toBe('ARCHIVED')
    await expect(lerEntradaParaArquivamento(e.id, 7)).rejects.toMatchObject({ code: 'ENTRADA_NAO_ENCONTRADA' })
    expect((await updateEntry(e.id, { title: 'Histórico' }, tenant)).entry?.status).toBe('ARCHIVED')
  })
  it('criação aguardando embeddings perde lease real e não publica depois de arquivo complete', async () => {
    const stop = barreira()
    vi.mocked(generateEmbeddings).mockImplementationOnce(async texts => { await stop.parar(); return texts.map(() => [1]) })
    const work = indexEntry({ title: 'Fixture', content, category: 'ESTABELECIMENTO_INFO', createdBy: 'u', tenant })
    const rejected = expect(work).rejects.toMatchObject({ code: 'INDEXACAO_PERDIDA' })
    await stop.chegou
    let entry = await db.knowledgeBaseEntry.findFirstOrThrow({ where: { projectId: 6 } })
    // Simula somente passagem do prazo na fixture, sem esperar cinco minutos.
    const metadata = { ...(entry.metadata as Record<string, unknown>), [EXPIRACAO_DO_CICLO]: new Date(Date.now() - 1000).toISOString() }
    entry = await db.knowledgeBaseEntry.update({ where: { id: entry.id }, data: { metadata } })
    expect((await arquivarEntradaBase(args(entry))).status).toBe('complete')
    stop.liberar(); await rejected
    expect((await db.knowledgeBaseEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('ARCHIVED')
    expect(await db.knowledgeChunk.count({ where: { entryId: entry.id } })).toBe(0); expect(base.vetores.size).toBe(0)
  })
  it('pendência durável é selecionada em JSONB após falha e só sai quando retomada conclui', async () => {
    const e = await seed()
    await db.knowledgeChunk.create({ data: { id: 'c', entryId: e.id, ordinal: 0, content, vectorId: 'e:0' } })
    base.vetores.set('e:0', { id: 'e:0', vector: [1], metadata: { entryId: 'e', projectId: 6 } })
    base.aoConsultar = async () => { throw new Error('Vector caiu') }
    expect((await arquivarEntradaBase(args(e))).cleanupPending).toBe(true)
    const pending = await db.knowledgeBaseEntry.findMany({ where: { OR: [
      { status: 'ACTIVE', expiresAt: { lte: new Date() } },
      { status: 'ARCHIVED', metadata: { path: [LIMPEZA_ARQUIVAMENTO_PENDENTE], equals: true } },
    ] } })
    expect(pending).toHaveLength(1); expect(pending[0].status).toBe('ARCHIVED')
    await editarEntradaCoordenada(e.id, { metadata: null })
    const current = await db.knowledgeBaseEntry.findUniqueOrThrow({ where: { id: e.id } })
    expect((current.metadata as Record<string, unknown>)[LIMPEZA_ARQUIVAMENTO_PENDENTE]).toBe(true)
    base.aoConsultar = undefined
    expect(await arquivarEntradaBase(args(current))).toMatchObject({ status: 'complete', cleanupPending: false })
    expect(await db.knowledgeBaseEntry.count({ where: { status: 'ARCHIVED', metadata: { path: [LIMPEZA_ARQUIVAMENTO_PENDENTE], equals: true } } })).toBe(0)
    expect(await db.knowledgeChunk.count({ where: { entryId: e.id } })).toBe(1)
  })
  it('DELETE parcial real preserva edição humana e reindexa o estado atual', async () => {
    await seed()
    base.vetores.set('e:0', { id: 'e:0', vector: [1], metadata: { entryId: 'e', projectId: 6 } })
    const original = IndiceFalso.prototype.delete
    vi.spyOn(IndiceFalso.prototype, 'delete').mockImplementationOnce(async function(ids) {
      await updateEntry('e', { title: 'Edição humana preservada' }, tenant)
      return original.call(this, ids)
    })
    expect(await deleteEntry('e', tenant)).toMatchObject({ status: 'partial', database: 'preserved', recovery: { status: 'reindexed' } })
    expect((await db.knowledgeBaseEntry.findUniqueOrThrow({ where: { id: 'e' } })).title).toBe('Edição humana preservada')
    expect(await db.knowledgeChunk.count({ where: { entryId: 'e' } })).toBeGreaterThan(0); expect(base.vetores.size).toBe(1)
  })

})
