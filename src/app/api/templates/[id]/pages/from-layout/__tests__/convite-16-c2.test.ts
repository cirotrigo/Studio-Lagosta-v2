/**
 * #16@2 pela aba Layouts: GET (vitrine com UMA versão por id — o #16 em @2) e POST pela rota real → `comporPeca` REAL
 * com FONTES REAIS → página nova SEM Generation, reaberta só pelo JSON das camadas e renderizada de novo. O POST com
 * `versao: 1` (cliente antigo) continua C1; uma Page @1 já gravada não é regravada pelo POST do @2.
 * Dublados como no convite-16 da rota: banco em memória (não é Postgres), Clerk, espiões das guardas, Blob/fontes/autofix.
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
  const projeto = { id: 9002, userId: 'u-dono', organizationProjects: [] }
  const doEditor = (where: Record<string, any>) =>
    loja.paginas.filter((p) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'gte' in v ? p[k] >= v.gte : p[k] === v)))
  const db: Record<string, any> = {
    ...base,
    user: { findUnique: async ({ where }: any) => (where.id === 'u-dono' ? { clerkId: 'user_dono' } : null) },
    template: { findFirst: async (args: any) => (args?.where?.id === 77 ? { id: 77, projectId: 9002, Project: projeto } : base.template.findFirst(args)) },
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
import { copyAutoralDaPagina, type CopyAutoral } from '@/lib/copy-autoral'
import { blocosLidosDasCamadas } from '@/lib/copy-autoral/efetiva'
import { cenario } from '@/lib/direcao-de-arte/__tests__/suporte/compositor'
import { CLARO, COPY_16, ID_CONVITE, cenario16, fontesNoDisco, medidorComFontesReais, paginaDoCenario16 } from '@/lib/direcao-de-arte/__tests__/suporte/cenario-16'
import { GET, POST } from '../route'

const CONTRATO: CopyAutoral = { ...(COPY_16 as unknown as CopyAutoral), origem: { autor: 'equipe', em: '2026-10-20T12:00:00.000Z', superficie: 'editor' } }
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
const CAMADAS = [
  texto('t0', 'pre', 'convite', [0], 'Você é convidado', 150),
  texto('t1', 'headline', 'manchete', [0], 'Noite de', 300),
  texto('t2', 'headline2', 'manchete', [1], 'vinhos', 420),
  texto('t3', 'apoio', 'detalhe', [0], 'Harmonização com o chef', 900),
  texto('t4', 'servico', 'quando', [0], 'Sexta, 14 de novembro · 20h', 1100),
  texto('t5', 'cta', 'site', [0], 'www.casa.com.br', 1600),
]

function origem() {
  const pagina = (id: string, order: number, extra: Pagina) => ({ id, name: id, templateId: 77, width: 1080, height: 1920, order, isTemplate: false, tags: [], background: '#101010', layers: '[]', copyAutoral: null, ...extra })
  loja.paginas = [pagina('origem', 1, { layers: JSON.stringify(CAMADAS), copyAutoral: CONTRATO }), pagina('p2', 2, {})]
  return structuredClone(loja.paginas[0])
}

beforeEach(async () => {
  vi.clearAllMocks()
  loja.seq = 0
  const { medir } = await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  cenario.atual = await cenario16(await paginaDoCenario16('assin-16'), medir)
})

const PATH_STORY = 'M0 8.6782 L0 0 L14.5089 0 M85.4911 0 L100 0 L100 8.6782 M100 91.3218 L100 100 L85.4911 100 M14.5089 100 L0 100 L0 91.3218'
const ASSET = 'M0 25 L0 0 L25 0 M75 0 L100 0 L100 25 M100 75 L100 100 L75 100 M25 100 L0 100 L0 75'
const post = async (versao: number) =>
  (await POST(
    new Request('http://studio.test/api/templates/77/pages/from-layout', { method: 'POST', body: JSON.stringify({ arquetipo: { id: ID_CONVITE, versao }, aPartirDaPagina: 'origem' }) }),
    { params: Promise.resolve({ id: '77' }) },
  )) as any
const reaberta = (id: string) => JSON.parse(loja.paginas.find((p) => p.id === id)!.layers) as Layer[]

describe.skipIf(!fontesNoDisco())('#16@2 · Layouts (GET e POST), fontes reais', () => {
  it('L-1: o GET devolve 10 layouts (com o #8, o #4, o #5 e o #9 da H9), um por id, com o #16 em versão 2 e a geometria do @2', async () => {
    origem()
    const r = (await GET(new Request('http://studio.test/x'), { params: Promise.resolve({ id: '77' }) })) as any
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    // H9: o #9@1 publicado → 10 layouts; IH #10: os 2 da coluna → 12; o #4 guardado fora da vitrine (25/10) → 11; o #3 guardado (26/10) → 10.
    expect(r.body.arquetipos).toHaveLength(10)
    expect(new Set(r.body.arquetipos.map((a: Pagina) => a.id)).size).toBe(10)
    const convite = r.body.arquetipos.find((a: Pagina) => a.id === ID_CONVITE)
    expect([convite.versao, convite.disponibilidade]).toEqual([2, 'disponivel'])
    expect(convite.geometria.story.logo).toEqual({ x: 0.41, y: 0.114, w: 0.18, h: 0.04 })
  }, 120_000)

  it('L-2/L-4: POST @2 → 201 com o path derivado e a derivação nas camadas; reabre pelo JSON e renderiza; a Page @1 gravada não muda', async () => {
    const antes = origem()
    const r1 = await post(1)
    expect(r1.status, JSON.stringify(r1.body)).toBe(201)
    const paginaV1 = structuredClone(loja.paginas.find((p) => p.id === r1.body.pageId)!)

    const r = await post(2)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const nova = loja.paginas.find((p) => p.id === r.body.pageId)!
    expect(Object.keys(nova).filter((k) => /generation|fieldValues|composicao/i.test(k))).toEqual([])
    expect(nova.background).toBe(CLARO)
    const camadas = reaberta(nova.id)
    const cant = camadas.find((l) => l.id === 'acento-cantoneiras')!
    expect(camadas.filter((l) => (l.metadata as any)?.compositor?.acento?.elemento === 'cantoneiras')).toHaveLength(1)
    expect([(cant.style as any).shapeType, (cant.style as any).pathData, (cant.style as any).strokeWidth]).toEqual(['svg-path', PATH_STORY, 2])
    expect((cant.style as any).vetor).toEqual({ asset: { id: 'cantoneiras', versao: 1 } })
    expect((cant.metadata as any).compositor.acento).toEqual({
      elemento: 'cantoneiras', tipo: 'cantoneiras', ancoradoA: 'peca', corPorPapel: 'destaque', fonteDaCor: 'destaque-da-manchete (cantoneiras)',
      arquetipo: `${ID_CONVITE}@2`, derivacao: { regra: 'bracos-iguais', bracoPx: 130 },
    })
    expect(blocosLidosDasCamadas(copyAutoralDaPagina(nova.copyAutoral)!, camadas).lacunas).toEqual([])

    // Renderizada de novo SÓ pelas camadas: tinta a 129 px do canto nos dois braços, fundo a 140 px.
    const { CanvasRenderer } = await vi.importActual<typeof import('@/lib/canvas-renderer')>('@/lib/canvas-renderer')
    const png = await new CanvasRenderer(1080, 1920).renderDesign({ canvas: { width: 1080, height: 1920, backgroundColor: nova.background }, layers: camadas }, {})
    const px = async (x: number, y: number) => {
      const { data } = await sharp(png).extract({ left: Math.round(x), top: Math.round(y), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
      return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
    }
    const { x, y } = cant.position
    expect(await px(x + 129, y)).not.toBe(CLARO)
    expect(await px(x, y + 129)).not.toBe(CLARO)
    expect(await px(x + 140, y)).toBe(CLARO)
    expect(await px(x, y + 140)).toBe(CLARO)

    // L-4: a Page @1 não é regravada — camadas, fundo, copy e o resto iguais. Só o `order` anda +1: a página nova entra
    // logo depois da origem e empurra as seguintes (a regra de inserção da rota, a mesma em qualquer versão).
    const v1Depois = loja.paginas.find((p) => p.id === r1.body.pageId)!
    expect({ ...v1Depois, order: 0 }).toEqual({ ...paginaV1, order: 0 })
    expect(v1Depois.order).toBe(paginaV1.order + 1)
    expect(loja.paginas.find((p) => p.id === 'origem')).toEqual(antes)
  }, 120_000)

  it('L-3: POST com versao 1 (cliente antigo) continua C1 — o path do asset, sem derivação', async () => {
    origem()
    const r = await post(1)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const cant = reaberta(r.body.pageId).find((l) => l.id === 'acento-cantoneiras')!
    expect((cant.style as any).pathData).toBe(ASSET)
    expect((cant.metadata as any).compositor.acento).toMatchObject({ arquetipo: `${ID_CONVITE}@1` })
    expect('derivacao' in (cant.metadata as any).compositor.acento).toBe(false)
  }, 120_000)
})
