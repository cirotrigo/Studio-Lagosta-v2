/**
 * REV-FINAL-02 (revisão FINAL do Codex sobre 618e45f7, 12/09/2026): a copy
 * VISUAL não perde texto de camadas com o MESMO nome.
 *
 * Duas camadas visíveis com ids distintos e o mesmo nome ("Texto"), uma em
 * texto simples e outra em rich text — nas três formas em que `Page.layers`
 * aparece no banco (array, string JSON, string dupla-codificada). O caminho
 * real da recuperação forçada (`recomporPaginaDefasada`, re-render sobre uma
 * Generation ANTIGA cujo mapa já tinha colapsado), os textos esperados da
 * conferência (`extractExpectedTexts`) e o agendamento só pela Generation e
 * pela URL (`agendarPost`). O render é interrompido de propósito logo depois
 * de receber o patch: o que se prova é o que a recuperação MANDA gravar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  posts: [] as Array<Record<string, any>>,
  slides: [] as Array<Record<string, any>>,
  renders: [] as Array<Record<string, any>>,
}))

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    project: { findUnique: async () => ({ id: 8, name: 'Lagosta Criativa', userId: 'dono-interno', instagramAccountId: null }) },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 8 } } : null,
    },
    generation: {
      findMany: async () => [...banco.generations].reverse(),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        banco.generations
          .filter((g) => (where.id ? g.id === where.id : true) && (where.resultUrl ? g.resultUrl === where.resultUrl : true) && (where.projectId ? g.projectId === where.projectId : true))
          .at(-1) ?? null,
    },
    socialPost: {
      findMany: async () => banco.slides,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const post = { id: `post-${banco.posts.length + 1}`, ...data }
        banco.posts.push(post)
        return post
      },
    },
    knowledgeBaseEntry: { findFirst: async () => null },
    $executeRaw: async () => 1,
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: vi.fn() }))

const PARAR_NO_RENDER = 'parar-no-render-da-prova'
vi.mock('@/lib/creatives/persist', () => ({
  getPublicAppUrl: () => 'https://studio.test',
  renderPageAndRegister: async (input: Record<string, unknown>) => {
    banco.renders.push(input)
    throw new Error(PARAR_NO_RENDER)
  },
}))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: vi.fn() }))
vi.mock('@/lib/ai/generation-queue', () => ({
  marcarForcaAtendida: vi.fn(),
  marcarForcaEmExecucao: vi.fn(),
  marcarRenderComoEsta: vi.fn(),
  pedirNovaTentativa: vi.fn(),
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: async (urls: string[]) => ({ urls, falhas: [] }) }))
vi.mock('@/lib/aprendizado/sinal-de-agendamento', () => ({
  registrarSlotDoPost: async () => null,
  registrarCopyDoPost: async () => null,
  fecharSugestaoDeSlot: async () => null,
}))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarLegendaDoPost: async () => null }))
vi.mock('@/lib/posts/artes-do-post', () => ({ registrarArtesDoPost: async () => ({ artes: [] }) }))

import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { agendarPost } from '../agendar'
import { copyVisualDasCamadas, lerProcedencia } from '../procedencia-da-copy'
import { extractExpectedTexts } from '@/lib/ai/creative-text-verification'

const CAMADAS = [
  { id: 'l-titulo', name: 'Texto', type: 'text', content: 'Almoço executivo', visible: true, order: 1, position: { x: 100, y: 1400 }, size: { width: 880, height: 120 }, style: { fontSize: 80 } },
  { id: 'l-horario', name: 'Texto', type: 'rich-text', content: 'Até 15h', visible: true, order: 2, position: { x: 100, y: 1600 }, size: { width: 880, height: 60 }, style: { fontSize: 40 }, richTextStyles: [{ start: 4, end: 7, fontWeight: 700 }] },
]
const ESPERADA = { Texto: 'Almoço executivo', 'Texto#2': 'Até 15h' }

const FORMAS: Array<[string, unknown]> = [
  ['array', CAMADAS],
  ['string JSON', JSON.stringify(CAMADAS)],
  ['string dupla-codificada', JSON.stringify(JSON.stringify(CAMADAS))],
]

const URL_ANTIGA = 'https://blob.test/arte-rapida/8/p9-antiga.png'

beforeEach(() => {
  banco.generations = []
  banco.posts = []
  banco.renders = []
  banco.slides = [
    // Slide de carrossel (várias mídias, sem página): a invalidação não o alcança, a recuperação sim.
    { id: 'post-carrossel', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', URL_ANTIGA], laterPostId: null },
  ]
})

describe.each(FORMAS)('REV-FINAL-02 — nomes repetidos entre text e rich-text, Page.layers em %s', (_forma, layers) => {
  it('copyVisualDasCamadas guarda os DOIS textos, inteiros, com a chave única de textosDaPagina; a conferência exige os dois', () => {
    const copy = copyVisualDasCamadas(layers)
    expect(copy).toEqual(ESPERADA)
    expect(extractExpectedTexts({ slotValues: copy })).toEqual(expect.arrayContaining(['Almoço executivo', 'Até 15h']))
  })

  it('a recuperação forçada de uma Generation ANTIGA (mapa já colapsado) regrava a copy visual com os dois; os textos esperados e o agendamento por Generation e por URL herdam os dois', async () => {
    banco.pagina = { id: 'p9', name: 'Almoço', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers }
    // A arte antiga: renderizada com as duas camadas, mas com a copy visual gravada pelo mapa que colapsava.
    banco.generations = [
      { id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'ajuste-arte', sourcePageId: null, fieldValues: { source: 'ajuste-arte', pageId: 'p9', slotValues: { Texto: 'Até 15h' } } },
    ]

    await expect(recomporPaginaDefasada({ pageId: 'p9', forcar: true })).rejects.toThrow(PARAR_NO_RENDER)
    expect(banco.renders).toHaveLength(1)
    const patch = banco.renders[0].fieldValues as Record<string, unknown>
    expect(banco.renders[0].generationId).toBe('gen-antiga')
    expect(patch.slotValues).toEqual(ESPERADA)

    // O que a arte passa a afirmar depois do merge do patch (o persist mescla só as chaves do patch).
    const url = 'https://blob.test/arte-rapida/8/p9-recuperada.png'
    const fvDepois = { ...banco.generations[0].fieldValues, ...patch }
    banco.generations[0] = { ...banco.generations[0], resultUrl: url, fieldValues: fvDepois }
    expect(extractExpectedTexts(fvDepois)).toEqual(expect.arrayContaining(['Almoço executivo', 'Até 15h']))
    expect(lerProcedencia(fvDepois, null).copyVisual).toEqual(ESPERADA)

    // Agendar SÓ pela Generation: a cópia textual do post carrega os dois textos.
    await agendarPost({ projectId: 8, generationId: 'gen-antiga', postType: 'STORY', scheduledDatetime: '2026-10-01 10:00', situacao: 'rascunho' })
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [url], generationId: 'gen-antiga', slotValues: ESPERADA })

    // Agendar pela URL (casada com a Generation pelo resultUrl): idem.
    await agendarPost({ projectId: 8, mediaUrls: [url], postType: 'STORY', scheduledDatetime: '2026-10-01 11:00', situacao: 'rascunho' })
    expect(banco.posts[1]).toMatchObject({ mediaUrls: [url], generationId: 'gen-antiga', slotValues: ESPERADA })
  })
})
