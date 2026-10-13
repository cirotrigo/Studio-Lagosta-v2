/**
 * Autorização decide; saldo não. Quem não tem acesso ao projeto recebe a mesma
 * resposta com ou sem créditos (e não ganha User no banco). Com acesso, o modo
 * interno (flag desligada) não devolve 402 com saldo zero; com a flag ligada,
 * o 402 de antes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  temAcesso: false,
  ordem: [] as string[],
  getUserFromClerkId: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: null }) }))
vi.mock('@/lib/auth-utils', () => ({
  getUserFromClerkId: async (clerkId: string) => {
    m.ordem.push('getUserFromClerkId')
    m.getUserFromClerkId(clerkId)
    return { id: 'u1', clerkId }
  },
}))
vi.mock('@/lib/credits/settings', () => ({ getFeatureCost: async () => 10, getPlanCredits: async () => 0 }))
vi.mock('@/lib/db', () => {
  const tx = {
    user: { findUnique: async () => ({ id: 'u1', clerkId: 'user_1' }) },
    creditBalance: {
      findUnique: async () => {
        m.ordem.push('saldo')
        return { id: 'cb1', creditsRemaining: 0 }
      },
      updateMany: async () => ({ count: 0 }),
    },
    usageHistory: { create: async () => ({}) },
  }
  return {
    db: {
      ...tx,
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      project: {
        findFirst: async () => {
          m.ordem.push('acesso')
          return m.temAcesso ? { id: 8, userId: 'u1', name: 'P', organizationProjects: [] } : null
        },
        findUnique: async () => null,
      },
      generation: {
        findFirst: async () => ({
          id: 'g1',
          projectId: 8,
          status: 'COMPLETED',
          resultUrl: 'https://x.public.blob.vercel-storage.com/a.png',
          Project: { userId: 'u1' },
        }),
      },
    },
  }
})
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async () => ({ id: 8 }),
  hasProjectReadAccess: () => m.temAcesso,
}))
vi.mock('@vercel/blob', () => ({ put: vi.fn() }))
vi.mock('@/lib/video/enfileirar-video', () => ({
  prepararVideoDaPagina: async () => ({ ok: false, status: 418, error: 'parou depois do acesso' }),
  criarJobDeVideo: vi.fn(),
}))
vi.mock('@/lib/video/process-video-job', () => ({ processVideoJob: vi.fn() }))

import { POST as enfileirarVideo } from '../video-processing/queue/route'
import { GET as baixarCriativo } from '../generations/[id]/download/route'

const pedidoDeVideo = () =>
  new Request('http://localhost/api/video-processing/queue', {
    method: 'POST',
    body: JSON.stringify({
      templateId: 1,
      projectId: 8,
      videoName: 'v',
      videoDuration: 5,
      videoWidth: 1080,
      videoHeight: 1920,
      webmBlobUrl: 'https://x.public.blob.vercel-storage.com/a.webm',
      webmBlobSize: 10,
      thumbnailBlobUrl: 'https://x.public.blob.vercel-storage.com/a.png',
    }),
  })
const baixar = () => baixarCriativo(new Request('http://localhost/api/generations/g1/download'), { params: Promise.resolve({ id: 'g1' }) })

beforeEach(() => {
  m.temAcesso = false
  m.ordem = []
  m.getUserFromClerkId.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/video-processing/queue', () => {
  it.each([
    ['desligada', ''],
    ['ligada', 'true'],
  ])('sem acesso, saldo 0, flag %s: 404, sem consultar saldo e sem criar User', async (_n, flag) => {
    vi.stubEnv('CREDITOS_APLICADOS', flag)
    const r = await enfileirarVideo(pedidoDeVideo())
    expect(r.status).toBe(404)
    expect(m.ordem).toEqual(['acesso'])
    expect(m.getUserFromClerkId).not.toHaveBeenCalled()
  })

  it('com acesso e flag ligada: o acesso vem antes do User e do saldo (402 de antes)', async () => {
    vi.stubEnv('CREDITOS_APLICADOS', 'true')
    m.temAcesso = true
    const r = await enfileirarVideo(pedidoDeVideo())
    expect(r.status).toBe(402)
    expect(m.ordem).toEqual(['acesso', 'getUserFromClerkId', 'getUserFromClerkId', 'saldo'])
  })

  it('com acesso e flag desligada, saldo 0: segue adiante (não 402)', async () => {
    vi.stubEnv('CREDITOS_APLICADOS', '')
    m.temAcesso = true
    const r = await enfileirarVideo(pedidoDeVideo())
    expect(r.status).toBe(418) // o preparo falso, depois do acesso e do saldo
  })
})

describe('GET /api/generations/[id]/download', () => {
  it('com acesso, saldo 0, flag desligada: baixa (não 402)', async () => {
    vi.stubEnv('CREDITOS_APLICADOS', '')
    m.temAcesso = true
    const r = await baixar()
    expect(r.status).toBe(307)
  })

  it.each([
    ['desligada', ''],
    ['ligada', 'true'],
  ])('sem acesso, flag %s: 403', async (_n, flag) => {
    vi.stubEnv('CREDITOS_APLICADOS', flag)
    expect((await baixar()).status).toBe(403)
  })

  it('com acesso, saldo 0, flag ligada: 402 como antes', async () => {
    vi.stubEnv('CREDITOS_APLICADOS', 'true')
    m.temAcesso = true
    expect((await baixar()).status).toBe(402)
  })
})
