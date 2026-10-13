/**
 * B1d — checkpoint e (Codex): o PUT do post não troca a mídia de um post com o contrato semântico.
 *
 * A mídia desse post é a que o render canônico produziu e PROVOU; trocar por outra (inclusive depois da entrega,
 * quando o PUT sincroniza a mídia nova com o Zernio) publicaria — e faria a agenda ler — uma mídia sem prova. A
 * decisão é tomada com a linha travada (`SELECT … FOR UPDATE`) na mesma transação da escrita. Legado: como sempre.
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ post: null as any, sql: [] as string[], atualizado: null as any, zernio: [] as unknown[] }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'clerk-1', orgId: null }) }))
vi.mock('@/lib/projects/access', () => ({ hasProjectReadAccess: () => true, hasProjectWriteAccess: () => true, withProjectOwner: async (p: unknown) => p }))
vi.mock('@/lib/later', () => ({ getLaterClient: () => ({ updatePost: async (...a: unknown[]) => void banco.zernio.push(a) }) }))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarEdicaoDeLegenda: async () => undefined }))
vi.mock('@/lib/compositor/pastas', () => ({ refilarPaginasDoPost: async () => undefined }))
vi.mock('@/lib/db', () => {
  const db: any = {
    project: { findUnique: async () => ({ id: 8, userId: 'u', organizationProjects: [] }) },
    user: { findUnique: async () => null },
    socialPost: {
      findUnique: async () => banco.post,
      update: async ({ data }: any) => {
        banco.post = { ...banco.post, ...data }
        banco.atualizado = data
        return { ...banco.post, Generation: null, Project: { laterAccountId: null } }
      },
    },
    $queryRaw: async (partes: TemplateStringsArray) => {
      banco.sql.push(partes.join('?'))
      return [{ slotValues: banco.post.slotValues }]
    },
    $transaction: async (fazer: (tx: unknown) => Promise<unknown>) => fazer(db),
  }
  return { db }
})

import { PUT } from '../route'

const put = (body: Record<string, unknown>) =>
  PUT(new NextRequest('http://t/api/projects/8/posts/post-1', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ projectId: '8', postId: 'post-1' }) })

beforeEach(() => {
  banco.sql = []
  banco.atualizado = null
  banco.zernio = []
  banco.post = {
    id: 'post-1', projectId: 8, laterPostId: null, caption: 'c', scheduledDatetime: null, postType: 'STORY', status: 'SCHEDULED',
    mediaUrls: ['https://blob.test/provada.png'], slotValues: { _slots: { manchete: 'X' } },
  }
})

describe('PUT: a mídia de um post semântico não é trocada', () => {
  it('troca de mídia num post semântico → 422 CONTRATO_COM_MIDIA_PRONTA, com a linha travada, e nada gravado', async () => {
    const r = await put({ mediaUrls: ['https://cliente.test/outra.jpg'] })
    expect(r.status).toBe(422)
    expect(await r.json()).toMatchObject({ error: 'CONTRATO_COM_MIDIA_PRONTA' })
    expect(banco.sql[0]).toMatch(/FROM "SocialPost"[\s\S]*FOR UPDATE/)
    expect(banco.atualizado).toBeNull()
    expect(banco.post.mediaUrls).toEqual(['https://blob.test/provada.png'])
  })

  it('já entregue (laterPostId): idem — a mídia sem prova não vai ao Zernio', async () => {
    banco.post.laterPostId = 'z1'
    const r = await put({ mediaUrls: ['https://cliente.test/outra.jpg'] })
    expect(r.status).toBe(422)
    expect(banco.zernio).toEqual([])
  })

  it('a mesma mídia (sem troca) e outros campos seguem como sempre', async () => {
    const r = await put({ caption: 'nova legenda', mediaUrls: ['https://blob.test/provada.png'] })
    expect(r.status).toBe(200)
    expect(banco.atualizado).toMatchObject({ caption: 'nova legenda' })
  })

  it('legado: troca de mídia como sempre', async () => {
    banco.post.slotValues = { 't-h': 'X' }
    const r = await put({ mediaUrls: ['https://cliente.test/outra.jpg'] })
    expect(r.status).toBe(200)
    expect(banco.post.mediaUrls).toEqual(['https://cliente.test/outra.jpg'])
  })
})
