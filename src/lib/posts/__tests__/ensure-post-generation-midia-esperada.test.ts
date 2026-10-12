/**
 * B1d — checkpoint d (Codex, rodada 9): uma execução de render só vincula uma Generation ao post se o post AINDA
 * aponta para a mídia que ESSA execução confirmou. O vínculo é CAS (generationId nulo + mediaUrls + renderedImageUrl),
 * nos DOIS ramos (Generation existente por resultUrl, e Generation nova). Sem `midiaEsperada`, o comportamento de
 * sempre (os outros chamadores).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  post: null as any,
  geracoes: [] as Array<{ id: string; projectId: number; resultUrl: string }>,
  /** Corre no meio do vínculo, entre a leitura e o CAS: a edição semântica que invalida a arte. */
  antesDoCas: null as null | (() => void),
}))

const URL_A = 'https://blob.test/posts/rendered/a.png'

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const tx = {
  socialPost: {
    findUnique: vi.fn(async () => estado.post && { ...estado.post, Project: { userId: 'u1', name: 'P' } }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: Record<string, unknown> }) => {
      estado.antesDoCas?.()
      estado.antesDoCas = null
      const p = estado.post
      if (!p || p.generationId !== where.generationId) return { count: 0 }
      if ('mediaUrls' in where && !igual(p.mediaUrls, where.mediaUrls.equals)) return { count: 0 }
      if ('renderedImageUrl' in where && p.renderedImageUrl !== where.renderedImageUrl) return { count: 0 }
      if ('renderStatus' in where && p.renderStatus !== where.renderStatus) return { count: 0 }
      estado.post = { ...p, ...data }
      return { count: 1 }
    }),
  },
  page: { findUnique: vi.fn(async () => ({ id: 'p1', name: 'Página', layers: [], templateId: 7, Template: { name: 'T' } })) },
  generation: {
    findFirst: vi.fn(async ({ where }: any) => estado.geracoes.find((g) => g.projectId === where.projectId && g.resultUrl === where.resultUrl) ?? null),
    create: vi.fn(async ({ data }: any) => {
      const g = { id: `g${estado.geracoes.length + 1}`, projectId: data.projectId, resultUrl: data.resultUrl }
      estado.geracoes.push(g)
      return { id: g.id }
    }),
  },
}

vi.mock('@/lib/db', () => ({ db: { socialPost: { findUnique: vi.fn(async () => estado.post && { generationId: estado.post.generationId }) } } }))
vi.mock('@/lib/trava-por-chave', () => ({
  // Transação de verdade: o que foi criado volta atrás se `fazer` lançar.
  comTravaPorChave: async (_chave: string, fazer: (t: unknown) => Promise<unknown>) => {
    const antes = [...estado.geracoes]
    try {
      return await fazer(tx)
    } catch (e) {
      estado.geracoes = antes
      throw e
    }
  },
}))

import { ensurePostGeneration } from '../ensure-post-generation'

const invalidar = () => {
  estado.post = { ...estado.post, mediaUrls: [], renderedImageUrl: null, renderStatus: 'PENDING' }
}

beforeEach(() => {
  vi.clearAllMocks()
  estado.post = { id: 'post-1', projectId: 8, templateId: 7, pageId: 'p1', generationId: null, renderStatus: 'RENDERED', mediaUrls: [URL_A], renderedImageUrl: URL_A, slotValues: null }
  estado.geracoes = []
  estado.antesDoCas = null
})

describe('com a mídia esperada: o vínculo só vale para a arte que esta execução confirmou', () => {
  it('Generation NOVA: arte invalidada antes do CAS → generationId não é gravado, e a Generation não fica órfã', async () => {
    estado.antesDoCas = invalidar
    expect(await ensurePostGeneration('post-1', { midiaEsperada: URL_A })).toBeNull()
    expect(estado.post.generationId).toBeNull()
    expect(estado.geracoes).toEqual([])
  })

  it('Generation EXISTENTE (resultUrl = URL_A): arte invalidada antes do CAS → generationId não é gravado', async () => {
    estado.geracoes = [{ id: 'g-antiga', projectId: 8, resultUrl: URL_A }]
    estado.antesDoCas = invalidar
    expect(await ensurePostGeneration('post-1', { midiaEsperada: URL_A })).toBeNull()
    expect(estado.post.generationId).toBeNull()
  })

  it('o post já não aponta para a mídia esperada: nem cria Generation', async () => {
    invalidar()
    expect(await ensurePostGeneration('post-1', { midiaEsperada: URL_A })).toBeNull()
    expect(tx.generation.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resultUrl: URL_A }) }))
    expect(estado.geracoes).toEqual([])
  })

  it('positivo: o post ainda aponta para URL_A → vincula (nova e existente)', async () => {
    const nova = await ensurePostGeneration('post-1', { midiaEsperada: URL_A })
    expect(nova).toBe('g1')
    expect(estado.post.generationId).toBe('g1')

    estado.post = { ...estado.post, generationId: null }
    estado.geracoes = [{ id: 'g-existente', projectId: 8, resultUrl: URL_A }]
    expect(await ensurePostGeneration('post-1', { midiaEsperada: URL_A })).toBe('g-existente')
    expect(estado.post.generationId).toBe('g-existente')
  })
})

describe('Codex rodada 10: a URL ainda é A, mas o post saiu de RENDERED (voltou a rascunho) — o vínculo atrasado não vale', () => {
  const voltarARascunho = () => {
    estado.post = { ...estado.post, renderStatus: 'PENDING' } // mediaUrls e renderedImageUrl continuam A
  }

  it('Generation NOVA: CAS falha, generationId fica nulo e a Generation é desfeita', async () => {
    estado.antesDoCas = voltarARascunho
    expect(await ensurePostGeneration('post-1', { midiaEsperada: URL_A })).toBeNull()
    expect(estado.post.generationId).toBeNull()
    expect(estado.geracoes).toEqual([])
  })

  it('Generation EXISTENTE: CAS falha e generationId fica nulo', async () => {
    estado.geracoes = [{ id: 'g-antiga', projectId: 8, resultUrl: URL_A }]
    estado.antesDoCas = voltarARascunho
    expect(await ensurePostGeneration('post-1', { midiaEsperada: URL_A })).toBeNull()
    expect(estado.post.generationId).toBeNull()
  })
})

describe('sem a mídia esperada: o comportamento de sempre (outros chamadores)', () => {
  it('vincula pela arte atual, sem exigir mídia no CAS', async () => {
    expect(await ensurePostGeneration('post-1')).toBe('g1')
    const where = tx.socialPost.updateMany.mock.calls.at(-1)![0].where
    expect(where).toEqual({ id: 'post-1', generationId: null })
  })
})
