/**
 * #8 `minimal-divisao-foto-topo@1` pela aba Layouts: GET (vitrine com a caixa da foto) e POST pela rota real →
 * `comporPeca` REAL com FONTES REAIS → página nova SEM Generation, com o fundo efetivo (o papel do liso), reaberta só pelo
 * JSON das camadas e renderizada de novo. Origem intacta, fora do rodízio, recorte autoral pelo histórico do contrato.
 * Dublados como no convite-16-c2 da rota: banco em memória (não é Postgres), Clerk, espiões das guardas, Blob/fontes/autofix.
 * A foto da origem é uma URL https de identidade; os bytes vêm do dublê (nenhuma rede, nenhum Drive, nenhum Blob).
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
  const projeto = { id: 9008, userId: 'u-dono', organizationProjects: [] }
  const doEditor = (where: Record<string, any>) =>
    loja.paginas.filter((p) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'gte' in v ? p[k] >= v.gte : p[k] === v)))
  const db: Record<string, any> = {
    ...base,
    user: { findUnique: async ({ where }: any) => (where.id === 'u-dono' ? { clerkId: 'user_dono' } : null) },
    template: {
      findFirst: async (args: any) =>
        args?.where?.id === 77
          ? { id: 77, name: 'Programação', projectId: 9008, Project: projeto }
          : args?.where?.id === 78
            ? { id: 78, name: 'Assinatura', projectId: 9008, Project: projeto }
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

import sharp from 'sharp'
import type { Layer } from '@/types/template'
import type { CopyAutoral } from '@/lib/copy-autoral'
import { paginasDeAssinatura } from '@/lib/compositor/compor'
import { cenario } from '@/lib/direcao-de-arte/__tests__/suporte/compositor'
import { ESCURO_8, ID_DIVISAO, cenario8, copy8, fontesNoDisco, medidorComFontesReais, paginaDoCenario8 } from '@/lib/direcao-de-arte/__tests__/suporte/cenario-8'
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
const FOTO = { id: 'bg-foto', name: 'Foto de fundo', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://fotos.test/origem-8.png', style: { objectFit: 'cover' } } as unknown as Layer
/** A origem com pré e cta (que o #8 não tem): eles saem da página NOVA, nunca da origem. */
const CAMADAS = [
  FOTO,
  texto('t0', 'pre', 'convite', [0], 'Você é convidado', 150),
  texto('t1', 'headline', 'manchete', [0], 'Noite de', 300),
  texto('t2', 'headline2', 'manchete', [1], 'vinhos', 420),
  texto('t3', 'apoio', 'detalhe', [0], 'Harmonização com o chef da casa', 900),
  texto('t4', 'servico', 'quando', [0], 'Sexta, 14/11 · 20h', 1100),
  texto('t5', 'cta', 'site', [0], 'www.casa.com.br', 1600),
]
const CONTRATO = {
  ...copy8({ manchete: ['Noite de', 'vinhos'], voz2: [1], apoio: ['Harmonização com o chef da casa'], servico: ['Sexta, 14/11 · 20h'], extras: [{ id: 'convite', funcao: 'pre', linhas: ['Você é convidado'] }, { id: 'site', funcao: 'cta', linhas: ['www.casa.com.br'] }] }),
  origem: { autor: 'equipe', em: '2026-10-20T12:00:00.000Z', superficie: 'editor' },
} as unknown as CopyAutoral

function origem(extra: Pagina = {}) {
  const pagina = (id: string, order: number, e: Pagina) => ({ id, name: id, templateId: 77, width: 1080, height: 1920, order, isTemplate: false, tags: [], background: '#101010', layers: '[]', copyAutoral: null, ...e })
  loja.paginas = [pagina('p0', 0, {}), pagina('origem', 1, { layers: JSON.stringify(CAMADAS), copyAutoral: CONTRATO, ...extra }), pagina('p2', 2, {})]
  return structuredClone(loja.paginas[1])
}
const post = async (corpo: Record<string, unknown> = {}, template = '77') =>
  (await POST(
    new Request(`http://studio.test/api/templates/${template}/pages/from-layout`, { method: 'POST', body: JSON.stringify({ arquetipo: { id: ID_DIVISAO, versao: 1 }, aPartirDaPagina: 'origem', ...corpo }) }),
    { params: Promise.resolve({ id: template }) },
  )) as any
const gravada = (id: string) => loja.paginas.find((p) => p.id === id)!
const reaberta = (id: string) => JSON.parse(gravada(id).layers) as Layer[]
const pixel = async (png: Buffer, x: number, y: number) => {
  const { data } = await sharp(png).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

beforeEach(async () => {
  vi.clearAllMocks()
  loja.seq = 0
  const { medir } = await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  cenario.atual = await cenario8(await paginaDoCenario8('assin-8'), medir)
})

describe.skipIf(!fontesNoDisco())('#8 · Layouts (GET e POST), fontes reais', () => {
  it('G-M3 (rota): o GET lista 10 layouts (H9: com o #9@1; IH #10: com os 2 da coluna; sem o #4 e o #3 guardados) e o #8 com fundo foto-em-caixa, a caixa da foto e a geometria de referência', async () => {
    origem()
    const r = (await GET(new Request('http://studio.test/x'), { params: Promise.resolve({ id: '77' }) })) as any
    expect(r.status).toBe(200)
    expect(r.body.arquetipos).toHaveLength(10)
    const d8 = r.body.arquetipos.find((a: Pagina) => a.id === ID_DIVISAO)
    expect(d8).toMatchObject({ versao: 1, fundo: 'foto-em-caixa', disponibilidade: 'disponivel', caixaDaFoto: { story: { x: 0, y: 0, w: 1, h: 0.6 }, feed: { x: 0, y: 0, w: 1, h: 0.58 } } })
    expect(d8.geometria.story.headline).toEqual({ x: 0.085, y: 0.65, w: 0.7, h: 0.11 })
    expect(d8.geometria.feed.logo).toEqual({ x: 0.74, y: 0.85, w: 0.175, h: 0.06 })
  }, 120_000)

  it('G-L1/G-L2/G-L3/G-L7/G-L4: POST → Page nova depois da origem, fundo efetivo, foto na caixa, tags; reaberta pelo JSON e renderizada; origem intacta; as duas invalidações; fora do rodízio', async () => {
    const antes = origem()
    const r = await post()
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const nova = gravada(r.body.pageId)
    // G-L1: logo depois da origem, comum e editável, no template da origem, com as tags do layout e o fundo efetivo.
    expect([nova.order, nova.templateId, nova.isTemplate, nova.background, nova.width, nova.height]).toEqual([2, 77, false, ESCURO_8, 1080, 1920])
    expect(nova.tags).toEqual(['layout', `arquetipo:${ID_DIVISAO}`])
    // G-L2: reaberta SÓ pelo JSON: a foto na caixa com o corte, os textos no liso, a logo.
    const camadas = reaberta(r.body.pageId)
    const bg = camadas.find((l) => l.id === 'bg-foto')!
    expect([bg.position, bg.size, (bg.style as any).objectFit, (bg.style as any).cropPosition]).toEqual([{ x: 0, y: 0 }, { width: 1080, height: 1152 }, 'cover', 'center-middle'])
    expect(camadas.filter((l) => ['headline', 'headline2', 'apoio', 'servico', 'logo'].includes(l.id)).every((l) => l.position.y >= 1152)).toBe(true)
    const { CanvasRenderer } = await import('@/lib/canvas-renderer')
    const png = await new CanvasRenderer(1080, 1920).renderDesign({ canvas: { width: 1080, height: 1920, backgroundColor: nova.background }, layers: camadas }, {})
    expect(await pixel(png, 40, 1800)).toBe(ESCURO_8)
    expect(await pixel(png, 40, 600)).not.toBe(ESCURO_8)
    // G-L3: a origem byte a byte; só as posteriores andam uma posição.
    expect(gravada('origem')).toEqual(antes)
    expect([gravada('p0').order, gravada('origem').order, gravada('p2').order]).toEqual([0, 1, 3])
    // G-L7: as duas guardas para a Page nova.
    expect(espias.invalidar).toHaveBeenCalledWith(expect.anything(), { pageIds: [r.body.pageId] })
    expect(espias.recompor).toHaveBeenCalledWith([r.body.pageId])
    // G-L4: a Page nova não está no template "Assinatura" e não é variante (fora do rodízio).
    expect((await paginasDeAssinatura(9008)).paginas.map((p) => p.id)).not.toContain(r.body.pageId)
    const naAssinatura = await post({}, '78')
    expect([naAssinatura.status, naAssinatura.body.error]).toEqual([422, 'LAYOUT_NA_ASSINATURA'])
  }, 120_000)

  it('G-L6: origem COM contrato e pré/cta → a revisão do SISTEMA no histórico da Page nova (sem os blocos, ordem renumerada), resposta e aviso reais; origem intacta', async () => {
    const antes = origem()
    const r = await post()
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.foraDoLayout.map((f: Pagina) => [f.camada, f.motivo])).toEqual([
      ['t0', 'papel-fora-do-layout'],
      ['t5', 'papel-fora-do-layout'],
    ])
    expect(r.body.avisos).toContain('2 texto(s) da página não entraram no layout (sem papel ou sem lugar nele).')
    const copy = gravada(r.body.pageId).copyAutoral as Pagina
    expect(copy.blocos.map((b: Pagina) => [b.id, b.funcao, b.ordem])).toEqual([
      ['manchete', 'headline', 0],
      ['detalhe', 'apoio', 1],
      ['quando', 'servico', 2],
    ])
    const revisao = copy.revisoes.find((v: Pagina) => v.autor === 'sistema' && v.superficie === 'layout')
    expect(revisao.motivo).toMatch(/2 bloco\(s\) sem lugar no layout minimal-divisao-foto-topo ficaram fora da página nova/)
    expect(Object.keys(gravada(r.body.pageId)).filter((k) => /removid/i.test(k))).toEqual([])
    expect(gravada('origem')).toEqual(antes)
  }, 120_000)

  it('G-L6: origem SEM contrato (caminho legado) e origem sem foto (409 LAYOUT_SEM_FOTO); origem intacta nos dois', async () => {
    const legado = origem({ copyAutoral: null })
    const r = await post()
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.foraDoLayout.map((f: Pagina) => f.camada)).toEqual(['t0', 't5'])
    expect(gravada('origem')).toEqual(legado)
    const semFoto = origem({ layers: JSON.stringify(CAMADAS.filter((l) => l.id !== 'bg-foto')) })
    const r409 = await post()
    expect([r409.status, r409.body.error]).toEqual([409, 'LAYOUT_SEM_FOTO'])
    expect(gravada('origem')).toEqual(semFoto)
    expect(loja.paginas.map((p) => p.id)).toEqual(['p0', 'origem', 'p2'])
  }, 120_000)
})
