/**
 * #5 `minimal-fb-topo-centro@1` pela aba Layouts: GET (vitrine com a logo centrada no topo e a pílula presa ao serviço) e
 * POST pela rota real → `comporPeca` REAL com FONTES REAIS → página nova SEM Generation, foto INTEIRA, COM a camada da
 * pílula de contorno, reaberta só pelo JSON das camadas e renderizada de novo. Origem intacta, fora do rodízio, pré/cta
 * recortados pela revisão do sistema no contrato. Dublados como no base-centro-4 da rota: banco em memória (não é
 * Postgres), Clerk, espiões das guardas, Blob/fontes/autofix. A foto da origem é uma URL https de identidade; os bytes vêm
 * do dublê (nenhuma rede, nenhum Drive, nenhum Blob). Marca, foto e logo SINTÉTICAS (`cenario-5.ts`).
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
  const base = (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoBanco().db as Record<string, any>
  const projeto = { id: 9005, userId: 'u-dono', organizationProjects: [] }
  const doEditor = (where: Record<string, any>) =>
    loja.paginas.filter((p) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'gte' in v ? p[k] >= v.gte : p[k] === v)))
  const db: Record<string, any> = {
    ...base,
    user: { findUnique: async ({ where }: any) => (where.id === 'u-dono' ? { clerkId: 'user_dono' } : null) },
    template: {
      findFirst: async (args: any) =>
        args?.where?.id === 77
          ? { id: 77, name: 'Programação', projectId: 9005, Project: projeto }
          : args?.where?.id === 78
            ? { id: 78, name: 'Assinatura', projectId: 9005, Project: projeto }
            : base.template.findFirst(args),
    },
    page: {
      ...base.page,
      findFirst: async ({ where }: any) => structuredClone(doEditor(where)[0] ?? null),
      findMany: async (args: any) => (args?.where?.templateId === 77 ? structuredClone(doEditor(args.where)) : base.page.findMany(args)),
      updateMany: async ({ where, data }: any) => ({ count: doEditor(where).map((p) => (p.order += data.order.increment)).length }),
      create: async ({ data }: any) => {
        const nova = { id: `nova-${++loja.seq}`, ...data }
        loja.paginas.push(nova)
        return { id: nova.id }
      },
    },
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
import { DIMENSOES, ID_TOPO_CENTRO, cenario5, copy5, fontesNoDisco, fotoDoCenario5, medidorComFontesReais, paginaDoCenario5 } from '@/lib/direcao-de-arte/__tests__/suporte/cenario-5'
import { GET, POST } from '../route'

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
const FOTO = { id: 'bg-foto', name: 'Foto de fundo', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://fotos.test/origem-5.png', style: { objectFit: 'cover' } } as unknown as Layer
/** A origem com pré e cta (que o #5@1 não tem): eles saem da página NOVA, nunca da origem. */
const CAMADAS = [
  FOTO,
  texto('t0', 'pre', 'convite', [0], 'Você é convidado', 150),
  texto('t1', 'headline', 'manchete', [0], 'Noite de', 300),
  texto('t2', 'headline2', 'manchete', [1], 'vinhos', 420),
  texto('t3', 'apoio', 'detalhe', [0], 'Harmonização com o chef', 600),
  texto('t4', 'servico', 'quando', [0], 'Sexta, 14/11 · 20h', 1500),
  texto('t5', 'cta', 'site', [0], 'www.casa.com.br', 1650),
]
const CONTRATO = {
  ...copy5({
    manchete: ['Noite de', 'vinhos'],
    voz2: [1],
    apoio: ['Harmonização com o chef'],
    servico: ['Sexta, 14/11 · 20h'],
    extras: [
      { id: 'convite', funcao: 'pre', linhas: ['Você é convidado'] },
      { id: 'site', funcao: 'cta', linhas: ['www.casa.com.br'] },
    ],
  }),
  origem: { autor: 'equipe', em: '2026-10-20T12:00:00.000Z', superficie: 'editor' },
} as unknown as CopyAutoral

function origem(extra: Pagina = {}) {
  const pagina = (id: string, order: number, e: Pagina) => ({ id, name: id, templateId: 77, width: 1080, height: 1920, order, isTemplate: false, tags: [], background: '#101010', layers: '[]', copyAutoral: null, ...e })
  loja.paginas = [pagina('p0', 0, {}), pagina('origem', 1, { layers: JSON.stringify(CAMADAS), copyAutoral: CONTRATO, ...extra }), pagina('p2', 2, {})]
  return structuredClone(loja.paginas[1])
}
const post = async (corpo: Record<string, unknown> = {}, template = '77') =>
  (await POST(
    new Request(`http://studio.test/api/templates/${template}/pages/from-layout`, { method: 'POST', body: JSON.stringify({ arquetipo: { id: ID_TOPO_CENTRO, versao: 1 }, aPartirDaPagina: 'origem', ...corpo }) }),
    { params: Promise.resolve({ id: template }) },
  )) as any
const gravada = (id: string) => loja.paginas.find((p) => p.id === id)!
const reaberta = (id: string) => JSON.parse(gravada(id).layers) as Layer[]

beforeEach(async () => {
  vi.clearAllMocks()
  loja.seq = 0
  const { medir } = await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  cenario.atual = await cenario5(await paginaDoCenario5('assin-5'), medir, { foto: await fotoDoCenario5(DIMENSOES.story, { topo: 40, base: 40 }) })
})

describe.skipIf(!fontesNoDisco())('#5 · Layouts (GET e POST), fontes reais', () => {
  it('V-02: o GET lista o #5 (entre a base-esquerda e o topo-esquerda; o #3 guardado fora da vitrine, 26/10) com fundo foto, disponível, a geometria Story/Feed e a pílula presa ao serviço', async () => {
    origem()
    const r = (await GET(new Request('http://studio.test/x'), { params: Promise.resolve({ id: '77' }) })) as any
    expect(r.status).toBe(200)
    const ids = r.body.arquetipos.map((a: Pagina) => a.id)
    expect(ids).not.toContain('minimal-fb-centro-optico')
    expect(ids.slice(ids.indexOf('minimal-fb-base-esquerda'), ids.indexOf('minimal-fb-topo-esquerda') + 1)).toEqual(['minimal-fb-base-esquerda', ID_TOPO_CENTRO, 'minimal-fb-topo-esquerda'])
    const d5 = r.body.arquetipos.find((a: Pagina) => a.id === ID_TOPO_CENTRO)
    expect(d5).toMatchObject({ versao: 1, fundo: 'foto', disponibilidade: 'disponivel', elementos: [{ id: 'pilula', tipo: 'pilula-contorno', opcional: false, corPorPapel: 'texto', presoA: 'servico' }] })
    expect('caixaDaFoto' in d5).toBe(false)
    expect(d5.geometria.story).toMatchObject({ logo: { x: 0.41, y: 0.105, w: 0.18, h: 0.035 }, headline: { x: 0.12, y: 0.155, w: 0.76, h: 0.12 }, apoio: { x: 0.2, y: 0.29, w: 0.6, h: 0.06 }, servico: { x: 0.2, y: 0.825, w: 0.6, h: 0.045 } })
    expect(d5.geometria.feed).toMatchObject({ logo: { x: 0.41, y: 0.105, w: 0.18, h: 0.035 }, headline: { x: 0.12, y: 0.16, w: 0.76, h: 0.12 }, apoio: { x: 0.2, y: 0.3, w: 0.6, h: 0.07 }, servico: { x: 0.2, y: 0.83, w: 0.6, h: 0.06 } })
  }, 120_000)

  it('V-03: POST #5@1 → Page nova depois da origem, foto inteira, COM a pílula; reaberta pelo JSON e renderizada; origem intacta; invalidações; fora do rodízio', async () => {
    const antes = origem()
    const r = await post()
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const nova = gravada(r.body.pageId)
    expect([nova.order, nova.templateId, nova.isTemplate, nova.width, nova.height]).toEqual([2, 77, false, 1080, 1920])
    expect(nova.tags).toEqual(['layout', `arquetipo:${ID_TOPO_CENTRO}`])
    const camadas = reaberta(r.body.pageId)
    const bg = camadas.find((l) => l.id === 'bg-foto')!
    expect([bg.position, bg.size, (bg.style as any).objectFit]).toEqual([{ x: 0, y: 0 }, { width: 1080, height: 1920 }, 'cover'])
    // A pílula vem na página criada, presa ao serviço, abaixo dos textos.
    const p = camadas.find((l) => l.id === 'acento-pilula')!
    const s = camadas.find((l) => l.id === 'servico')!
    expect(p.style).toMatchObject({ shapeType: 'rounded-rectangle', fill: 'transparent', strokeWidth: 2, border: { radius: 9999 } })
    expect((p.metadata as any).compositor.acento).toMatchObject({ elemento: 'pilula', tipo: 'pilula-contorno', presoA: 'servico' })
    expect(Math.abs(p.position.x - (s.position.x - 31))).toBeLessThanOrEqual(1)
    expect(Math.abs(p.position.y - (s.position.y - 18))).toBeLessThanOrEqual(1)
    expect(camadas.filter((l) => l.type === 'text').every((t) => camadas.indexOf(t) > camadas.indexOf(p))).toBe(true)
    const logo = camadas.find((l) => l.id === 'logo')!
    expect(Math.abs(logo.position.x + logo.size.width / 2 - 540)).toBeLessThanOrEqual(1)
    expect((logo.metadata as any).compositor.canto).toBe('superior-centro')
    const { CanvasRenderer } = await import('@/lib/canvas-renderer')
    const png = await new CanvasRenderer(1080, 1920).renderDesign({ canvas: { width: 1080, height: 1920, backgroundColor: nova.background }, layers: camadas }, {})
    expect(png.length).toBeGreaterThan(1000)
    expect(gravada('origem')).toEqual(antes)
    expect([gravada('p0').order, gravada('origem').order, gravada('p2').order]).toEqual([0, 1, 3])
    expect(espias.invalidar).toHaveBeenCalledWith(expect.anything(), { pageIds: [r.body.pageId] })
    expect(espias.recompor).toHaveBeenCalledWith([r.body.pageId])
    expect((await paginasDeAssinatura(9005)).paginas.map((p) => p.id)).not.toContain(r.body.pageId)
    // Pré e cta saem da página NOVA (revisão do sistema no contrato), nunca da origem.
    expect(r.body.foraDoLayout.map((f: Pagina) => [f.camada, f.motivo])).toEqual([
      ['t0', 'papel-fora-do-layout'],
      ['t5', 'papel-fora-do-layout'],
    ])
  }, 120_000)

  it('V-04: origem sem foto → 409 LAYOUT_SEM_FOTO, nada criado; template Assinatura → 422 LAYOUT_NA_ASSINATURA', async () => {
    const semFoto = origem({ layers: JSON.stringify(CAMADAS.filter((l) => l.id !== 'bg-foto')) })
    const r409 = await post()
    expect([r409.status, r409.body.error]).toEqual([409, 'LAYOUT_SEM_FOTO'])
    expect(gravada('origem')).toEqual(semFoto)
    expect(loja.paginas.map((p) => p.id)).toEqual(['p0', 'origem', 'p2'])
    expect(espias.invalidar).not.toHaveBeenCalled()
    origem()
    const naAssinatura = await post({}, '78')
    expect([naAssinatura.status, naAssinatura.body.error]).toEqual([422, 'LAYOUT_NA_ASSINATURA'])
  }, 120_000)

  it('V-05 (observado): origem com o serviço em 2 linhas → a rota devolve a recusa de linhas excedidas do compositor, sem código novo; nada criado', async () => {
    const duas = { ...CONTRATO, blocos: (CONTRATO as any).blocos.map((b: Pagina) => (b.funcao === 'servico' ? { ...b, linhas: ['Sexta, 14/11', '20h'] } : b)) }
    const camadas = CAMADAS.map((l) => (l.id === 't4' ? ({ ...l, content: 'Sexta, 14/11\n20h', metadata: { compositor: { papel: 'servico', bloco: 'quando', linhas: [0, 1] } } } as Layer) : l))
    origem({ layers: JSON.stringify(camadas), copyAutoral: duas })
    const r = await post()
    expect([r.status, r.body.error ?? r.body.code], JSON.stringify(r.body).slice(0, 400)).toEqual([422, 'ARQUETIPO_LINHAS_EXCEDIDAS'])
    expect(loja.paginas.map((p) => p.id)).toEqual(['p0', 'origem', 'p2'])
  }, 120_000)
})
