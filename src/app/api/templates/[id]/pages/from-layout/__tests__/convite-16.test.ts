/**
 * #16 `minimal-tipografico-convite` pela aba Layouts: rota real → `comporPeca` REAL (contrato autoral, segunda voz, logo
 * fixa central, cantoneiras presas à peça, fio acima do apoio, cta na base, fundo claro) com FONTES REAIS → página NOVA
 * gravada, SEM Generation. Depois a página é REABERTA só pelas próprias camadas (o JSON gravado): o desenho e a cor das
 * cantoneiras no `style`/`style.vetor`, a identidade em `metadata.compositor.acento`, o fundo e a copy — renderizada de
 * novo pelo renderizador do Studio, sem replay nem persistência nova.
 * Dublados: o banco (em memória — não é Postgres), o Clerk, quem invalida renders/pede recomposição (espiões) e os
 * módulos do suporte do compositor (Blob, registro de fontes, autofix). Marca sintética.
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
import { POST } from '../route'

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

describe.skipIf(!fontesNoDisco())('#16 · Layouts → compositor real → página nova, reaberta pelas camadas (fontes reais)', () => {
  it('201: fundo claro, cantoneiras e fio gravados nas camadas, logo central, cta na base, contrato intacto; reabre e renderiza sem Generation', async () => {
    const antes = origem()
    const r = (await POST(
      new Request('http://studio.test/api/templates/77/pages/from-layout', { method: 'POST', body: JSON.stringify({ arquetipo: { id: ID_CONVITE, versao: 1 }, aPartirDaPagina: 'origem' }) }),
      { params: Promise.resolve({ id: '77' }) },
    )) as any
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const nova = loja.paginas.find((p) => p.id === r.body.pageId)!
    // A Page é a única persistência: nenhum campo de Generation nela, nenhuma receita fora das camadas.
    expect(Object.keys(nova).filter((k) => /generation|fieldValues|composicao/i.test(k))).toEqual([])
    expect(nova.background).toBe(CLARO)

    // REABRIR: só o JSON gravado (o que o editor carrega), sem replay.
    const camadas = JSON.parse(nova.layers) as Layer[]
    const porId = (id: string) => camadas.find((l) => l.id === id)!
    expect(camadas.some((l) => l.type === 'image')).toBe(false)
    const cant = porId('acento-cantoneiras')
    expect((cant.style as any).shapeType).toBe('svg-path')
    expect((cant.style as any).pathData).toBe('M0 25 L0 0 L25 0 M75 0 L100 0 L100 25 M100 75 L100 100 L75 100 M25 100 L0 100 L0 75')
    expect((cant.style as any).strokeColor).toBe('rgba(176, 141, 87, 1)')
    expect((cant.style as any).vetor).toEqual({ asset: { id: 'cantoneiras', versao: 1 } })
    expect((cant.metadata as any).compositor.acento).toEqual({ elemento: 'cantoneiras', tipo: 'cantoneiras', ancoradoA: 'peca', corPorPapel: 'destaque', fonteDaCor: 'destaque-da-manchete (cantoneiras)', arquetipo: `${ID_CONVITE}@1` })
    expect((porId('acento-fio').metadata as any).compositor.acento).toMatchObject({ elemento: 'fio', presoA: 'apoio' })
    const logo = porId('logo')
    expect(Math.abs(logo.position.x + logo.size.width / 2 - 540)).toBeLessThanOrEqual(1)
    expect(porId('cta').content).toBe('→ www.casa.com.br')
    expect(porId('cta').position.y).toBeGreaterThan(porId('servico').position.y)

    // A copy: o contrato da origem atravessa (ids, ordem, linhas, segunda voz), e as camadas reabertas o leem de volta.
    const gravada = copyAutoralDaPagina(nova.copyAutoral)!
    expect(gravada.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, b.estilo?.linhasNaVoz2 ?? null])).toEqual(
      CONTRATO.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, b.estilo?.linhasNaVoz2 ?? null]),
    )
    expect(blocosLidosDasCamadas(gravada, camadas).lacunas).toEqual([])

    // Renderizada de novo a partir das camadas reabertas: claro no miolo, o vértice do braço pintado.
    const { CanvasRenderer } = await vi.importActual<typeof import('@/lib/canvas-renderer')>('@/lib/canvas-renderer')
    const png = await new CanvasRenderer(1080, 1920).renderDesign({ canvas: { width: 1080, height: 1920, backgroundColor: nova.background }, layers: camadas }, {})
    const px = async (x: number, y: number) => {
      const { data } = await sharp(png).extract({ left: Math.round(x), top: Math.round(y), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
      return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
    }
    expect(await px(20, 20)).toBe(CLARO)
    expect(await px(cant.position.x, cant.position.y)).not.toBe(CLARO)
    expect(await px(cant.position.x + cant.size.width / 2, cant.position.y)).toBe(CLARO)

    // Quem grava Page.layers chama as duas guardas; a origem não muda.
    expect(espias.invalidar).toHaveBeenCalled()
    expect(espias.recompor).toHaveBeenCalled()
    expect(loja.paginas.find((p) => p.id === 'origem')).toEqual(antes)
  }, 120_000)
})
