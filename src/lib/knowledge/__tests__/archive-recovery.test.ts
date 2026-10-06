import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { base, dbFalso, IndiceFalso } from './fixtures/base-falsa'
vi.mock('@/lib/db', async () => ({ db: (await import('./fixtures/base-falsa')).dbFalso }))
vi.mock('@upstash/vector', async () => ({ Index: (await import('./fixtures/base-falsa')).IndiceFalso }))
vi.mock('../embeddings', () => ({ generateEmbeddings: vi.fn(async (texts: string[]) => texts.map(() => [1])) }))
vi.mock('../cache', () => ({ invalidateProjectCache: vi.fn(async () => 0), invalidateProjectCacheWithReceipt: vi.fn(async (projectId: number) => ({ projectId, status: 'confirmed', version: 1, deletedCount: 0 })) }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'clerk_u', orgId: 'org' })) }))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: vi.fn(async () => ({ id: 'u', email: null })) }))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: { ESTABELECIMENTO_INFO: 'ESTABELECIMENTO_INFO', CAMPANHAS: 'CAMPANHAS' } }))
vi.mock('@/lib/aprendizado/captura', () => ({ expirarSugestoesPendentes: vi.fn(async () => 0) }))
import { GET as cron } from '@/app/api/cron/archive-expired-knowledge/route'
import { DELETE as remover } from '@/app/api/knowledge/[id]/route'
import { DELETE as removerAdmin } from '@/app/api/admin/knowledge/[id]/route'
import { deleteEntry, updateEntry } from '../indexer'
import { arquivarEntradaBase, hashDoConteudo } from '../archive'
import { arquivarComArrendamento, editarEntradaCoordenada } from '../arrendamento'
import { generateEmbeddings } from '../embeddings'
import { invalidateProjectCacheWithReceipt } from '../cache'
import { LIMPEZA_ARQUIVAMENTO_PENDENTE, EXPIRACAO_DO_CICLO, DURACAO_DO_ARRENDAMENTO_MS } from '../marca-de-indexado'
const tenant = { projectId: 6, userId: 'u' }
const content = 'Conteúdo preservado da fonte da marca para provas de retomada.'
const args = () => ({ entryId: 'e', projectId: 6, autor: 'u', updatedAt: new Date(base.linha('e').updatedAt), contentHash: hashDoConteudo(base.linha('e').content) })
const findMany = vi.fn(async ({ where }) => {
  expect(where.OR).toEqual([
    { status: 'ACTIVE', expiresAt: { lte: expect.any(Date) } },
    { status: 'ARCHIVED', metadata: { path: [LIMPEZA_ARQUIVAMENTO_PENDENTE], equals: true } },
  ])
  return [...base.entradas.values()].filter(e => (e.status === 'ACTIVE' && e.expiresAt && e.expiresAt <= new Date()) || (e.status === 'ARCHIVED' && base.meta(e.id)[LIMPEZA_ARQUIVAMENTO_PENDENTE] === true)).map(e => structuredClone(e))
})
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks(); base.reset()
  vi.stubEnv('UPSTASH_VECTOR_REST_URL', 'https://fake.upstash.io'); vi.stubEnv('UPSTASH_VECTOR_REST_TOKEN', 'fake'); vi.stubEnv('CRON_SECRET', 'fake-secret'); vi.stubEnv('ADMIN_USER_IDS', 'clerk_u')
  vi.mocked(generateEmbeddings).mockImplementation(async texts => texts.map(() => [1]))
  vi.mocked(invalidateProjectCacheWithReceipt).mockResolvedValue({ projectId: 6, status: 'confirmed', version: 1, deletedCount: 0 })
  Object.assign(dbFalso.knowledgeBaseEntry, { findMany })
  base.semear({ id: 'e', content, expiresAt: new Date(Date.now() - 1000), metadata: { origem: 'original', chaveDoFato: 'f' } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
const runCron = async () => (await cron(new Request('http://localhost/cron', { headers: { authorization: 'Bearer fake-secret' } }))).json()
it('cron falha após ARCHIVED; próximo run retoma marcador durável, confirma e deixa de selecionar', async () => {
  base.aoConsultar = async () => { throw new Error('Vector caiu') }
  const first = await runCron()
  expect(first).toMatchObject({ success: false, archived: 1 }); expect(first.partial).toHaveLength(1)
  expect(base.linha('e').status).toBe('ARCHIVED'); expect(base.meta('e')[LIMPEZA_ARQUIVAMENTO_PENDENTE]).toBe(true)
  // Simula restart: apenas dados duráveis no banco e índice sobrevivem; nenhum recibo é reutilizado.
  base.aoConsultar = undefined
  const second = await runCron()
  expect(second).toMatchObject({ success: true, archived: 1, partial: [] }); expect(base.vetores.size).toBe(0)
  expect(base.meta('e')[LIMPEZA_ARQUIVAMENTO_PENDENTE]).toBeUndefined(); expect(base.chunks).toHaveLength(1)
  const third = await runCron(); expect(third).toMatchObject({ success: true, archived: 0 })
})
it('queda imediatamente após CAS tem marcador: cron espera lease e retoma depois de vencer sem reativar', async () => {
  vi.useFakeTimers()
  await arquivarComArrendamento('e', 6, base.linha('e').updatedAt, 'u', 'processo-que-caiu')
  expect((await runCron()).success).toBe(false); expect(base.vetores.size).toBe(1)
  await vi.advanceTimersByTimeAsync(DURACAO_DO_ARRENDAMENTO_MS + 1)
  expect((await runCron()).success).toBe(true)
  expect(base.linha('e').status).toBe('ARCHIVED'); expect(base.vetores.size).toBe(0)
})
it('cache falho mantém pendência selecionável; retomada confirma sem reativar ou perder chunks', async () => {
  vi.mocked(invalidateProjectCacheWithReceipt).mockResolvedValueOnce({ projectId: 6, status: 'failed', deletedCount: 0 })
  expect((await runCron()).success).toBe(false); expect(base.meta('e')[LIMPEZA_ARQUIVAMENTO_PENDENTE]).toBe(true)
  expect((await runCron()).success).toBe(true); expect(base.chunks).toHaveLength(1)
})
it('edição de metadata do histórico não apaga nem permite forjar pendência durável', async () => {
  base.aoConsultar = async () => { throw new Error('Vector caiu') }; await arquivarEntradaBase(args())
  await editarEntradaCoordenada('e', { metadata: { nota: 'humana', [LIMPEZA_ARQUIVAMENTO_PENDENTE]: false } })
  expect(base.meta('e')).toMatchObject({ nota: 'humana', [LIMPEZA_ARQUIVAMENTO_PENDENTE]: true, chaveDoFato: 'f' })
  await editarEntradaCoordenada('e', { metadata: null }); expect(base.meta('e')[LIMPEZA_ARQUIVAMENTO_PENDENTE]).toBe(true)
  base.aoConsultar = undefined; expect((await runCron()).success).toBe(true)
})
it('reativação humana de pendência não é selecionada/rearquivada pelo cron', async () => {
  base.aoConsultar = async () => { throw new Error('Vector caiu') }; await arquivarEntradaBase(args()); base.aoConsultar = undefined
  await updateEntry('e', { status: 'ACTIVE' }, tenant); base.linha('e').expiresAt = new Date(Date.now() + 60000)
  expect((await runCron()).archived).toBe(0); expect(base.linha('e').status).toBe('ACTIVE')
})
it('drift entre snapshot/aquisição e drift durante query não emitem delete Vector', async () => {
  const original = dbFalso.knowledgeBaseEntry.findUnique.getMockImplementation()!
  let reads = 0
  dbFalso.knowledgeBaseEntry.findUnique.mockImplementationOnce(async input => { const r = await original(input); base.linha('e').title = 'antes do lease'; base.linha('e').updatedAt = new Date(Date.now()); return r })
  await expect(deleteEntry('e', tenant)).rejects.toMatchObject({ code: 'CONFLITO_EXCLUSAO', status: 409 })
  expect(base.chamadas.query).toBe(0); expect(base.vetores.size).toBe(1)
  base.aoConsultar = async () => { if (++reads === 1) await updateEntry('e', { title: 'durante query' }, tenant) }
  await expect(deleteEntry('e', tenant)).rejects.toMatchObject({ code: 'CONFLITO_EXCLUSAO', status: 409 })
  expect(base.chamadas.delete).toEqual([]); expect(base.vetores.size).toBe(1)
})
function editDuringDelete() {
  const original = IndiceFalso.prototype.delete
  vi.spyOn(IndiceFalso.prototype, 'delete').mockImplementationOnce(async function(ids) {
    await updateEntry('e', { title: 'Edição humana durante delete', tags: ['preservar'] }, tenant)
    return original.call(this, ids)
  })
}
it('conflito após delete devolve partial e reindexa estado humano atual sem apagar registro', async () => {
  editDuringDelete(); const r = await deleteEntry('e', tenant)
  expect(r).toMatchObject({ success: false, status: 'partial', code: 'CONFLITO_EXCLUSAO', database: 'preserved', vectors: { cleanup: 'uncertain' }, recovery: { status: 'reindexed' } })
  expect(base.linha('e')).toMatchObject({ status: 'ACTIVE', title: 'Edição humana durante delete', tags: ['preservar'], content })
  expect(base.chunks[0].content).toBe(content); expect(base.vetores.size).toBe(1)
})
for (const admin of [false, true]) {
  it(`API DELETE ${admin ? 'admin' : 'org'} dá 202 + recibo parcial após drift tardio e 409 antes do delete`, async () => {
    editDuringDelete()
    const route = admin ? removerAdmin : remover
    const req = new NextRequest('http://localhost/api/knowledge/e', { method: 'DELETE' })
    const r = await route(req, { params: Promise.resolve({ id: 'e' }) })
    expect(r.status).toBe(202); expect(await r.json()).toMatchObject({ success: false, exclusao: { status: 'partial', recovery: { status: 'reindexed' } } })
    base.aoConsultar = async () => { await updateEntry('e', { title: 'drift pré-delete' }, tenant) }
    const before = base.chamadas.delete.length
    const conflict = await route(req, { params: Promise.resolve({ id: 'e' }) })
    expect(conflict.status).toBe(409); expect((await conflict.json()).error).toBe('CONFLITO_EXCLUSAO'); expect(base.chamadas.delete.length).toBe(before)
  })
}
it('reindexação de recuperação falha: recibo pending preserva edição, sem 500 nem exclusão posterior', async () => {
  editDuringDelete(); vi.mocked(generateEmbeddings).mockRejectedValueOnce(new Error('embeddings caiu'))
  const r = await deleteEntry('e', tenant)
  expect(r).toMatchObject({ status: 'partial', database: 'preserved', recovery: { status: 'pending', issue: 'REINDEX_UNCONFIRMED' } })
  expect(base.linha('e').title).toBe('Edição humana durante delete'); expect(base.entradas.has('e')).toBe(true)
})
it('delete externo em voo que estoura prazo não inicia reindexação concorrente', async () => {
  vi.useFakeTimers(); vi.spyOn(IndiceFalso.prototype, 'delete').mockImplementationOnce(async () => new Promise(() => {}))
  const work = deleteEntry('e', tenant); await vi.advanceTimersByTimeAsync(60001)
  const r = await work
  expect(r).toMatchObject({ status: 'partial', vectors: { cleanup: 'uncertain' }, recovery: { status: 'pending', issue: 'OWNERSHIP_UNCONFIRMED' } })
  expect(generateEmbeddings).not.toHaveBeenCalled(); expect(base.meta('e')[EXPIRACAO_DO_CICLO]).toBeDefined()
})
it('drift depois de ausência confirmada também retorna parcial com reindexação atual', async () => {
  let queries = 0
  base.aoConsultar = async () => { if (++queries === 2) await updateEntry('e', { title: 'Edição após limpeza confirmada' }, tenant) }
  const r = await deleteEntry('e', tenant)
  expect(r).toMatchObject({ status: 'partial', code: 'CONFLITO_EXCLUSAO', database: 'preserved', vectors: { cleanup: 'confirmed' }, recovery: { status: 'reindexed' } })
  expect(base.linha('e').title).toBe('Edição após limpeza confirmada'); expect(base.vetores.size).toBe(1)
})
