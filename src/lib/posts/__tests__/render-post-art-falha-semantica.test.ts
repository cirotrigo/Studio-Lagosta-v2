/**
 * B1d — checkpoint d no `renderPostArt`: a falha SEMÂNTICA (o contrato novo não casa com a página no momento do
 * render) é determinística e TERMINAL na primeira tentativa — RENDER_FAILED, uma tentativa contabilizada, sem
 * backoff, com o envelope seguro em `renderError`. Erro comum (fonte, Canvas, Blob) segue o retry de sempre.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ post: null as any, falha: null as null | (() => Error), chamada: null as unknown, leituras: 0, quebraLeitura: 0, duranteRender: null as null | (() => void) }))
const igual = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b)

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findUnique: async () => {
        banco.leituras++
        if (banco.leituras === banco.quebraLeitura) throw new Error('timeout')
        return banco.post
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!banco.post) return { count: 0 }
        for (const k of ['renderStatus', 'nextRenderAt']) if (k in where && !igual(banco.post[k], where[k])) return { count: 0 }
        banco.post = { ...banco.post, ...data }
        return { count: 1 }
      },
    },
  },
}))
vi.mock('@/lib/posts/story-renderer', () => ({
  renderStoryImage: async (...args: unknown[]) => {
    banco.chamada = args
    banco.duranteRender?.()
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
  banco.post = { pageId: 'p1', slotValues: null, renderStatus: 'PENDING', mediaUrls: [], renderAttempts: 0, nextRenderAt: null }
  banco.chamada = null
  banco.leituras = 0
  banco.quebraLeitura = 0
  banco.duranteRender = null
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

    banco.post = { ...banco.post, renderStatus: 'PENDING', renderAttempts: 2 } // a contagem que vale é a da linha
    await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: null, renderAttempts: 2 })
    expect(banco.post).toMatchObject({ renderStatus: 'RENDER_FAILED', renderAttempts: 3, renderError: 'Blob upload failed: 503' })
    expect(lerErroRenderSemantico(banco.post.renderError)).toBeNull()
  })
})

describe('Codex (rodada 2): o pedido desenhado é o da linha RESERVADA, não o que o cron leu antes', () => {
  it('editado entre a leitura do cron e a reserva: renderiza o pageId e o slotValues atuais', async () => {
    banco.post = { ...banco.post, pageId: 'p2', slotValues: { _slots: { manchete: 'Novo' } } }
    banco.falha = () => new ErroRenderSemantico('CONTRATO_INVALIDO', 'p1', erros)
    await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: { _slots: { manchete: 'Velho' } }, renderAttempts: 0 })
    expect(banco.chamada).toEqual(['p2', 'post-1', { _slots: { manchete: 'Novo' } }])
  })
})

describe('Codex (rodada 3): cada gravação é da RESERVA desta execução', () => {
  it('leitura do pedido falha depois da reserva: a linha volta à fila (não fica presa em RENDERING)', async () => {
    banco.quebraLeitura = 2 // 1ª = guarda da mídia; 2ª = o pedido, já reservado
    const r = await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: null, renderAttempts: 0 })
    expect(r).toMatchObject({ ok: false, motivo: 'falhou' })
    expect(banco.post).toMatchObject({ renderStatus: 'PENDING', renderAttempts: 1 })
  })

  it('edição + nova reserva de OUTRA execução durante o render: a falha antiga não encerra o pedido novo', async () => {
    const outra = new Date(Date.UTC(2001, 0, 1))
    banco.duranteRender = () => {
      banco.post = { ...banco.post, slotValues: { _slots: { manchete: 'Novo' } }, renderStatus: 'RENDERING', nextRenderAt: outra, renderAttempts: 0 }
    }
    banco.falha = () => new ErroRenderSemantico('CONTRATO_INVALIDO', 'p1', erros)
    const r = await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: { _slots: { manchete: 'Velho' } }, renderAttempts: 0 })
    expect(r).toMatchObject({ ok: false, motivo: 'invalidado' })
    expect(banco.post).toMatchObject({ renderStatus: 'RENDERING', nextRenderAt: outra })
    expect(banco.post.renderError).toBeUndefined()
  })

  it('a contagem de tentativas é a da linha reservada (a edição zerou), não a lida antes', async () => {
    banco.falha = () => new Error('Blob upload failed: 503')
    await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: null, renderAttempts: 2 })
    expect(banco.post).toMatchObject({ renderStatus: 'PENDING', renderAttempts: 1 })
  })
})
