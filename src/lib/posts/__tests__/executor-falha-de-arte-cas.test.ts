/**
 * B1d — checkpoint f (arbitragem do Codex): o executor marca FAILED por falha de arte só se a linha AINDA é o
 * RENDER_FAILED que ele leu. A leitura do laço pode ter minutos; se a recuperação reabriu o post nesse meio-tempo
 * (RENDER_FAILED → PENDING), marcar FAILED mataria a correção da pessoa e dispararia um aviso falso.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ post: null as any, lido: null as any, logs: [] as unknown[], avisos: [] as unknown[] }))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      // só a consulta da janela de publicação devolve o post; o snapshot é o que o laço leu
      findMany: async (args: any) => (args.where?.scheduledDatetime?.gte && args.where?.scheduledDatetime?.lte && !args.where?.OR ? [banco.lido] : []),
      update: async ({ data }: any) => {
        banco.post = { ...banco.post, ...data }
        return banco.post
      },
      updateMany: async ({ where, data }: any) => {
        const p = banco.post
        const igual = Object.entries(where).every(([k, v]) => (v === null ? p[k] == null : p[k] === v))
        if (!igual) return { count: 0 }
        banco.post = { ...p, ...data }
        return { count: 1 }
      },
    },
    postLog: {
      findFirst: async () => null,
      create: async (a: unknown) => void banco.logs.push(a),
    },
    postRetry: { findMany: async () => [] },
  },
}))
vi.mock('../failure-handler', () => ({ NOTIFY_AFTER_ATTEMPT: 3, notifyPublishFailure: async (...a: unknown[]) => void banco.avisos.push(a) }))
vi.mock('../render-post-art', () => ({ renderPostArt: vi.fn() }))
vi.mock('../scheduler', () => ({ PostScheduler: class { sendToLater = vi.fn() } }))

import { PostExecutor } from '../executor'
import { ErroRenderSemantico } from '../erro-render-semantico'

const envelope = new ErroRenderSemantico('CONTRATO_INVALIDO', 'p1', []).paraRenderError()

beforeEach(() => {
  banco.logs = []
  banco.avisos = []
  const linha = {
    id: 'post-1', status: 'SCHEDULED', laterPostId: null, postType: 'STORY', pageId: 'p1', publishType: 'DIRECT',
    scheduledDatetime: new Date(), renderStatus: 'RENDER_FAILED', renderError: envelope, renderAttempts: 1, nextRenderAt: null,
    mediaUrls: [], videoDaPagina: false, slotValues: { _slots: { manchete: 'X' } }, Project: { id: 8, name: 'P' },
  }
  banco.post = { ...linha }
  banco.lido = { ...linha }
})

describe('executor: falha de arte com CAS', () => {
  it('Q. recuperado depois da leitura (PENDING, sem envelope): não marca FAILED nem avisa', async () => {
    banco.post = { ...banco.post, renderStatus: 'PENDING', renderError: null, renderAttempts: 0 }
    await new PostExecutor().executeScheduledPosts()
    expect(banco.post.status).toBe('SCHEDULED')
    expect(banco.logs).toEqual([])
    expect(banco.avisos).toEqual([])
  })

  it('R. ainda é a falha lida: marca FAILED e avisa uma vez, como hoje', async () => {
    await new PostExecutor().executeScheduledPosts()
    expect(banco.post.status).toBe('FAILED')
    expect(banco.logs).toHaveLength(1)
    expect(banco.avisos).toHaveLength(1)
  })

  it('ganhou laterPostId no meio (entregue por outra via): não marca FAILED', async () => {
    banco.post = { ...banco.post, laterPostId: 'z1' }
    await new PostExecutor().executeScheduledPosts()
    expect(banco.post.status).toBe('SCHEDULED')
  })
})
