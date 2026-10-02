/**
 * O render de post grava `mediaUrls: [png]`. Post cuja mídia é um vídeo (ou um
 * carrossel) e que chegou a PENDING por outro caminho — o PUT troca a mídia sem
 * mexer em `renderStatus`, e voltar para rascunho pede render — não pode ter a
 * mídia apagada por ele (2ª revisão do Codex, 02/10/2026).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  post: null as any,
  renders: 0,
  /** Roda no meio do render — é o PUT do post trocando a mídia. */
  duranteORender: null as null | (() => void),
}))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findUnique: async () => (banco.post ? { mediaUrls: banco.post.mediaUrls } : null),
      updateMany: async ({ where, data }: { where: { renderStatus?: string; mediaUrls?: { equals: string[] } }; data: Record<string, unknown> }) => {
        if (!banco.post) return { count: 0 }
        if (where.renderStatus && banco.post.renderStatus !== where.renderStatus) return { count: 0 }
        if (where.mediaUrls && JSON.stringify(where.mediaUrls.equals) !== JSON.stringify(banco.post.mediaUrls)) return { count: 0 }
        banco.post = { ...banco.post, ...data }
        return { count: 1 }
      },
    },
  },
}))
vi.mock('@/lib/posts/story-renderer', () => ({
  renderStoryImage: async () => {
    banco.renders++
    banco.duranteORender?.()
    return { url: 'https://blob.test/posts/rendered/p-1.png', aplicouSlots: true, copyDaPagina: {} }
  },
}))
vi.mock('../ensure-post-generation', () => ({ ensurePostGeneration: async () => undefined }))
vi.mock('../../../../prisma/generated/client', () => ({
  RenderStatus: { PENDING: 'PENDING', RENDERING: 'RENDERING', RENDERED: 'RENDERED', RENDER_FAILED: 'RENDER_FAILED', NOT_NEEDED: 'NOT_NEEDED' },
}))

import { renderPostArt } from '../render-post-art'

const pedido = { id: 'post-1', pageId: 'p1', slotValues: null, renderAttempts: 0 }

beforeEach(() => {
  banco.renders = 0
  banco.duranteORender = null
})

describe('renderPostArt não apaga mídia que o render da página não cobre', () => {
  it('story com MP4 em PENDING: sai da fila como NOT_NEEDED, o MP4 fica e nada é renderizado', async () => {
    banco.post = { renderStatus: 'PENDING', mediaUrls: ['https://blob.test/video-exports/u/1-story.mp4'] }
    const r = await renderPostArt(pedido)
    expect(r).toEqual({ ok: false, motivo: 'midia-propria' })
    expect(banco.post.mediaUrls).toEqual(['https://blob.test/video-exports/u/1-story.mp4'])
    expect(banco.post.renderStatus).toBe('NOT_NEEDED')
    expect(banco.renders).toBe(0)
  })

  it('carrossel em PENDING: as mídias ficam todas', async () => {
    const midias = ['https://blob.test/a.jpg', 'https://blob.test/b.jpg', 'https://blob.test/c.jpg']
    banco.post = { renderStatus: 'PENDING', mediaUrls: midias }
    expect((await renderPostArt(pedido)).motivo).toBe('midia-propria')
    expect(banco.post.mediaUrls).toEqual(midias)
  })

  it('a mídia vira MP4 DURANTE o render: o PNG não entra por cima, e o post volta à fila para a guarda decidir', async () => {
    const mp4 = ['https://blob.test/video-exports/u/1-story.mp4']
    banco.post = { renderStatus: 'PENDING', mediaUrls: ['https://blob.test/posts/rendered/antiga.png'] }
    banco.duranteORender = () => {
      banco.post = { ...banco.post, mediaUrls: mp4 }
    }
    expect(await renderPostArt(pedido)).toEqual({ ok: false, motivo: 'invalidado' })
    expect(banco.post.mediaUrls).toEqual(mp4)
    expect(banco.post.renderStatus).toBe('PENDING')

    // Rodada seguinte: a guarda tira o post da fila, sem renderizar de novo.
    banco.duranteORender = null
    expect((await renderPostArt(pedido)).motivo).toBe('midia-propria')
    expect(banco.post.mediaUrls).toEqual(mp4)
    expect(banco.post.renderStatus).toBe('NOT_NEEDED')
    expect(banco.renders).toBe(1)
  })

  it('controle: imagem única (ou nenhuma) renderiza como sempre', async () => {
    for (const mediaUrls of [[], ['https://blob.test/posts/rendered/antiga.png']]) {
      banco.post = { renderStatus: 'PENDING', mediaUrls }
      const r = await renderPostArt(pedido)
      expect(r.ok).toBe(true)
      expect(banco.post.mediaUrls).toEqual(['https://blob.test/posts/rendered/p-1.png'])
      expect(banco.post.renderStatus).toBe('RENDERED')
    }
    expect(banco.renders).toBe(2)
  })
})
