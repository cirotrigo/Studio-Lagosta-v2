import { beforeEach, expect, it, vi } from 'vitest'
import { base, barreira, dbFalso } from './fixtures/base-falsa'
vi.mock('@/lib/db', async () => ({ db: (await import('./fixtures/base-falsa')).dbFalso }))
vi.mock('@upstash/vector', async () => ({ Index: (await import('./fixtures/base-falsa')).IndiceFalso }))
vi.mock('../embeddings', () => ({ generateEmbeddings: vi.fn(async (texts: string[]) => texts.map(() => [1])) }))
vi.mock('../cache', () => ({ invalidateProjectCache: vi.fn(async () => 0), invalidateProjectCacheWithReceipt: vi.fn(async (projectId: number) => ({ projectId, status: 'confirmed', version: 1, deletedCount: 0 })) }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'clerk_u', orgId: 'org' })) }))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: vi.fn(async () => ({ id: 'u' })) }))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: { ESTABELECIMENTO_INFO: 'ESTABELECIMENTO_INFO', CAMPANHAS: 'CAMPANHAS' } }))
vi.mock('@/lib/aprendizado/captura', () => ({ expirarSugestoesPendentes: vi.fn(async () => 0) }))
import { indexEntry, indexFile, updateEntry, deleteEntry } from '../indexer'
import { arquivarEntradaBase, hashDoConteudo } from '../archive'
import { generateEmbeddings } from '../embeddings'
import { adquirirArrendamento } from '../arrendamento'
import { DURACAO_DO_ARRENDAMENTO_MS, CICLO_DE_INDEXACAO } from '../marca-de-indexado'
import { toolsDeBaseEDna } from '@/lib/mcp/catalogo/base-e-dna'
import { POST as confirmar } from '@/app/api/knowledge/confirm/route'
import { GET as cron } from '@/app/api/cron/archive-expired-knowledge/route'
const tenant = { projectId: 6, userId: 'u' }
const content = 'Texto preservado da entrada da marca para provas locais de concorrência.'
const input = { title: 'Fonte', content, category: 'ESTABELECIMENTO_INFO' as never, createdBy: 'u', tenant }
const archiveArgs = (id: string) => ({ entryId: id, projectId: 6, autor: 'u', updatedAt: new Date(base.linha(id).updatedAt), contentHash: hashDoConteudo(base.linha(id).content) })
beforeEach(() => {
  vi.clearAllMocks(); base.reset()
  process.env.UPSTASH_VECTOR_REST_URL = 'https://fake.upstash.io'; process.env.UPSTASH_VECTOR_REST_TOKEN = 'fake'
  vi.mocked(generateEmbeddings).mockImplementation(async (texts: string[]) => texts.map(() => [1]))
})
for (const upload of [false, true]) {
  it(`criação ${upload ? 'indexFile' : 'indexEntry'} pausada impede arquivo enquanto lease vale`, async () => {
    const stop = barreira(); vi.mocked(generateEmbeddings).mockImplementationOnce(async texts => { await stop.parar(); return texts.map(() => [1]) })
    const work = upload ? indexFile({ ...input, filename: 'fonte.txt', fileContent: content }) : indexEntry(input)
    await stop.chegou
    const [e] = [...base.entradas.values()]
    await expect(arquivarEntradaBase(archiveArgs(e.id))).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
    stop.liberar(); await work
    expect(e.status).toBe('ACTIVE'); expect(base.vetores.size).toBeGreaterThan(0)
  })
  it(`criação ${upload ? 'indexFile' : 'indexEntry'} perde lease: arquivar complete e retomar não ressuscita vetores/chunks`, async () => {
    vi.useFakeTimers()
    try {
      const stop = barreira(); vi.mocked(generateEmbeddings).mockImplementationOnce(async texts => { await stop.parar(); return texts.map(() => [1]) })
      const work = upload ? indexFile({ ...input, filename: 'fonte.txt', fileContent: content }) : indexEntry(input)
      const rejected = expect(work).rejects.toMatchObject({ code: 'INDEXACAO_PERDIDA' })
      await stop.chegou; const [e] = [...base.entradas.values()]
      await vi.advanceTimersByTimeAsync(DURACAO_DO_ARRENDAMENTO_MS + 1)
      expect((await arquivarEntradaBase(archiveArgs(e.id))).status).toBe('complete')
      stop.liberar(); await rejected
      expect(base.linha(e.id).status).toBe('ARCHIVED'); expect(base.vetores.size).toBe(0); expect(base.chunks).toEqual([])
    } finally { vi.useRealTimers() }
  })
}
it('edição de histórico arquivado retorna sucesso sem embeddings nem alteração de chunks', async () => {
  base.semear({ id: 'e', content, status: 'ARCHIVED', metadata: { chaveDoFato: 'f', origem: 'original' } })
  const chunks = structuredClone(base.chunks)
  const r = await updateEntry('e', { content: 'Texto histórico corrigido', title: 'Título novo' }, tenant)
  expect(r).toMatchObject({ entry: { status: 'ARCHIVED', content: 'Texto histórico corrigido' }, indexacaoPendente: null })
  expect(generateEmbeddings).not.toHaveBeenCalled(); expect(base.chunks).toEqual(chunks); expect(base.meta('e')).toMatchObject({ chaveDoFato: 'f', origem: 'original' })
})
it('reativação por updateEntry indexa mesmo sem editar conteúdo', async () => {
  base.semear({ id: 'e', content, status: 'ARCHIVED' }); base.vetores.clear()
  const r = await updateEntry('e', { status: 'ACTIVE' }, tenant)
  expect(r.entry?.status).toBe('ACTIVE'); expect(generateEmbeddings).toHaveBeenCalled(); expect(base.vetores.size).toBeGreaterThan(0)
})
it('recuperação MCP por id depois de queda no recibo retorna versão/hash arquivados e não expõe outro tenant', async () => {
  base.semear({ id: 'e', content }); await arquivarEntradaBase(archiveArgs('e')) // recibo deliberadamente descartado
  const tool = toolsDeBaseEDna.find(t => t.nome === 'consultar-entrada-base')!
  expect(tool.acesso).toEqual({ tipo: 'projeto' })
  const read = await tool.handler({ projectId: 6, entradaId: 'e' }, { kind: 'service' }) as { updatedAt: Date; contentHash: string }
  expect(read).toMatchObject({ status: 'ARCHIVED', contentHash: hashDoConteudo(content) })
  await expect(tool.handler({ projectId: 7, entradaId: 'e' }, { kind: 'service' })).rejects.toMatchObject({ code: 'ENTRADA_NAO_ENCONTRADA' })
  const r = await arquivarEntradaBase({ ...archiveArgs('e'), ...read })
  expect(r.status).toBe('complete')
})
it('DELETE legado durante indexação é recusado antes de apagar registro, chunks ou vetores', async () => {
  base.semear({ id: 'e', content }); await adquirirArrendamento('e', 'indexador')
  await expect(deleteEntry('e', tenant)).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
  expect(base.entradas.has('e')).toBe(true); expect(base.chunks).toHaveLength(1); expect(base.chamadas.delete).toEqual([])
})
it('DELETE legado perdido entre query/delete não apaga registro ou vetores do vencedor', async () => {
  base.semear({ id: 'e', content }); base.aoConsultar = async () => { base.meta('e')[CICLO_DE_INDEXACAO] = 'vencedor' }
  await expect(deleteEntry('e', tenant)).rejects.toMatchObject({ code: 'INDEXACAO_PERDIDA' })
  expect(base.entradas.has('e')).toBe(true); expect(base.vetores.size).toBe(1); expect(base.chunks).toHaveLength(1)
})
it('DELETE já existente continua funcionando sob lease/CAS, inclusive histórico arquivado', async () => {
  base.semear({ id: 'e', content, status: 'ARCHIVED' })
  expect(await deleteEntry('e', tenant)).toMatchObject({ success: true, status: 'complete', database: 'deleted' }); expect(base.entradas.size).toBe(0); expect(base.chunks).toEqual([]); expect(base.vetores.size).toBe(0)
})
const preview = () => ({ operation: 'DELETE', category: 'ESTABELECIMENTO_INFO', title: 'Fonte', content, tags: [], targetEntryId: 'e', matches: [{ entryId: 'e', title: 'Fonte', category: 'ESTABELECIMENTO_INFO', content, score: 1, updatedAt: base.linha('e').updatedAt.toISOString(), contentHash: hashDoConteudo(content) }] })
const confirm = (p: ReturnType<typeof preview>) => confirmar(new Request('http://localhost/api/knowledge/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 6, preview: p }) }))
it('confirmação DELETE usa versão aprovada e recibo coordenado; edição posterior bloqueia', async () => {
  base.semear({ id: 'e', content }); const approved = preview()
  await updateEntry('e', { title: 'Editado depois de aprovado' }, tenant)
  expect((await confirm(approved)).status).toBe(409); expect(base.linha('e').status).toBe('ACTIVE')
  const response = await confirm(preview()); expect(response.status).toBe(200); expect((await response.json()).arquivamento.status).toBe('complete')
  expect(base.entradas.has('e')).toBe(true); expect(base.chunks).toHaveLength(1)
})
it('confirmação sem versão anterior pede releitura, sem escrever', async () => {
  base.semear({ id: 'e', content }); const p = preview(); p.matches = []
  expect((await confirm(p)).status).toBe(409); expect(base.linha('e').status).toBe('ACTIVE')
})
it('cron usa versão da varredura: validade prorrogada entre scan/CAS não é arquivada', async () => {
  base.semear({ id: 'e', content, expiresAt: new Date(Date.now() - 1000) })
  const scan = vi.fn(async () => {
    const original = structuredClone(base.linha('e'))
    await updateEntry('e', { title: 'Prorrogação concorrente' }, tenant)
    base.linha('e').expiresAt = new Date(Date.now() + 100000)
    return [original]
  })
  Object.assign(dbFalso.knowledgeBaseEntry, { findMany: scan })
  vi.stubEnv('CRON_SECRET', 'fake-secret')
  try {
    const res = await cron(new Request('http://localhost/cron', { headers: { authorization: 'Bearer fake-secret' } }))
    expect((await res.json()).archived).toBe(0); expect(base.linha('e').status).toBe('ACTIVE'); expect(base.chamadas.delete).toEqual([])
  } finally { vi.unstubAllEnvs() }
})
it('DELETE legado não absorve alteração concorrente de campo não indexado', async () => {
  base.semear({ id: 'e', content })
  base.aoConsultar = async () => { await updateEntry('e', { title: 'Edição concorrente' }, tenant) }
  await expect(deleteEntry('e', tenant)).rejects.toMatchObject({ code: 'CONFLITO_EXCLUSAO', status: 409 })
  expect(base.linha('e').title).toBe('Edição concorrente'); expect(base.chunks).toHaveLength(1); expect(base.vetores.size).toBe(1); expect(base.chamadas.delete).toEqual([])
})
it('criação solicitada ARCHIVED preserva somente cadastro, sem publicar índice', async () => {
  const r = await indexEntry({ ...input, status: 'ARCHIVED' })
  expect(r.entry.status).toBe('ARCHIVED'); expect(r.chunks).toEqual([]); expect(generateEmbeddings).not.toHaveBeenCalled(); expect(base.vetores.size).toBe(0)
})
