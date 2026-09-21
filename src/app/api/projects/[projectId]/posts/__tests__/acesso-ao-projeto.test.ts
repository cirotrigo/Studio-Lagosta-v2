/**
 * A agenda de UM projeto só aparece para quem enxerga o projeto (21/09/2026).
 *
 * `GET …/posts/calendar` e `GET …/posts/next-scheduled` conferiam só a sessão
 * do Clerk: qualquer conta logada listava a agenda de outro cliente —
 * legendas, mídias, erros, nome, @ do Instagram e logo. As rotas e o gate
 * (`@/lib/projects/access`) são os reais; o Clerk e o banco são falsos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const estado = vi.hoisted(() => ({
  sessao: { userId: 'user_estranho', orgId: 'org_outra' as string | null },
  findMany: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => estado.sessao, clerkClient: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        where.id === 8
          ? {
              id: 8,
              userId: 'cuid_dono',
              organizationProjects: [{ organization: { clerkOrgId: 'org_casa', name: 'Casa' } }],
              Logo: [],
            }
          : null,
    },
    user: {
      findUnique: async ({ where }: { where: { id?: string } }) =>
        where.id === 'cuid_dono' ? { clerkId: 'user_dono' } : null,
    },
    socialPost: { findMany: estado.findMany, findFirst: estado.findFirst },
  },
}))

import { GET as calendario } from '../calendar/route'
import { GET as proximo } from '../next-scheduled/route'

const POST = { id: 'post-1', projectId: 8, caption: 'Legenda do cliente', scheduledDatetime: new Date('2026-09-22T15:00:00Z') }
const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) })
const pedirCalendario = (projectId: string) =>
  calendario(
    new NextRequest(
      `http://studio.test/api/projects/${projectId}/posts/calendar?startDate=2026-09-21T00:00:00Z&endDate=2026-09-28T00:00:00Z`,
    ),
    params(projectId),
  )

beforeEach(() => {
  estado.sessao = { userId: 'user_estranho', orgId: 'org_outra' }
  estado.findMany.mockReset().mockImplementation(async ({ where }: { where: { scheduleType: unknown } }) =>
    where.scheduleType === 'RECURRING' ? [] : [POST],
  )
  estado.findFirst.mockReset().mockResolvedValue(POST)
})

describe('agenda de um projeto — só para quem enxerga o projeto', () => {
  it('conta logada de OUTRA organização: 403 e nenhum post lido do banco', async () => {
    const res = await pedirCalendario('8')
    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain('Legenda do cliente')
    expect(estado.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['o dono', { userId: 'user_dono', orgId: null }],
    ['o membro da organização com que o projeto é compartilhado', { userId: 'user_membro', orgId: 'org_casa' }],
  ])('%s continua vendo a agenda', async (_, sessao) => {
    estado.sessao = sessao
    const res = await pedirCalendario('8')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([expect.objectContaining({ id: 'post-1', caption: 'Legenda do cliente' })])
  })

  it('projeto inexistente: 404', async () => {
    expect((await pedirCalendario('999')).status).toBe(404)
    expect(estado.findMany).not.toHaveBeenCalled()
  })

  it('o próximo agendado segue a mesma regra', async () => {
    const pedir = () => proximo(new NextRequest('http://studio.test/api/projects/8/posts/next-scheduled'), params('8'))
    expect((await pedir()).status).toBe(403)
    expect(estado.findFirst).not.toHaveBeenCalled()

    estado.sessao = { userId: 'user_membro', orgId: 'org_casa' }
    expect(await (await pedir()).json()).toMatchObject({ postId: 'post-1' })
  })
})
