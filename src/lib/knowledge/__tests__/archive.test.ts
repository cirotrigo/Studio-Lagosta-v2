import { beforeEach, expect, it, vi } from 'vitest'
import { base, dbFalso } from './fixtures/base-falsa'
vi.mock('@/lib/db', async () => ({ db: (await import('./fixtures/base-falsa')).dbFalso }))
vi.mock('@upstash/vector', async () => ({ Index: (await import('./fixtures/base-falsa')).IndiceFalso }))
vi.mock('../embeddings', () => ({ generateEmbeddings: vi.fn() }))
vi.mock('../cache', () => ({ invalidateProjectCacheWithReceipt: vi.fn(async (projectId: number) => ({ projectId, status: 'confirmed', version: 1, deletedCount: 0 })) }))
import { arquivarEntradaBase, hashDoConteudo } from '../archive'
import { adquirirArrendamento, editarEntradaCoordenada } from '../arrendamento'
import { invalidateProjectCacheWithReceipt } from '../cache'
import { CICLO_DE_INDEXACAO } from '../marca-de-indexado'
import { reindexEntry } from '../indexer'
const content = 'Informação atual da marca preservada junto com sua origem e identidade.'
function args() { const e = base.linha('e'); return { entryId: 'e', projectId: 6, autor: 'u', updatedAt: new Date(e.updatedAt), contentHash: hashDoConteudo(e.content) } }
beforeEach(() => {
  base.reset(); vi.clearAllMocks()
  process.env.UPSTASH_VECTOR_REST_URL = 'https://fake.upstash.io'
  process.env.UPSTASH_VECTOR_REST_TOKEN = 'fake'
  base.semear({ id: 'e', content, metadata: { origem: 'original', chaveDoFato: 'f', indexadoEm: 'ontem' } })
  vi.mocked(invalidateProjectCacheWithReceipt).mockResolvedValue({ projectId: 6, status: 'confirmed', version: 1, deletedCount: 0 })
})
it('arquiva, confirma ausência vetorial e preserva registro, chunks, metadata humano e DNA', async () => {
  base.dna = { toneOfVoice: 'v2', contentRules: 'regras', updatedAt: new Date() }
  const before = structuredClone(base.linha('e')); const chunks = structuredClone(base.chunks); const dna = structuredClone(base.dna)
  const r = await arquivarEntradaBase(args())
  expect(r.status).toBe('complete'); expect(r.snapshot).toMatchObject(before); expect(r.snapshotHash).toMatch(/^[a-f0-9]{64}$/)
  expect(base.vetores.size).toBe(0); expect(base.chunks).toEqual(chunks); expect(base.dna).toEqual(dna)
  expect(base.linha('e')).toMatchObject({ status: 'ARCHIVED', content, metadata: { origem: 'original', chaveDoFato: 'f' } })
  await expect(reindexEntry('e', { projectId: 6, userId: 'u' })).rejects.toThrow('arquivada')
})
it('recusa versão/hash/tenant divergentes sem vetores ou status alterados', async () => {
  const old = args(); await editarEntradaCoordenada('e', { content: 'edição concorrente' })
  await expect(arquivarEntradaBase(old)).rejects.toMatchObject({ code: 'CONFLITO_ARQUIVAMENTO' })
  await expect(arquivarEntradaBase({ ...args(), contentHash: '0'.repeat(64) })).rejects.toMatchObject({ code: 'CONFLITO_ARQUIVAMENTO' })
  await expect(arquivarEntradaBase({ ...args(), projectId: 7 })).rejects.toMatchObject({ code: 'ENTRADA_NAO_ENCONTRADA' })
  expect(base.linha('e').status).toBe('ACTIVE'); expect(base.chamadas.delete).toEqual([])
})
it('CAS perdido entre leitura e escrita não absorve a edição concorrente', async () => {
  dbFalso.knowledgeBaseEntry.updateMany.mockImplementationOnce(async () => { base.linha('e').updatedAt = new Date(Date.now() + 50); return { count: 0 } })
  await expect(arquivarEntradaBase(args())).rejects.toThrow('CONFLITO_ARQUIVAMENTO')
  expect(base.linha('e').status).toBe('ACTIVE'); expect(base.chamadas.query).toBe(0)
})
it('indexação em curso bloqueia arquivamento', async () => {
  await adquirirArrendamento('e', 'indexador')
  await expect(arquivarEntradaBase(args())).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
  expect(base.linha('e').status).toBe('ACTIVE')
})
it('durante limpeza, impede edição, indexação e reativação coordenadas', async () => {
  base.aoConsultar = async () => {
    await expect(editarEntradaCoordenada('e', { status: 'ACTIVE' })).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
    await expect(editarEntradaCoordenada('e', { content: 'novo' })).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
    await expect(adquirirArrendamento('e', 'outro')).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
  }
  expect((await arquivarEntradaBase(args())).status).toBe('complete')
})
it('posse perdida entre query e delete não inicia delete nem libera o token alheio', async () => {
  base.aoConsultar = async () => { base.meta('e')[CICLO_DE_INDEXACAO] = 'alheio' }
  const r = await arquivarEntradaBase(args())
  expect(r.status).toBe('partial'); expect(r.vectors.status).toBe('pending'); expect(r.leaseReleased).toBe(false)
  expect(base.chamadas.delete).toEqual([]); expect(base.linha('e').status).toBe('ARCHIVED')
})
it('reativação fora do serviço entre query/delete é detectada e não apaga vetores', async () => {
  base.aoConsultar = async () => { base.linha('e').status = 'ACTIVE' }
  const r = await arquivarEntradaBase(args())
  expect(r.status).toBe('partial'); expect(base.chamadas.delete).toEqual([])
})
it('falha Vector retorna parcial com DB arquivado; retry explícito com nova versão completa limpeza', async () => {
  base.aoConsultar = async () => { throw new Error('Vector indisponível') }
  const r = await arquivarEntradaBase(args())
  expect(r.status).toBe('partial'); expect(r.database).toBe('archived'); expect(base.chunks).toHaveLength(1)
  base.aoConsultar = undefined
  expect((await arquivarEntradaBase(args())).status).toBe('complete')
})
it('Redis não confirmado retorna parcial apesar de limpeza vetorial concluída', async () => {
  vi.mocked(invalidateProjectCacheWithReceipt).mockResolvedValue({ projectId: 6, status: 'failed', deletedCount: 0 })
  const r = await arquivarEntradaBase(args()); expect(r.status).toBe('partial'); expect(r.vectors.status).toBe('confirmed')
})
it('falha no delete Vector preserva arquivo e retorna parcial', async () => {
  const { IndiceFalso } = await import('./fixtures/base-falsa')
  const del = vi.spyOn(IndiceFalso.prototype, 'delete').mockRejectedValueOnce(new Error('delete falhou'))
  const r = await arquivarEntradaBase(args())
  expect(r.status).toBe('partial'); expect(r.vectors).toMatchObject({ status: 'pending', issue: 'VECTOR_UNCONFIRMED' })
  expect(base.linha('e').status).toBe('ARCHIVED'); expect(base.vetores.size).toBe(1)
  del.mockRestore()
})
it('delete aceito que deixa vetor não confirma sucesso', async () => {
  const { IndiceFalso } = await import('./fixtures/base-falsa')
  const del = vi.spyOn(IndiceFalso.prototype, 'delete').mockResolvedValueOnce({ deleted: 0 })
  const r = await arquivarEntradaBase(args()); expect(r.status).toBe('partial'); expect(r.vectors.status).toBe('pending')
  del.mockRestore()
})
it('passo em voo que estoura prazo não libera lease para uma reativação atrasada', async () => {
  vi.useFakeTimers()
  const { PRAZO_DO_PASSO_MS, EXPIRACAO_DO_CICLO } = await import('../marca-de-indexado')
  const { IndiceFalso } = await import('./fixtures/base-falsa')
  const del = vi.spyOn(IndiceFalso.prototype, 'delete').mockImplementationOnce(async () => new Promise(() => {}))
  try {
    const work = arquivarEntradaBase(args())
    await vi.advanceTimersByTimeAsync(PRAZO_DO_PASSO_MS + 1)
    const r = await work
    expect(r.status).toBe('partial'); expect(r.leaseReleased).toBe(false); expect(base.meta('e')[EXPIRACAO_DO_CICLO]).toBeDefined()
    await expect(editarEntradaCoordenada('e', { status: 'ACTIVE' })).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
  } finally { del.mockRestore(); vi.useRealTimers() }
})
it('não declara banco arquivado quando escrita externa o reativou durante limpeza', async () => {
  base.aoConsultar = async () => { base.linha('e').status = 'ACTIVE' }
  const r = await arquivarEntradaBase(args())
  expect(r).toMatchObject({ database: 'changed', arquivada: false, status: 'partial' })
})
