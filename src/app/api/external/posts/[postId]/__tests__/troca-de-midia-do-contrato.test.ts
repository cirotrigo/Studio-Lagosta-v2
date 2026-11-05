/**
 * B1d — checkpoint e (Codex): o PATCH externo não troca a mídia de um post com o contrato semântico — nem antes nem
 * depois da entrega (quando ele sincroniza a mídia nova com o Zernio). A mídia pedida é comparada com a da linha
 * TRAVADA (`SELECT … FOR UPDATE`), na mesma transação da escrita. Legado: como sempre.
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ post: null as any, travada: undefined as any, sql: [] as string[], atualizado: null as any, zernio: [] as unknown[] }))

vi.mock('@/lib/external-api/auth', () => ({ isExternalApiAuthorized: () => true }))
vi.mock('@/lib/compositor/pastas', () => ({ refilarPaginasDoPost: async () => undefined }))
vi.mock('@/lib/later', () => ({
  getLaterClient: () => ({ updatePost: async (...a: unknown[]) => void banco.zernio.push(a), uploadMediaFromUrl: async (u: string) => ({ url: u }) }),
}))
vi.mock('@/lib/db', () => {
  const db: any = {
    socialPost: {
      findUnique: async () => banco.post,
      update: async ({ data }: any) => {
        banco.post = { ...banco.post, ...data }
        banco.atualizado = data
        return banco.post
      },
    },
    $queryRaw: async (partes: TemplateStringsArray) => {
      banco.sql.push(partes.join('?'))
      const linha = banco.travada ?? banco.post
      return [{ slotValues: linha.slotValues, mediaUrls: linha.mediaUrls }]
    },
    $transaction: async (fazer: (tx: unknown) => Promise<unknown>) => fazer(db),
  }
  return { db }
})

import { PATCH } from '../route'

const patch = (body: Record<string, unknown>) =>
  PATCH(new NextRequest('http://t/api/external/posts/post-1', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ postId: 'post-1' }) })

beforeEach(() => {
  banco.sql = []
  banco.travada = undefined
  banco.atualizado = null
  banco.zernio = []
  banco.post = {
    id: 'post-1', projectId: 8, status: 'SCHEDULED', postType: 'STORY', caption: 'c', scheduledDatetime: null, laterPostId: 'z1',
    mediaUrls: ['https://blob.test/provada.png'], slotValues: { _slots: { manchete: 'X' } }, Project: { laterAccountId: null, userId: 'u' },
  }
})

describe('PATCH externo: a mídia de um post semântico não é trocada', () => {
  it('troca de mídia (já no Zernio) → 422, linha travada, nada gravado e nada enviado ao Zernio', async () => {
    const r = await patch({ mediaUrls: ['https://cliente.test/outra.jpg'] })
    expect(r.status).toBe(422)
    expect(await r.json()).toMatchObject({ error: 'CONTRATO_COM_MIDIA_PRONTA' })
    expect(banco.sql[0]).toMatch(/FROM "SocialPost"[\s\S]*FOR UPDATE/)
    expect(banco.atualizado).toBeNull()
    expect(banco.zernio).toEqual([])
  })

  it('a decisão é da linha travada: o contrato chegou depois da leitura', async () => {
    banco.post.slotValues = { 't-h': 'X' }
    banco.travada = { ...banco.post, slotValues: { _papeis: { headline: 'X' } } }
    const r = await patch({ mediaUrls: ['https://cliente.test/outra.jpg'] })
    expect(r.status).toBe(422)
    expect(banco.atualizado).toBeNull()
  })

  it('legenda sem troca de mídia segue como sempre', async () => {
    const r = await patch({ caption: 'nova' })
    expect(r.status).toBe(200)
    expect(banco.atualizado).toMatchObject({ caption: 'nova' })
  })

  it('legado: troca de mídia como sempre', async () => {
    banco.post.slotValues = { 't-h': 'X' }
    banco.post.laterPostId = null
    const r = await patch({ mediaUrls: ['https://cliente.test/outra.jpg'] })
    expect(r.status).toBe(200)
    expect(banco.post.mediaUrls).toEqual(['https://cliente.test/outra.jpg'])
  })
})
