/**
 * "Postar agora" não pode morrer com a resposta (31/10/2026).
 *
 * O PUT disparava `sendToLater` solto: a rota respondia, a Vercel congelava a função e o post ficava em
 * "postando" sem chegar ao Zernio até a varredura de travados, 30 minutos depois. Carrossel é o caso que mais
 * sofre: a chamada ao Zernio leva quase 2 minutos. O envio tem de ir pelo `after()`, com tempo de função para
 * caber nele.
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  post: null as any,
  depois: [] as Array<() => Promise<unknown>>,
  enviar: null as any,
}))

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: (tarefa: () => Promise<unknown>) => {
    estado.depois.push(tarefa)
  },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'clerk-1', orgId: null }) }))
vi.mock('@/lib/projects/access', () => ({ hasProjectReadAccess: () => true, hasProjectWriteAccess: () => true, withProjectOwner: async (p: unknown) => p }))
vi.mock('@/lib/later', () => ({ getLaterClient: () => ({ updatePost: async () => undefined }) }))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarEdicaoDeLegenda: async () => undefined }))
vi.mock('@/lib/compositor/pastas', () => ({ refilarPaginasDoPost: async () => undefined }))
vi.mock('@/lib/posts/scheduler', () => ({
  PostScheduler: class {
    sendToLater = (id: string) => estado.enviar(id)
  },
}))
vi.mock('@/lib/db', () => {
  const db: any = {
    project: { findUnique: async () => ({ id: 2, userId: 'u', organizationProjects: [] }) },
    user: { findUnique: async () => null },
    socialPost: {
      findUnique: async () => estado.post,
      update: async ({ data }: any) => {
        estado.post = { ...estado.post, ...data }
        return { ...estado.post, Generation: null, Project: { laterAccountId: null } }
      },
    },
    $queryRaw: async () => [{ slotValues: null, mediaUrls: estado.post.mediaUrls, laterPostId: estado.post.laterPostId }],
    $transaction: async (fazer: (tx: unknown) => Promise<unknown>) => fazer(db),
  }
  return { db }
})

import { PUT, maxDuration as tempoDaEdicao } from '../route'
import { maxDuration as tempoDaCriacao } from '../../route'

const postarAgora = () =>
  PUT(new NextRequest('http://t/api/projects/2/posts/post-1', { method: 'PUT', body: JSON.stringify({ scheduleType: 'IMMEDIATE' }) }), {
    params: Promise.resolve({ projectId: '2', postId: 'post-1' }),
  })

beforeEach(() => {
  estado.depois = []
  estado.enviar = vi.fn(async () => ({ success: true }))
  estado.post = {
    id: 'post-1', projectId: 2, laterPostId: null, caption: 'c', scheduledDatetime: null, postType: 'CAROUSEL', status: 'SCHEDULED',
    pageId: null, mediaUrls: ['https://blob.test/a.jpg', 'https://blob.test/b.jpg'], slotValues: null, renderStatus: 'NOT_NEEDED',
  }
})

describe('PUT IMMEDIATE sem laterPostId', () => {
  it('1. o envio vai pelo after(): a rota responde sem depender de uma promessa solta', async () => {
    const r = await postarAgora()
    expect(r.status).toBe(200)
    expect(estado.enviar).not.toHaveBeenCalled()
    expect(estado.depois).toHaveLength(1)

    await estado.depois[0]()
    expect(estado.enviar).toHaveBeenCalledWith('post-1')
  })

  it('2. falha do envio não vaza do after(): quem marca FAILED e avisa é o próprio sendToLater', async () => {
    estado.enviar = vi.fn(async () => {
      throw new Error('Zernio fora do ar')
    })
    await postarAgora()
    await expect(estado.depois[0]()).resolves.toBeUndefined()
  })

  it('3. post que não é imediato não dispara envio', async () => {
    const r = await PUT(new NextRequest('http://t/api/projects/2/posts/post-1', { method: 'PUT', body: JSON.stringify({ caption: 'nova' }) }), {
      params: Promise.resolve({ projectId: '2', postId: 'post-1' }),
    })
    expect(r.status).toBe(200)
    expect(estado.depois).toHaveLength(0)
  })
})

describe('tempo de função', () => {
  it('4. criar e editar têm folga para os quase 2 minutos do carrossel no Zernio', () => {
    expect(tempoDaEdicao).toBeGreaterThanOrEqual(120)
    expect(tempoDaCriacao).toBeGreaterThanOrEqual(120)
  })
})
