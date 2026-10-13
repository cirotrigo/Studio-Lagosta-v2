/**
 * B1d — checkpoint d (Codex, rodada 9): uma execução de render só vincula uma Generation ao post se o post AINDA
 * aponta para a mídia que ESSA execução confirmou. O vínculo é CAS (generationId nulo + mediaUrls + renderedImageUrl),
 * nos DOIS ramos (Generation existente por resultUrl, e Generation nova). Sem `midiaEsperada`, o comportamento de
 * sempre (os outros chamadores).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  post: null as any,
  geracoes: [] as Array<{ id: string; projectId: number; resultUrl: string; fieldValues?: any }>,
  /** Corre no meio do vínculo, entre a leitura e o CAS: a edição semântica que invalida a arte. */
  antesDoCas: null as null | (() => void),
  /** PostRenderProof por "postId|mediaUrl". */
  provas: {} as Record<string, { layersSnapshot: unknown }>,
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
  postRenderProof: {
    findUnique: vi.fn(async ({ where }: any) => estado.provas[`${where.postId_mediaUrl.postId}|${where.postId_mediaUrl.mediaUrl}`] ?? null),
  },
  page: { findUnique: vi.fn(async () => ({ id: 'p1', name: 'Página', layers: [{ id: 't-h', name: 'Título', type: 'text', content: 'texto do MODELO', visible: true }], templateId: 7, Template: { name: 'T' } })) },
  generation: {
    findFirst: vi.fn(async ({ where }: any) => estado.geracoes.find((g) => g.projectId === where.projectId && g.resultUrl === where.resultUrl) ?? null),
    create: vi.fn(async ({ data }: any) => {
      const g = { id: `g${estado.geracoes.length + 1}`, projectId: data.projectId, resultUrl: data.resultUrl, fieldValues: data.fieldValues }
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
  estado.provas = {}
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

describe('checkpoint e: a Generation de um post semântico não grava o PEDIDO como texto esperado', () => {
  it('J. sem prova da mídia: NÃO afirma copy visual (nem o pedido, nem o texto do modelo); o pedido fica em slotValuesRecebidos', async () => {
    const pedido = { _slots: { manchete: 'Noite do vinho' }, _papeis: { cta: 'Reserve' } }
    estado.post = { ...estado.post, slotValues: pedido }
    await ensurePostGeneration('post-1', { midiaEsperada: URL_A })
    const fv = estado.geracoes[0].fieldValues
    expect('slotValues' in fv).toBe(false)
    expect(fv.slotValuesRecebidos).toEqual(pedido)
    expect(JSON.stringify(fv)).not.toMatch(/texto do MODELO/)
  })

  it('J. com a prova da URL: a copy visual são os textos das camadas que PRODUZIRAM a mídia', async () => {
    const pedido = { _slots: { 'headline-principal': 'Festival de Massas' } }
    estado.post = { ...estado.post, slotValues: pedido }
    estado.provas[`post-1|${URL_A}`] = { layersSnapshot: [{ id: 't-h', name: 'Título', type: 'text', content: 'Festival de Massas', visible: true }] }
    await ensurePostGeneration('post-1', { midiaEsperada: URL_A })
    const fv = estado.geracoes[0].fieldValues
    expect(fv.slotValues).toEqual({ Título: 'Festival de Massas' })
    expect(fv.slotValuesRecebidos).toEqual(pedido)
    expect(JSON.stringify(fv.slotValues)).not.toMatch(/_slots|_papeis|headline-principal/)
  })

  it('prova de OUTRA URL não serve de copy visual', async () => {
    estado.post = { ...estado.post, slotValues: { _slots: { manchete: 'X' } } }
    estado.provas['post-1|https://blob.test/outra.png'] = { layersSnapshot: [{ id: 't', name: 'T', type: 'text', content: 'OUTRA', visible: true }] }
    await ensurePostGeneration('post-1', { midiaEsperada: URL_A })
    expect('slotValues' in estado.geracoes[0].fieldValues).toBe(false)
  })

  it('legado: como sempre (copy do post, ou o texto da página quando o post não tem copy)', async () => {
    estado.post = { ...estado.post, slotValues: null }
    await ensurePostGeneration('post-1', { midiaEsperada: URL_A })
    expect(JSON.stringify(estado.geracoes[0].fieldValues.slotValues)).toMatch(/texto do MODELO/)
  })
})
