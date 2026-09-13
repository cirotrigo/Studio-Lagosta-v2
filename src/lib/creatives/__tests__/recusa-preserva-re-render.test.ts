/**
 * C6-01 da pré-revisão do HEAD f0eee811 (12/09/2026): a RECUSA de uma
 * recomposição depois de um re-render não reabre R13/R37/R38/R42.
 *
 * O caminho real: `registrarRecusa` (recompor.ts) grava o patch pelo merge raso
 * do banco (o falso aplica `fieldValues || patch`), e os leitores — a
 * procedência do agendamento (`lerProcedencia` / `agendarPost`), a arte como a
 * agenda a monta (`arteDosFieldValues`) e `textosDaPeca` — leem o `fieldValues`
 * resultante. Antes, a recusa trocava `recomposicao` inteiro por
 * `{ estado: 'recusada' }` e o PNG re-renderizado ficava: os leitores voltavam a
 * confiar no snapshot e na copy de outra versão da mídia.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  generations: [] as Array<Record<string, any>>,
  posts: [] as Array<Record<string, any>>,
}))

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    project: { findUnique: async () => ({ id: 8, name: 'Lagosta Criativa', userId: 'dono-interno', instagramAccountId: null }) },
    generation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        banco.generations
          .filter((g) => (where.id ? g.id === where.id : true) && (where.resultUrl ? g.resultUrl === where.resultUrl : true) && (where.projectId ? g.projectId === where.projectId : true))
          .at(-1) ?? null,
    },
    socialPost: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const post = { id: `post-${banco.posts.length + 1}`, ...data }
        banco.posts.push(post)
        return post
      },
    },
    knowledgeBaseEntry: { findFirst: async () => null },
    postLog: { create: async () => ({}) },
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      // O merge raso de `mesclarFieldValuesDaArte`: `fieldValues || patch` sobre o valor atual da linha.
      const sql = partes.join('?')
      if (!sql.includes('||')) throw new Error(`SQL inesperado no teste: ${sql}`)
      const g = banco.generations.find((x) => x.id === String(valores[valores.length - 1]))
      if (!g) return 0
      g.fieldValues = { ...g.fieldValues, ...(JSON.parse(String(valores[0])) as Record<string, unknown>) }
      return 1
    },
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: vi.fn() }))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test', renderPageAndRegister: vi.fn() }))
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

import { registrarRecusa } from '@/lib/compositor/recompor'
import { CreativeError } from '@/lib/creatives/errors'
import { arteDosFieldValues, textosDaPeca } from '@/lib/posts/textos-da-peca'
import { agendarPost } from '../agendar'
import { lerProcedencia } from '../procedencia-da-copy'

const URL_B = 'https://blob.test/arte-rapida/8/p9-B.png'
const snap = (texto: string) => [{ id: 'l1', name: 'headline', type: 'text', content: texto }]

/** A arte já re-renderizada (PNG B) e, depois, uma recomposição recusada. Devolve o `fieldValues` como fica no banco. */
async function reRenderizadaERecusada(fieldValues: Record<string, unknown>): Promise<Record<string, any>> {
  banco.generations = [{ id: 'gen-b', projectId: 8, resultUrl: URL_B, sourcePageId: null, fieldValues }]
  await registrarRecusa({
    pageId: 'p9',
    generationId: 'gen-b',
    postIds: [],
    erro: new CreativeError('TEXTO_NAO_CABE_NA_COLUNA', 'A linha não cabe na coluna nem a 80% da fonte.', 422),
  })
  const fv = banco.generations[0].fieldValues as Record<string, any>
  expect(fv.recusaDaRecomposicao).toMatchObject({ errorCode: 'TEXTO_NAO_CABE_NA_COLUNA' })
  expect(fv.recomposicao).toEqual(fieldValues.recomposicao)
  return fv
}

const entregueSemPagina = (slotValues: unknown) => ({ pageId: null, generationId: 'gen-b', mediaUrls: [URL_B], slotValues, status: 'POSTED', laterPostId: null })

beforeEach(() => {
  banco.generations = []
  banco.posts = []
})

describe('C6-01 — a recusa depois do re-render não reabre as regras do PR 6', () => {
  it('R38/R42 — re-renderizada SEM o marcador e recusada: a copy A segue invalidada no agendamento e na agenda', async () => {
    const fv = await reRenderizadaERecusada({ source: 'ajuste-arte', pageId: 'p9', slotValues: { headline: 'Copy A de outra versão' }, recomposicao: { estado: 're-renderizada', em: '2026-09-12T20:00:00.000Z', urlsAnteriores: ['https://blob.test/A.png'] } })
    expect(lerProcedencia(fv, null)).toMatchObject({ copyVisual: null, copyInvalidada: true })

    const ag = await agendarPost({ projectId: 8, generationId: 'gen-b', postType: 'STORY', scheduledDatetime: '2026-10-01 10:00', situacao: 'rascunho' })
    expect(banco.posts[0].mediaUrls).toEqual([URL_B])
    expect(JSON.stringify(banco.posts[0].slotValues ?? null)).not.toContain('Copy A')
    expect((ag as { aviso?: string }).aviso).toMatch(/re-renderizada/)

    const r = textosDaPeca(entregueSemPagina({ headline: 'Copy A de outra versão' }), { slides: [{ url: URL_B, arte: arteDosFieldValues(fv) }] })
    expect(r.textos).toEqual([])
    expect(r.indisponiveis).toMatch(/re-renderizada/)
    expect(JSON.stringify(r)).not.toContain('Copy A')
  })

  it('COM o marcador e recusada: a copy regravada segue valendo — o post herda B e a agenda afirma B pela mídia', async () => {
    const fv = await reRenderizadaERecusada({ source: 'ajuste-arte', pageId: 'p9', layersSnapshot: snap('Copy A antiga'), slotValues: { headline: 'Copy B regravada' }, recomposicao: { estado: 're-renderizada', em: '2026-09-12T20:00:00.000Z', copyVisualRegravada: true, urlsAnteriores: ['https://blob.test/A.png'] } })
    expect(lerProcedencia(fv, null)).toMatchObject({ copyVisual: { headline: 'Copy B regravada' }, copyInvalidada: false })

    const ag = await agendarPost({ projectId: 8, generationId: 'gen-b', postType: 'STORY', scheduledDatetime: '2026-10-01 10:00', situacao: 'rascunho' })
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [URL_B], slotValues: { headline: 'Copy B regravada' } })
    expect((ag as { aviso?: string }).aviso ?? '').not.toMatch(/re-renderizada/)

    const r = textosDaPeca(entregueSemPagina({ headline: 'Copy B regravada' }), { slides: [{ url: URL_B, arte: arteDosFieldValues(fv) }] })
    expect(r).toMatchObject({ textos: ['Copy B regravada'], origem: 'arte', parcial: true })
    expect(JSON.stringify(r)).not.toContain('Copy A')
  })

  it('R13 — slide do compositor re-renderizado (snapshot A, sem copy visual) e recusado: o snapshot A continua sem afirmar texto pela mídia B', async () => {
    const fv = await reRenderizadaERecusada({ source: 'compositor', pageId: 'p9', spec: { formato: 'story' }, layersSnapshot: snap('Texto A antigo'), recomposicao: { estado: 're-renderizada', em: '2026-09-12T20:00:00.000Z' } })
    const capa = 'https://blob.test/capa.png'
    const r = textosDaPeca(
      { pageId: null, generationId: null, mediaUrls: [capa, URL_B], slotValues: null, status: 'POSTED', laterPostId: null },
      { slides: [{ url: capa, arte: arteDosFieldValues({ source: 'compositor', layersSnapshot: snap('Capa') }) }, { url: URL_B, arte: arteDosFieldValues(fv) }] },
    )
    expect(r.textos).toEqual(['Capa'])
    expect(r.slides?.[1].indisponiveis).toMatch(/re-renderizada/)
    expect(JSON.stringify(r)).not.toContain('Texto A antigo')
  })

  it('R37 — arte de post-schedule re-renderizada e recusada não volta à leitura de modelo', async () => {
    const fv = await reRenderizadaERecusada({ source: 'post-schedule', pageId: 'tpl', slotValues: { headline: 'Copy A do modelo' }, layersSnapshot: snap('Título do modelo'), recomposicao: { estado: 're-renderizada', em: '2026-09-12T20:00:00.000Z' } })
    expect(arteDosFieldValues(fv)).toMatchObject({ reRenderizada: true, copyVisualRegravada: false })
    const r = textosDaPeca(entregueSemPagina({ headline: 'Copy A do modelo' }), { slides: [{ url: URL_B, arte: arteDosFieldValues(fv) }] })
    expect(r.textos).toEqual([])
    expect(JSON.stringify(r)).not.toMatch(/Copy A do modelo|Título do modelo/)
  })
})
