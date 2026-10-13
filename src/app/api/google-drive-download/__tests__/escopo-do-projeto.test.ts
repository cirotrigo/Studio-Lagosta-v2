/**
 * Copiar fotos do Drive para o Blob a partir de um projeto: toda foto precisa
 * estar sob as pastas DAQUELE projeto, tudo ou nada, antes de qualquer cópia.
 * Projeto inexistente, sem acesso e foto alheia respondem o mesmo 404.
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { blobPut, zerarArvore } from '@/lib/google-drive/__tests__/arvore-falsa'

const m = vi.hoisted(() => ({ userId: 'userA', baixados: [] as string[] }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: m.userId, orgId: null }), currentUser: async () => null }))
vi.mock('@/server/google-drive-service', async () => ({
  googleDriveService: (await import('@/lib/google-drive/__tests__/arvore-falsa')).drive,
}))
vi.mock('@/lib/db', async () => ({ db: (await import('@/lib/google-drive/__tests__/arvore-falsa')).dbFalso }))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: async () => ({ id: 'u-int' }) }))
vi.mock('@vercel/blob', async () => ({ put: (await import('@/lib/google-drive/__tests__/arvore-falsa')).blobPut }))
vi.mock('@/lib/images/auto-crop', () => ({
  getImageInfo: async () => ({ width: 1, height: 1, ratio: 1 }),
  cropToInstagramFeed: async (b: Buffer) => b,
}))
vi.mock('@/lib/projects/access', async () => {
  const f = await import('@/lib/google-drive/__tests__/arvore-falsa')
  return {
    withProjectOwner: async (p: unknown) => p,
    hasProjectReadAccess: (p: { id: number }, { userId }: { userId: string }) =>
      f.ADMINS.has(userId) || (f.VISIVEIS[userId] ?? []).includes(p.id),
  }
})
vi.mock('googleapis', () => {
  const files = {
    get: async ({ fileId, alt }: { fileId: string; alt?: string }) => {
      if (alt === 'media') {
        m.baixados.push(fileId)
        return { data: new ArrayBuffer(4) }
      }
      return { data: { name: `${fileId}.jpg`, mimeType: 'image/jpeg' } }
    },
  }
  class OAuth2 {
    setCredentials() {}
  }
  return { google: { auth: { OAuth2 }, drive: () => ({ files }) } }
})

import { POST as baixarGlobal } from '../route'
import { POST as baixarDoProjeto } from '../../projects/[projectId]/google-drive/download/route'

beforeEach(() => {
  zerarArvore()
  m.userId = 'userA'
  m.baixados = []
  vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'id')
  vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'segredo')
  vi.stubEnv('GOOGLE_DRIVE_REFRESH_TOKEN', 'token')
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

const ROTAS: Array<[string, (projectId: number, fileIds: unknown[]) => Promise<Response>]> = [
  ['/api/google-drive-download', (projectId, fileIds) =>
    baixarGlobal(new NextRequest('http://t/x', { method: 'POST', body: JSON.stringify({ projectId, fileIds }) }))],
  ['/api/projects/[id]/google-drive/download', (projectId, fileIds) =>
    baixarDoProjeto(new NextRequest('http://t/x', { method: 'POST', body: JSON.stringify({ fileIds }) }), {
      params: Promise.resolve({ projectId: String(projectId) }),
    })],
]

async function corpo(r: Response) {
  return { status: r.status, body: await r.json() }
}

describe.each(ROTAS)('%s', (_nome, baixar) => {
  it('userA copia fotos do projeto 1 (pasta geral, de imagens e atalho pelo destino)', async () => {
    const r = await corpo(await baixar(1, ['fileA', 'fileAimg', 'shortA']))
    expect(r.status).toBe(200)
    expect(r.body.uploaded).toBe(3)
    expect(m.baixados).toEqual(['fileA', 'fileAimg', 'fileB'])
  })
  it('foto alheia, inexistente, projeto sem acesso e projeto inexistente: o mesmo 404, nada copiado', async () => {
    const alheia = await corpo(await baixar(1, ['fileB']))
    const respostas = [
      await corpo(await baixar(1, ['nao-existe'])),
      await corpo(await baixar(2, ['fileB'])),
      await corpo(await baixar(99, ['fileA'])),
      await corpo(await baixar(1, ['fileA', 'fileB'])),
      await corpo(await baixar(1, ['root'])),
      await corpo(await baixar(1, ["x' or 'rootB"])),
    ]
    expect(alheia.status).toBe(404)
    for (const r of respostas) expect(r).toEqual(alheia)
    expect(m.baixados).toEqual([])
    expect(blobPut).not.toHaveBeenCalled()
  })
  it('o vínculo é com o projeto, inclusive para admin', async () => {
    m.userId = 'userAB'
    expect((await baixar(1, ['fileB'])).status).toBe(404)
    m.userId = 'user_admin'
    expect((await baixar(1, ['fileB'])).status).toBe(404)
    expect((await baixar(2, ['fileB'])).status).toBe(200)
  })
})
