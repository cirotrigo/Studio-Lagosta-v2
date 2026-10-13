/**
 * O cliente citado (co-branding) também tem de estar no alcance de quem pede:
 * sem leitura nele, a resposta é a mesma do cliente que não existe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ existentes: [8, 9, 10] as number[], legiveis: [8, 9] as number[], start: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: 'org_1' }) }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async (id: number) => (m.existentes.includes(id) ? { id } : null),
  hasProjectWriteAccess: (p: { id: number } | null) => p?.id === 8,
  hasProjectReadAccess: (p: { id: number } | null) => !!p && m.legiveis.includes(p.id),
}))
vi.mock('@/lib/ai/creative-generation-service', () => ({ startArtGeneration: m.start }))
vi.mock('@/lib/ai/generation-queue', () => ({ enfileirarArte: vi.fn() }))
vi.mock('@/lib/ai/generation-queue-executor', () => ({ dispararJobAgora: vi.fn() }))

import { POST } from '../route'

const post = (marcaDoClienteProjectId?: number) =>
  POST(new Request('http://t/api/projects/8/arte-ia', {
    method: 'POST',
    body: JSON.stringify({ track: 'imagem', formato: 'story', marcaDoClienteProjectId }),
  }), { params: Promise.resolve({ projectId: '8' }) })

beforeEach(() => {
  m.start.mockReset()
  m.start.mockResolvedValue({ jobGenerationId: 'g1', reused: false, runnerArgs: null })
})

describe('POST arte-ia: cliente citado', () => {
  it('sem leitura no cliente citado → 404 igual ao inexistente, nada iniciado', async () => {
    const semAcesso = await post(10)
    const inexistente = await post(99)
    expect(semAcesso.status).toBe(404)
    expect(inexistente.status).toBe(404)
    expect(await semAcesso.json()).toEqual(await inexistente.json())
    expect(m.start).not.toHaveBeenCalled()
  })
  it('com leitura → inicia com a marca dele', async () => {
    expect((await post(9)).status).toBe(202)
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ marcaDoClienteProjectId: 9 }))
  })
  it('sem cliente citado → como sempre', async () => {
    expect((await post()).status).toBe(202)
  })
})
