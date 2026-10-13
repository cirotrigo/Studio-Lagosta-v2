/**
 * Com `templateId`, a miniatura sobrescreve a do template: exige escrita no
 * projeto dele. Sem `templateId`, o caminho é avulso e segue como sempre.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ podeEscrever: true, acesso: [] as unknown[], caminhos: [] as string[], template: { projectId: 7 } as any }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: 'org_1' }) }))
vi.mock('@/lib/permissions', () => {
  class PermissionError extends Error {
    constructor(message: string, public status = 403) {
      super(message)
    }
  }
  return {
    PermissionError,
    requireProjectAccess: async (projectId: number, opts: unknown) => {
      m.acesso.push([projectId, opts])
      if (!m.podeEscrever) throw new PermissionError('Não autorizado', 403)
      return { id: projectId }
    },
  }
})
vi.mock('@/lib/render-engine', () => ({ generateThumbnail: async () => Buffer.from('png') }))
vi.mock('@vercel/blob', () => ({
  put: async (caminho: string) => {
    m.caminhos.push(caminho)
    return { url: `https://blob.test/${caminho}` }
  },
}))
vi.mock('@/lib/db', () => ({ db: { template: { findUnique: async () => m.template } } }))

import { POST } from '../route'

const post = (extra: Record<string, unknown>) =>
  POST(new Request('http://t/api/templates/generate-thumbnail', { method: 'POST', body: JSON.stringify({ designData: {}, ...extra }) }))

beforeEach(() => {
  m.podeEscrever = true
  m.acesso = []
  m.caminhos = []
  m.template = { projectId: 7 }
})

describe('POST /api/templates/generate-thumbnail', () => {
  it('template de projeto sem escrita → 403 e nada sobrescrito', async () => {
    m.podeEscrever = false
    expect((await post({ templateId: 5 })).status).toBe(403)
    expect(m.acesso).toEqual([[7, { userId: 'user_1', orgId: 'org_1', write: true }]])
    expect(m.caminhos).toEqual([])
  })
  it('template inexistente → 404', async () => {
    m.template = null
    expect((await post({ templateId: 5 })).status).toBe(404)
    expect(m.caminhos).toEqual([])
  })
  it('com escrita → sobrescreve a do template', async () => {
    expect((await post({ templateId: 5 })).status).toBe(200)
    expect(m.caminhos).toEqual(['templates/thumbnails/5.png'])
  })
  it('sem templateId → caminho avulso, sem checagem de projeto', async () => {
    expect((await post({})).status).toBe(200)
    expect(m.acesso).toEqual([])
    expect(m.caminhos[0]).toMatch(/^templates\/thumbnails\/avulso-user_1-/)
  })
})
