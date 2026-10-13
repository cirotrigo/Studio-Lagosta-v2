/**
 * Saldo insuficiente na cobrança do vídeo não falha o job: o MP4 já existe.
 * O job conclui com `creditsDeducted: false` e a arte ganha o aviso
 * `cobrancaAviso` (por merge no banco, nunca espalhando o fieldValues lido).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const b = vi.hoisted(() => ({
  startedAt: null as Date | null,
  jobUpdates: [] as any[],
  patches: [] as any[],
  generationUpdates: [] as any[],
}))

vi.mock('@/lib/db', () => {
  const tx = {
    $queryRaw: async () => [{ status: 'PROCESSING', startedAt: b.startedAt }],
    generation: { update: async ({ data }: any) => b.generationUpdates.push(data) },
  }
  return {
    db: {
      videoProcessingJob: {
        updateMany: async ({ data }: any) => {
          if (data.startedAt) b.startedAt = data.startedAt
          b.jobUpdates.push(data)
          return { count: 1 }
        },
        findUnique: async () => ({
          id: 'j1',
          attempts: 1,
          creditsDeducted: false,
          generationId: 'g1',
          mp4ResultUrl: 'https://x.public.blob.vercel-storage.com/v.mp4',
          thumbnailUrl: null,
          designData: null,
          clerkUserId: 'user_1',
          projectId: 8,
          videoName: 'v',
          videoDuration: 5,
          status: 'PROCESSING',
          startedAt: b.startedAt,
        }),
      },
      generation: { findUnique: async () => null },
      $executeRaw: async () => 1,
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  }
})
vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: vi.fn() }))
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: {} }))
vi.mock('@/lib/credits/deduct', () => ({ deductCreditsForFeature: vi.fn() }))
vi.mock('@/lib/creatives/mesclar-field-values', () => ({
  mesclarFieldValuesDaArte: async (_tx: unknown, _id: string, patch: unknown) => b.patches.push(patch),
}))

import { processVideoJob } from '../process-video-job'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'

beforeEach(() => {
  b.startedAt = null
  b.jobUpdates = []
  b.patches = []
  b.generationUpdates = []
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('processVideoJob: cobrança recusada por saldo', () => {
  it('conclui o job sem cobrança, arte COMPLETED com o aviso, nada FAILED', async () => {
    vi.mocked(deductCreditsForFeature).mockRejectedValueOnce(new InsufficientCreditsError(10, 0))
    const r = await processVideoJob('j1')
    expect(r).toMatchObject({ outcome: 'completed', jobId: 'j1' })
    expect(b.jobUpdates.at(-1)).toMatchObject({ status: 'COMPLETED', creditsDeducted: false })
    expect(b.jobUpdates.some((d) => d.status === 'FAILED')).toBe(false)
    expect(b.generationUpdates).toEqual([expect.objectContaining({ status: 'COMPLETED' })])
    expect(b.patches).toEqual([expect.objectContaining({ cobrancaAviso: 'saldo-insuficiente' })])
  })

  it('cobrança que passa: creditsDeducted true e sem aviso', async () => {
    vi.mocked(deductCreditsForFeature).mockResolvedValueOnce({ creditsRemaining: 0 })
    const r = await processVideoJob('j1')
    expect(r).toMatchObject({ outcome: 'completed' })
    expect(b.jobUpdates.at(-1)).toMatchObject({ status: 'COMPLETED', creditsDeducted: true })
    expect(b.patches[0]).not.toHaveProperty('cobrancaAviso')
  })
})
