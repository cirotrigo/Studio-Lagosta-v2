/**
 * R51 da revisão FINAL sobre 16af4e20 (13/09/2026): trocar a arte de um rascunho
 * de mídia única pela GALERIA deixa `pageId` como vínculo HISTÓRICO
 * (`NOT_NEEDED`, página conservada). `ver-agenda` carregava a página antiga e
 * devolvia os textos DELA com origem `pagina`, antes de olhar a mídia atual e a
 * procedência dela — a revisão semanal recebia a copy da arte anterior.
 *
 * O caminho real, ponta a ponta: o post nasce com `pageId=A` renderizando da
 * página A, `trocarArteDoPost` troca pela arte B da galeria, e o handler de
 * `ver-agenda` lê o post como ficou. Banco falso; serviço e handler reais.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  post: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  paginas: [] as Array<Record<string, any>>,
}))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findUnique: async () => structuredClone(banco.post),
      findMany: async () => [structuredClone(banco.post)],
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.post = { ...banco.post, ...data }
        return { count: 1 }
      },
    },
    generation: {
      findFirst: async ({ where }: { where: { id: string; projectId: number } }) =>
        banco.generations.find((g) => g.id === where.id && g.projectId === where.projectId) ?? null,
      findMany: async ({ where }: { where: { projectId: number; resultUrl: { in: string[] } } }) =>
        banco.generations.filter((g) => g.projectId === where.projectId && where.resultUrl.in.includes(g.resultUrl)),
    },
    page: {
      findMany: async ({ where }: { where: { id: { in: string[] }; Template: { projectId: number } } }) =>
        banco.paginas.filter((p) => where.id.in.includes(p.id) && p.projectId === where.Template.projectId).map((p) => ({ id: p.id, layers: p.layers })),
    },
    knowledgeBaseEntry: { findMany: async () => [] },
    postLog: { create: async () => ({}) },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../../prisma/generated/client'))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: async (urls: string[]) => ({ urls, falhas: [] }), ehHostProprio: () => true }))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test', renderPageAndRegister: vi.fn() }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: async () => null }))

import { Prisma } from '../../../../../prisma/generated/client'
import { trocarArteDoPost } from '@/lib/posts/trocar-arte-do-post'
import { toolsDeAgenda } from '../agenda'

const URL_A = 'https://blob.test/arte-rapida/8/A.png'
const URL_B = 'https://blob.test/arte-rapida/8/B.png'
const verAgenda = toolsDeAgenda.find((t) => t.nome === 'ver-agenda')!

const camadasDaPaginaA = JSON.stringify([
  { id: 'h', name: 'headline', type: 'text', content: 'Copy da página A', visible: true, order: 1 },
  { id: 'a', name: 'apoio', type: 'text', content: 'Apoio de A', visible: true, order: 2 },
])

function arteB(fieldValues: Record<string, unknown>) {
  return { id: 'gen-b', projectId: 8, resultUrl: URL_B, fieldValues }
}

async function itemDaAgenda() {
  const r = (await verAgenda.handler({ projectId: 8, from: '2026-09-14', to: '2026-09-20' }, { kind: 'service' } as never)) as { dias: Array<{ posts: Array<Record<string, any>> }> }
  return r.dias[0].posts[0]
}

beforeEach(() => {
  banco.paginas = [{ id: 'pag-A', projectId: 8, layers: camadasDaPaginaA }]
  banco.generations = [{ id: 'gen-a', projectId: 8, resultUrl: URL_A, fieldValues: { source: 'post-schedule', pageId: 'pag-A' } }]
  banco.post = {
    id: 'post-1',
    projectId: 8,
    postType: 'STORY',
    status: 'DRAFT',
    caption: null,
    scheduledDatetime: new Date('2026-09-16T22:00:00Z'),
    publishedUrl: null,
    publishType: 'DIRECT',
    mediaUrls: [URL_A],
    generationId: 'gen-a',
    laterPostId: null,
    learningScope: 'ROTINA',
    campaignId: null,
    pageId: 'pag-A',
    templateId: 77,
    renderStatus: 'RENDERED',
    slotValues: null,
  }
})

describe('R51 — ver-agenda depois de trocar a arte pela galeria', () => {
  it('controle: o post que renderiza da SUA página segue devolvendo os textos da página', async () => {
    const item = await itemDaAgenda()
    expect(item.textos).toEqual(['Copy da página A', 'Apoio de A'])
    expect(item.textosOrigem).toBe('pagina')
  })

  it('B re-renderizada SEM marcador: nenhum texto de A — a fonte é declarada indisponível', async () => {
    banco.generations.push(arteB({ source: 'ajuste-arte', pageId: 'pag-B-fora-do-projeto', slotValues: { headline: 'Copy de outra versão de B' }, recomposicao: { estado: 're-renderizada' } }))
    await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
    expect(banco.post!.pageId).toBe('pag-A')
    expect(banco.post!.renderStatus).toBe('NOT_NEEDED')
    expect(banco.post!.slotValues).toBe(Prisma.DbNull)
    banco.post!.slotValues = null // o que o banco devolve de um DbNull

    const item = await itemDaAgenda()
    expect(JSON.stringify(item)).not.toContain('página A')
    expect(JSON.stringify(item)).not.toContain('Apoio de A')
    expect(JSON.stringify(item)).not.toContain('outra versão')
    expect(item.textos).toBeUndefined()
    expect(item.textosIndisponiveis).toMatch(/re-renderizada/)
  })

  it('B re-renderizada COM a copy visual regravada: só a copy de B, qualificada como parcial — nada de A', async () => {
    banco.generations.push(arteB({ source: 'ajuste-arte', pageId: 'pag-B-fora-do-projeto', slotValues: { headline: 'Copy B regravada' }, recomposicao: { estado: 're-renderizada', copyVisualRegravada: true } }))
    await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
    expect(banco.post!.pageId).toBe('pag-A')

    const item = await itemDaAgenda()
    expect(item.textos).toEqual(['Copy B regravada'])
    expect(item.textosOrigem).toBe('arte')
    expect(item.textosParciais).toBe(true)
    expect(JSON.stringify(item)).not.toContain('página A')
  })

  it('registro ANTIGO (anterior ao C6-03) já nessa situação: nem a página A nem a copy de outra versão guardada no post são afirmadas', async () => {
    banco.generations.push(arteB({ source: 'ajuste-arte', slotValues: { headline: 'Copy de outra versão de B' }, recomposicao: { estado: 're-renderizada' } }))
    banco.post = { ...banco.post!, mediaUrls: [URL_B], generationId: 'gen-b', renderStatus: 'NOT_NEEDED', slotValues: { headline: 'Copy de outra versão de B' } }

    const item = await itemDaAgenda()
    expect(item.textos).toBeUndefined()
    expect(item.textosIndisponiveis).toBeTruthy()
    expect(JSON.stringify(item)).not.toContain('página A')
    expect(JSON.stringify(item)).not.toContain('Apoio de A')
  })

  /**
   * R52 (revisão FINAL sobre 7e96c643, 18/09/2026): a arte B da galeria é de MODELO (`post-schedule`) e aponta para a
   * MESMA página do post. O render aplicou `{ l1: '' , headline: 'Costela' }` — o id vence o nome, e o PNG não tem
   * "Costela". A troca descarta o `l1` vazio e grava `{ headline: 'Costela' }` no post; a igualdade de `pageId` fazia
   * a agenda aplicar isso à página e afirmar "Costela". A procedência da mídia manda, com ou sem registro das camadas.
   */
  describe('R52 — B de modelo apontando para a MESMA página do post, com id e nome endereçando a mesma camada', () => {
    const paginaDoModelo = [{ id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo', visible: true, order: 1 }]
    for (const [caso, snapshot] of [['sem registro das camadas', undefined], ['com registro das camadas', paginaDoModelo]] as const) {
      it(`${caso}: "Costela" não é afirmado`, async () => {
        banco.paginas = [{ id: 'pag-A', projectId: 8, layers: JSON.stringify(paginaDoModelo) }]
        banco.generations.push(arteB({ source: 'post-schedule', pageId: 'pag-A', slotValues: { l1: { content: '' }, headline: 'Costela' }, ...(snapshot ? { layersSnapshot: snapshot } : {}) }))
        await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
        expect(banco.post!.pageId).toBe('pag-A')
        expect(banco.post!.renderStatus).toBe('NOT_NEEDED')
        expect(banco.post!.slotValues).toEqual({ headline: 'Costela' })

        const item = await itemDaAgenda()
        expect(JSON.stringify(item)).not.toContain('Costela')
        expect(item.textosOrigem).not.toBe('pagina-com-copy-do-post')
        expect(item.textos ?? []).toEqual([])
        expect(item.textosIndisponiveis).toBeTruthy()
      })
    }
  })

  /**
   * Varredura da classe do R52 (18/09/2026): com a arte da PRÓPRIA página (não de modelo), a página segue sendo a
   * fonte — mas os slots que o post herdou na troca NÃO são entrada de render nenhum (`NOT_NEEDED`: o PNG é o da arte,
   * mantido em dia com a página pela recomposição). Depois de editar a página, aplicá-los devolvia o texto de antes.
   */
  it('arte da própria página, página editada depois da troca: vale a página como está, nunca os slots herdados', async () => {
    const pagina = (texto: string) => JSON.stringify([{ id: 'h', name: 'headline', type: 'text', content: texto, visible: true, order: 1 }])
    banco.paginas = [{ id: 'pag-A', projectId: 8, layers: pagina('Copy X') }]
    banco.generations.push(arteB({ source: 'ajuste-arte', pageId: 'pag-A', slotValues: { headline: 'Copy X' }, layersSnapshot: JSON.parse(pagina('Copy X')) }))
    await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
    expect(banco.post!.slotValues).toEqual({ headline: 'Copy X' })
    // a página é editada e a arte B é re-renderizada como a página ficou, com a copy visual regravada
    banco.paginas = [{ id: 'pag-A', projectId: 8, layers: pagina('Copy Y') }]
    banco.generations[1].fieldValues = { ...banco.generations[1].fieldValues, slotValues: { headline: 'Copy Y' }, recomposicao: { estado: 're-renderizada', copyVisualRegravada: true } }

    const item = await itemDaAgenda()
    expect(item.textos).toEqual(['Copy Y'])
    expect(item.textosOrigem).toBe('pagina')
    expect(JSON.stringify(item)).not.toContain('Copy X')
  })
})
