/**
 * Pastas do Drive do projeto e o OAuth do Drive são coisa de admin: quem troca
 * a pasta do projeto troca o que a equipe do cliente enxerga no Drive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  userId: 'user_dono' as string | null,
  admin: false,
  atualizado: null as unknown,
  estadoNoCookie: undefined as string | undefined,
  trocouCodigo: false,
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: m.userId, orgId: null }), currentUser: async () => null }))
vi.mock('@/lib/admin-utils', () => ({ isAdmin: async () => m.admin }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async (id: number) => ({ id }),
  hasProjectWriteAccess: () => true,
}))
vi.mock('@/lib/db', () => ({
  db: {
    project: {
      update: async ({ data }: { data: unknown }) => {
        m.atualizado = data
        return { id: 1 }
      },
    },
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (m.estadoNoCookie ? { value: m.estadoNoCookie } : undefined) }),
}))
vi.mock('googleapis/build/src/apis/drive', () => {
  class OAuth2 {
    async getToken() {
      m.trocouCodigo = true
      return { tokens: { refresh_token: 'r', access_token: 'a' } }
    }
  }
  return { auth: { OAuth2 } }
})

import { PATCH } from '../../projects/[projectId]/settings/route'
import { POST as iniciarOauth } from '../start-oauth/route'
import { GET as retornoOauth } from '../callback/route'

beforeEach(() => {
  m.userId = 'user_dono'
  m.admin = false
  m.atualizado = null
  m.estadoNoCookie = undefined
  m.trocouCodigo = false
  vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'id')
  vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'segredo')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const patch = (body: unknown) =>
  PATCH(new Request('http://t/x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ projectId: '1' }) })

describe('PATCH /api/projects/[id]/settings', () => {
  it.each([
    [{ googleDriveFolderId: 'rootB', googleDriveFolderName: 'B' }],
    [{ googleDriveImagesFolderId: 'rootB', googleDriveImagesFolderName: 'B' }],
    [{ googleDriveVideosFolderId: null, googleDriveVideosFolderName: null }],
    [{ googleDriveFolderName: 'outro nome' }],
    [{ aiChatBehavior: 'x', googleDriveFolderId: 'rootB', googleDriveFolderName: 'B' }],
  ])('pasta do Drive sem ser admin → 403, nada gravado (%j)', async (body) => {
    expect((await patch(body)).status).toBe(403)
    expect(m.atualizado).toBeNull()
  })
  it('os outros campos seguem a regra de sempre', async () => {
    expect((await patch({ aiChatBehavior: 'x' })).status).toBe(200)
    expect(m.atualizado).toEqual({ aiChatBehavior: 'x' })
  })
  it('admin troca a pasta', async () => {
    m.admin = true
    expect((await patch({ googleDriveFolderId: 'rootB', googleDriveFolderName: 'B' })).status).toBe(200)
    expect(m.atualizado).toEqual({ googleDriveFolderId: 'rootB', googleDriveFolderName: 'B' })
  })
})

describe('OAuth do Drive', () => {
  const retorno = (qs = 'code=c&state=s') => retornoOauth(new Request(`http://t/api/google-drive/callback?${qs}`))

  it('sem sessão → 401; sem ser admin → 403; admin → URL', async () => {
    m.userId = null
    expect((await iniciarOauth()).status).toBe(401)
    expect((await retorno()).status).toBe(401)
    m.userId = 'user_dono'
    expect((await iniciarOauth()).status).toBe(403)
    m.estadoNoCookie = 's'
    expect((await retorno()).status).toBe(403)
    expect(m.trocouCodigo).toBe(false)
    m.admin = true
    const r = await iniciarOauth()
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toMatch(/Path=\/api\/google-drive\/callback/i)
  })
  it('admin: o estado precisa existir e bater', async () => {
    m.admin = true
    expect((await retorno()).status).toBe(400)
    m.estadoNoCookie = 'outro'
    expect((await retorno()).status).toBe(400)
    expect((await retorno('code=c')).status).toBe(400)
    expect(m.trocouCodigo).toBe(false)
    m.estadoNoCookie = 's'
    expect((await retorno()).status).toBe(200)
    expect(m.trocouCodigo).toBe(true)
  })
})
