/**
 * O token de upload sai preso a um projeto com escrita, e só para o prefixo
 * `videos/<projectId>/`.
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ tokens: [] as unknown[] }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: 'org_1' }) }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async (id: number) => (id === 8 || id === 10 ? { id } : null),
  hasProjectWriteAccess: (p: { id: number } | null) => p?.id === 8,
}))
vi.mock('@vercel/blob/client', () => ({
  handleUpload: async ({ body, onBeforeGenerateToken }: any) => {
    const r = await onBeforeGenerateToken(body.payload.pathname, body.payload.clientPayload, false)
    m.tokens.push(r)
    return { type: 'blob.generate-client-token', clientToken: 'tok' }
  },
}))

import { POST } from '../route'

const pedir = (pathname: string, clientPayload: unknown) =>
  POST(new NextRequest('http://t/api/export/video/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: { pathname, callbackUrl: 'http://t', multipart: false, clientPayload: clientPayload === undefined ? null : JSON.stringify(clientPayload) },
    }),
  }))

beforeEach(() => {
  m.tokens = []
})

describe('POST /api/export/video/upload-url', () => {
  it('sem projectId → 400, sem token', async () => {
    expect((await pedir('videos/8/a.mp4', undefined)).status).toBe(400)
    expect(m.tokens).toEqual([])
  })
  it('projeto sem escrita ou inexistente → mesmo 404, sem token', async () => {
    const semAcesso = await pedir('videos/10/a.mp4', { projectId: 10 })
    const inexistente = await pedir('videos/99/a.mp4', { projectId: 99 })
    expect(semAcesso.status).toBe(404)
    expect(inexistente.status).toBe(404)
    expect(await semAcesso.json()).toEqual(await inexistente.json())
    expect(m.tokens).toEqual([])
  })
  it('caminho fora do prefixo do projeto → 400, sem token', async () => {
    expect((await pedir('videos/10/a.mp4', { projectId: 8 })).status).toBe(400)
    expect((await pedir('videos/a.mp4', { projectId: 8 })).status).toBe(400)
    expect(m.tokens).toEqual([])
  })
  it('com escrita e caminho do projeto → token', async () => {
    const r = await pedir('videos/8/a.mp4', { projectId: 8 })
    expect(r.status).toBe(200)
    expect(m.tokens).toHaveLength(1)
    expect(JSON.parse((m.tokens[0] as { tokenPayload: string }).tokenPayload)).toMatchObject({ userId: 'user_1', projectId: 8 })
  })
})
