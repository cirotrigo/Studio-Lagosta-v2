/**
 * H9 — #9 `minimal-divisao-cor-topo-arco@1` (publicado) pela aba Layouts: GET (vitrine com a caixa e a máscara) e POST
 * pela rota real → `comporPeca` REAL com a Montserrat do repo → página nova com a `bg-foto` mascarada (o path do arco
 * gravado), o fundo do liso e o serviço da origem em `foraDoLayout` (o #9 não tem serviço). Origem intacta; recusas 409
 * (origem sem foto) e 422 (template "Assinatura"). Dublados como no divisao-8 da rota: banco em memória (não é Postgres),
 * Clerk, espiões das guardas, Blob/fontes do projeto/autofix; a foto é a da worktree pelo dublê (nenhuma rede, Drive, Blob).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Pagina = Record<string, any>
const loja = vi.hoisted(() => ({ paginas: [] as Pagina[], seq: 0 }))
const espias = vi.hoisted(() => ({ invalidar: vi.fn(), recompor: vi.fn() }))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_dono', orgId: null }) }))
vi.mock('@/lib/compositor/recompor', () => ({ pedirRecomposicaoDaArteCongelada: espias.recompor }))
vi.mock('@/lib/posts/invalidate-renders', () => ({
  invalidateScheduledRenders: async (...args: unknown[]) => {
    espias.invalidar(...args)
    return { invalidados: 0, congelados: [], reabertos: 0 }
  },
}))
vi.mock('@/lib/db', async () => {
  const { cenario: c, mockDoBanco } = await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')
  const base = mockDoBanco().db as Record<string, any>
  const projeto = { id: 9009, userId: 'u-dono', organizationProjects: [] }
  const doEditor = (where: Record<string, any>) =>
    loja.paginas.filter((p) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'gte' in v ? p[k] >= v.gte : p[k] === v)))
  const db: Record<string, any> = {
    ...base,
    // As fontes do projeto = a Montserrat do repo (a do cenário do #9).
    project: { findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), titleFontFamily: 'Montserrat', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }) },
    user: { findUnique: async ({ where }: any) => (where.id === 'u-dono' ? { clerkId: 'user_dono' } : null) },
    template: {
      findFirst: async (args: any) =>
        args?.where?.id === 77
          ? { id: 77, name: 'Programação', projectId: 9009, Project: projeto }
          : args?.where?.id === 78
            ? { id: 78, name: 'Assinatura', projectId: 9009, Project: projeto }
            : base.template.findFirst(args),
    },
    page: {
      ...base.page,
      findFirst: async ({ where }: any) => structuredClone(doEditor(where)[0] ?? null),
      findMany: async (args: any) =>
        args?.where?.templateId === 77
          ? structuredClone(doEditor(args.where))
          : c.atual!.paginasDeAssinatura.filter((p) => (!args?.where?.id?.in || args.where.id.in.includes(p.id)) && (!args?.where?.id?.not || p.id !== args.where.id.not)),
      updateMany: async ({ where, data }: any) => ({ count: doEditor(where).map((p) => (p.order += data.order.increment)).length }),
      create: async ({ data }: any) => {
        const nova = { id: `nova-${++loja.seq}`, ...data }
        loja.paginas.push(nova)
        return { id: nova.id }
      },
    },
    fontCombination: { findMany: async () => [] },
    $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = partes.join('?')
      if (sql.includes('pg_advisory_xact_lock')) return [{ ok: 1 }]
      if (sql.includes('FOR UPDATE')) return doEditor({ id: valores[0], templateId: valores[1] }).map((p) => ({ order: p.order }))
      throw new Error(`SQL inesperado: ${sql}`)
    },
  }
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db)
  return { db }
})
vi.mock('@/lib/creatives/persist', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDaPersistencia())
vi.mock('@/lib/compositor/pastas', () => ({ garantirPasta: async () => ({ id: 1, name: 'x' }), ordemNaPasta: async () => ({ ordem: 1, repeticao: 0 }) }))
vi.mock('@/lib/brand/voz-service', () => ({ carimboDaVozAgora: async () => null }))
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).gradientesDoCenario,
}))

import type { Layer } from '@/types/template'
import type { CopyAutoral } from '@/lib/copy-autoral'
import { paginasDeAssinatura } from '@/lib/compositor/compor'
import { cenario } from '@/lib/direcao-de-arte/__tests__/suporte/compositor'
import { CLARO_9, FOTO_URL_9, ID_ARCO, cenario9, copy9, medidorComAsFontesDoRepo, type Formato9 } from '@/lib/direcao-de-arte/__tests__/suporte/cenario-9'
import { GET, POST } from '../route'

/** Os paths das peças Bv3 aceitas (o mesmo GOLDEN de `mascara-9.test.ts`). */
const GOLDEN = {
  story: 'M0 100 L0 24.566 C 5.7585 16.952 13.286 10.7601 21.9728 6.4921 C 30.6597 2.2241 40.2613 0 50 0 C 59.7387 0 69.3403 2.2241 78.0272 6.4921 C 86.714 10.7601 94.2415 16.952 100 24.566 L100 100 Z',
  feed: 'M0 100 L0 36.1991 C 5.7585 24.9795 13.286 15.8555 21.9728 9.5664 C 30.6597 3.2773 40.2613 0 50 0 C 59.7387 0 69.3403 3.2773 78.0272 9.5664 C 86.714 15.8555 94.2415 24.9795 100 36.1991 L100 100 Z',
}
const ALTURA: Record<Formato9, number> = { story: 1920, feed: 1350 }
/** A caixa da foto em px (`caixaDaFoto` × DIMENSOES): Story y 806,4 / 1114 de altura; Feed y 594 / 756. */
const CAIXA: Record<Formato9, { y: number; h: number }> = { story: { y: 806.4, h: 1114 }, feed: { y: 594, h: 756 } }

const texto = (id: string, papel: string, bloco: string, linhas: number[], content: string, y: number): Layer =>
  ({
    id,
    name: papel,
    type: 'text',
    visible: true,
    locked: false,
    order: 1,
    content,
    position: { x: 80, y },
    size: { width: 900, height: 120 },
    rotation: 0,
    style: { fontFamily: 'Georgia', fontSize: 60, fill: '#1f1f1f' },
    metadata: { compositor: { papel, bloco, linhas } },
  }) as Layer
const foto = (f: Formato9) =>
  ({ id: 'bg-foto', name: 'Foto de fundo', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: ALTURA[f] }, fileUrl: FOTO_URL_9, style: { objectFit: 'cover' } }) as unknown as Layer
/** A origem com SERVIÇO (que o #9 não tem): ele sai da página NOVA, em `foraDoLayout`, nunca da origem. */
const camadas = (f: Formato9) => [
  foto(f),
  texto('t0', 'pre', 'chamada', [0], 'ESTA SEMANA', 150),
  texto('t1', 'headline', 'manchete', [0], 'Bastidores da', 300),
  texto('t2', 'headline2', 'manchete', [1], 'nova sessão', 420),
  texto('t3', 'apoio', 'detalhe', [0], 'Luz natural', 560),
  texto('t4', 'servico', 'quando', [0], 'Sexta, 20h', 700),
]
const contrato = (f: Formato9) =>
  ({
    ...copy9(f, { apoio: ['Luz natural'], mais: [{ id: 'quando', funcao: 'servico', linhas: ['Sexta, 20h'] }] }),
    origem: { autor: 'equipe', em: '2026-10-20T12:00:00.000Z', superficie: 'editor' },
  }) as unknown as CopyAutoral

function origem(f: Formato9, extra: Pagina = {}) {
  const pagina = (id: string, order: number, e: Pagina) => ({ id, name: id, templateId: 77, width: 1080, height: ALTURA[f], order, isTemplate: false, tags: [], background: '#101010', layers: '[]', copyAutoral: null, ...e })
  loja.paginas = [pagina('p0', 0, {}), pagina('origem', 1, { layers: JSON.stringify(camadas(f)), copyAutoral: contrato(f), ...extra }), pagina('p2', 2, {})]
  return structuredClone(loja.paginas[1])
}
const post = async (corpo: Record<string, unknown> = {}, template = '77') =>
  (await POST(
    new Request(`http://studio.test/api/templates/${template}/pages/from-layout`, { method: 'POST', body: JSON.stringify({ arquetipo: { id: ID_ARCO, versao: 1 }, aPartirDaPagina: 'origem', ...corpo }) }),
    { params: Promise.resolve({ id: template }) },
  )) as any
const gravada = (id: string) => loja.paginas.find((p) => p.id === id)!

beforeEach(async () => {
  vi.clearAllMocks()
  loja.seq = 0
  cenario.atual = await cenario9('claro', await medidorComAsFontesDoRepo(() => vi.importActual('@/lib/creatives/server-text-measurer')))
})

describe('H9 · #9 nos Layouts (GET e POST), Montserrat do repo', () => {
  it('H-02 (rota GET): 10 layouts (IH #10; o #4 e o #3 guardados fora da vitrine); o #9 em 3º, com a caixa da foto, a máscara (raio 0,62, path GOLDEN) e a geometria da definição final (w .602, logo do Feed h .0348)', async () => {
    origem('story')
    const r = (await GET(new Request('http://studio.test/x'), { params: Promise.resolve({ id: '77' }) })) as any
    expect(r.status).toBe(200)
    // IH #10: os 2 ids da coluna entram antes (ordem por id) → 12 layouts e o #9 de 1º a 3º; o #4 guardado (25/10) → 11; o #3 guardado (26/10) → 10.
    expect(r.body.arquetipos).toHaveLength(10)
    expect(r.body.arquetipos[2].id).toBe(ID_ARCO)
    const d9 = r.body.arquetipos.find((a: Pagina) => a.id === ID_ARCO)
    expect(d9).toMatchObject({ versao: 1, fundo: 'foto-em-caixa', disponibilidade: 'disponivel', caixaDaFoto: { story: { x: 0, y: 0.42, w: 1, h: 0.58 }, feed: { x: 0, y: 0.44, w: 1, h: 0.56 } } })
    expect(d9.mascaraDaFoto).toEqual({ story: { tipo: 'arco-janela', raio: 0.62, path: GOLDEN.story }, feed: { tipo: 'arco-janela', raio: 0.62, path: GOLDEN.feed } })
    expect(d9.geometria.story.headline).toEqual({ x: 0.085, y: 0.19, w: 0.602, h: 0.12 })
    expect(d9.geometria.feed.logo).toEqual({ x: 0.74, y: 0.105, w: 0.175, h: 0.0348 })
    expect(d9.papeis.map((p: Pagina) => p.papel)).toEqual(['pre', 'headline', 'apoio', 'logo'])
  }, 120_000)

  for (const f of ['story', 'feed'] as const) {
    it(`H-02/H-07/CT-05 (rota POST ${f}): página nova depois da origem com a bg-foto mascarada (arco-janela, path GOLDEN), o fundo do liso, o serviço em foraDoLayout; origem intacta; fora do rodízio`, async () => {
      const antes = origem(f)
      const r = await post()
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      const nova = gravada(r.body.pageId)
      expect([nova.order, nova.templateId, nova.isTemplate, nova.width, nova.height]).toEqual([2, 77, false, 1080, ALTURA[f]])
      expect(nova.tags).toEqual(['layout', `arquetipo:${ID_ARCO}`])
      // O texto no liso: o fundo é o papel que o compositor escolheu (no cenário, tinta escura → o liso claro).
      expect(nova.background).toBe(CLARO_9)
      const bg = (JSON.parse(nova.layers) as Layer[]).find((l) => l.id === 'bg-foto')!
      expect([bg.position.y, bg.size.height]).toEqual([CAIXA[f].y, CAIXA[f].h])
      expect((bg.style as any).mask).toEqual({ shapeId: 'arco-janela', path: GOLDEN[f] })
      // CT-05: o serviço da origem não tem lugar no #9 — sai da página nova, dito em foraDoLayout; nenhum texto some calado.
      expect(r.body.foraDoLayout.map((x: Pagina) => [x.camada, x.motivo])).toEqual([['t4', 'papel-fora-do-layout']])
      const copy = nova.copyAutoral as Pagina
      expect(copy.blocos.map((b: Pagina) => [b.id, b.funcao])).toEqual([
        ['chamada', 'pre'],
        ['manchete', 'headline'],
        ['detalhe', 'apoio'],
      ])
      expect(gravada('origem')).toEqual(antes)
      expect([gravada('p0').order, gravada('origem').order, gravada('p2').order]).toEqual([0, 1, 3])
      expect(espias.invalidar).toHaveBeenCalledWith(expect.anything(), { pageIds: [r.body.pageId] })
      expect(espias.recompor).toHaveBeenCalledWith([r.body.pageId])
      // H-07: a página do Layouts não entra no rodízio de variantes da marca.
      expect((await paginasDeAssinatura(9009)).paginas.map((p) => p.id)).not.toContain(r.body.pageId)
    }, 120_000)
  }

  it('H-07: origem sem foto → 409 LAYOUT_SEM_FOTO; template "Assinatura" → 422 LAYOUT_NA_ASSINATURA; nada criado, origem intacta', async () => {
    const semFoto = origem('story', { layers: JSON.stringify(camadas('story').filter((l) => l.id !== 'bg-foto')) })
    const r409 = await post()
    expect([r409.status, r409.body.error]).toEqual([409, 'LAYOUT_SEM_FOTO'])
    expect(gravada('origem')).toEqual(semFoto)
    const comFoto = origem('story')
    const r422 = await post({}, '78')
    expect([r422.status, r422.body.error]).toEqual([422, 'LAYOUT_NA_ASSINATURA'])
    expect(gravada('origem')).toEqual(comFoto)
    expect(loja.paginas.map((p) => p.id)).toEqual(['p0', 'origem', 'p2'])
    expect(espias.invalidar).not.toHaveBeenCalled()
  }, 120_000)
})
