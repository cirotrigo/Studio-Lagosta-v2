/**
 * Várias logos principais (02/11/2026): marcar uma logo como principal NÃO desmarca as outras — o compositor usa
 * todas as `isProjectLogo` como variantes da marca (a dourada, a branca, a azul) e escolhe a que lê sobre a foto.
 * Desmarcar continua desmarcando só a pedida.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  logos: [] as Array<{ id: number; projectId: number; fileUrl: string; isProjectLogo: boolean }>,
  updateMany: 0,
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'u1', orgId: null }) }))
vi.mock('@vercel/blob', () => ({ del: vi.fn() }))
vi.mock('@/lib/projects/access', () => ({ fetchProjectWithShares: async () => ({ id: 12 }), hasProjectWriteAccess: () => true }))
vi.mock('@/lib/db', () => ({
  db: {
    logo: {
      findFirst: async ({ where }: { where: { id: number } }) => {
        const l = banco.logos.find((x) => x.id === where.id)
        return l ? { ...l, Project: { id: l.projectId } } : null
      },
      update: async ({ where, data }: { where: { id: number }; data: { isProjectLogo: boolean } }) => {
        const l = banco.logos.find((x) => x.id === where.id)!
        l.isProjectLogo = data.isProjectLogo
        return { ...l }
      },
      updateMany: async () => {
        banco.updateMany += 1
        return { count: 0 }
      },
    },
  },
}))

import { PATCH } from '../[logoId]/route'

const marcar = (logoId: number, isProjectLogo: boolean) =>
  PATCH(new Request('http://t/x', { method: 'PATCH', body: JSON.stringify({ isProjectLogo }) }), { params: Promise.resolve({ projectId: '12', logoId: String(logoId) }) })

beforeEach(() => {
  banco.logos = [
    { id: 1, projectId: 12, fileUrl: 'dourada.png', isProjectLogo: true },
    { id: 2, projectId: 12, fileUrl: 'branca.png', isProjectLogo: false },
    { id: 3, projectId: 12, fileUrl: 'azul.png', isProjectLogo: false },
  ]
  banco.updateMany = 0
})

describe('PATCH /api/projects/:id/logos/:logoId', () => {
  it('marcar a branca como principal mantém a dourada principal (três variantes para o compositor)', async () => {
    expect((await marcar(2, true)).status).toBe(200)
    expect((await marcar(3, true)).status).toBe(200)
    expect(banco.logos.map((l) => [l.fileUrl, l.isProjectLogo])).toEqual([['dourada.png', true], ['branca.png', true], ['azul.png', true]])
    expect(banco.updateMany).toBe(0)
  })

  it('desmarcar desmarca só a pedida', async () => {
    await marcar(2, true)
    expect((await marcar(1, false)).status).toBe(200)
    expect(banco.logos.map((l) => l.isProjectLogo)).toEqual([false, true, false])
  })

  it('logo de outro projeto é 404, nada muda', async () => {
    banco.logos.push({ id: 9, projectId: 99, fileUrl: 'alheia.png', isProjectLogo: false })
    expect((await marcar(9, true)).status).toBe(404)
    expect(banco.logos.find((l) => l.id === 9)!.isProjectLogo).toBe(false)
  })
})
