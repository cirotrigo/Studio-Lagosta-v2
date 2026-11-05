/**
 * IH #10 — `minimal-coluna-foto@1` (foto à direita) e `minimal-coluna-foto-esquerda@1` (foto à esquerda) pela aba
 * Layouts: GET (12 layouts; os 2 do #10 em 1º e 2º com a caixa da foto e a geometria final A10-1/A10-2a) e POST pela rota
 * real → `comporPeca` REAL com a Montserrat do repo → página nova Story/Feed de cada lado com a `bg-foto` na caixa em px,
 * o fundo do liso e o pré/cta da origem em `foraDoLayout` (o #10 não os tem). Origem intacta; recusas 409 (origem sem
 * foto) e 422 (template "Assinatura"); fora do rodízio. Dublados como no arco-9 da rota: banco em memória (não é
 * Postgres), Clerk, espiões das guardas, Blob/fontes/autofix; a foto da origem é uma URL de identidade e os bytes vêm do
 * dublê do fetch (nenhuma rede, Drive ou Blob).
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
  const projeto = { id: 9010, userId: 'u-dono', organizationProjects: [] }
  const doEditor = (where: Record<string, any>) =>
    loja.paginas.filter((p) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'gte' in v ? p[k] >= v.gte : p[k] === v)))
  const db: Record<string, any> = {
    ...base,
    // As fontes do projeto = a Montserrat do repo (a do cenário do #10).
    project: { findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), titleFontFamily: 'Montserrat', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }) },
    user: { findUnique: async ({ where }: any) => (where.id === 'u-dono' ? { clerkId: 'user_dono' } : null) },
    template: {
      findFirst: async (args: any) =>
        args?.where?.id === 77
          ? { id: 77, name: 'Programação', projectId: 9010, Project: projeto }
          : args?.where?.id === 78
            ? { id: 78, name: 'Assinatura', projectId: 9010, Project: projeto }
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
import sharp from 'sharp'
import { cenario } from '@/lib/direcao-de-arte/__tests__/suporte/compositor'
import { CLARO_10, FOTO_URL_10, ID_COLUNA_D, ID_COLUNA_E, cenario10, copy10, medidorComAsFontesDoRepo, type Formato10 } from '@/lib/direcao-de-arte/__tests__/suporte/cenario-10'
import { GET, POST } from '../route'

const ALTURA: Record<Formato10, number> = { story: 1920, feed: 1350 }
/** A caixa da foto em px (`caixaDaFoto` × DIMENSOES): D x 621, E x 0; 459 × altura do formato. */
const CAIXA = { D: { x: 621 }, E: { x: 0 } } as const

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
const foto = (f: Formato10) =>
  ({ id: 'bg-foto', name: 'Foto de fundo', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: ALTURA[f] }, fileUrl: FOTO_URL_10, style: { objectFit: 'cover' } }) as unknown as Layer
/** A origem com PRÉ e CTA (que o #10 não tem): eles saem da página NOVA, em `foraDoLayout`, nunca da origem. */
const camadas = (f: Formato10) => [
  foto(f),
  texto('t0', 'pre', 'chamada', [0], 'ESTA SEMANA', 150),
  texto('t1', 'headline', 'manchete', [0, 1, 2], 'Bastidores\nda nova\nsessão', 300),
  texto('t2', 'apoio', 'detalhe', [0, 1], 'Luz natural e cada\nprato no ponto certo', 900),
  texto('t3', 'servico', 'quando', [0], 'Ter a dom · 18h às 23h', 1100),
  texto('t4', 'cta', 'site', [0], 'www.casa.com.br', 1250),
]
const contrato = () =>
  ({
    ...copy10({ mais: [{ id: 'chamada', funcao: 'pre', linhas: ['ESTA SEMANA'] }, { id: 'site', funcao: 'cta', linhas: ['www.casa.com.br'] }] }),
    origem: { autor: 'equipe', em: '2026-10-20T12:00:00.000Z', superficie: 'editor' },
  }) as unknown as CopyAutoral

function origem(f: Formato10, extra: Pagina = {}) {
  const pagina = (id: string, order: number, e: Pagina) => ({ id, name: id, templateId: 77, width: 1080, height: ALTURA[f], order, isTemplate: false, tags: [], background: '#101010', layers: '[]', copyAutoral: null, ...e })
  loja.paginas = [pagina('p0', 0, {}), pagina('origem', 1, { layers: JSON.stringify(camadas(f)), copyAutoral: contrato(), ...extra }), pagina('p2', 2, {})]
  return structuredClone(loja.paginas[1])
}
const post = async (id: string, corpo: Record<string, unknown> = {}, template = '77') =>
  (await POST(
    new Request(`http://studio.test/api/templates/${template}/pages/from-layout`, { method: 'POST', body: JSON.stringify({ arquetipo: { id, versao: 1 }, aPartirDaPagina: 'origem', ...corpo }) }),
    { params: Promise.resolve({ id: template }) },
  )) as any
const gravada = (id: string) => loja.paginas.find((p) => p.id === id)!
const pixel = async (png: Buffer, x: number, y: number) => {
  const { data } = await sharp(png).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

beforeEach(async () => {
  vi.clearAllMocks()
  loja.seq = 0
  cenario.atual = await cenario10('claro', await medidorComAsFontesDoRepo(() => vi.importActual('@/lib/creatives/server-text-measurer')))
})

describe('IH #10 · a coluna de foto nos Layouts (GET e POST), Montserrat do repo', () => {
  it('L-03 (rota GET): 10 layouts (o #4 e o #3 guardados fora da vitrine); os 2 do #10 em 1º e 2º, com a caixa da foto e a geometria final (A10-1 w .436, A10-2a logo .086/.739)', async () => {
    origem('story')
    const r = (await GET(new Request('http://studio.test/x'), { params: Promise.resolve({ id: '77' }) })) as any
    expect(r.status).toBe(200)
    expect(r.body.arquetipos).toHaveLength(10)
    expect(r.body.arquetipos.slice(0, 3).map((a: Pagina) => a.id)).toEqual([ID_COLUNA_D, ID_COLUNA_E, 'minimal-divisao-cor-topo-arco'])
    const [d, e] = r.body.arquetipos
    expect(d).toMatchObject({ versao: 1, fundo: 'foto-em-caixa', disponibilidade: 'disponivel', caixaDaFoto: { story: { x: 0.575, y: 0, w: 0.425, h: 1 }, feed: { x: 0.575, y: 0, w: 0.425, h: 1 } } })
    expect(e).toMatchObject({ versao: 1, fundo: 'foto-em-caixa', disponibilidade: 'disponivel', caixaDaFoto: { story: { x: 0, y: 0, w: 0.425, h: 1 }, feed: { x: 0, y: 0, w: 0.425, h: 1 } } })
    expect([d.mascaraDaFoto, e.mascaraDaFoto]).toEqual([undefined, undefined])
    expect(d.geometria.story.headline).toEqual({ x: 0.085, y: 0.155, w: 0.436, h: 0.245 })
    expect(e.geometria.feed.headline).toEqual({ x: 0.479, y: 0.165, w: 0.436, h: 0.21 })
    expect([d.geometria.feed.logo.x, e.geometria.story.logo.x]).toEqual([0.086, 0.739])
    expect(d.papeis.map((p: Pagina) => p.papel)).toEqual(['headline', 'apoio', 'servico', 'logo'])
    expect(d.elementos).toEqual([{ id: 'fio', tipo: 'fio-fino', opcional: true, corPorPapel: 'texto', presoA: 'headline' }])
  }, 120_000)

  for (const [lado, id, f] of [
    ['D', ID_COLUNA_D, 'story'],
    ['D', ID_COLUNA_D, 'feed'],
    ['E', ID_COLUNA_E, 'story'],
    ['E', ID_COLUNA_E, 'feed'],
  ] as const) {
    it(`L-03/L-06 (rota POST ${id} ${f}): página nova com a bg-foto na caixa (x ${CAIXA[lado].x}, 459 × ${ALTURA[f]}), o fundo do liso, pré/cta em foraDoLayout; origem intacta; fora do rodízio`, async () => {
      const antes = origem(f)
      const r = await post(id)
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      const nova = gravada(r.body.pageId)
      expect([nova.order, nova.templateId, nova.isTemplate, nova.width, nova.height]).toEqual([2, 77, false, 1080, ALTURA[f]])
      expect(nova.tags).toEqual(['layout', `arquetipo:${id}`])
      // O texto no liso: o fundo é o papel que o compositor escolheu (no cenário, tinta escura → o liso claro).
      expect(nova.background).toBe(CLARO_10)
      const reaberta = JSON.parse(nova.layers) as Layer[]
      const bg = reaberta.find((l) => l.id === 'bg-foto')!
      expect([bg.position, bg.size, (bg.style as any).objectFit]).toEqual([{ x: CAIXA[lado].x, y: 0 }, { width: 459, height: ALTURA[f] }, 'cover'])
      expect((bg.style as any).mask).toBeUndefined()
      // Os textos e a logo no liso (fora da caixa da foto, na horizontal).
      for (const l of reaberta.filter((x) => ['headline', 'apoio', 'servico', 'logo'].includes(x.id))) {
        expect([l.id, lado === 'D' ? l.position.x + l.size.width <= 621 : l.position.x >= 459]).toEqual([l.id, true])
      }
      // Reaberta SÓ pelo JSON e renderizada: o liso fora da caixa, a foto dentro.
      const { CanvasRenderer } = await import('@/lib/canvas-renderer')
      const png = await new CanvasRenderer(1080, ALTURA[f]).renderDesign({ canvas: { width: 1080, height: ALTURA[f], backgroundColor: nova.background }, layers: reaberta }, {})
      const [liso, naFoto] = lado === 'D' ? [[40, ALTURA[f] - 40], [850, ALTURA[f] / 2]] : [[1040, ALTURA[f] - 40], [230, ALTURA[f] / 2]]
      expect(await pixel(png, liso[0], liso[1])).toBe(CLARO_10)
      expect(await pixel(png, naFoto[0], naFoto[1])).not.toBe(CLARO_10)
      expect(r.body.foraDoLayout.map((x: Pagina) => [x.camada, x.motivo])).toEqual([
        ['t0', 'papel-fora-do-layout'],
        ['t4', 'papel-fora-do-layout'],
      ])
      const copy = nova.copyAutoral as Pagina
      expect(copy.blocos.map((b: Pagina) => [b.id, b.funcao])).toEqual([
        ['manchete', 'headline'],
        ['detalhe', 'apoio'],
        ['quando', 'servico'],
      ])
      expect(gravada('origem')).toEqual(antes)
      expect([gravada('p0').order, gravada('origem').order, gravada('p2').order]).toEqual([0, 1, 3])
      expect(espias.invalidar).toHaveBeenCalledWith(expect.anything(), { pageIds: [r.body.pageId] })
      expect(espias.recompor).toHaveBeenCalledWith([r.body.pageId])
      // L-06: a página do Layouts não entra no rodízio de variantes da marca.
      expect((await paginasDeAssinatura(9010)).paginas.map((p) => p.id)).not.toContain(r.body.pageId)
    }, 120_000)
  }

  it('L-03: origem sem foto → 409 LAYOUT_SEM_FOTO; template "Assinatura" → 422 LAYOUT_NA_ASSINATURA; nada criado, origem intacta', async () => {
    const semFoto = origem('story', { layers: JSON.stringify(camadas('story').filter((l) => l.id !== 'bg-foto')) })
    const r409 = await post(ID_COLUNA_E)
    expect([r409.status, r409.body.error]).toEqual([409, 'LAYOUT_SEM_FOTO'])
    expect(gravada('origem')).toEqual(semFoto)
    const comFoto = origem('feed')
    const r422 = await post(ID_COLUNA_D, {}, '78')
    expect([r422.status, r422.body.error]).toEqual([422, 'LAYOUT_NA_ASSINATURA'])
    expect(gravada('origem')).toEqual(comFoto)
    expect(loja.paginas.map((p) => p.id)).toEqual(['p0', 'origem', 'p2'])
    expect(espias.invalidar).not.toHaveBeenCalled()
  }, 120_000)
})
