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
  naArte: [] as string[],
  presos: [] as any[],
  fieldValues: null as unknown,
  jobsConcluidos: [] as any[],
  falhas: [] as unknown[],
  falharMarca: false,
}))

vi.mock('@/lib/db', () => {
  const tx = {
    $queryRaw: async () => [{ status: 'PROCESSING', startedAt: b.startedAt }],
    generation: {
      update: async ({ data }: any) => b.generationUpdates.push(data),
      findUnique: async () => ({ fieldValues: b.fieldValues }),
    },
    videoProcessingJob: {
      updateMany: async ({ data }: any) => {
        b.jobsConcluidos.push(data)
        return { count: 1 }
      },
    },
    socialPost: { findFirst: async () => null },
  }
  return {
    db: {
      videoProcessingJob: {
        updateMany: async ({ data }: any) => {
          if (data.startedAt) b.startedAt = data.startedAt
          b.jobUpdates.push(data)
          return { count: 1 }
        },
        findMany: async () => b.presos,
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
      generation: { findUnique: async ({ select }: any) => (select?.fieldValues && b.presos.length ? { fieldValues: b.fieldValues } : null) },
      // O patch da arte vai como JSON nos valores do SQL (o merge `||` no banco).
      $executeRaw: async (_partes: TemplateStringsArray, ...valores: unknown[]) => {
        if (b.falharMarca && valores.some((v) => typeof v === 'string' && v.includes('cobrancaAviso'))) {
          throw new Error('conexão caiu ao gravar a marca')
        }
        b.naArte.push(...valores.filter((v): v is string => typeof v === 'string'))
        return 1
      },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  }
})
vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: vi.fn() }))
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: {} }))
vi.mock('@/lib/credits/deduct', () => ({ deductCreditsForFeature: vi.fn() }))
vi.mock('@/lib/video/etapas-do-video', async (original) => ({
  ...(await original<typeof import('@/lib/video/etapas-do-video')>()),
  finalizarFalhaDoVideo: async (_db: unknown, p: unknown) => {
    b.falhas.push(p)
    return true
  },
}))
vi.mock('@/lib/creatives/mesclar-field-values', () => ({
  mesclarFieldValuesDaArte: async (_tx: unknown, _id: string, patch: unknown) => b.patches.push(patch),
}))

import { processVideoJob, recuperarJobsDeVideoPresos } from '../process-video-job'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'

beforeEach(() => {
  b.startedAt = null
  b.jobUpdates = []
  b.patches = []
  b.generationUpdates = []
  b.naArte = []
  b.presos = []
  b.fieldValues = null
  b.jobsConcluidos = []
  b.falhas = []
  b.falharMarca = false
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
    // A marca durável sai na hora da recusa, antes da conclusão: a recuperação depende dela.
    expect(b.naArte.some((v) => v.includes('"cobrancaAviso":"saldo-insuficiente"'))).toBe(true)
  })

  it('a marca sem saldo não grava: interrompido (recuperável), nunca FAILED; a próxima tentativa conclui', async () => {
    b.falharMarca = true
    vi.mocked(deductCreditsForFeature).mockRejectedValueOnce(new InsufficientCreditsError(10, 0))
    const r = await processVideoJob('j1')
    expect(r).toMatchObject({ outcome: 'interrompido', jobId: 'j1' })
    expect(b.falhas).toHaveLength(0)
    expect(b.generationUpdates).toHaveLength(0)
    expect(b.jobUpdates.some((d) => d.status === 'FAILED' || d.status === 'COMPLETED')).toBe(false)

    b.falharMarca = false
    vi.mocked(deductCreditsForFeature).mockRejectedValueOnce(new InsufficientCreditsError(10, 0))
    const de_novo = await processVideoJob('j1')
    expect(de_novo).toMatchObject({ outcome: 'completed' })
    expect(b.naArte.some((v) => v.includes('"cobrancaAviso":"saldo-insuficiente"'))).toBe(true)
    expect(b.jobUpdates.at(-1)).toMatchObject({ status: 'COMPLETED', creditsDeducted: false })
  })

  it('cobrança que passa: creditsDeducted true e sem aviso', async () => {
    vi.mocked(deductCreditsForFeature).mockResolvedValueOnce({ creditsRemaining: 0 })
    const r = await processVideoJob('j1')
    expect(r).toMatchObject({ outcome: 'completed' })
    expect(b.jobUpdates.at(-1)).toMatchObject({ status: 'COMPLETED', creditsDeducted: true })
    expect(b.patches[0]).not.toHaveProperty('cobrancaAviso')
  })
})

/**
 * Queda depois do MP4 com a cobrança recusada por saldo: na última tentativa,
 * a marca `cobrancaAviso` (gravada na hora da recusa) faz a recuperação
 * concluir o vídeo pronto em vez de falhá-lo.
 */
describe('recuperarJobsDeVideoPresos: vídeo pronto sem saldo', () => {
  const preso = (extra: Record<string, unknown> = {}) => ({
    id: 'j1',
    projectId: 8,
    startedAt: new Date('2026-10-13T10:00:00Z'),
    attempts: 2,
    mp4ResultUrl: 'https://x.public.blob.vercel-storage.com/v.mp4',
    creditsDeducted: false,
    generationId: 'g1',
    thumbnailUrl: null,
    ...extra,
  })
  const agora = new Date('2026-10-13T12:00:00Z')

  it('MP4 + marca sem saldo, última tentativa: conclui, não falha', async () => {
    b.presos = [preso()]
    b.fieldValues = { cobrancaAviso: 'saldo-insuficiente' }
    const r = await recuperarJobsDeVideoPresos(agora)
    expect(r).toEqual({ devolvidos: 0, falhados: 0, concluidos: 1 })
    expect(b.jobsConcluidos).toEqual([expect.objectContaining({ status: 'COMPLETED' })])
    expect(b.falhas).toHaveLength(0)
  })

  it('MP4 sem cobrança e sem a marca: falha, como antes', async () => {
    b.presos = [preso()]
    b.fieldValues = {}
    expect(await recuperarJobsDeVideoPresos(agora)).toMatchObject({ falhados: 1, concluidos: 0 })
  })

  it('sem MP4: falha, como antes (mesmo com a marca)', async () => {
    b.presos = [preso({ mp4ResultUrl: null })]
    b.fieldValues = { cobrancaAviso: 'saldo-insuficiente' }
    expect(await recuperarJobsDeVideoPresos(agora)).toMatchObject({ falhados: 1, concluidos: 0 })
  })

  it('cobrado: conclui, como antes', async () => {
    b.presos = [preso({ creditsDeducted: true })]
    expect(await recuperarJobsDeVideoPresos(agora)).toMatchObject({ falhados: 0, concluidos: 1 })
  })
})
