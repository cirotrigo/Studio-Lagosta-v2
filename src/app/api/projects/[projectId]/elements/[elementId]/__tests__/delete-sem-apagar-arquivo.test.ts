/**
 * D6 (b), CP-V2e: o DELETE de elemento apaga só a LINHA da biblioteca; o arquivo no Blob fica (as artes copiam a
 * `fileUrl`). A rota é a real; Clerk, banco, acesso e `@vercel/blob` são falsos. O token do Blob é ligado de
 * propósito: com ele, a rota antiga chamava `del` — é isso que o teste recusa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  sessao: { userId: 'user_dono' as string | null, orgId: null as string | null },
  escrita: true,
  elemento: { id: 11, projectId: 8, fileUrl: 'https://blob.test/projects/8/elements/selo.png', name: 'Selo' } as Record<string, unknown> | null,
  del: vi.fn(),
  apagar: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => estado.sessao }))
vi.mock('@vercel/blob', () => ({ del: estado.del }))
vi.mock('@/lib/db', () => ({
  db: {
    element: {
      findFirst: async () => (estado.elemento ? { ...estado.elemento, Project: { id: estado.elemento.projectId } } : null),
      delete: estado.apagar,
    },
  },
}))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async (id: number) => ({ id }),
  hasProjectWriteAccess: () => estado.escrita,
}))

import { DELETE } from '../route'

const pedir = (projectId: string, elementId: string) =>
  DELETE(new Request('http://studio.test/x', { method: 'DELETE' }), { params: Promise.resolve({ projectId, elementId }) })

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = 'token-falso'
  estado.sessao = { userId: 'user_dono', orgId: null }
  estado.escrita = true
  estado.elemento = { id: 11, projectId: 8, fileUrl: 'https://blob.test/projects/8/elements/selo.png', name: 'Selo' }
  estado.del.mockReset()
  estado.apagar.mockReset().mockResolvedValue({})
})
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN
})

describe('DELETE /api/projects/[projectId]/elements/[elementId]', () => {
  it('apaga a linha e NUNCA chama del no Blob (arquivo preservado)', async () => {
    const res = await pedir('8', '11')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(estado.apagar).toHaveBeenCalledTimes(1)
    expect(estado.apagar).toHaveBeenCalledWith({ where: { id: 11 } })
    expect(estado.del).not.toHaveBeenCalled()
  })

  it('elemento de outro projeto: 404, nada apagado', async () => {
    const res = await pedir('9', '11')
    expect(res.status).toBe(404)
    expect(estado.apagar).not.toHaveBeenCalled()
    expect(estado.del).not.toHaveBeenCalled()
  })

  it('sem escrita no projeto: 403, nada apagado', async () => {
    estado.escrita = false
    const res = await pedir('8', '11')
    expect(res.status).toBe(403)
    expect(estado.apagar).not.toHaveBeenCalled()
    expect(estado.del).not.toHaveBeenCalled()
  })

  it('sem sessão: 401, nada apagado', async () => {
    estado.sessao = { userId: null, orgId: null }
    const res = await pedir('8', '11')
    expect(res.status).toBe(401)
    expect(estado.apagar).not.toHaveBeenCalled()
  })
})
