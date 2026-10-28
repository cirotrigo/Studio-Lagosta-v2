/**
 * G4.6 — o POST de posts (o caminho do modal "Agendar Story": `useSocialPosts` → esta rota → `PostScheduler`) devolve em
 * `warnings` a célula vazia da grade da página, sem bloquear e mantendo auth/guardas/erros. Dublês: Clerk, acesso,
 * usuário, banco e o `PostScheduler` (nenhum agendamento real, Zernio ou upload).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const estado = vi.hoisted(() => ({
  sessao: { userId: 'user_dono', orgId: null as string | null },
  pagina: null as null | Record<string, unknown>,
  leiturasDaPagina: 0,
  criados: [] as unknown[],
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => estado.sessao }))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: async () => ({ id: 'cuid_dono' }) }))
vi.mock('@/lib/projects/access', () => ({ hasProjectReadAccess: () => true, hasProjectWriteAccess: () => true, withProjectOwner: async (p: unknown) => p }))
vi.mock('@/lib/aprendizado/sinal-de-repost', () => ({ fecharPropostaDeRepost: async () => undefined }))
vi.mock('@/lib/posts/scheduler', () => ({
  PostScheduler: class {
    async createPost(dados: unknown) {
      estado.criados.push(dados)
      return { success: true, postId: 'post-1' }
    }
  },
}))
vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async ({ where }: { where: { id: number } }) => (where.id === 8 ? { id: 8, userId: 'cuid_dono', instagramAccountId: 'ig-1', organizationProjects: [] } : null) },
    page: {
      findUnique: async () => {
        estado.leiturasDaPagina++
        return estado.pagina
      },
    },
  },
}))

import { POST } from '../route'

const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
const cel = (id: string, fileUrl: string) => ({ id, type: 'image', name: id, fileUrl, metadata: { grade: { id: 'g1' }, groupId: 'g1' } })
const pagina = (projectId: number, layers: unknown[]) => ({ id: 'p1', name: 'Story', width: 1080, height: 1920, background: '#fff', layers: JSON.stringify(layers), Template: { projectId } })
const pedir = (corpo: Record<string, unknown>) =>
  POST(new NextRequest('http://studio.test/api/projects/8/posts', { method: 'POST', body: JSON.stringify(corpo) }), { params: Promise.resolve({ projectId: '8' }) })
const story = (extra: Record<string, unknown> = {}) => ({ postType: 'STORY', caption: '', generationIds: [], mediaUrls: [`${BLOB}/story.jpg`], scheduleType: 'IMMEDIATE', pageId: 'p1', templateId: 77, ...extra })

beforeEach(() => {
  estado.sessao = { userId: 'user_dono', orgId: null }
  estado.pagina = null
  estado.leiturasDaPagina = 0
  estado.criados = []
})

describe('POST posts × grade com célula vazia (G4.6)', () => {
  it('página do projeto com 2 células vazias: 200, post criado (dublê) e o aviso em warnings', async () => {
    estado.pagina = pagina(8, [cel('c0', `${BLOB}/a.jpg`), cel('c1', ''), cel('c2', '')])
    const r = await pedir(story())
    expect(r.status).toBe(200)
    const json = await r.json()
    expect(json).toMatchObject({ postId: 'post-1', warnings: ['A grade tem 2 células vazias: elas saem sem foto na arte publicada.'] })
    expect(estado.criados).toHaveLength(1)
  })

  it('grade cheia: sem warnings (resposta como antes)', async () => {
    estado.pagina = pagina(8, [cel('c0', `${BLOB}/a.jpg`)])
    const json = await (await pedir(story())).json()
    expect(json.warnings).toBeUndefined()
  })

  it('página de OUTRO projeto: nada dela vira aviso; sem pageId a página nem é lida', async () => {
    estado.pagina = pagina(99, [cel('c1', '')])
    expect((await (await pedir(story())).json()).warnings).toBeUndefined()
    estado.leiturasDaPagina = 0
    await pedir(story({ pageId: undefined, templateId: undefined }))
    expect(estado.leiturasDaPagina).toBe(0)
  })

  it('auth e guardas como antes: sem sessão 401, projeto inexistente 404 — sem ler a página nem criar post', async () => {
    estado.pagina = pagina(8, [cel('c1', '')])
    estado.sessao = { userId: null as unknown as string, orgId: null }
    expect((await pedir(story())).status).toBe(401)
    estado.sessao = { userId: 'user_dono', orgId: null }
    const r = await POST(new NextRequest('http://studio.test/api/projects/9/posts', { method: 'POST', body: JSON.stringify(story()) }), { params: Promise.resolve({ projectId: '9' }) })
    expect(r.status).toBe(404)
    expect(estado.leiturasDaPagina).toBe(0)
    expect(estado.criados).toEqual([])
  })
})
