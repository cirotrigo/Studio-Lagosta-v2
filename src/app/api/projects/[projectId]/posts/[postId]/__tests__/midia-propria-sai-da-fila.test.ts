/**
 * #220: mídia própria que o render da página não cobre (vídeo, várias mídias) tira o post da fila de render no PUT —
 * mas só quando a mídia MUDOU. Reenviar a mesma lista (a interface faz isso ao trocar a legenda) não pode apagar um
 * RENDER_FAILED nem o `renderError` dele.
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ post: null as any, travada: undefined as any, atualizado: null as any }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'clerk-1', orgId: null }) }))
vi.mock('@/lib/projects/access', () => ({ hasProjectReadAccess: () => true, hasProjectWriteAccess: () => true, withProjectOwner: async (p: unknown) => p }))
vi.mock('@/lib/later', () => ({ getLaterClient: () => ({ updatePost: async () => undefined }) }))
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
    $queryRaw: async () => {
      const linha = banco.travada ?? banco.post
      return [{ slotValues: linha.slotValues, mediaUrls: linha.mediaUrls, laterPostId: linha.laterPostId }]
    },
    $transaction: async (fazer: (tx: unknown) => Promise<unknown>) => fazer(db),
  }
  return { db }
})

import { PUT } from '../route'

const put = (body: Record<string, unknown>) =>
  PUT(new NextRequest('http://t/api/projects/8/posts/post-1', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ projectId: '8', postId: 'post-1' }) })

const VIDEO = ['https://blob.test/v.mp4']
const ERRO = 'O vídeo deste post foi removido — gere de novo no editor.'

beforeEach(() => {
  banco.atualizado = null
  banco.travada = undefined
  banco.post = {
    id: 'post-1', projectId: 8, laterPostId: null, caption: 'c', scheduledDatetime: null, postType: 'STORY', status: 'DRAFT',
    pageId: 'pg', mediaUrls: VIDEO, slotValues: { 't-h': 'legado' }, renderStatus: 'RENDER_FAILED', renderError: ERRO,
  }
})

describe('PUT: mídia própria sai da fila de render só quando muda', () => {
  it('1. RENDER_FAILED + vídeo + PUT com a MESMA mídia (só legenda): segue RENDER_FAILED com o erro', async () => {
    const r = await put({ caption: 'nova', mediaUrls: [...VIDEO] })
    expect(r.status).toBe(200)
    expect(banco.atualizado).not.toHaveProperty('renderStatus')
    expect(banco.atualizado).not.toHaveProperty('renderError')
    expect(banco.post).toMatchObject({ renderStatus: 'RENDER_FAILED', renderError: ERRO, caption: 'nova' })
  })

  it.each(['RENDER_FAILED', 'PENDING'])('2. %s + troca REAL para vídeo/carrossel: NOT_NEEDED, erro limpo', async (status) => {
    banco.post.renderStatus = status
    banco.post.mediaUrls = ['https://blob.test/antiga.png']
    for (const nova of [['https://blob.test/novo.mp4'], ['https://blob.test/a.png', 'https://blob.test/b.png']]) {
      const r = await put({ mediaUrls: nova })
      expect(r.status).toBe(200)
      expect(banco.atualizado).toMatchObject({ renderStatus: 'NOT_NEEDED', renderError: null })
      banco.post.renderStatus = status
      banco.post.mediaUrls = ['https://blob.test/antiga.png']
    }
  })

  it('3. mídia mudou, mas a nova é coberta pelo render da página (uma imagem): não força NOT_NEEDED', async () => {
    banco.post.renderStatus = 'PENDING'
    const r = await put({ mediaUrls: ['https://blob.test/outra.png'] })
    expect(r.status).toBe(200)
    expect(banco.atualizado).not.toHaveProperty('renderStatus')
    expect(banco.post.renderStatus).toBe('PENDING')
  })

  it('4. post entregue (laterPostId) é intocável: o status de render não muda', async () => {
    banco.post.laterPostId = 'z1'
    banco.post.mediaUrls = ['https://blob.test/antiga.png']
    const r = await put({ mediaUrls: ['https://blob.test/novo.mp4'] })
    expect(r.status).toBe(200)
    expect(banco.atualizado).not.toHaveProperty('renderStatus')
    expect(banco.post.renderStatus).toBe('RENDER_FAILED')
  })

  it('4b. entregue no meio (laterPostId gravado entre a leitura e a trava): intocável (Codex)', async () => {
    banco.post.mediaUrls = ['https://blob.test/antiga.png']
    banco.travada = { ...banco.post, laterPostId: 'z1' }
    const r = await put({ mediaUrls: ['https://blob.test/novo.mp4'] })
    expect(r.status).toBe(200)
    expect(banco.atualizado).not.toHaveProperty('renderStatus')
  })

  it('1b. a mídia lida era outra, mas a TRAVADA é igual à pedida: não é troca, nada muda no render', async () => {
    banco.post.mediaUrls = ['https://blob.test/antiga.png']
    banco.travada = { ...banco.post, mediaUrls: [...VIDEO] }
    const r = await put({ caption: 'x', mediaUrls: [...VIDEO] })
    expect(r.status).toBe(200)
    expect(banco.atualizado).not.toHaveProperty('renderStatus')
  })

  it('5. contrato semântico: troca real continua recusada e nada é gravado (B1d)', async () => {
    banco.post.slotValues = { _slots: { manchete: 'X' } }
    banco.post.mediaUrls = ['https://blob.test/provada.png']
    const r = await put({ mediaUrls: ['https://blob.test/novo.mp4'] })
    expect(r.status).toBe(422)
    expect(await r.json()).toMatchObject({ error: 'CONTRATO_COM_MIDIA_PRONTA' })
    expect(banco.atualizado).toBeNull()
    expect(banco.post.renderStatus).toBe('RENDER_FAILED')
  })
})
