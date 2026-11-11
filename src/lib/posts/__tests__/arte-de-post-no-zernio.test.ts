/**
 * Trocar a arte de um post que mora no Zernio (11/11/2026).
 *
 * O Ciro sobe a arte pronta pelo Zernio; a Roberta, na agenda do Studio, pede a melhoria com IA ou troca a arte. A
 * arte nova tem de ir para o MESMO post do Zernio (é a cópia de lá que publica), no mesmo horário, e só então para o
 * banco. Aqui: a troca no Zernio, a aplicação da arte melhorada (rascunho, agendado, slide de carrossel), a troca de
 * arte pela galeria, as recusas e a falha do Zernio sem tocar o banco.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ posts: [] as any[], generations: [] as any[] }))
const zernio = vi.hoisted(() => ({ post: null as any, getPost: null as any, updatePost: null as any, createPost: null as any, deletePost: null as any }))

function casa(l: any, where: any): boolean {
  return Object.entries(where).every(([k, c]: [string, any]) => {
    const v = l[k]
    if (c === null) return v === null || v === undefined
    if (typeof c !== 'object') return v === c
    if ('in' in c) return c.in.includes(v)
    if ('equals' in c) return JSON.stringify(v) === JSON.stringify(c.equals)
    throw new Error(`filtro não suportado: ${k}`)
  })
}
const atualizar = async ({ where, data }: any) => {
  let count = 0
  banco.posts = banco.posts.map((p) => (casa(p, where) ? (count++, { ...p, ...data }) : p))
  return { count }
}

vi.mock('@/lib/db', () => {
  const socialPost = {
    findFirst: async ({ where }: any) => banco.posts.find((p) => casa(p, where)) ?? null,
    findUnique: async ({ where }: any) => banco.posts.find((p) => p.id === where.id) ?? null,
    updateMany: (a: any) => atualizar(a),
  }
  return {
    db: {
      socialPost,
      generation: { findFirst: async ({ where }: any) => banco.generations.find((g) => casa(g, where)) ?? null },
      postLog: { create: async () => undefined },
      $transaction: async (fn: any) => fn({ $queryRaw: async () => [{ slotValues: null }], socialPost }),
    },
  }
})
vi.mock('@/lib/later/client', () => ({
  getLaterClient: () => ({
    getPost: (...a: unknown[]) => zernio.getPost(...a),
    updatePost: (...a: unknown[]) => zernio.updatePost(...a),
    createPost: (...a: unknown[]) => zernio.createPost(...a),
    deletePost: (...a: unknown[]) => zernio.deletePost(...a),
  }),
}))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test', renderPageAndRegister: vi.fn() }))
vi.mock('@/lib/creatives/ingerir-midia', () => ({
  ingerirMidiaExterna: async (urls: string[]) => ({ urls, falhas: [] }),
  ehHostProprio: (url: string) => url.includes('blob.vercel-storage.com'),
}))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: async () => undefined }))
vi.mock('@/lib/aprendizado/sinal-de-agendamento', () => ({ fecharSugestaoDeSlot: async () => undefined, registrarSlotDoPost: async () => undefined }))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarEdicaoDeLegenda: async () => undefined }))

import { LaterNotFoundError } from '@/lib/later/errors'
import { recusaDeArteNoZernio, trocarMidiaNoZernio } from '../midia-no-zernio'
import { aplicarArteMelhoradaAoPost } from '../aplicar-arte-melhorada'
import { trocarArteDoPost } from '../trocar-arte-do-post'
import { recusaDaTroca } from '../troca-de-arte'

const CDN = (n: number) => `https://media.zernio.com/temp/slide-${n}.png`
const NOVA = 'https://abc.public.blob.vercel-storage.com/melhorada.png'
const DAQUI_A_DOIS_DIAS = new Date(Date.now() + 2 * 86_400_000)

const local = (extra: Record<string, unknown> = {}) => ({
  id: 'local-1', projectId: 5, laterPostId: 'z1', status: 'DRAFT', lateStatus: 'draft', scheduledDatetime: DAQUI_A_DOIS_DIAS,
  mediaUrls: [CDN(1)], postType: 'STORY', pageId: null, generationId: null, campaignId: null, slotValues: null,
  renderStatus: 'NOT_NEEDED', lastSyncAt: null, ...extra,
})

/** O Zernio de mentira guarda o post e devolve o que ficou, como o de verdade. */
function noZernio(status: string, urls: string[]) {
  zernio.post = { id: 'z1', status, publishAt: DAQUI_A_DOIS_DIAS.toISOString(), media: urls.map((url) => ({ type: 'image', url })) }
}

beforeEach(() => {
  banco.posts = []
  banco.generations = [{ id: 'gen-nova', projectId: 5, resultUrl: NOVA, fieldValues: {} }]
  noZernio('draft', [CDN(1)])
  zernio.getPost = vi.fn(async () => zernio.post)
  zernio.updatePost = vi.fn(async (_id: string, corpo: any) => {
    zernio.post = { ...zernio.post, media: corpo.mediaItems }
    return zernio.post
  })
  zernio.createPost = vi.fn()
  zernio.deletePost = vi.fn()
})

const aplicar = (indice?: number) =>
  aplicarArteMelhoradaAoPost({ postId: 'local-1', projectId: 5, indice, url: NOVA, generationId: 'gen-nova' })

describe('recusaDeArteNoZernio', () => {
  it('rascunho de lá pode sempre, mesmo com o horário em cima', () => {
    expect(recusaDeArteNoZernio({ lateStatus: 'draft', scheduledDatetime: new Date(Date.now() + 60_000) })).toBeNull()
  })
  it('agendado pode fora da janela e é recusado a menos de 5 minutos', () => {
    expect(recusaDeArteNoZernio({ lateStatus: 'scheduled', scheduledDatetime: DAQUI_A_DOIS_DIAS })).toBeNull()
    expect(recusaDeArteNoZernio({ lateStatus: 'scheduled', scheduledDatetime: new Date(Date.now() + 3 * 60_000) })?.codigo).toBe('POST_CONGELADO')
  })
  it('em publicação ou publicado: recusa', () => {
    expect(recusaDeArteNoZernio({ lateStatus: 'publishing' })?.codigo).toBe('POST_SAINDO')
    expect(recusaDeArteNoZernio({ lateStatus: 'published' })?.codigo).toBe('POST_SAINDO')
  })
})

describe('trocarMidiaNoZernio', () => {
  it('carrossel: manda a lista inteira, na ordem, com UMA posição trocada', async () => {
    noZernio('draft', [CDN(1), CDN(2), CDN(3)])
    const urls = await trocarMidiaNoZernio({ laterPostId: 'z1', indice: 1, url: NOVA, totalEsperado: 3 })
    expect(zernio.updatePost).toHaveBeenCalledWith('z1', {
      mediaItems: [{ type: 'image', url: CDN(1) }, { type: 'image', url: NOVA }, { type: 'image', url: CDN(3) }],
    })
    expect(urls).toEqual([CDN(1), NOVA, CDN(3)])
  })

  it('quantidade diferente da que a agenda conhece: recusa sem escrever', async () => {
    noZernio('draft', [CDN(1), CDN(2)])
    await expect(trocarMidiaNoZernio({ laterPostId: 'z1', indice: 0, url: NOVA, totalEsperado: 1 })).rejects.toMatchObject({ code: 'POST_MUDOU_NO_MEIO' })
    expect(zernio.updatePost).not.toHaveBeenCalled()
  })

  it('o estado conferido é o do Zernio: publicado por lá não é tocado', async () => {
    noZernio('published', [CDN(1)])
    await expect(trocarMidiaNoZernio({ laterPostId: 'z1', indice: 0, url: NOVA, totalEsperado: 1 })).rejects.toMatchObject({ code: 'POST_SAINDO' })
    expect(zernio.updatePost).not.toHaveBeenCalled()
  })

  it('404: estado indefinido', async () => {
    zernio.getPost = vi.fn(async () => { throw new LaterNotFoundError('Post not found') })
    await expect(trocarMidiaNoZernio({ laterPostId: 'z1', indice: 0, url: NOVA, totalEsperado: 1 })).rejects.toMatchObject({ code: 'ESTADO_INDEFINIDO' })
  })

  it('resposta com outro estado ou outra quantidade não conta como troca', async () => {
    zernio.updatePost = vi.fn(async () => ({ ...zernio.post, status: 'scheduled' }))
    await expect(trocarMidiaNoZernio({ laterPostId: 'z1', indice: 0, url: NOVA, totalEsperado: 1 })).rejects.toMatchObject({ code: 'ZERNIO_NAO_CONFIRMOU' })
  })
})

describe('arte melhorada com IA num post que mora no Zernio', () => {
  it('RASCUNHO importado: troca no mesmo post do Zernio e depois no banco; id, horário e estado ficam', async () => {
    banco.posts = [local()]
    const r = await aplicar()

    expect(r).toMatchObject({ aplicada: true, indice: 0, total: 1 })
    expect(zernio.updatePost).toHaveBeenCalledWith('z1', { mediaItems: [{ type: 'image', url: NOVA }] })
    expect(zernio.createPost).not.toHaveBeenCalled()
    expect(zernio.deletePost).not.toHaveBeenCalled()
    expect(banco.posts[0]).toMatchObject({
      mediaUrls: [NOVA], generationId: 'gen-nova', laterPostId: 'z1', status: 'DRAFT', lateStatus: 'draft',
      scheduledDatetime: DAQUI_A_DOIS_DIAS, renderStatus: 'NOT_NEEDED',
    })
    expect(banco.posts[0].lastSyncAt).toBeInstanceOf(Date)
  })

  it('AGENDADO importado, fora da janela: troca no Zernio e segue agendado nos dois lados', async () => {
    banco.posts = [local({ status: 'SCHEDULED', lateStatus: 'scheduled' })]
    noZernio('scheduled', [CDN(1)])
    expect(await aplicar()).toMatchObject({ aplicada: true })
    expect(zernio.post).toMatchObject({ status: 'scheduled', media: [{ type: 'image', url: NOVA }] })
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [NOVA], status: 'SCHEDULED', lateStatus: 'scheduled', laterPostId: 'z1' })
  })

  it('slide de CARROSSEL: só ele muda, no Zernio e no banco, e a ordem dos outros fica', async () => {
    banco.posts = [local({ postType: 'CAROUSEL', mediaUrls: [CDN(1), CDN(2), CDN(3)] })]
    noZernio('draft', [CDN(1), CDN(2), CDN(3)])
    expect(await aplicar(2)).toMatchObject({ aplicada: true, indice: 2, total: 3 })
    expect(zernio.post.media.map((m: any) => m.url)).toEqual([CDN(1), CDN(2), NOVA])
    expect(banco.posts[0].mediaUrls).toEqual([CDN(1), CDN(2), NOVA])
  })

  it('o banco guarda a URL que o Zernio devolveu (se ele re-hospedar a imagem, o sync não vê diferença)', async () => {
    banco.posts = [local()]
    const rehospedada = 'https://media.zernio.com/temp/rehospedada.png'
    zernio.updatePost = vi.fn(async () => ({ ...zernio.post, media: [{ type: 'image', url: rehospedada }] }))
    await aplicar()
    expect(banco.posts[0].mediaUrls).toEqual([rehospedada])
  })

  it('agendado a menos de 5 minutos: não troca em lugar nenhum, e a arte fica só na galeria', async () => {
    banco.posts = [local({ status: 'SCHEDULED', lateStatus: 'scheduled', scheduledDatetime: new Date(Date.now() + 3 * 60_000) })]
    const r = await aplicar()
    expect(r.aplicada).toBe(false)
    expect(r.motivo).toMatch(/publica em instantes/)
    expect(zernio.getPost).not.toHaveBeenCalled()
    expect(banco.posts[0].mediaUrls).toEqual([CDN(1)])
  })

  it('Zernio fora do ar: o banco não muda', async () => {
    banco.posts = [local()]
    zernio.updatePost = vi.fn(async () => { throw new Error('502') })
    const r = await aplicar()
    expect(r.aplicada).toBe(false)
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [CDN(1)], generationId: null })
  })

  it('post NATIVO ainda não entregue: como sempre, só o banco', async () => {
    banco.posts = [local({ laterPostId: null, lateStatus: null, status: 'SCHEDULED', mediaUrls: ['https://abc.public.blob.vercel-storage.com/a.png'] })]
    expect(await aplicar()).toMatchObject({ aplicada: true })
    expect(zernio.getPost).not.toHaveBeenCalled()
    expect(zernio.updatePost).not.toHaveBeenCalled()
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [NOVA], laterPostId: null })
  })

  it('post nativo ENTREGUE no meio da melhoria (ganhou laterPostId depois da leitura): o banco não é tocado', async () => {
    banco.posts = [local({ laterPostId: null, lateStatus: null, status: 'SCHEDULED' })]
    const { db } = await import('@/lib/db')
    vi.spyOn(db.socialPost, 'updateMany').mockImplementationOnce((async (a: any) => {
      banco.posts[0].laterPostId = 'z-novo'
      return atualizar(a)
    }) as any)
    expect((await aplicar()).aplicada).toBe(false)
    expect(banco.posts[0].mediaUrls).toEqual([CDN(1)])
  })
})

describe('trocar-arte-do-post num rascunho que mora no Zernio', () => {
  const trocar = (extra: Record<string, unknown> = {}) => trocarArteDoPost({ projectId: 5, postId: 'local-1', generationId: 'gen-nova', ...extra })

  it('a regra: só o que é rascunho NOS DOIS lados passa; agendado pede voltar para rascunho antes', () => {
    expect(recusaDaTroca({ status: 'DRAFT', laterPostId: 'z1', lateStatus: 'draft' })).toBeNull()
    expect(recusaDaTroca({ status: 'SCHEDULED', laterPostId: 'z1', lateStatus: 'scheduled' })?.codigo).toBe('POST_CONGELADO')
    expect(recusaDaTroca({ status: 'DRAFT', laterPostId: 'z1', lateStatus: 'scheduled' })?.codigo).toBe('POST_CONGELADO')
  })

  it('troca no Zernio primeiro e depois no banco, como imagem pronta', async () => {
    banco.posts = [local()]
    const r = await trocar()
    expect(zernio.updatePost).toHaveBeenCalledWith('z1', { mediaItems: [{ type: 'image', url: NOVA }] })
    expect(r).toMatchObject({ trocado: true, total: 1, acompanhaAPagina: false })
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [NOVA], generationId: 'gen-nova', laterPostId: 'z1', status: 'DRAFT', renderStatus: 'NOT_NEEDED' })
  })

  it('carrossel: troca o slide pedido e mantém os outros', async () => {
    banco.posts = [local({ postType: 'CAROUSEL', mediaUrls: [CDN(1), CDN(2), CDN(3)] })]
    noZernio('draft', [CDN(1), CDN(2), CDN(3)])
    await trocar({ indice: 1 })
    expect(banco.posts[0].mediaUrls).toEqual([CDN(1), NOVA, CDN(3)])
    expect(zernio.post.media.map((m: any) => m.url)).toEqual([CDN(1), NOVA, CDN(3)])
  })

  it('Zernio falha: lança e o banco não muda', async () => {
    banco.posts = [local()]
    zernio.updatePost = vi.fn(async () => { throw new Error('502') })
    await expect(trocar()).rejects.toMatchObject({ code: 'ZERNIO_INDISPONIVEL' })
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [CDN(1)], generationId: null })
  })

  it('agendado no Zernio: recusado sem falar com o Zernio', async () => {
    banco.posts = [local({ status: 'SCHEDULED', lateStatus: 'scheduled' })]
    await expect(trocar()).rejects.toMatchObject({ code: 'POST_CONGELADO' })
    expect(zernio.getPost).not.toHaveBeenCalled()
  })
})
