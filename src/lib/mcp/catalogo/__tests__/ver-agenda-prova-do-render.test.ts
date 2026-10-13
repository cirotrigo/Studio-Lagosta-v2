/**
 * B1d — checkpoint e no `ver-agenda`: a peça semântica ENTREGUE lê a PROVA do render casada por post + URL entregue
 * (`PostRenderProof`), e nunca a Generation casada pela URL nem o modelo de hoje. Handler real, banco falso.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const URL = 'https://blob.test/posts/rendered/post-1.png'
const banco = vi.hoisted(() => ({
  post: null as Record<string, any> | null,
  provas: [] as Array<{ postId: string; mediaUrl: string; layersSnapshot: unknown }>,
  consultasDeProva: [] as unknown[],
}))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: { findMany: async () => [structuredClone(banco.post)] },
    generation: {
      // A Generation casada pela URL traz um snapshot de OUTRA versão: não pode ser lida como prova.
      findMany: async () => [{ id: 'g-antiga', resultUrl: URL, fieldValues: { source: 'post-schedule', pageId: 'pag-M', layersSnapshot: [{ id: 'h', type: 'text', content: 'SNAPSHOT DA GENERATION', visible: true }] } }],
    },
    page: {
      findMany: async () => [{ id: 'pag-M', isTemplate: true, layers: JSON.stringify([{ id: 'h', name: 'h', type: 'text', content: 'MODELO DE HOJE', visible: true, order: 1, metadata: { slot: { id: 'manchete' } } }]) }],
    },
    postRenderProof: {
      findMany: async (args: { where: { OR: Array<{ postId: string; mediaUrl: string }> } }) => {
        banco.consultasDeProva.push(args)
        return banco.provas.filter((p) => args.where.OR.some((o) => o.postId === p.postId && o.mediaUrl === p.mediaUrl))
      },
    },
    knowledgeBaseEntry: { findMany: async () => [] },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../../prisma/generated/client'))

import { toolsDeAgenda } from '../agenda'

const verAgenda = toolsDeAgenda.find((t) => t.nome === 'ver-agenda')!
async function itemDaAgenda() {
  const r = (await verAgenda.handler({ projectId: 8, from: '2026-10-14', to: '2026-10-20' }, { kind: 'service' } as never)) as { dias: Array<{ posts: Array<Record<string, any>> }> }
  return r.dias[0].posts[0]
}

beforeEach(() => {
  banco.provas = []
  banco.consultasDeProva = []
  banco.post = {
    id: 'post-1', projectId: 8, postType: 'STORY', status: 'POSTED', caption: null, scheduledDatetime: new Date('2026-10-16T22:00:00Z'),
    publishedUrl: null, publishType: 'DIRECT', mediaUrls: [URL], generationId: 'g-antiga', laterPostId: 'z1', learningScope: 'ROTINA',
    campaignId: null, pageId: 'pag-M', renderStatus: 'RENDERED', slotValues: { _slots: { manchete: 'Pedido do post' } },
  }
})

describe('ver-agenda: peça semântica entregue', () => {
  it('com a prova da URL entregue: os textos são os das camadas que produziram o PNG', async () => {
    banco.provas = [{ postId: 'post-1', mediaUrl: URL, layersSnapshot: [{ id: 'h', type: 'text', content: 'Desenhado no PNG', visible: true, order: 1 }] }]
    const item = await itemDaAgenda()
    expect(item.textos).toEqual(['Desenhado no PNG'])
    expect(item.textosOrigem).toBe('arte')
  })

  it('sem prova: indisponível — nem a Generation casada, nem o modelo de hoje, nem o pedido', async () => {
    const item = await itemDaAgenda()
    expect(item.textos).toBeUndefined()
    expect(item.textosIndisponiveis).toMatch(/prova/)
    expect(JSON.stringify(item)).not.toMatch(/SNAPSHOT DA GENERATION|MODELO DE HOJE|Pedido do post/)
  })

  it('prova de outra URL do mesmo post não serve', async () => {
    banco.provas = [{ postId: 'post-1', mediaUrl: 'https://blob.test/posts/rendered/antiga.png', layersSnapshot: [{ id: 'h', type: 'text', content: 'ANTIGA', visible: true }] }]
    const item = await itemDaAgenda()
    expect(item.textos).toBeUndefined()
    expect(JSON.stringify(item)).not.toMatch(/ANTIGA/)
  })
})
