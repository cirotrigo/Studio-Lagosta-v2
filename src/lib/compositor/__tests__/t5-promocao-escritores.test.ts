/**
 * T5 (24/10/2026) — os CINCO escritores que SUBSTITUEM `Page.tags` preservam a marca `fora-do-rodizio` (a da linha
 * gravada vale, não a do pedido): marcada + pedido sem a marca → continua; comum + pedido com a marca → não entra.
 * Handlers REAIS com o banco em memória (o `select` é respeitado: a linha "antes" só tem as tags se a rota as pedir).
 * Dublados: Clerk, acesso, invalidação, recomposição, aprendizado, `after()`.
 *
 * E1 PATCH template-pages/[pageId]/tags · E2 PATCH designs/[designId]/tags · E3 MCP marcar-como-modelo ·
 * E4 PATCH templates/[id]/pages/[pageId] (com e sem transação) · E5 PUT templates/[id] (página casada do push).
 * T5 · a marca sobrevive à normalização da E1 e não casa nenhum classificador de formato.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const MARCA = 'fora-do-rodizio'
type Linha = Record<string, any>
const banco = vi.hoisted(() => ({ paginas: {} as Record<string, Linha>, relogio: 1_000, tagsCriadas: [] as string[], escritasDeTags: [] as unknown[] }))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: () => undefined,
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_dono', orgId: null, orgRole: null }) }))
vi.mock('@/lib/templates/access', () => ({
  fetchTemplateWithProject: async () => ({ id: 77, Project: { id: 3 } }),
  hasTemplateReadAccess: () => true,
  hasTemplateWriteAccess: () => true,
}))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async () => ({ id: 3, userId: 'u', organizationProjects: [] }),
  hasProjectReadAccess: () => true,
  hasProjectWriteAccess: () => true,
  hasProjectOwnership: () => true,
  withProjectOwner: async (p: unknown) => p,
}))
vi.mock('@/lib/templates/miniatura', () => ({ guardarMiniatura: async (u: string) => u }))
vi.mock('@/lib/posts/invalidate-renders', async () => ({
  invalidateScheduledRenders: vi.fn(async () => ({ invalidados: 0, congelados: [] as string[] })),
  normalizeLayersString: (await import('@/lib/posts/page-layers')).normalizeLayersString,
}))
vi.mock('@/lib/compositor/recompor', () => ({ pedirRecomposicaoDaArteCongelada: vi.fn(async () => []) }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ caiNaEscolhaPropria: () => false, fecharDicaDeCopyDaPagina: vi.fn(async () => null) }))
vi.mock('@/lib/db', () => {
  const projetar = (linha: Linha | undefined, select?: Record<string, unknown>, include?: Record<string, unknown>) => {
    if (!linha) return null
    const copia = structuredClone(linha)
    const base = select ? Object.fromEntries(Object.keys(select).filter((k) => k in copia).map((k) => [k, copia[k]])) : copia
    return include?.Template ? { ...base, Template: { id: 77, projectId: 3, name: 'Peças' } } : base
  }
  const gravar = (id: string, data: Linha) => {
    if (data.tags !== undefined) banco.escritasDeTags.push(structuredClone(data.tags))
    banco.paginas[id] = { ...banco.paginas[id], ...data, updatedAt: new Date(++banco.relogio) }
    return banco.paginas[id]
  }
  const db: Record<string, any> = {
    template: {
      findFirst: async () => ({ id: 77, name: 'Peças', projectId: 3, Project: { id: 3, organizationProjects: [] } }),
      update: async ({ data }: { data: Linha }) => ({ id: 77, name: 'Peças', ...data }),
    },
    projectTag: {
      findMany: async () => [],
      createMany: async ({ data }: { data: Array<{ name: string }> }) => banco.tagsCriadas.push(...data.map((t) => t.name)),
    },
    page: {
      findFirst: async ({ where, select, include }: Linha) => projetar(banco.paginas[where.id], select, include),
      findUnique: async ({ where, select, include }: Linha) => projetar(banco.paginas[where.id], select, include),
      findMany: async ({ where }: Linha) => Object.values(banco.paginas).filter((p) => p.templateId === where.templateId).map((p) => structuredClone(p)).sort((a, b) => a.order - b.order),
      update: async ({ where, data, select }: Linha) => projetar(gravar(where.id, data), select),
      updateMany: async ({ where, data }: Linha) => {
        const p = banco.paginas[where.id]
        if (!p || (where.updatedAt && where.updatedAt.getTime() !== p.updatedAt.getTime())) return { count: 0 }
        gravar(where.id, data)
        return { count: 1 }
      },
      create: async ({ data }: Linha) => (banco.paginas[data.id] = { ...data, updatedAt: new Date(++banco.relogio) }),
    },
    socialPost: { findMany: async () => [] },
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db }
})

import { PATCH as patchTagsDoModelo } from '@/app/api/projects/[projectId]/template-pages/[pageId]/tags/route'
import { PATCH as patchTagsDoDesign } from '@/app/api/projects/[projectId]/designs/[designId]/tags/route'
import { PATCH as patchDaPagina } from '@/app/api/templates/[id]/pages/[pageId]/route'
import { PUT as putDoTemplate } from '@/app/api/templates/[id]/route'
import { toolsDeModelos } from '@/lib/mcp/catalogo/modelos'
import { formatoDaPagina } from '../assinatura'
import { formatoDaPaginaGravada } from '../formato'

const camadas = [{ id: 'headline', name: 'headline', type: 'text', visible: true, position: { x: 100, y: 300 }, size: { width: 800, height: 200 }, content: 'Oi', style: { fontSize: 80, color: '#ffffff' } }]
const linha = (tags: string[]): Linha => ({ id: 'p1', name: 'Story', templateId: 77, order: 0, width: 1080, height: 1920, background: '#000000', layers: JSON.stringify(camadas), tags, isTemplate: true, audio: null, thumbnail: null, copyAutoral: null, updatedAt: new Date(banco.relogio) })
const pedido = (corpo: unknown) => ({ json: async () => corpo }) as unknown as Request
const MARCADA = [MARCA, 'story']
const COMUM = ['story']
const tagsGravadas = () => banco.paginas.p1.tags as string[]

/** Os dois sentidos para cada escritor: a marca não sai e não entra. */
const casos = [
  { antes: MARCADA, pedidas: ['happy-hour'], depois: ['happy-hour', MARCA] },
  { antes: COMUM, pedidas: [MARCA, 'happy-hour'], depois: ['happy-hour'] },
]

beforeEach(() => {
  banco.paginas = {}
  banco.tagsCriadas = []
  banco.escritasDeTags = []
})

describe('T5 · escritores de tags preservam a marca', () => {
  it.each(casos)('E1 (T1) rota de tags do curador: $antes + $pedidas → $depois', async ({ antes, pedidas, depois }) => {
    banco.paginas.p1 = linha(antes)
    const r = (await patchTagsDoModelo(pedido({ tags: pedidas }), { params: Promise.resolve({ projectId: '3', pageId: 'p1' }) })) as unknown as { status: number }
    expect(r.status).toBe(200)
    expect(tagsGravadas()).toEqual(depois)
    expect(banco.tagsCriadas).not.toContain(MARCA)
  })

  it.each(casos)('E2 (T6) rota de tags do design: $antes + $pedidas → $depois', async ({ antes, pedidas, depois }) => {
    banco.paginas.p1 = linha(antes)
    const r = (await patchTagsDoDesign(pedido({ tags: pedidas }), { params: Promise.resolve({ projectId: '3', designId: 'p1' }) })) as unknown as { status: number }
    expect(r.status).toBe(200)
    expect(tagsGravadas()).toEqual(depois)
    expect(banco.tagsCriadas).not.toContain(MARCA)
  })

  it.each(casos)('E3 (T2) MCP marcar-como-modelo com tags: $antes + $pedidas → $depois', async ({ antes, pedidas, depois }) => {
    for (const isTemplate of [true, false]) {
      banco.paginas.p1 = { ...linha(antes), isTemplate }
      const tool = toolsDeModelos.find((t) => t.nome === 'marcar-como-modelo')!
      await tool.handler({ projectId: 3, pageId: 'p1', tags: pedidas }, { kind: 'user' } as never)
      expect(tagsGravadas()).toEqual(depois)
    }
  })

  it.each(casos)('E4 (T3) PATCH da página, ramo SEM transação (só tags): $antes + $pedidas → $depois', async ({ antes, pedidas, depois }) => {
    banco.paginas.p1 = linha(antes)
    const r = (await patchDaPagina(pedido({ tags: pedidas }), { params: Promise.resolve({ id: '77', pageId: 'p1' }) })) as unknown as { status: number }
    expect(r.status).toBe(200)
    expect(tagsGravadas()).toEqual(depois)
  })

  it.each(casos)('E4 (T3) PATCH da página, ramo COM transação (fundo + tags, linha relida no compare-and-set): $antes + $pedidas → $depois', async ({ antes, pedidas, depois }) => {
    banco.paginas.p1 = linha(antes)
    const r = (await patchDaPagina(pedido({ tags: pedidas, background: '#123456' }), { params: Promise.resolve({ id: '77', pageId: 'p1' }) })) as unknown as { status: number }
    expect(r.status).toBe(200)
    expect(banco.paginas.p1.background).toBe('#123456')
    expect(tagsGravadas()).toEqual(depois)
  })

  it.each(casos)('E5 (T4) PUT do template, página casada do push: $antes + $pedidas → $depois', async ({ antes, pedidas, depois }) => {
    banco.paginas.p1 = linha(antes)
    const r = (await putDoTemplate(pedido({ designData: { canvas: { width: 1080, height: 1920 }, pages: [{ id: 'p1', name: 'Story', width: 1080, height: 1920, layers: camadas, background: '#000000', order: 0, tags: pedidas }] } }), { params: Promise.resolve({ id: '77' }) })) as unknown as { status: number; body: unknown }
    expect(r.status).toBe(200)
    expect(tagsGravadas()).toEqual(depois)
  })

  it('T5: a marca sobrevive à normalização da E1 e não casa nenhum classificador de formato', async () => {
    banco.paginas.p1 = linha(MARCADA)
    await patchTagsDoModelo(pedido({ tags: ['Fora-do-Rodízio', 'Happy Hour'] }), { params: Promise.resolve({ projectId: '3', pageId: 'p1' }) })
    // Normalizada, a forma pedida vira a reservada — e o pedido não a duplica nem a põe: fica a da linha.
    expect(tagsGravadas()).toEqual(['happy-hour', MARCA])
    const semFormato = { name: '', width: 1000, height: 1000.5 }
    expect(formatoDaPagina({ ...semFormato, tags: [MARCA] })).toBe(formatoDaPagina({ ...semFormato, tags: [] }))
    for (const tamanho of [{ width: 1080, height: 1920 }, { width: 1080, height: 1350 }]) {
      expect(formatoDaPagina({ name: 'x', ...tamanho, tags: [MARCA] })).toBe(formatoDaPagina({ name: 'x', ...tamanho, tags: [] }))
      expect(formatoDaPaginaGravada({ ...tamanho, tags: [MARCA] })).toBe(formatoDaPaginaGravada({ ...tamanho, tags: [] }))
    }
    expect(/feed|story|stories|quadrad|clara|escura/.test(MARCA)).toBe(false)
  })
})
