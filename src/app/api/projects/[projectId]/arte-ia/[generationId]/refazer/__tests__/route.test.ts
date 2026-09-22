/**
 * C15-05 na FIAÇÃO: "Gerar de novo" passa a `startArtGeneration` o carimbo da
 * voz da arte ORIGINAL (`origemDoCarimbo`), e não o da voz de agora. Os helpers
 * têm teste próprio; este prova que a rota os usa.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const d = vi.hoisted(() => ({ findFirst: vi.fn(), start: vi.fn() }))

vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), after: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_1', orgId: 'org_1' })) }))
vi.mock('@/lib/db', () => ({ db: { generation: { findFirst: d.findFirst } } }))
vi.mock('@/lib/projects/access', () => ({ fetchProjectWithShares: vi.fn(async () => ({ id: 6 })), hasProjectWriteAccess: vi.fn(() => true) }))
vi.mock('@/lib/ai/creative-generation-service', () => ({ startArtGeneration: d.start }))
vi.mock('@/lib/ai/generation-queue', () => ({ enfileirarArte: vi.fn() }))
vi.mock('@/lib/ai/generation-queue-executor', () => ({ dispararJobAgora: vi.fn() }))

import { POST } from '../route'

const chamar = () =>
  POST(new Request('http://localhost/api/projects/6/arte-ia/g-orig/refazer', { method: 'POST', body: '{}' }), {
    params: Promise.resolve({ projectId: '6', generationId: 'g-orig' }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  d.start.mockResolvedValue({ jobGenerationId: 'g-nova', reused: false, creditosCobrados: 25, runnerArgs: null })
})

describe('refazer · a copy reproduzida herda o carimbo da voz da origem', () => {
  it('arte com carimbo: a geração nova leva o MESMO carimbo e o instante da escrita dele', async () => {
    const carimbo = { fonte: 'voz', versao: 3, lidoEm: '2026-09-01T10:00:00.000Z', escritaEm: '2026-09-01T09:00:00.000Z' }
    d.findFirst.mockResolvedValue({ fieldValues: { source: 'arte-ia', slotValues: { a: 'Sexta' }, vozNaEscrita: carimbo }, createdAt: new Date('2026-09-01T10:00:00Z') })
    const res = await chamar()
    expect(res.status).toBe(202)
    expect(d.findFirst.mock.calls[0][0].select).toMatchObject({ fieldValues: true, createdAt: true })
    expect(d.start).toHaveBeenCalledTimes(1)
    expect(d.start.mock.calls[0][0]).toMatchObject({ copy: ['Sexta'], vozNaEscrita: carimbo, escritaEm: '2026-09-01T09:00:00.000Z' })
  })

  it('arte anterior ao carimbo: sem carimbo herdado, e a escrita é a criação da arte original', async () => {
    d.findFirst.mockResolvedValue({ fieldValues: { source: 'arte-ia', slotValues: { a: 'Sexta' } }, createdAt: new Date('2026-08-20T12:00:00Z') })
    const res = await chamar()
    expect(res.status).toBe(202)
    expect(d.start.mock.calls[0][0]).toMatchObject({ vozNaEscrita: null, escritaEm: '2026-08-20T12:00:00.000Z' })
  })
})
