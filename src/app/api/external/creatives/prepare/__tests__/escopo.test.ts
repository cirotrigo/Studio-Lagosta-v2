import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A rota de serviço (EXTERNAL_API_SECRET) resolve projeto em escopo global —
 * agora DECLARADO (`projetosVisiveis: 'todos'`), não herdado da falta de
 * argumento. Sem o token, nada é resolvido.
 */
const m = vi.hoisted(() => ({ autorizado: vi.fn(), prepare: vi.fn() }))
vi.mock('@/lib/external-api/auth', () => ({ isExternalApiAuthorized: m.autorizado }))
vi.mock('@/lib/creatives/arte-rapida', async () => {
  const { CreativeError } = await import('@/lib/creatives/errors')
  return { prepareCreative: m.prepare, CreativeError }
})

import { POST } from '../route'

const chamar = (body: unknown) =>
  POST(new NextRequest('http://t/api/external/creatives/prepare', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  m.autorizado.mockReturnValue(true)
  m.prepare.mockResolvedValue({ ok: true })
})

describe('/api/external/creatives/prepare', () => {
  it('sem token: 401 e nada é resolvido', async () => {
    m.autorizado.mockReturnValue(false)
    expect((await chamar({ projectHint: 'segredo', theme: 'x' })).status).toBe(401)
    expect(m.prepare).not.toHaveBeenCalled()
  })

  it("com token: resolve em escopo 'todos' declarado", async () => {
    expect((await chamar({ projectHint: 'segredo', theme: 'x' })).status).toBe(200)
    expect(m.prepare).toHaveBeenCalledWith(expect.objectContaining({ projectHint: 'segredo', projetosVisiveis: 'todos' }))
  })

  it.each([0, -1, 2.5])('projectId %s é recusado na validação', async (projectId) => {
    expect((await chamar({ projectId, theme: 'x' })).status).toBe(400)
    expect(m.prepare).not.toHaveBeenCalled()
  })
})
