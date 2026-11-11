/**
 * A arte de um post que veio do Zernio entra na galeria SOB DEMANDA, para a melhoria com IA ter Generation de origem
 * e imagem no nosso Blob. Aqui: o caminho feliz, o reaproveitamento, e as recusas antes de baixar qualquer coisa.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ post: null as any, generations: [] as any[] }))
const fora = vi.hoisted(() => ({ baixar: null as any, importar: null as any }))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findFirst: async ({ where }: any) => (banco.post && banco.post.id === where.id && banco.post.projectId === where.projectId ? banco.post : null),
      updateMany: async ({ where, data }: any) => {
        if (banco.post.id !== where.id || (where.generationId === null && banco.post.generationId)) return { count: 0 }
        banco.post = { ...banco.post, ...data }
        return { count: 1 }
      },
    },
    generation: { findFirst: async ({ where }: any) => banco.generations.find((g) => g.resultUrl === where.resultUrl) ?? null },
  },
}))
vi.mock('@/lib/creatives/baixar-imagem-externa', () => ({ baixarImagemExterna: (...a: unknown[]) => fora.baixar(...a) }))
vi.mock('@/lib/creatives/arte-enviada', () => ({ importarArte: (...a: unknown[]) => fora.importar(...a) }))
vi.mock('../agenda-acoes', () => ({ formatarBRT: () => '13/11/2026, 17:30' }))

import { trazerArteDoPostParaGaleria } from '../arte-do-post-na-galeria'

const CDN = 'https://media.zernio.com/temp/story.png'
const BLOB = 'https://abc.public.blob.vercel-storage.com/arte-enviada/5/story.png'
const post = (extra: Record<string, unknown> = {}) => ({
  id: 'local-1', projectId: 5, status: 'DRAFT', laterPostId: 'z1', lateStatus: 'draft',
  scheduledDatetime: new Date(Date.now() + 2 * 86_400_000), mediaUrls: [CDN], postType: 'STORY', generationId: null, ...extra,
})
const trazer = (indice?: number) => trazerArteDoPostParaGaleria({ projectId: 5, postId: 'local-1', indice })

beforeEach(() => {
  banco.post = post()
  banco.generations = []
  fora.baixar = vi.fn(async () => ({ bytes: Buffer.from('png'), contentType: 'image/png' }))
  fora.importar = vi.fn(async () => ({ generationId: 'gen-origem', url: BLOB }))
})

describe('trazerArteDoPostParaGaleria', () => {
  it('baixa a mídia do Zernio, registra na galeria e liga a arte ao post', async () => {
    const r = await trazer()
    expect(fora.baixar).toHaveBeenCalledWith(CDN)
    expect(fora.importar).toHaveBeenCalledWith(expect.objectContaining({ projectId: 5, origem: 'post-do-zernio:local-1#0' }))
    expect(r).toEqual({ generationId: 'gen-origem', url: BLOB, jaEstava: false })
    expect(banco.post).toMatchObject({ generationId: 'gen-origem', mediaUrls: [CDN], laterPostId: 'z1' })
  })

  it('slide de carrossel: traz o slide pedido e NÃO mexe na arte ligada ao post (que é a da capa)', async () => {
    banco.post = post({ mediaUrls: [CDN, 'https://media.zernio.com/temp/slide-2.png'], generationId: 'gen-capa' })
    await trazer(1)
    expect(fora.baixar).toHaveBeenCalledWith('https://media.zernio.com/temp/slide-2.png')
    expect(banco.post.generationId).toBe('gen-capa')
  })

  it('a mídia já é uma arte da galeria (melhoria anterior): reaproveita, sem baixar nem duplicar', async () => {
    banco.post = post({ mediaUrls: [BLOB] })
    banco.generations = [{ id: 'gen-melhorada', resultUrl: BLOB }]
    expect(await trazer()).toEqual({ generationId: 'gen-melhorada', url: BLOB, jaEstava: true })
    expect(fora.baixar).not.toHaveBeenCalled()
    expect(fora.importar).not.toHaveBeenCalled()
  })

  it('recusa ANTES de baixar: a minutos de publicar, já publicado, vídeo, slide que não existe, post que não é do Zernio', async () => {
    const casos: Array<[Record<string, unknown>, number | undefined, string]> = [
      [{ status: 'SCHEDULED', lateStatus: 'scheduled', scheduledDatetime: new Date(Date.now() + 2 * 60_000) }, 0, 'POST_CONGELADO'],
      [{ status: 'POSTED', lateStatus: 'published' }, 0, 'POST_NAO_MELHORAVEL'],
      [{ mediaUrls: ['https://media.zernio.com/temp/reel.mp4'] }, 0, 'POST_DE_VIDEO'],
      [{}, 3, 'SLIDE_INVALIDO'],
      [{ laterPostId: null, lateStatus: null }, 0, 'POST_NAO_ESTA_NO_ZERNIO'],
    ]
    for (const [extra, indice, code] of casos) {
      banco.post = post(extra)
      await expect(trazer(indice), code).rejects.toMatchObject({ code })
    }
    expect(fora.baixar).not.toHaveBeenCalled()
    expect(fora.importar).not.toHaveBeenCalled()
  })
})
