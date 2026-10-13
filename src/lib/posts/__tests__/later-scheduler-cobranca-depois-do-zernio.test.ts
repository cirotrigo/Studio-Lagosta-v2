/**
 * A cobrança do post vem DEPOIS de gravar o `laterPostId`: com o post já no
 * Zernio, nenhuma falha da cobrança pode marcá-lo FAILED sem `laterPostId`
 * (o retry o reenviaria — publicação dupla). A falha da cobrança vira log, não
 * falha do post. Falha ANTES do Zernio segue FAILED + `handlePublishFailure`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = {
  id: 'p1',
  projectId: 8,
  userId: 'u1',
  status: 'POSTING',
  postType: 'STORY',
  publishType: 'DIRECT',
  scheduleType: 'IMMEDIATE',
  caption: 'c',
  slotValues: null,
  mediaUrls: ['https://x.public.blob.vercel-storage.com/a.png'],
  Project: { id: 8, name: 'P', laterAccountId: 'acc1', laterLinkedinAccountId: null, organizationProjects: [] },
}

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      update: vi.fn(async ({ data }: any) => ({ id: 'p1', ...data })),
      findUnique: vi.fn(async () => post),
    },
    user: { findUnique: vi.fn(async () => ({ clerkId: 'user_1' })) },
    postLog: { create: vi.fn(async () => ({})) },
    $queryRaw: vi.fn(async () => [{ mediaUrls: post.mediaUrls, slotValues: null }]),
  },
}))
vi.mock('@/lib/credits/deduct', () => ({ deductCreditsForFeature: vi.fn() }))
vi.mock('@vercel/blob', () => ({ put: vi.fn() }))
vi.mock('@/lib/posts/verification/tag-generator', () => ({ generateVerificationTag: () => 'TAG' }))
const zernio = vi.hoisted(() => ({ createPost: vi.fn(), createPostWithMedia: vi.fn() }))
vi.mock('@/lib/later', () => ({ getLaterClient: () => zernio }))
vi.mock('@/lib/images/auto-crop', () => ({ cropToInstagramFeed: vi.fn() }))
vi.mock('../failure-handler', () => ({ handlePublishFailure: vi.fn() }))
vi.mock('../ensure-post-generation', () => ({ ensurePostGeneration: vi.fn(async () => null) }))

import { LaterPostScheduler } from '../later-scheduler'
import { db } from '@/lib/db'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { handlePublishFailure } from '../failure-handler'

const atualizacoes = () => vi.mocked(db.socialPost.update).mock.calls.map((c: any) => c[0].data)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  zernio.createPost.mockResolvedValue({ id: 'z1', status: 'scheduled' })
})

describe('sendToLater: cobrança depois de gravar o laterPostId', () => {
  it.each([
    ['saldo insuficiente', () => new InsufficientCreditsError(3, 0)],
    ['erro genérico', () => new Error('banco caiu')],
  ])('cobrança falha (%s): post salvo com laterPostId, não FAILED, sem handlePublishFailure', async (_n, erro) => {
    vi.mocked(deductCreditsForFeature).mockRejectedValueOnce(erro())
    const r = await new LaterPostScheduler().sendToLater('p1')
    expect(r).toEqual({ success: true, laterPostId: 'z1' })
    expect(atualizacoes()).toEqual([expect.objectContaining({ laterPostId: 'z1', status: 'SCHEDULED' })])
    expect(atualizacoes().some((d) => d.status === 'FAILED')).toBe(false)
    expect(handlePublishFailure).not.toHaveBeenCalled()
    expect(db.postLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ postId: 'p1', event: 'SENT', metadata: { cobrancaFalhou: true, laterPostId: 'z1' } }),
    })
  })

  it('o laterPostId é gravado ANTES da cobrança', async () => {
    vi.mocked(deductCreditsForFeature).mockResolvedValueOnce({ creditsRemaining: 0 })
    await new LaterPostScheduler().sendToLater('p1')
    const gravou = vi.mocked(db.socialPost.update).mock.invocationCallOrder[0]
    const cobrou = vi.mocked(deductCreditsForFeature).mock.invocationCallOrder[0]
    expect(gravou).toBeLessThan(cobrou)
    expect(deductCreditsForFeature).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: 'user_1', feature: 'social_media_post', details: expect.objectContaining({ laterPostId: 'z1' }) }),
    )
  })

  it('falha no Zernio: FAILED + handlePublishFailure uma vez, sem cobrança', async () => {
    zernio.createPost.mockRejectedValueOnce(new Error('Zernio fora'))
    await expect(new LaterPostScheduler().sendToLater('p1')).rejects.toThrow('Zernio fora')
    expect(atualizacoes()).toEqual([expect.objectContaining({ status: 'FAILED' })])
    expect(handlePublishFailure).toHaveBeenCalledTimes(1)
    expect(deductCreditsForFeature).not.toHaveBeenCalled()
  })
})
