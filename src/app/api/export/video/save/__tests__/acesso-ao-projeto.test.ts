/**
 * Registrar um vídeo cria arte no projeto: exige escrita nele. Projeto sem
 * acesso, template inexistente e template de outro projeto respondem igual.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ podeEscrever: true, ordem: [] as string[], template: null as any, criado: false }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: 'org_1' }) }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async (id: number) => {
    m.ordem.push(`acesso:${id}`)
    return { id }
  },
  hasProjectWriteAccess: () => m.podeEscrever,
}))
vi.mock('@/lib/db', () => ({
  db: {
    template: {
      findFirst: async ({ where }: { where: { id: number; projectId?: number } }) => {
        m.ordem.push('template')
        const t = m.template
        return t && t.id === where.id && t.projectId === where.projectId ? t : null
      },
    },
    generation: {
      create: async () => {
        m.criado = true
        return { id: 'g1', resultUrl: 'https://blob.test/v.mp4' }
      },
    },
  },
}))

import { POST } from '../route'

const post = () =>
  POST(new Request('http://t/api/export/video/save', {
    method: 'POST',
    body: JSON.stringify({ videoUrl: 'https://blob.test/v.mp4', templateId: 5, projectId: 7, fileName: 'v.mp4' }),
  }))

beforeEach(() => {
  m.podeEscrever = true
  m.ordem = []
  m.criado = false
  m.template = { id: 5, name: 'T', projectId: 7, Project: { id: 7, name: 'Cliente' } }
})

describe('POST /api/export/video/save', () => {
  it('sem escrita, template inexistente e de outro projeto → o mesmo 404, nada gravado', async () => {
    m.podeEscrever = false
    const semAcesso = await post()
    expect(m.ordem).toEqual(['acesso:7'])
    m.podeEscrever = true
    m.template = null
    const inexistente = await post()
    m.template = { id: 5, name: 'T', projectId: 3, Project: { id: 3, name: 'Outro' } }
    const deOutro = await post()
    const corpos = await Promise.all([semAcesso, inexistente, deOutro].map((r) => r.json()))
    expect([semAcesso.status, inexistente.status, deOutro.status]).toEqual([404, 404, 404])
    expect(corpos[1]).toEqual(corpos[0])
    expect(corpos[2]).toEqual(corpos[0])
    expect(m.criado).toBe(false)
  })
  it('com escrita → grava', async () => {
    expect((await post()).status).toBe(200)
    expect(m.criado).toBe(true)
  })
})
