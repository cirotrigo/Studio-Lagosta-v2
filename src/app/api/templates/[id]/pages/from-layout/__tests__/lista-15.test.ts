/**
 * #15 `minimal-tipografico-lista` pela CADEIA INTEIRA: rota real de Layouts → `comporPeca` REAL (spec, contrato
 * autoral, segunda voz, arquétipo publicado, fundo claro, fio por item, rodapé em duas colunas) com FONTES REAIS e o
 * medidor REAL do servidor → página nova gravada. Dublados: o banco (em memória — não é Postgres), o Clerk, quem
 * invalida renders/pede recomposição (espiões) e os módulos do suporte do compositor (Blob, registro de fontes,
 * autofix). A marca é sintética; nenhuma marca real consultada.
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

import type { Layer } from '@/types/template'
import { autorDoBloco, copyAutoralDaPagina, revisaoDaPaginaComCamadas, type CopyAutoral } from '@/lib/copy-autoral'
import { cenario } from '@/lib/direcao-de-arte/__tests__/suporte/compositor'
import { CLARO, COPY_15, ID_LISTA, cenario15, fontesNoDisco, medidorComFontesReais, paginaDoCenario15 } from '@/lib/direcao-de-arte/__tests__/suporte/cenario-15'
import { POST } from '../route'

/** A origem: a copy do #15 como a EQUIPE a deixou no editor (contrato que descreve as camadas de hoje), sem foto. */
const CONTRATO: CopyAutoral = { ...(COPY_15 as unknown as CopyAutoral), origem: { autor: 'equipe', em: '2026-10-20T12:00:00.000Z', superficie: 'editor' } }
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
    size: { width: 900, height: 160 },
    rotation: 0,
    style: { fontFamily: 'Georgia', fontSize: 60, fill: '#1f1f1f' },
    metadata: { compositor: { papel, bloco, linhas } },
  }) as Layer
const CAMADAS = [
  texto('t1', 'headline', 'manchete', [0, 1], 'Algo\nnovo feito', 200),
  texto('t2', 'headline2', 'manchete', [2], 'para você', 400),
  texto('t3', 'apoio', 'lista', [0, 1, 2], COPY_15.blocos[1].linhas.join('\n'), 900),
  texto('t4', 'cta', 'chamada', [0], 'Compre em nosso site', 1600),
  texto('t5', 'servico', 'endereco', [0], 'www.restaurante.com.br', 1700),
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
  cenario.atual = await cenario15(await paginaDoCenario15('assin-15'), medir)
})

describe.skipIf(!fontesNoDisco())('#15 · Layouts → compositor real → página nova (fontes reais)', () => {
  it('origem com contrato e sem foto: 201, fundo claro gravado, lista item a item com fios, rodapé em duas colunas, contrato intacto', async () => {
    const antes = origem()
    expect(revisaoDaPaginaComCamadas(CONTRATO, CAMADAS, { autor: 'sistema', motivo: 'x', superficie: 'teste' }).estado).toBe('sem-mudanca')
    const r = (await POST(
      new Request('http://studio.test/api/templates/77/pages/from-layout', { method: 'POST', body: JSON.stringify({ arquetipo: { id: ID_LISTA, versao: 1 }, aPartirDaPagina: 'origem' }) }),
      { params: Promise.resolve({ id: '77' }) },
    )) as any
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const nova = loja.paginas.find((p) => p.id === r.body.pageId)!
    const camadas = JSON.parse(nova.layers) as Layer[]
    // Sem foto, o fundo que o compositor mediu e desenhou é o que a página grava.
    expect(nova.background).toBe(CLARO)
    expect(camadas.some((l) => l.type === 'image')).toBe(false)
    const porId = (id: string) => camadas.find((l) => l.id === id)!
    expect(['apoio', 'apoio-2', 'apoio-3'].map((id) => porId(id).content)).toEqual(COPY_15.blocos[1].linhas)
    expect(camadas.filter((l) => (l.metadata as any)?.compositor?.acento?.elemento === 'fio').map((l) => l.id)).toEqual(['acento-fio-item1', 'acento-fio-item2', 'acento-fio-item3'])
    expect([porId('cta').content, porId('servico').content]).toEqual(['Compre em nosso site', 'www.restaurante.com.br'])
    expect(porId('cta').position.x + porId('cta').size.width).toBeLessThan(porId('servico').position.x)
    expect(porId('headline2').content).toBe('para você')
    // O contrato da origem atravessa: ids, ordem, linhas e a segunda voz declarada; nada recortado, autoria da equipe.
    const gravada = copyAutoralDaPagina(nova.copyAutoral)!
    expect(gravada.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, b.estilo?.linhasNaVoz2 ?? null])).toEqual(
      CONTRATO.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, b.estilo?.linhasNaVoz2 ?? null]),
    )
    expect(gravada.origem).toEqual(CONTRATO.origem)
    expect(autorDoBloco(gravada, 'lista').autor).toBe('equipe')
    // Quem grava Page.layers chama as duas guardas; a origem não muda.
    expect(espias.invalidar).toHaveBeenCalled()
    expect(espias.recompor).toHaveBeenCalled()
    expect(loja.paginas.find((p) => p.id === 'origem')).toEqual(antes)
  }, 120_000)

  it('o mesmo layout num modelo antigo (com foto) segue recusando a origem sem foto: 409 LAYOUT_SEM_FOTO, nada gravado', async () => {
    origem()
    const r = (await POST(
      new Request('http://studio.test/api/templates/77/pages/from-layout', { method: 'POST', body: JSON.stringify({ arquetipo: { id: 'minimal-titulo-gigante', versao: 1 }, aPartirDaPagina: 'origem' }) }),
      { params: Promise.resolve({ id: '77' }) },
    )) as any
    expect([r.status, r.body.error]).toEqual([409, 'LAYOUT_SEM_FOTO'])
    expect(loja.paginas).toHaveLength(2)
  }, 120_000)
})
