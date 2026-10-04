import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), embed: vi.fn(async () => [1]), vectors: vi.fn(), get: vi.fn(), set: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { knowledgeChunk: { findMany: mocks.findMany } } }))
vi.mock('../embeddings', () => ({ generateEmbedding: mocks.embed }))
vi.mock('../vector-client', () => ({ queryVectors: mocks.vectors }))
vi.mock('../cache', () => ({ getCachedResults: mocks.get, setCachedResults: mocks.set }))
import { KnowledgeCategory } from '../../../../prisma/generated/client'
import { searchKnowledgeBase } from '../search'
import { CICLO_DE_INDEXACAO, EXPIRACAO_DO_CICLO } from '../marca-de-indexado'
const tenant = { projectId: 6, userId: 'u' }
let entry: { id: string; projectId: number; status: string; content: string; category: string; title: string; tags: string[]; expiresAt: Date | null; metadata: unknown }
let chunk: { id: string; entryId: string; vectorId: string; content: string; ordinal: number }
beforeEach(() => {
  vi.clearAllMocks()
  entry = { id: 'e', projectId: 6, status: 'ACTIVE', content: 'Texto atual e vigente da marca.', category: 'CAMPANHAS', title: 'Campanha', tags: [], expiresAt: null, metadata: null }
  chunk = { id: 'c', entryId: 'e', vectorId: 'e:0', content: entry.content, ordinal: 0 }
  mocks.get.mockResolvedValue(null); mocks.vectors.mockResolvedValue([{ id: 'e:0', score: 0.9 }])
  mocks.findMany.mockImplementation(async ({ where }) => {
    expect(where.entry).toMatchObject({ projectId: 6, status: { in: ['ACTIVE'] } })
    expect(where.entry.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }])
    if (entry.projectId !== where.entry.projectId || !where.entry.status.in.includes(entry.status) || (entry.expiresAt && entry.expiresAt <= new Date()) || (where.entry.category && where.entry.category !== entry.category)) return []
    if (where.id && !where.id.in.includes(chunk.id)) return []
    if (where.vectorId && !where.vectorId.in.includes(chunk.vectorId)) return []
    return [{ ...chunk, entry: { ...entry } }]
  })
})
async function prime() {
  const cached = await searchKnowledgeBase('campanha', tenant, { useCache: false })
  expect(cached).toHaveLength(1)
  expect(cached[0].sourceVersion).toMatch(/^[a-f0-9]{64}$/)
  expect(cached[0].sourceVersion).not.toContain(entry.content)
  mocks.get.mockResolvedValue(structuredClone(cached)); mocks.embed.mockClear(); mocks.vectors.mockClear(); mocks.findMany.mockClear()
  return cached
}
it('hit válido usa DB atual, sem embedding, e reidrata título/tags mesmo sem invalidação', async () => {
  await prime(); entry.title = 'Título atual'; entry.tags = ['nova']
  const results = await searchKnowledgeBase('campanha', tenant)
  expect(results[0].entry).toMatchObject({ title: 'Título atual', tags: ['nova'] })
  expect(mocks.embed).not.toHaveBeenCalled(); expect(mocks.findMany).toHaveBeenCalledTimes(1)
})
for (const scenario of ['archived', 'expired', 'tenant', 'category', 'content', 'chunk', 'lease'] as const) {
  it(`hit ${scenario} vira miss e não reapresenta fonte`, async () => {
    await prime()
    if (scenario === 'archived') entry.status = 'ARCHIVED'
    if (scenario === 'expired') entry.expiresAt = new Date(Date.now() - 1000)
    if (scenario === 'tenant') entry.projectId = 7
    if (scenario === 'category') entry.category = 'HORARIOS'
    if (scenario === 'content') entry.content = 'Texto editado sem reindexar.'
    if (scenario === 'chunk') chunk.id = 'substituído'
    if (scenario === 'lease') entry.metadata = { [CICLO_DE_INDEXACAO]: 'novo', [EXPIRACAO_DO_CICLO]: new Date(Date.now() + 60000).toISOString() }
    if (scenario === 'chunk') mocks.vectors.mockResolvedValue([])
    const results = await searchKnowledgeBase('campanha', tenant, { categoryFilter: KnowledgeCategory.CAMPANHAS })
    expect(results).toEqual([]); expect(mocks.embed).toHaveBeenCalledTimes(1)
  })
}
it('conteúdo e chunk atualizados com mesmo id invalidam score velho e retornam busca fresca', async () => {
  await prime(); entry.content = chunk.content = 'Conteúdo novo corretamente indexado.'
  mocks.vectors.mockResolvedValue([{ id: 'e:0', score: 0.82 }])
  const r = await searchKnowledgeBase('campanha', tenant)
  expect(r[0]).toMatchObject({ content: entry.content, score: 0.82 }); expect(mocks.embed).toHaveBeenCalledTimes(1)
})
it('cache legado sem versão e cache vazio são miss', async () => {
  const cached = await prime(); delete cached[0].sourceVersion; mocks.get.mockResolvedValue(cached)
  await searchKnowledgeBase('campanha', tenant); expect(mocks.embed).toHaveBeenCalledTimes(1)
  mocks.embed.mockClear(); mocks.get.mockResolvedValue([])
  await searchKnowledgeBase('campanha', tenant); expect(mocks.embed).toHaveBeenCalledTimes(1)
})
it('sem metadata de saída ainda confere entrada e conteúdo no banco', async () => {
  const cached = await searchKnowledgeBase('campanha', tenant, { useCache: false, includeEntryMetadata: false })
  expect(cached[0].entry).toBeUndefined(); mocks.get.mockResolvedValue(cached); entry.status = 'ARCHIVED'
  expect(await searchKnowledgeBase('campanha', tenant, { includeEntryMetadata: false })).toEqual([])
})
