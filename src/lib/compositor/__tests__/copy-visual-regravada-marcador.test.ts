/**
 * O MARCADOR da regravação da copy visual no re-render (integração do PR 0
 * com o R38/R42 do PR 6, 12/09/2026).
 *
 * `recomposicao.copyVisualRegravada: true` só entra no patch do re-render
 * quando os `slotValues` do MESMO patch são a copy visual deste PNG. Arte
 * re-renderizada sem o marcador segue carregando `slotValues` de outra versão
 * da mídia — e é por ele que os leitores do PR 6 decidem. O harness é o de
 * `copy-visual-nomes-repetidos.test.ts` (PR 0): o render é interrompido logo
 * depois de receber o patch, e o que se prova é o que a recuperação MANDA
 * gravar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
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
        banco.generations.filter((g) => (where.id ? g.id === where.id : true) && (where.resultUrl ? g.resultUrl === where.resultUrl : true)).at(-1) ?? null,
    },
    socialPost: { findMany: async () => banco.slides },
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

import { recomporPaginaDefasada } from '@/lib/compositor/recompor'

const CAMADAS = [
  { id: 'l-titulo', name: 'Título', type: 'text', content: 'Almoço executivo', visible: true, order: 1, position: { x: 100, y: 1400 }, size: { width: 880, height: 120 }, style: { fontSize: 80 } },
  { id: 'l-cta', name: 'CTA', type: 'text', content: 'Reserve', visible: false, order: 2, position: { x: 100, y: 1600 }, size: { width: 880, height: 60 }, style: { fontSize: 40 } },
]
const URL_ANTIGA = 'https://blob.test/arte-rapida/8/p9-antiga.png'

function arte(fieldValues: Record<string, unknown>) {
  return { id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'ajuste-arte', sourcePageId: null, fieldValues }
}

async function patchDoReRender(layers: unknown, fieldValues: Record<string, unknown>): Promise<Record<string, any>> {
  banco.pagina = { id: 'p9', name: 'Almoço', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers }
  banco.generations = [arte(fieldValues)]
  await expect(recomporPaginaDefasada({ pageId: 'p9', forcar: true })).rejects.toThrow(PARAR_NO_RENDER)
  expect(banco.renders).toHaveLength(1)
  return banco.renders[0].fieldValues as Record<string, any>
}

beforeEach(() => {
  banco.renders = []
  banco.slides = [{ id: 'post-carrossel', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', URL_ANTIGA], laterPostId: null }]
})

describe('recompor — o marcador `recomposicao.copyVisualRegravada` acompanha a copy visual regravada', () => {
  it('arte COM copy visual e página legível: o patch regrava os `slotValues` E marca, no mesmo registro do re-render', async () => {
    const patch = await patchDoReRender(CAMADAS, { source: 'ajuste-arte', pageId: 'p9', slotValues: { Título: 'Texto antigo', CTA: 'Reserve' } })
    expect(patch.slotValues).toEqual({ Título: 'Almoço executivo' })
    expect(patch.recomposicao).toMatchObject({ estado: 're-renderizada', copyVisualRegravada: true })
    expect(typeof patch.recomposicao.em).toBe('string')
  })

  it('página legível SEM texto visível: `{}` é copy visual (a arte não tem texto) — regrava e marca', async () => {
    const patch = await patchDoReRender([{ ...CAMADAS[0], visible: false }], { source: 'ajuste-arte', pageId: 'p9', slotValues: { Título: 'Texto antigo' } })
    expect(patch.slotValues).toEqual({})
    expect(patch.recomposicao.copyVisualRegravada).toBe(true)
  })

  it('página ILEGÍVEL: a copy visual fica como estava (fora do patch) e o registro NÃO leva o marcador', async () => {
    const patch = await patchDoReRender('{{ilegível', { source: 'ajuste-arte', pageId: 'p9', slotValues: { Título: 'Texto antigo' } })
    expect('slotValues' in patch).toBe(false)
    expect(patch.recomposicao.estado).toBe('re-renderizada')
    expect('copyVisualRegravada' in patch.recomposicao).toBe(false)
    expect(patch.recomposicao.avisos).toEqual(expect.arrayContaining([expect.stringMatching(/ilegíveis/)]))
  })

  it('arte SEM copy visual (não se inventa uma): nem `slotValues` nem marcador', async () => {
    const patch = await patchDoReRender(CAMADAS, { source: 'compositor', pageId: 'p9' })
    expect('slotValues' in patch).toBe(false)
    expect(patch.recomposicao.estado).toBe('re-renderizada')
    expect('copyVisualRegravada' in patch.recomposicao).toBe(false)
  })
})
