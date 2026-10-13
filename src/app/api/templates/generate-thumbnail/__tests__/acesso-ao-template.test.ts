/**
 * Com `templateId`, a miniatura sobrescreve a do template: exige escrita no
 * projeto dele. Sem `templateId`, o caminho é avulso e segue como sempre.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ podeEscrever: true, acesso: [] as unknown[], caminhos: [] as string[], template: { projectId: 7 } as any }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: 'org_1' }) }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async (id: number) => ({ id }),
  hasProjectWriteAccess: (p: { id: number } | null, opts: unknown) => {
    if (!p) return false
    m.acesso.push([p.id, opts])
    return m.podeEscrever
  },
}))
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
  it('template sem escrita e template inexistente → o mesmo 404, nada sobrescrito', async () => {
    m.podeEscrever = false
    const semAcesso = await post({ templateId: 5 })
    expect(m.acesso).toEqual([[7, { userId: 'user_1', orgId: 'org_1' }]])
    m.template = null
    const inexistente = await post({ templateId: 5 })
    expect([semAcesso.status, inexistente.status]).toEqual([404, 404])
    expect(await semAcesso.json()).toEqual(await inexistente.json())
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
