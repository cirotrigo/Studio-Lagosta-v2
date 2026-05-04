/**
 * Test the 404 handler added to PostExecutor.syncLateStatus.
 *
 * Background: Zernio deletes posts after they fail. Before this fix, syncLateStatus
 * silently swallowed 404 from `getPost`, so the local row stayed POSTING forever.
 * Now a 404 transitions the row to FAILED with a clear error message and a PostLog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdate = vi.fn()
const mockFindMany = vi.fn()
const mockPostLogCreate = vi.fn()
const mockGetPost = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    postLog: {
      create: (...args: unknown[]) => mockPostLogCreate(...args),
    },
  },
}))

vi.mock('@/lib/later/client', () => ({
  getLaterClient: () => ({
    getPost: (...args: unknown[]) => mockGetPost(...args),
  }),
}))

// Real LaterNotFoundError so `instanceof` works.
import { LaterNotFoundError } from '@/lib/later/errors'
import { PostExecutor } from '../executor'

describe('PostExecutor.syncLateStatus — 404 handler (Patch 1)', () => {
  beforeEach(() => {
    mockUpdate.mockReset()
    mockFindMany.mockReset()
    mockPostLogCreate.mockReset()
    mockGetPost.mockReset()
  })

  it('marks POSTING posts FAILED when Zernio returns 404 (LaterNotFoundError)', async () => {
    const stuckPost = {
      id: 'local-post-1',
      laterPostId: 'zernio-deleted-1',
      status: 'POSTING',
      lastSyncAt: null,
    }
    mockFindMany.mockResolvedValue([stuckPost])
    mockGetPost.mockRejectedValue(new LaterNotFoundError('Post not found'))
    mockUpdate.mockResolvedValue({})
    mockPostLogCreate.mockResolvedValue({})

    const executor = new PostExecutor()
    const result = await executor.syncLateStatus()

    expect(mockGetPost).toHaveBeenCalledWith('zernio-deleted-1')

    const updateCall = mockUpdate.mock.calls.find(
      (call) => (call[0] as any).where?.id === 'local-post-1'
    )
    expect(updateCall, 'expected the FAILED transition update to be called').toBeDefined()
    const data = (updateCall![0] as any).data
    expect(data.status).toBe('FAILED')
    expect(data.errorMessage).toContain('não encontrado no Zernio (404)')
    expect(data.processingStartedAt).toBeNull()
    expect(data.failedAt).toBeInstanceOf(Date)

    const logCall = mockPostLogCreate.mock.calls[0]?.[0] as any
    expect(logCall?.data.event).toBe('FAILED')
    expect(logCall?.data.postId).toBe('local-post-1')

    expect(result.updated).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('marks SCHEDULED posts FAILED on 404 too', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'local-post-2',
        laterPostId: 'zernio-deleted-2',
        status: 'SCHEDULED',
        lastSyncAt: null,
      },
    ])
    mockGetPost.mockRejectedValue(new LaterNotFoundError('Post not found'))
    mockUpdate.mockResolvedValue({})
    mockPostLogCreate.mockResolvedValue({})

    const executor = new PostExecutor()
    const result = await executor.syncLateStatus()

    expect((mockUpdate.mock.calls[0]?.[0] as any).data.status).toBe('FAILED')
    expect(result.updated).toBe(1)
  })

  it('detects 404 by statusCode property (not just instanceof)', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'local-post-3',
        laterPostId: 'zernio-x',
        status: 'POSTING',
        lastSyncAt: null,
      },
    ])
    // A bare object that looks like an HTTP error but isn't a LaterNotFoundError.
    const fakeError = Object.assign(new Error('Not found'), { statusCode: 404 })
    mockGetPost.mockRejectedValue(fakeError)
    mockUpdate.mockResolvedValue({})
    mockPostLogCreate.mockResolvedValue({})

    const executor = new PostExecutor()
    await executor.syncLateStatus()

    expect((mockUpdate.mock.calls[0]?.[0] as any).data.status).toBe('FAILED')
  })

  it('does NOT mark FAILED on non-404 errors (legacy behavior preserved)', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'local-post-4',
        laterPostId: 'zernio-y',
        status: 'POSTING',
        lastSyncAt: null,
      },
    ])
    const serverError = Object.assign(new Error('Internal error'), { statusCode: 500 })
    mockGetPost.mockRejectedValue(serverError)
    mockUpdate.mockResolvedValue({})

    const executor = new PostExecutor()
    const result = await executor.syncLateStatus()

    // No FAILED update should happen
    const failedUpdates = mockUpdate.mock.calls.filter(
      (call) => (call[0] as any).data?.status === 'FAILED'
    )
    expect(failedUpdates).toHaveLength(0)
    // Legacy counter still increments
    expect(result.failed).toBe(1)
    expect(result.updated).toBe(0)
  })

  it('does NOT touch posts in non-recoverable states even on 404 (only POSTING/SCHEDULED)', async () => {
    // (This case is unlikely to come from the findMany filter, but defensive: belt and suspenders)
    mockFindMany.mockResolvedValue([
      {
        id: 'local-post-5',
        laterPostId: 'zernio-z',
        status: 'POSTED', // shouldn't be in the result set, but if it is, don't clobber it
        lastSyncAt: null,
      },
    ])
    mockGetPost.mockRejectedValue(new LaterNotFoundError('Post not found'))
    mockUpdate.mockResolvedValue({})

    const executor = new PostExecutor()
    await executor.syncLateStatus()

    const failedUpdates = mockUpdate.mock.calls.filter(
      (call) => (call[0] as any).data?.status === 'FAILED'
    )
    expect(failedUpdates).toHaveLength(0)
  })
})
