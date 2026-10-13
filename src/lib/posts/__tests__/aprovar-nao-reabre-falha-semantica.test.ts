/**
 * B1d — checkpoint f (subagentes B/F + Codex): aprovar um rascunho NÃO repõe em PENDING uma falha SEMÂNTICA de render.
 *
 * Aprovar só agenda; não valida o pedido. Repor o render ali apagava o envelope (`renderError: null`) e reabria a
 * falha sem conferir a página — contornando a recuperação do checkpoint f, que só reabre com o pedido validado. A
 * decisão é do banco (a escrita é condicional à linha corrente), não de uma leitura solta. Legado e erro comum: como
 * sempre (a aprovação de um post sem mídia repõe o render).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ posts: [] as any[] }))

function casa(l: any, where: any): boolean {
  return Object.entries(where).every(([k, c]: [string, any]) => {
    if (k === 'OR') return c.some((w: any) => casa(l, w))
    if (k === 'NOT') return !casa(l, c)
    const v = l[k]
    if (c === null) return v === null || v === undefined
    if (typeof c !== 'object') return v === c
    if ('in' in c) return c.in.includes(v)
    if ('not' in c) return v !== c.not
    if ('startsWith' in c) return typeof v === 'string' && v.startsWith(c.startsWith)
    throw new Error(`filtro não suportado: ${k}`)
  })
}

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async () => ({ name: 'P', instagramAccountId: 'ig' }) },
    socialPost: {
      findMany: async () => banco.posts,
      update: async ({ where, data }: any) => {
        banco.posts = banco.posts.map((p) => (p.id === where.id ? { ...p, ...data } : p))
        return banco.posts.find((p) => p.id === where.id)
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0
        banco.posts = banco.posts.map((p) => (casa(p, where) ? (count++, { ...p, ...data }) : p))
        return { count }
      },
    },
  },
}))
vi.mock('@/lib/aprendizado/sinal-de-agendamento', () => ({ fecharSugestaoDeSlot: async () => undefined, registrarSlotDoPost: async () => undefined }))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarEdicaoDeLegenda: async () => undefined }))
vi.mock('@/lib/posts/campanha-vigencia', () => ({ avisosDeCampanhaVencida: async () => [] }))

import { processarAprovacao } from '../agenda-acoes'
import { ErroRenderSemantico } from '../erro-render-semantico'

const envelope = new ErroRenderSemantico('CONTRATO_INVALIDO', 'p1', []).paraRenderError()
const rascunho = (extra: Record<string, unknown> = {}) => ({
  id: 'post-1', status: 'DRAFT', scheduledDatetime: new Date(Date.now() + 3_600_000), laterPostId: null, mediaUrls: [], pageId: 'p1',
  renderStatus: 'RENDER_FAILED', renderError: envelope, renderAttempts: 1, videoDaPagina: false, campaignId: null, postType: 'STORY',
  generationId: null, sugestaoId: null, slotValues: { _slots: { manchete: 'X' } }, ...extra,
})
const aprovar = () => processarAprovacao({ projectId: 8, postIds: ['post-1'], action: 'APPROVE' })

beforeEach(() => {
  banco.posts = []
})

describe('aprovar rascunho sem mídia', () => {
  it('P. falha SEMÂNTICA: agenda, mas a arte continua RENDER_FAILED com o envelope', async () => {
    banco.posts = [rascunho()]
    await aprovar()
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', renderStatus: 'RENDER_FAILED', renderError: envelope, renderAttempts: 1 })
  })

  it('erro COMUM: repõe o render, como sempre', async () => {
    banco.posts = [rascunho({ renderError: 'Blob upload failed: 503', renderAttempts: 3, slotValues: { 't-h': 'X' } })]
    await aprovar()
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', renderStatus: 'PENDING', renderError: null, renderAttempts: 0 })
  })

  it('sem erro (render nunca feito): repõe o render, como sempre', async () => {
    banco.posts = [rascunho({ renderStatus: 'PENDING', renderError: null, renderAttempts: 0 })]
    await aprovar()
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', renderStatus: 'PENDING' })
  })
})
