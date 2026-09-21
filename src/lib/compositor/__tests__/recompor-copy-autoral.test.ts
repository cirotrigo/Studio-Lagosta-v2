/**
 * PR3-F02 (revisão FINAL do Codex sobre abac9b34, 18/09/2026): o registro da
 * copy autoral da arte (`fieldValues.copyAutoral`) acompanha o PNG. O serviço
 * real (`recomporPaginaDefasada`) com o banco em memória:
 *  - RE-RENDER (a página ajustada à mão; aqui pela recuperação forçada, que
 *    cai no mesmo ramo): a efetiva é medida nas camadas que o PNG desenha;
 *  - RECOMPOSIÇÃO que troca a imagem sem conseguir medir a copy: a efetiva
 *    antiga não segue como se fosse a desta imagem (`efetiva: null`).
 * `ver-geracao` (`copyDaArte`) é conferido sobre o resultado do merge.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  slides: [] as Array<Record<string, any>>,
  renders: [] as Array<Record<string, any>>,
  sql: [] as Array<{ sql: string; valores: unknown[] }>,
  composta: [] as Array<Record<string, any>>,
}))

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    project: { findUnique: async () => ({ id: 8, name: 'Lagosta Criativa', userId: 'dono-interno', instagramAccountId: null }) },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 8 } } : null,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data }
        return { count: 1 }
      },
    },
    generation: {
      findMany: async () => [...banco.generations].reverse(),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        banco.generations.filter((g) => (where.id ? g.id === where.id : true) && (where.resultUrl ? g.resultUrl === where.resultUrl : true)).at(-1) ?? null,
    },
    socialPost: { findMany: async () => banco.slides },
    postLog: { create: async ({ data }: { data: unknown }) => data },
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      banco.sql.push({ sql: partes.join('?'), valores })
      return 1
    },
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async () => ({ url: 'https://blob.test/arte-rapida/8/p9-nova.png' })), del: vi.fn() }))

const PARAR_NO_RENDER = 'parar-no-render-da-prova'
vi.mock('@/lib/creatives/persist', () => ({
  getPublicAppUrl: () => 'https://studio.test',
  renderPageAndRegister: async (input: Record<string, unknown>) => {
    banco.renders.push(input)
    throw new Error(PARAR_NO_RENDER)
  },
}))
vi.mock('@/lib/compositor/compor', () => ({
  comporPeca: vi.fn(async () => ({ layers: banco.composta, prova: Buffer.from('png'), diagnostico: { avisos: [] } })),
}))
vi.mock('@/lib/ai/generation-queue', () => ({
  marcarForcaAtendida: vi.fn(),
  marcarForcaEmExecucao: vi.fn(),
  marcarRenderComoEsta: vi.fn(),
  pedirNovaTentativa: vi.fn(),
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))

import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { copyDaArte } from '@/lib/mcp/catalogo/ver-geracao-retorno'
import { MAX_REVISOES_DA_COPY, VERSAO_DO_CONTRATO, type CopyAutoral } from '@/lib/copy-autoral'

function texto(id: string, y: number, content: string) {
  return { id: `l-${id}`, name: id, type: 'text', content, visible: true, order: y, position: { x: 100, y }, size: { width: 880, height: 80 }, style: { fontSize: 60 }, metadata: { compositor: { papel: id } } }
}

function contrato(headline: string, revisoes = 0): CopyAutoral {
  return {
    versao: VERSAO_DO_CONTRATO,
    origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: [headline] },
      { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Sexta é dia'] },
    ],
    revisoes: Array.from({ length: revisoes }, () => ({ em: '2026-09-12T11:00:00.000Z', autor: 'equipe' as const, motivo: 'edição', superficie: 'editor', blocos: ['apoio'], campos: { apoio: ['linhas'] } })),
  }
}

const URL_ANTIGA = 'https://blob.test/arte-rapida/8/p9-antiga.png'
const registroAntigo = { original: contrato('Texto antigo'), efetiva: contrato('Texto antigo'), comparavel: true }

function arte(fieldValues: Record<string, unknown>) {
  return { id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { source: 'compositor', pageId: 'p9', ...fieldValues } }
}

function pagina(layers: unknown, copyAutoral: unknown) {
  banco.pagina = { id: 'p9', name: 'Sexta', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers, copyAutoral }
}

/** O patch que o merge da arte recebeu (a recomposição feita grava por `$executeRaw`). */
function patchDoMerge(): Record<string, any> {
  const merges = banco.sql.filter((q) => q.sql.includes('||'))
  expect(merges.length).toBeGreaterThan(0)
  return JSON.parse(String(merges.at(-1)!.valores[0]))
}

beforeEach(() => {
  banco.renders = []
  banco.sql = []
  banco.slides = [{ id: 'post-carrossel', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', URL_ANTIGA], laterPostId: null }]
})

describe('re-render: a efetiva acompanha o PNG (PR3-F02)', () => {
  it('a equipe mudou texto E posição (re-render): `copyAutoral.efetiva` é a copy desta imagem, e `ver-geracao` a mostra como desenhada', async () => {
    const camadas = [{ ...texto('headline', 200, 'Milk-shake em dobro'), position: { x: 140, y: 260 } }, texto('apoio', 400, 'Sexta é dia')]
    // o PATCH do editor já revisou o contrato da página (equipe)
    const daPagina = { ...contrato('Milk-shake em dobro'), revisoes: [{ em: '2026-09-12T11:00:00.000Z', autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', blocos: ['headline'], campos: { headline: ['linhas'] } }] }
    pagina(camadas, daPagina)
    banco.generations = [arte({ copyAutoral: registroAntigo })]
    await expect(recomporPaginaDefasada({ pageId: 'p9', forcar: true })).rejects.toThrow(PARAR_NO_RENDER)
    const patch = banco.renders[0].fieldValues as Record<string, any>
    expect(patch.copyAutoral.efetiva.blocos[0].linhas).toEqual(['Milk-shake em dobro'])
    expect(patch.copyAutoral.original).toEqual(registroAntigo.original)
    const vista = copyDaArte({ ...arte({ copyAutoral: registroAntigo }).fieldValues, ...patch })!
    expect(vista.desenhada[0].linhas).toEqual(['Milk-shake em dobro'])
    expect(vista.comparavel).toBe(true)
    expect(vista.blocosDiferentes).toEqual(['headline'])
  })

  it('contrato da página com o histórico CHEIO: a efetiva antiga NÃO segue — `efetiva: null`, não comparável, com o motivo', async () => {
    pagina([texto('headline', 200, 'Milk-shake em dobro'), texto('apoio', 400, 'Sexta é dia')], contrato('Texto antigo', MAX_REVISOES_DA_COPY))
    banco.generations = [arte({ copyAutoral: registroAntigo })]
    await expect(recomporPaginaDefasada({ pageId: 'p9', forcar: true })).rejects.toThrow(PARAR_NO_RENDER)
    const patch = banco.renders[0].fieldValues as Record<string, any>
    expect(patch.copyAutoral.efetiva).toBeNull()
    expect(patch.copyAutoral.comparavel).toBe(false)
    expect(patch.copyAutoral.lacunas.join(' ')).toMatch(/não pôde ser medida/)
    const vista = copyDaArte({ ...arte({ copyAutoral: registroAntigo }).fieldValues, ...patch })!
    expect(vista.comparavel).toBe(false)
    expect(vista.desenhada).toEqual([])
  })

  it('controle: arte SEM registro de copy não ganha um inventado', async () => {
    pagina([texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sexta é dia')], contrato('Milk-shake'))
    banco.generations = [arte({})]
    await expect(recomporPaginaDefasada({ pageId: 'p9', forcar: true })).rejects.toThrow(PARAR_NO_RENDER)
    expect('copyAutoral' in (banco.renders[0].fieldValues as Record<string, any>)).toBe(false)
  })
})

describe('recomposição que troca a imagem sem medir a copy (PR3-F02)', () => {
  it('histórico cheio: a página e a arte ficam sem contrato novo, e a efetiva antiga não segue como a desta imagem', async () => {
    const snapshot = [texto('headline', 200, 'Texto antigo'), texto('apoio', 400, 'Sexta é dia')]
    pagina([texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sexta é dia')], contrato('Milk-shake', MAX_REVISOES_DA_COPY))
    // o compositor desenhou outro texto (a seta do CTA, o destaque) — a leitura teria de registrar revisão, e não cabe
    banco.composta = [texto('headline', 200, 'Milk-shake →'), texto('apoio', 400, 'Sexta é dia')]
    banco.generations = [arte({ copyAutoral: registroAntigo, layersSnapshot: snapshot, spec: { projectId: 8, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Texto antigo'] }, { papel: 'apoio', linhas: ['Sexta é dia'] }], foto: { url: 'https://blob.test/foto.png' } } })]
    await recomporPaginaDefasada({ pageId: 'p9' }).catch(() => undefined)
    const patch = patchDoMerge()
    expect(patch.layersSnapshot[0].content).toBe('Milk-shake →')
    expect(patch.copyAutoral).toMatchObject({ efetiva: null, comparavel: false })
    expect(copyDaArte({ ...banco.generations[0].fieldValues, ...patch })!.desenhada).toEqual([])
  })
})
