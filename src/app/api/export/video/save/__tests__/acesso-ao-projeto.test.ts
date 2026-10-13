/**
 * Registrar um vídeo cria arte no projeto: exige escrita nele.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ podeEscrever: true, acesso: [] as unknown[], criado: false }))

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
vi.mock('@/lib/db', () => ({
  db: {
    template: { findFirst: async () => ({ id: 5, name: 'T', Project: { id: 7, name: 'Cliente' } }) },
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
  m.acesso = []
  m.criado = false
})

describe('POST /api/export/video/save', () => {
  it('sem escrita no projeto → 403 e nada gravado', async () => {
    m.podeEscrever = false
    expect((await post()).status).toBe(403)
    expect(m.acesso).toEqual([[7, { userId: 'user_1', orgId: 'org_1', write: true }]])
    expect(m.criado).toBe(false)
  })
  it('com escrita → grava', async () => {
    expect((await post()).status).toBe(200)
    expect(m.criado).toBe(true)
  })
})
