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
  sql: [] as Array<{ sql: string; valores: unknown[] }>,
  logs: [] as Array<Record<string, any>>,
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
    postLog: {
      create: async ({ data }: { data: Record<string, any> }) => {
        banco.logs.push(data)
        return data
      },
    },
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      banco.sql.push({ sql: partes.join('?'), valores })
      return 1
    },
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

import { mensagemDaRecusaNoHistorico, recomporPaginaDefasada, registrarRecusa } from '@/lib/compositor/recompor'
import { CreativeError } from '@/lib/creatives/errors'

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
  banco.sql = []
  banco.logs = []
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

describe('recompor — a recusa não apaga o registro do re-render (C6-01 da pré-revisão do HEAD f0eee811)', () => {
  const REGISTRO = { estado: 're-renderizada', em: '2026-09-12T20:00:00.000Z', copyVisualRegravada: true, urlsAnteriores: [URL_ANTIGA], avisos: [] }

  it('a RECUSA grava só `recusaDaRecomposicao` (merge raso no banco): o merge preserva estado, marcador, rastro e a copy visual', async () => {
    const antes = { source: 'ajuste-arte', pageId: 'p9', slotValues: { Título: 'Almoço executivo' }, recomposicao: REGISTRO }
    await registrarRecusa({ pageId: 'p9', generationId: 'gen-antiga', postIds: [], erro: new CreativeError('TEXTO_NAO_CABE_NA_COLUNA', 'A linha não cabe na coluna.', 422) })
    const merges = banco.sql.filter((q) => q.sql.includes('||'))
    expect(merges).toHaveLength(1)
    expect(merges[0].valores.at(-1)).toBe('gen-antiga')
    const patch = JSON.parse(String(merges[0].valores[0])) as Record<string, any>
    expect(Object.keys(patch)).toEqual(['recusaDaRecomposicao'])
    expect(patch.recusaDaRecomposicao).toMatchObject({ erro: 'A linha não cabe na coluna.', errorCode: 'TEXTO_NAO_CABE_NA_COLUNA' })
    expect(typeof patch.recusaDaRecomposicao.em).toBe('string')
    const depois = { ...antes, ...patch }
    expect(depois.recomposicao).toEqual(REGISTRO)
    expect(depois.slotValues).toEqual(antes.slotValues)
  })

  it('o re-render seguinte que dá certo limpa a recusa anterior (`recusaDaRecomposicao: null` no mesmo patch)', async () => {
    const patch = await patchDoReRender(CAMADAS, { source: 'ajuste-arte', pageId: 'p9', slotValues: { Título: 'Texto antigo' }, recusaDaRecomposicao: { errorCode: 'TEXTO_NAO_CABE_NA_COLUNA' } })
    expect('recusaDaRecomposicao' in patch).toBe(true)
    expect(patch.recusaDaRecomposicao).toBeNull()
  })

  it('merge raso: um re-render SEM regravação (página ilegível) depois de um com marcador tira o marcador do registro', async () => {
    const comMarca = { source: 'ajuste-arte', pageId: 'p9', slotValues: { Título: 'Almoço executivo' }, recomposicao: REGISTRO }
    const patch = await patchDoReRender('{{ilegível', comMarca)
    const depois = { ...comMarca, ...patch } as Record<string, any>
    expect(depois.recomposicao.estado).toBe('re-renderizada')
    expect('copyVisualRegravada' in depois.recomposicao).toBe(false)
    expect(depois.slotValues).toEqual(comMarca.slotValues)
  })
})

describe('recompor — a recusa no histórico diz o que aconteceu com a imagem (C6-12 da pré-revisão do PR 6)', () => {
  it('post cujo slide JÁ recebeu o PNG desta rodada não ouve "a imagem continua sendo a anterior"; o outro ouve; a arte guarda `arteTrocada`', async () => {
    await registrarRecusa({
      pageId: 'p9',
      generationId: 'gen-antiga',
      postIds: ['post-trocado', 'post-parado'],
      erro: new CreativeError('PAGINA_MUDOU_DURANTE', 'a página foi editada de novo enquanto a arte era refeita.', 409),
      arteTrocada: true,
      postsComArteNova: ['post-trocado'],
    })
    const porPost = new Map(banco.logs.map((l) => [l.postId, String(l.message)]))
    expect(porPost.get('post-trocado')).toMatch(/já foi trocada/)
    expect(porPost.get('post-trocado')).not.toMatch(/continua sendo a anterior/)
    expect(porPost.get('post-parado')).toMatch(/continua sendo a anterior/)
    // o conselho é neutro: a mudança pode ter sido a foto, não o texto
    for (const m of porPost.values()) {
      expect(m).not.toMatch(/ajuste o texto/)
      expect(m).toMatch(/confira a página e salve de novo/i)
    }
    const patch = JSON.parse(String(banco.sql.filter((q) => q.sql.includes('||'))[0].valores[0])) as Record<string, any>
    expect(patch.recusaDaRecomposicao.arteTrocada).toBe(true)
    // recusa sem troca: `arteTrocada` false, e a mensagem pura segue o mesmo contrato
    expect(mensagemDaRecusaNoHistorico('x.', false)).toMatch(/continua sendo a anterior — confira a página e salve de novo/)
  })
})
