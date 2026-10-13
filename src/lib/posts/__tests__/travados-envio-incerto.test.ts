/**
 * Varredura de posts travados × envio incerto: POSTING sem `laterPostId` não
 * significa "nunca chegou ao Zernio" quando há o log `persistenciaIncerta`.
 * Nesse caso o `laterPostId` do log volta para a linha (CAS) e o status-sync
 * assume — nada de FAILED nem reenvio automático. Sem o log, como antes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const b = vi.hoisted(() => ({
  travados: [] as any[],
  logs: [] as any[],
  updateMany: vi.fn(),
  logsCriados: [] as any[],
}))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findMany: async ({ where }: any) =>
        where.status === 'POSTING' && where.laterPostId === null ? b.travados : [],
      updateMany: b.updateMany,
    },
    postLog: {
      findMany: async ({ where }: any) => b.logs.filter((l) => where.postId.in.includes(l.postId) && l.event === where.event),
      create: async ({ data }: any) => void b.logsCriados.push(data),
    },
  },
}))
vi.mock('../failure-handler', () => ({ handlePublishFailure: vi.fn(), notifyPublishFailure: vi.fn(), RETRY_DELAY_MS: 60_000 }))
const envio = vi.hoisted(() => ({ sendToLater: vi.fn(), createPost: vi.fn() }))
vi.mock('../later-scheduler', () => ({ LaterPostScheduler: class { sendToLater = envio.sendToLater; createPost = envio.createPost } }))

import { PostScheduler } from '../scheduler'
import { handlePublishFailure } from '../failure-handler'

beforeEach(() => {
  vi.clearAllMocks()
  b.travados = [{ id: 'p1', status: 'POSTING', laterPostId: null }]
  b.logs = []
  b.logsCriados = []
  b.updateMany.mockResolvedValue({ count: 1 })
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('checkStuckPosts: envio incerto', () => {
  it('com o log persistenciaIncerta: devolve o laterPostId (CAS), sem FAILED, sem aviso, sem reenvio', async () => {
    b.logs = [{ postId: 'p1', event: 'SENT', metadata: { laterPostId: 'z1', persistenciaIncerta: true } }]
    await new PostScheduler().checkStuckPosts()
    expect(b.updateMany).toHaveBeenCalledTimes(1)
    expect(b.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', laterPostId: null, status: 'POSTING' },
      data: { laterPostId: 'z1', lastSyncAt: null },
    })
    expect(handlePublishFailure).not.toHaveBeenCalled()
    expect(envio.sendToLater).not.toHaveBeenCalled()
    expect(envio.createPost).not.toHaveBeenCalled()
    expect(b.logsCriados.some((l) => l.event === 'FAILED')).toBe(false)
  })

  it('log SENT comum (sem o marcador) não conta', async () => {
    b.logs = [{ postId: 'p1', event: 'SENT', metadata: { laterPostId: 'z1' } }]
    await new PostScheduler().checkStuckPosts()
    expect(b.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }))
    expect(handlePublishFailure).toHaveBeenCalledWith('p1', expect.any(Error))
  })

  it('sem o marcador: FAILED + handlePublishFailure, como antes', async () => {
    await new PostScheduler().checkStuckPosts()
    expect(b.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['p1'] } }, data: expect.objectContaining({ status: 'FAILED' }) }),
    )
    expect(handlePublishFailure).toHaveBeenCalledTimes(1)
  })
})
