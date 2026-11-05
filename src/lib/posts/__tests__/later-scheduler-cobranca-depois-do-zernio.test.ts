/**
 * A cobrança do post vem DEPOIS de gravar o `laterPostId`: com o post já no
 * Zernio, nenhuma falha da cobrança pode marcá-lo FAILED sem `laterPostId`
 * (o retry o reenviaria — publicação dupla). A falha da cobrança vira log, não
 * falha do post. Falha ANTES do Zernio segue FAILED + `handlePublishFailure`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => post),
    },
    user: { findUnique: vi.fn(async () => ({ clerkId: 'user_1' })) },
    postLog: { create: vi.fn(async () => ({})) },
    $queryRaw: vi.fn(async () => [{ mediaUrls: post.mediaUrls, slotValues: null }]),
  },
}))
vi.mock('@/lib/credits/deduct', () => ({ deductCreditsForFeature: vi.fn(), validateCreditsForFeature: vi.fn() }))
vi.mock('@vercel/blob', () => ({ put: vi.fn() }))
vi.mock('@/lib/posts/verification/tag-generator', () => ({ generateVerificationTag: () => 'TAG' }))
const zernio = vi.hoisted(() => ({ createPost: vi.fn(), createPostWithMedia: vi.fn() }))
vi.mock('@/lib/later', () => ({ getLaterClient: () => zernio }))
vi.mock('@/lib/images/auto-crop', () => ({ cropToInstagramFeed: vi.fn() }))
vi.mock('../failure-handler', () => ({ handlePublishFailure: vi.fn() }))
vi.mock('../ensure-post-generation', () => ({ ensurePostGeneration: vi.fn(async () => null) }))

import { LaterPostScheduler } from '../later-scheduler'
import { db } from '@/lib/db'
import { deductCreditsForFeature, validateCreditsForFeature } from '@/lib/credits/deduct'
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

/**
 * O post já foi criado no Zernio e a gravação do `laterPostId` falha: é
 * INCERTO, não FAILED. Marcar FAILED sem `laterPostId` mandaria o retry
 * reenviar (publicação dupla).
 */
describe('sendToLater: gravação incerta depois do Zernio', () => {
  it('update falha, a gravação mínima (CAS) salva o laterPostId: segue, sem FAILED', async () => {
    vi.mocked(db.socialPost.update).mockRejectedValueOnce(new Error('conexão caiu'))
    vi.mocked(deductCreditsForFeature).mockResolvedValueOnce({ creditsRemaining: 0 })
    const r = await new LaterPostScheduler().sendToLater('p1')
    expect(r).toEqual({ success: true, laterPostId: 'z1' })
    expect(db.socialPost.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', laterPostId: null }, data: { laterPostId: 'z1' } })
    expect(atualizacoes().some((d) => d.status === 'FAILED')).toBe(false)
    expect(handlePublishFailure).not.toHaveBeenCalled()
  })

  it('as duas gravações falham: resultado incerto, sem FAILED, sem aviso, sem reenviar', async () => {
    vi.mocked(db.socialPost.update).mockRejectedValueOnce(new Error('conexão caiu'))
    vi.mocked(db.socialPost.updateMany).mockRejectedValueOnce(new Error('conexão caiu de novo'))
    const r = await new LaterPostScheduler().sendToLater('p1')
    expect(r).toEqual({ success: false, incerto: true, laterPostId: 'z1' })
    expect(atualizacoes().some((d) => d.status === 'FAILED')).toBe(false)
    expect(handlePublishFailure).not.toHaveBeenCalled()
    expect(zernio.createPost).toHaveBeenCalledTimes(1)
    expect(db.postLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ postId: 'p1', metadata: { laterPostId: 'z1', persistenciaIncerta: true } }),
    })
  })
})

/** Gravado o `laterPostId`, nada depois (log, cobrança) muda o estado do post. */
describe('sendToLater: depois do laterPostId gravado, falha nenhuma vira FAILED', () => {
  it('o log final lança: sucesso, sem FAILED, sem handlePublishFailure', async () => {
    vi.mocked(deductCreditsForFeature).mockResolvedValueOnce({ creditsRemaining: 0 })
    vi.mocked(db.postLog.create).mockRejectedValueOnce(new Error('log caiu'))
    const r = await new LaterPostScheduler().sendToLater('p1')
    expect(r).toEqual({ success: true, laterPostId: 'z1' })
    expect(atualizacoes()).toEqual([expect.objectContaining({ laterPostId: 'z1', status: 'SCHEDULED' })])
    expect(handlePublishFailure).not.toHaveBeenCalled()
  })

  it('a cobrança e os logs lançam: sucesso, sem FAILED, sem handlePublishFailure', async () => {
    vi.mocked(deductCreditsForFeature).mockRejectedValueOnce(new Error('banco caiu'))
    vi.mocked(db.postLog.create).mockRejectedValue(new Error('log caiu'))
    try {
      const r = await new LaterPostScheduler().sendToLater('p1')
      expect(r).toEqual({ success: true, laterPostId: 'z1' })
      expect(atualizacoes().some((d) => d.status === 'FAILED')).toBe(false)
      expect(handlePublishFailure).not.toHaveBeenCalled()
    } finally {
      vi.mocked(db.postLog.create).mockReset().mockResolvedValue({} as never)
    }
  })
})

/**
 * Com `CREDITOS_APLICADOS=true`, saldo zero volta a impedir a publicação: a
 * validação vem ANTES do Zernio (nada foi enviado ainda), e a recusa segue o
 * caminho de falha de antes — FAILED + `handlePublishFailure`, que trata
 * crédito insuficiente como não-retentável. Desligada, nenhuma checagem.
 */
describe('sendToLater: validação de saldo antes do Zernio (flag ligada)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('flag ligada, saldo 0: não chama o Zernio, FAILED + handlePublishFailure com o erro de crédito', async () => {
    vi.stubEnv('CREDITOS_APLICADOS', 'true')
    vi.mocked(validateCreditsForFeature).mockRejectedValueOnce(new InsufficientCreditsError(3, 0))
    await expect(new LaterPostScheduler().sendToLater('p1')).rejects.toBeInstanceOf(InsufficientCreditsError)
    expect(zernio.createPost).not.toHaveBeenCalled()
    expect(atualizacoes()).toEqual([expect.objectContaining({ status: 'FAILED' })])
    expect(handlePublishFailure).toHaveBeenCalledTimes(1)
    expect(vi.mocked(handlePublishFailure).mock.calls[0][1]).toBeInstanceOf(InsufficientCreditsError)
    expect(deductCreditsForFeature).not.toHaveBeenCalled()
  })

  it('flag ligada, saldo ok: valida, publica e cobra depois do laterPostId', async () => {
    vi.stubEnv('CREDITOS_APLICADOS', 'true')
    vi.mocked(validateCreditsForFeature).mockResolvedValueOnce({ available: 10, needed: 3 })
    vi.mocked(deductCreditsForFeature).mockResolvedValueOnce({ creditsRemaining: 7 })
    const r = await new LaterPostScheduler().sendToLater('p1')
    expect(r).toEqual({ success: true, laterPostId: 'z1' })
    expect(validateCreditsForFeature).toHaveBeenCalledWith('user_1', 'social_media_post', 1, { organizationId: undefined })
    expect(vi.mocked(validateCreditsForFeature).mock.invocationCallOrder[0]).toBeLessThan(zernio.createPost.mock.invocationCallOrder[0])
    expect(vi.mocked(db.socialPost.update).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deductCreditsForFeature).mock.invocationCallOrder[0],
    )
  })

  it('flag desligada: nenhuma validação, publica', async () => {
    vi.stubEnv('CREDITOS_APLICADOS', '')
    const r = await new LaterPostScheduler().sendToLater('p1')
    expect(r).toEqual({ success: true, laterPostId: 'z1' })
    expect(validateCreditsForFeature).not.toHaveBeenCalled()
  })
})
