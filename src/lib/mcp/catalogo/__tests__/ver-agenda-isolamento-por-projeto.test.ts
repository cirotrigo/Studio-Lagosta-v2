/**
 * Isolamento por projeto na leitura de textos de `ver-agenda` (R29/R30/R32), depois do R51 (13/09/2026).
 *
 * A prova-dev-36 sobre cf3bff3a pegou a regressão: o R51 tratava como "página histórica" também o post SEM mídia
 * nenhuma (`arteDaMidia` ausente ≠ `pageId`), o que calava a declaração de fonte INDISPONÍVEL do post com página de
 * outro projeto e zerava os textos do post `NOT_NEEDED` com página do próprio projeto. Não havia vazamento — páginas e
 * artes são carregadas filtradas por projeto —, e é isso que este teste trava: o banco falso filtra por projeto SÓ
 * quando a consulta pede, então tirar o filtro do handler faz os textos de B aparecerem aqui.
 *
 * Caminho real: o handler de `ver-agenda` com o módulo puro de textos; só o banco é falso.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  posts: [] as Array<Record<string, any>>,
  generations: [] as Array<Record<string, any>>,
  paginas: [] as Array<Record<string, any>>,
}))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findMany: async ({ where }: { where: { projectId?: number } }) =>
        structuredClone(banco.posts.filter((p) => where?.projectId === undefined || p.projectId === where.projectId)),
    },
    generation: {
      // Filtra por projeto só se a consulta pedir: sem o filtro no handler, a arte de outro projeto é devolvida.
      findMany: async ({ where }: { where: { projectId?: number; resultUrl: { in: string[] } } }) =>
        banco.generations.filter((g) => (where.projectId === undefined || g.projectId === where.projectId) && where.resultUrl.in.includes(g.resultUrl)),
    },
    page: {
      // Idem: sem `Template: { projectId }` no handler, a página de outro projeto é devolvida.
      findMany: async ({ where }: { where: { id: { in: string[] }; Template?: { projectId?: number } } }) =>
        banco.paginas
          .filter((p) => where.id.in.includes(p.id) && (where.Template?.projectId === undefined || p.projectId === where.Template.projectId))
          .map((p) => ({ id: p.id, layers: p.layers })),
    },
    knowledgeBaseEntry: { findMany: async () => [] },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../../prisma/generated/client'))

import { toolsDeAgenda } from '../agenda'

const PROJETO = 8
const OUTRO = 9
const verAgenda = toolsDeAgenda.find((t) => t.nome === 'ver-agenda')!

const URL_SEM_ARTE = 'https://blob.test/uploads/8/sem-arte.png'
const URL_ARTE_DE_OUTRO = 'https://blob.test/arte-rapida/9/de-outro.png'
const URL_ARTE_DAQUI_COM_PAGINA_DE_OUTRO = 'https://blob.test/arte-rapida/8/aponta-para-9.png'

const camada = (id: string, content: string, order: number) => ({ id, name: `camada-${id}`, type: 'text', content, visible: true, order })
const TEXTO_DE_OUTRO = 'Texto do projeto nove'
const SNAPSHOT_DE_OUTRO = 'Snapshot do projeto nove'
const vazou = (item: Record<string, unknown>) => /projeto nove/.test(JSON.stringify(item))

function post(id: string, campos: Record<string, unknown>) {
  return {
    id,
    projectId: PROJETO,
    postType: 'STORY',
    status: 'DRAFT',
    caption: null,
    scheduledDatetime: new Date('2026-09-16T22:00:00Z'),
    publishedUrl: null,
    publishType: 'DIRECT',
    mediaUrls: [],
    generationId: null,
    laterPostId: null,
    learningScope: 'ROTINA',
    campaignId: null,
    pageId: null,
    renderStatus: 'NOT_NEEDED',
    slotValues: null,
    ...campos,
  }
}

async function itemDoPost(id: string) {
  const r = (await verAgenda.handler({ projectId: PROJETO, from: '2026-09-14', to: '2026-09-20' }, { kind: 'service' } as never)) as {
    dias: Array<{ posts: Array<Record<string, any>> }>
  }
  const item = r.dias.flatMap((d) => d.posts).find((p) => p.postId === id)
  expect(item).toBeDefined()
  return item!
}

beforeEach(() => {
  banco.paginas = [
    { id: 'pag-A', projectId: PROJETO, layers: JSON.stringify([camada('h', 'Copy da página A', 1)]) },
    { id: 'pag-OUTRO', projectId: OUTRO, layers: JSON.stringify([camada('h', TEXTO_DE_OUTRO, 1)]) },
  ]
  banco.generations = [
    // Arte de OUTRO projeto, com snapshot confiável: se fosse carregada, afirmaria o texto dela.
    { id: 'gen-outro', projectId: OUTRO, resultUrl: URL_ARTE_DE_OUTRO, fieldValues: { pageId: 'pag-OUTRO', layersSnapshot: [camada('s', SNAPSHOT_DE_OUTRO, 1)] } },
    // Arte DESTE projeto cujo `fieldValues.pageId` aponta para a página de outro projeto (R32).
    { id: 'gen-aponta', projectId: PROJETO, resultUrl: URL_ARTE_DAQUI_COM_PAGINA_DE_OUTRO, fieldValues: { pageId: 'pag-OUTRO' } },
  ]
  banco.posts = []
})

describe('ver-agenda: página ou arte de OUTRO projeto nunca entrega textos (R29/R30/R32), com e sem mídia', () => {
  it.each(['NOT_NEEDED', 'RENDERED'])('pageId de outro projeto SEM mídia (%s): sem textos, a página declarada indisponível', async (renderStatus) => {
    banco.posts = [post('p1', { pageId: 'pag-OUTRO', renderStatus })]
    const item = await itemDoPost('p1')
    expect(vazou(item)).toBe(false)
    expect(item.textos ?? []).toEqual([])
    expect(item.textosIndisponiveis).toMatch(/não pôde ser carregada/)
  })

  it.each(['NOT_NEEDED', 'RENDERED'])('pageId de outro projeto COM mídia sem arte registrada (%s): sem textos, fonte indisponível', async (renderStatus) => {
    banco.posts = [post('p2', { pageId: 'pag-OUTRO', renderStatus, mediaUrls: [URL_SEM_ARTE] })]
    const item = await itemDoPost('p2')
    expect(vazou(item)).toBe(false)
    expect(item.textos ?? []).toEqual([])
    expect(item.textosIndisponiveis).toBeTruthy()
  })

  it.each(['NOT_NEEDED', 'RENDERED'])('pageId de outro projeto COM mídia que é arte de outro projeto (%s): sem textos, fonte indisponível', async (renderStatus) => {
    banco.posts = [post('p3', { pageId: 'pag-OUTRO', renderStatus, mediaUrls: [URL_ARTE_DE_OUTRO], generationId: 'gen-outro' })]
    const item = await itemDoPost('p3')
    expect(vazou(item)).toBe(false)
    expect(item.textos ?? []).toEqual([])
    expect(item.textosIndisponiveis).toBeTruthy()
  })

  it.each(['NOT_NEEDED', 'RENDERED'])('post SEM página cuja mídia é a arte de OUTRO projeto (%s): sem os textos dela', async (renderStatus) => {
    banco.posts = [post('p4', { renderStatus, mediaUrls: [URL_ARTE_DE_OUTRO], generationId: 'gen-outro' })]
    const item = await itemDoPost('p4')
    expect(vazou(item)).toBe(false)
    expect(item.textos ?? []).toEqual([])
    expect(item.textosIndisponiveis).toBeTruthy()
  })

  it('post sem página cuja arte (deste projeto) aponta para página de OUTRO projeto: sem os textos dela, fonte indisponível', async () => {
    banco.posts = [post('p5', { mediaUrls: [URL_ARTE_DAQUI_COM_PAGINA_DE_OUTRO], generationId: 'gen-aponta' })]
    const item = await itemDoPost('p5')
    expect(vazou(item)).toBe(false)
    expect(item.textos ?? []).toEqual([])
    expect(item.textosIndisponiveis).toMatch(/a arte desta peça não afirma texto/)
  })

  it.each(['NOT_NEEDED', 'RENDERED'])('controle: pageId do PRÓPRIO projeto sem mídia (%s) segue devolvendo os textos da página', async (renderStatus) => {
    banco.posts = [post('p6', { pageId: 'pag-A', renderStatus })]
    const item = await itemDoPost('p6')
    expect(item.textos).toEqual(['Copy da página A'])
    expect(item.textosOrigem).toBe('pagina')
  })
})
