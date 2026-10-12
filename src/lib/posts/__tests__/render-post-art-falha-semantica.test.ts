/**
 * B1d — checkpoint d no `renderPostArt`: a falha SEMÂNTICA (o contrato novo não casa com a página no momento do
 * render) é determinística e TERMINAL na primeira tentativa — RENDER_FAILED, uma tentativa contabilizada, sem
 * backoff, com o envelope seguro em `renderError`. Erro comum (fonte, Canvas, Blob) segue o retry de sempre.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ post: null as any, falha: null as null | (() => Error) }))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findUnique: async () => (banco.post ? { mediaUrls: banco.post.mediaUrls } : null),
      updateMany: async ({ where, data }: { where: { renderStatus?: string }; data: Record<string, unknown> }) => {
        if (!banco.post) return { count: 0 }
        if (where.renderStatus && banco.post.renderStatus !== where.renderStatus) return { count: 0 }
        banco.post = { ...banco.post, ...data }
        return { count: 1 }
      },
    },
  },
}))
vi.mock('@/lib/posts/story-renderer', () => ({
  renderStoryImage: async () => {
    throw banco.falha!()
  },
}))
vi.mock('../ensure-post-generation', () => ({ ensurePostGeneration: async () => undefined }))
vi.mock('../../../../prisma/generated/client', () => ({
  RenderStatus: { PENDING: 'PENDING', RENDERING: 'RENDERING', RENDERED: 'RENDERED', RENDER_FAILED: 'RENDER_FAILED', NOT_NEEDED: 'NOT_NEEDED' },
}))

import { renderPostArt } from '../render-post-art'
import { ErroRenderSemantico, lerErroRenderSemantico } from '../erro-render-semantico'

const erros = [{ codigo: 'ALVO_NAO_RESOLVIDO', origem: { tipo: 'slotId', chave: 'manchete' }, erro: { codigo: 'SLOT_NAO_ENCONTRADO' } }] as never

beforeEach(() => {
  banco.post = { renderStatus: 'PENDING', mediaUrls: [], renderAttempts: 0, nextRenderAt: null }
})

describe('H. falha semântica: terminal na primeira tentativa', () => {
  it('RENDER_FAILED, uma tentativa, envelope seguro, sem backoff', async () => {
    banco.falha = () => new ErroRenderSemantico('CONTRATO_INVALIDO', 'p1', erros)
    const r = await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: { _slots: { manchete: 'X' } }, renderAttempts: 0 })
    expect(r).toMatchObject({ ok: false, motivo: 'falha-semantica' })
    expect(banco.post.renderStatus).toBe('RENDER_FAILED')
    expect(banco.post.renderAttempts).toBe(1)
    expect(banco.post.nextRenderAt).toBeNull()
    expect(lerErroRenderSemantico(banco.post.renderError)).toMatchObject({ motivo: 'CONTRATO_INVALIDO', pageId: 'p1', erros })
    expect(lerErroRenderSemantico(r.erro)).not.toBeNull()
  })

  it('mesmo com tentativas anteriores de erro comum, a semântica não espera a terceira', async () => {
    banco.post.renderAttempts = 1
    banco.falha = () => new ErroRenderSemantico('PAGINA_DE_CONTEUDO', 'p1')
    await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: { _slots: {} }, renderAttempts: 1 })
    expect(banco.post).toMatchObject({ renderStatus: 'RENDER_FAILED', renderAttempts: 2 })
  })
})

describe('I. erro comum (fonte/Blob/canvas): o retry de sempre', () => {
  it('1ª e 2ª tentativas: PENDING com backoff; 3ª: RENDER_FAILED com a mensagem', async () => {
    banco.falha = () => new Error('Blob upload failed: 503')
    const r1 = await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: null, renderAttempts: 0 })
    expect(r1).toEqual({ ok: false, motivo: 'falhou', erro: 'Blob upload failed: 503' })
    expect(banco.post).toMatchObject({ renderStatus: 'PENDING', renderAttempts: 1, renderError: 'Blob upload failed: 503' })
    expect(banco.post.nextRenderAt.getTime()).toBeGreaterThan(Date.now())

    banco.post = { ...banco.post, renderStatus: 'PENDING' }
    await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: null, renderAttempts: 2 })
    expect(banco.post).toMatchObject({ renderStatus: 'RENDER_FAILED', renderAttempts: 3, renderError: 'Blob upload failed: 503' })
    expect(lerErroRenderSemantico(banco.post.renderError)).toBeNull()
  })
})
