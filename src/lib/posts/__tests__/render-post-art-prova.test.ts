/**
 * B1d — checkpoint e no `renderPostArt`: a PROVA do render ("estas camadas produziram ESTA mídia").
 *
 * - O CAS do sucesso (RENDERING + a ficha desta execução + a mídia anterior) e o INSERT da `PostRenderProof`
 *   rodam na MESMA transação: falha no INSERT desfaz o RENDERED (opção A); CAS que não pega a linha não cria prova.
 * - A prova é de TODO render canônico de página (legado também) e é append-only: só `create`.
 * - Mídia pronta (fornecida) nunca ganha prova.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  post: null as any,
  provas: [] as Array<{ postId: string; mediaUrl: string; proofVersion?: number; layersSnapshot: unknown }>,
  falhaNaProva: false,
  duranteRender: null as null | (() => void),
  render: { url: 'https://blob.test/posts/rendered/novo.png', camadas: [{ id: 't-h', type: 'text', content: 'Noite do vinho' }] as unknown[], aplicouSlots: true, copyDaPagina: {} as Record<string, string> },
}))
const igual = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : JSON.stringify(a) === JSON.stringify(b))

vi.mock('@/lib/db', () => {
  const db: any = {
    socialPost: {
      findUnique: async () => banco.post,
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, unknown> }) => {
        if (!banco.post) return { count: 0 }
        for (const k of ['renderStatus', 'nextRenderAt']) if (k in where && !igual(banco.post[k], where[k])) return { count: 0 }
        if ('laterPostId' in where && (banco.post.laterPostId ?? null) !== where.laterPostId) return { count: 0 }
        if ('status' in where && !where.status.in.includes(banco.post.status)) return { count: 0 }
        if ('mediaUrls' in where && !igual(banco.post.mediaUrls, where.mediaUrls.equals)) return { count: 0 }
        banco.post = { ...banco.post, ...data }
        return { count: 1 }
      },
    },
    postRenderProof: {
      create: async ({ data }: any) => {
        if (banco.falhaNaProva) throw new Error('insert da prova falhou')
        if (banco.provas.some((p) => p.postId === data.postId && p.mediaUrl === data.mediaUrl)) throw new Error('PK duplicada')
        banco.provas.push(data)
        return data
      },
    },
    // Transação de verdade: o que foi escrito dentro volta atrás se `fazer` lançar.
    $transaction: async (fazer: (tx: unknown) => Promise<unknown>) => {
      const antes = { post: banco.post, provas: [...banco.provas] }
      try {
        return await fazer(db)
      } catch (e) {
        banco.post = antes.post
        banco.provas = antes.provas
        throw e
      }
    },
  }
  return { db }
})
vi.mock('@/lib/posts/story-renderer', () => ({
  renderStoryImage: async () => {
    banco.duranteRender?.()
    return { url: banco.render.url, aplicouSlots: banco.render.aplicouSlots, copyDaPagina: banco.render.copyDaPagina, camadasEfetivas: banco.render.camadas }
  },
}))
vi.mock('../ensure-post-generation', () => ({ ensurePostGeneration: async () => null }))
vi.mock('../../../../prisma/generated/client', () => ({
  RenderStatus: { PENDING: 'PENDING', RENDERING: 'RENDERING', RENDERED: 'RENDERED', RENDER_FAILED: 'RENDER_FAILED', NOT_NEEDED: 'NOT_NEEDED' },
  PostStatus: { DRAFT: 'DRAFT', SCHEDULED: 'SCHEDULED', POSTING: 'POSTING', POSTED: 'POSTED', FAILED: 'FAILED' },
}))

import { renderPostArt } from '../render-post-art'

const semantico = { _slots: { manchete: 'Noite do vinho' } }

beforeEach(() => {
  banco.post = { id: 'post-1', status: 'SCHEDULED', laterPostId: null, pageId: 'p1', slotValues: semantico, renderStatus: 'PENDING', mediaUrls: [], renderedImageUrl: null, renderAttempts: 0, nextRenderAt: null }
  banco.provas = []
  banco.falhaNaProva = false
  banco.duranteRender = null
  banco.render = { url: 'https://blob.test/posts/rendered/novo.png', camadas: [{ id: 't-h', type: 'text', content: 'Noite do vinho' }], aplicouSlots: true, copyDaPagina: {} }
})

const renderizar = () => renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: banco.post.slotValues, renderAttempts: 0 })

describe('A. render confirmado: a URL confirmada tem prova com as camadas efetivas', () => {
  it('semântico: RENDERED com a URL e UMA prova (post, URL, versão 1, layersSnapshot = camadasEfetivas)', async () => {
    const r = await renderizar()
    expect(r).toMatchObject({ ok: true, url: banco.render.url })
    expect(banco.post).toMatchObject({ renderStatus: 'RENDERED', renderedImageUrl: banco.render.url, mediaUrls: [banco.render.url] })
    expect(banco.provas).toEqual([{ postId: 'post-1', mediaUrl: banco.render.url, proofVersion: 1, layersSnapshot: banco.render.camadas }])
  })

  it('O (checkpoint g): legado de página de conteúdo — a cópia da página continua sendo regravada, como sempre', async () => {
    banco.post.slotValues = { Título: 'cópia velha' }
    banco.render = { ...banco.render, aplicouSlots: false, copyDaPagina: { Título: 'texto novo da página' } }
    await renderizar()
    expect(banco.post.slotValues).toMatchObject({ Título: 'texto novo da página' })
  })

  it('P (checkpoint g): o render semântico não regrava SocialPost.slotValues — o pedido _slots/_papeis fica', async () => {
    await renderizar()
    expect(banco.post.slotValues).toEqual(semantico)
  })

  it('legado também registra prova (a entidade é "estas camadas produziram esta mídia", não "post semântico")', async () => {
    banco.post.slotValues = { 't-h': 'X' }
    await renderizar()
    expect(banco.provas).toHaveLength(1)
    expect(banco.provas[0].mediaUrl).toBe(banco.render.url)
  })
})

describe('opção A: prova e RENDERED são atômicos no banco', () => {
  it('INSERT da prova falha → o RENDERED é desfeito (nada de RENDERED sem prova); cai no retry comum', async () => {
    banco.falhaNaProva = true
    const r = await renderizar()
    expect(r).toMatchObject({ ok: false, motivo: 'falhou' })
    expect(banco.provas).toEqual([])
    expect(banco.post.renderStatus).not.toBe('RENDERED')
    expect(banco.post.mediaUrls).toEqual([])
    expect(banco.post.renderedImageUrl).toBeNull()
  })
})

describe('E. render que perdeu a ficha antes de confirmar: nenhuma prova para o Blob vencido', () => {
  it('outra execução reservou no meio do render → CAS 0, sem prova, sem RENDERED', async () => {
    const outra = new Date(Date.UTC(2001, 0, 1))
    banco.duranteRender = () => {
      banco.post = { ...banco.post, renderStatus: 'RENDERING', nextRenderAt: outra }
    }
    const r = await renderizar()
    expect(r).toMatchObject({ ok: false, motivo: 'invalidado' })
    expect(banco.provas).toEqual([])
    expect(banco.post).toMatchObject({ renderStatus: 'RENDERING', nextRenderAt: outra })
  })

  it('a mídia mudou durante o render → CAS 0, sem prova', async () => {
    banco.duranteRender = () => {
      banco.post = { ...banco.post, mediaUrls: ['https://cliente.jpg'] }
    }
    await renderizar()
    expect(banco.provas).toEqual([])
  })
})

describe('F. re-render: a URL nova ganha a sua prova; a anterior mantém a dela', () => {
  it('duas confirmações, duas provas, a primeira intacta', async () => {
    await renderizar()
    const primeira = { ...banco.provas[0] }
    banco.post = { ...banco.post, renderStatus: 'PENDING' } // invalidado (edição)
    banco.render = { ...banco.render, url: 'https://blob.test/posts/rendered/segundo.png', camadas: [{ id: 't-h', type: 'text', content: 'Outro texto' }] }
    await renderPostArt({ id: 'post-1', pageId: 'p1', slotValues: semantico, renderAttempts: 0 })
    expect(banco.provas).toHaveLength(2)
    expect(banco.provas[0]).toEqual(primeira)
    expect(banco.provas[1]).toMatchObject({ mediaUrl: 'https://blob.test/posts/rendered/segundo.png', layersSnapshot: banco.render.camadas })
  })
})

describe('H. mídia pronta (fornecida) nunca ganha prova', () => {
  it('post com mídia própria (carrossel) sai da fila sem render e sem prova', async () => {
    banco.post = { ...banco.post, slotValues: { 't-h': 'X' }, mediaUrls: ['https://a.jpg', 'https://b.jpg'] }
    const r = await renderizar()
    expect(r).toMatchObject({ ok: false, motivo: 'midia-propria' })
    expect(banco.provas).toEqual([])
  })
})

describe('D. a prova é APPEND-ONLY: ninguém atualiza nem sobrescreve uma prova', () => {
  it('em todo o código-fonte, PostRenderProof só aparece com create (nunca update/upsert/delete)', () => {
    const arquivos: string[] = []
    const andar = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) {
          if (n !== 'node_modules' && n !== 'generated' && n !== '__tests__') andar(p)
        } else if (/\.tsx?$/.test(n)) arquivos.push(p)
      }
    }
    andar(join(process.cwd(), 'src'))
    andar(join(process.cwd(), 'scripts'))
    const escritas = arquivos.flatMap((a) => [...readFileSync(a, 'utf8').matchAll(/postRenderProof\.(\w+)\(/g)].map((m) => `${a}:${m[1]}`))
    expect(escritas.length).toBeGreaterThan(0)
    expect(escritas.filter((e) => /:(update|updateMany|upsert|delete|deleteMany|createMany)$/.test(e))).toEqual([])
    expect(arquivos.filter((a) => /UPDATE\s+"PostRenderProof"|DELETE\s+FROM\s+"PostRenderProof"/.test(readFileSync(a, 'utf8')))).toEqual([])
  })
})

describe('GATE FINAL (Codex R2): post já reservado/entregue nunca tem a mídia trocada pelo render', () => {
  it('PENDING mas já com laterPostId (entregue): não reserva, não desenha, sem prova', async () => {
    banco.post = { ...banco.post, laterPostId: 'z1' }
    expect(await renderizar()).toMatchObject({ ok: false, motivo: 'ocupado' })
    expect(banco.provas).toEqual([])
    expect(banco.post.renderStatus).toBe('PENDING')
  })

  it('PENDING mas POSTING (aprovação atrasada repôs o render): não reserva', async () => {
    banco.post = { ...banco.post, status: 'POSTING' }
    expect(await renderizar()).toMatchObject({ ok: false, motivo: 'ocupado' })
    expect(banco.provas).toEqual([])
  })

  it('virou POSTING DURANTE o render: a confirmação não grava mídia nem prova', async () => {
    banco.duranteRender = () => {
      banco.post = { ...banco.post, status: 'POSTING', mediaUrls: [] }
    }
    const r = await renderizar()
    expect(r.ok).toBe(false)
    expect(banco.provas).toEqual([])
    expect(banco.post.renderedImageUrl).toBeNull()
  })
})
