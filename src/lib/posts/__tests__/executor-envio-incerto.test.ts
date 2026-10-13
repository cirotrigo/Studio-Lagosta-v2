/**
 * Envio incerto (o post foi criado no Zernio, mas o `laterPostId` não foi
 * gravado): a nova tentativa não é sucesso e não agenda outra — reenviar
 * arriscaria publicação dupla. A reconciliação dos posts travados decide.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const b = vi.hoisted(() => ({ retryUpdates: [] as any[], agendados: 0 }))

vi.mock('@/lib/db', () => ({
  db: {
    postRetry: {
      findMany: async () => [{ id: 'r1', postId: 'p1', attemptNumber: 1, post: { id: 'p1', Project: { id: 8, name: 'P' } } }],
      update: async ({ data }: any) => void b.retryUpdates.push(data),
    },
  },
}))
vi.mock('../failure-handler', () => ({ NOTIFY_AFTER_ATTEMPT: 1, notifyPublishFailure: vi.fn() }))
vi.mock('../render-post-art', () => ({ renderPostArt: vi.fn() }))
vi.mock('../scheduler', () => ({
  PostScheduler: class {
    sendToLater = vi.fn(async () => ({ success: false, incerto: true, laterPostId: 'z1' }))
    scheduleRetry = vi.fn(async () => {
      b.agendados++
    })
  },
}))

import { PostExecutor } from '../executor'
import { notifyPublishFailure } from '../failure-handler'

beforeEach(() => {
  b.retryUpdates = []
  b.agendados = 0
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('executeRetries: envio incerto', () => {
  it('não marca a tentativa como sucesso, não agenda outra, não avisa', async () => {
    await new PostExecutor().executeRetries()
    expect(b.retryUpdates.at(-1)).toMatchObject({ status: 'FAILED' })
    expect(b.retryUpdates.some((d) => d.status === 'SUCCESS')).toBe(false)
    expect(b.agendados).toBe(0)
    expect(notifyPublishFailure).not.toHaveBeenCalled()
  })
})
