/**
 * Finalizar um criativo grava página e arte no projeto do template: exige
 * escrita nesse projeto, e a página-modelo tem de ser do template informado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  podeEscrever: true,
  acesso: [] as unknown[],
  criados: [] as string[],
  pagina: null as any,
}))

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
vi.mock('@vercel/blob', () => ({ put: async () => ({ url: 'https://blob.test/c.png', pathname: 'c.png' }) }))
vi.mock('@/lib/aprendizado/uso-de-modelo', () => ({ registrarUsoDeModelo: async () => undefined }))
vi.mock('@/lib/db', () => ({
  db: {
    page: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const p = m.pagina
        if (!p || where.id !== p.id) return null
        if (where.templateId !== undefined && where.templateId !== p.templateId) return null
        return p
      },
      count: async () => 0,
      create: async () => {
        m.criados.push('page')
        return { id: 'nova' }
      },
    },
    generation: {
      create: async () => {
        m.criados.push('generation')
        return { id: 'g1' }
      },
    },
    aICreativeGeneration: {
      create: async () => {
        m.criados.push('ai')
        return { id: 'a1' }
      },
    },
  },
}))

import { POST } from '../route'

const corpo = (templateId = 5) => ({
  templateId,
  templatePageId: 'pg1',
  dataUrl: 'data:image/png;base64,aGVsbG8=',
  images: {},
  texts: {},
  layers: [],
})
const post = (b: unknown) => POST(new Request('http://t/api/gerar-criativo/finalize', { method: 'POST', body: JSON.stringify(b) }))

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = 'tok'
  m.podeEscrever = true
  m.acesso = []
  m.criados = []
  m.pagina = {
    id: 'pg1', templateId: 5, isTemplate: true, width: 1080, height: 1920, background: null,
    Template: { id: 5, name: 'T', projectId: 7, Project: { name: 'Cliente' } },
  }
})

describe('POST /api/gerar-criativo/finalize', () => {
  it('sem escrita no projeto do template → 403 e nada gravado', async () => {
    m.podeEscrever = false
    const r = await post(corpo())
    expect(r.status).toBe(403)
    expect(m.acesso).toEqual([[7, { userId: 'user_1', orgId: 'org_1', write: true }]])
    expect(m.criados).toEqual([])
  })

  it('página-modelo de outro template → 404 e nada gravado', async () => {
    const r = await post(corpo(99))
    expect(r.status).toBe(404)
    expect(m.criados).toEqual([])
  })

  it('com escrita e página do template → grava', async () => {
    const r = await post(corpo())
    expect(r.status).toBe(200)
    expect(m.criados).toEqual(['page', 'generation', 'ai'])
  })
})
