/**
 * As rotas de depuração mostram dados de qualquer cliente: só admin entra.
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ userId: null as string | null, admin: false }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: m.userId, orgId: null }),
  currentUser: async () => null,
}))
vi.mock('@/lib/admin-utils', () => ({ isAdmin: async () => m.admin }))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: async () => ({ id: 'u-int' }) }))
vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findMany: async () => [],
      findUnique: async () => ({ id: 'p1', laterPostId: null, Project: { id: 1, name: 'X', postingProvider: null } }),
    },
    project: { findFirst: async () => ({ id: 1, name: 'X', brandReferenceUrls: [], BrandColor: [], CustomFont: [] }) },
  },
}))

import { GET as getPosts } from '../posts/route'
import { GET as getPost } from '../post/[postId]/route'
import { GET as getProjectData } from '../project-data/route'
import { GET as getAuth } from '../auth/route'
import { GET as getOrg } from '../org/route'

const chamadas: Array<[string, () => Promise<Response>]> = [
  ['posts', () => getPosts(new NextRequest('http://t/api/debug/posts?projectId=1'))],
  ['post', () => getPost(new NextRequest('http://t/api/debug/post/p1'), { params: Promise.resolve({ postId: 'p1' }) })],
  ['project-data', () => getProjectData(new Request('http://t/api/debug/project-data?name=x'))],
  ['auth', () => getAuth()],
  ['org', () => getOrg()],
]

beforeEach(() => {
  m.userId = null
  m.admin = false
})

describe.each(chamadas)('/api/debug/%s', (_nome, chamar) => {
  it('sem sessão → 401', async () => {
    expect((await chamar()).status).toBe(401)
  })
  it('usuário comum → 403', async () => {
    m.userId = 'user_comum'
    expect((await chamar()).status).toBe(403)
  })
  it('admin → 200', async () => {
    m.userId = 'user_admin'
    m.admin = true
    expect((await chamar()).status).toBe(200)
  })
})
