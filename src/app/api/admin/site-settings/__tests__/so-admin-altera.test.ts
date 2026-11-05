/**
 * Alterar as configurações do site é coisa de admin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ userId: null as string | null, admin: false, gravado: null as unknown }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: m.userId }) }))
vi.mock('@/lib/admin-utils', () => ({ isAdmin: async () => m.admin }))
vi.mock('@/lib/db', () => ({
  db: {
    siteSettings: {
      findFirst: async () => ({ id: 's1' }),
      update: async ({ data }: { data: unknown }) => {
        m.gravado = data
        return { id: 's1', ...(data as object) }
      },
      create: async () => ({ id: 's1' }),
    },
  },
}))

import { PATCH } from '../route'

const patch = () => PATCH(new Request('http://t/api/admin/site-settings', { method: 'PATCH', body: JSON.stringify({ siteName: 'Outro' }) }))

beforeEach(() => {
  m.userId = null
  m.admin = false
  m.gravado = null
})

describe('PATCH /api/admin/site-settings', () => {
  it('sem sessão → 401', async () => {
    expect((await patch()).status).toBe(401)
    expect(m.gravado).toBeNull()
  })
  it('usuário comum → 403 e nada gravado', async () => {
    m.userId = 'user_comum'
    expect((await patch()).status).toBe(403)
    expect(m.gravado).toBeNull()
  })
  it('admin → grava', async () => {
    m.userId = 'user_admin'
    m.admin = true
    expect((await patch()).status).toBe(200)
    expect(m.gravado).toMatchObject({ siteName: 'Outro', updatedBy: 'user_admin' })
  })
})
