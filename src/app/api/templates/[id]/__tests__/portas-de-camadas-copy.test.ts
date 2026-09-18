/**
 * PR3-F03 (revisão FINAL do Codex sobre abac9b34, 18/09/2026): o PATCH de
 * CAMADA (`/api/pages/[pageId]/layers/[layerId]`, autosave de camada) e o PUT
 * do TEMPLATE (páginas no `designData`) gravam as camadas COM a revisão do
 * contrato da copy. Antes os dois escreviam `layers` sem revisar
 * `copyAutoral`, e o PATCH seguinte só de geometria registrava a mudança de
 * texto com a operação e a autoria erradas.
 *
 * Os três handlers reais, o banco em memória.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as any,
  relogio: 1_000,
  escritas: 0,
  antesDaEscrita: {} as Record<number, () => void>,
}))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/templates/access', () => ({
  fetchTemplateWithProject: async () => ({ id: 77, Project: { id: 8 } }),
  hasTemplateReadAccess: () => true,
  hasTemplateWriteAccess: () => true,
}))
vi.mock('@/lib/projects/access', () => ({ hasProjectReadAccess: () => true, hasProjectWriteAccess: () => true, withProjectOwner: async (p: unknown) => p }))
vi.mock('@/lib/templates/miniatura', () => ({ guardarMiniatura: async (u: string) => u }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ caiNaEscolhaPropria: () => false, fecharDicaDeCopyDaPagina: vi.fn(async () => null) }))
vi.mock('@/lib/posts/invalidate-renders', async () => ({
  invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }),
  normalizeLayersString: (await import('@/lib/posts/page-layers')).normalizeLayersString,
}))
vi.mock('@/lib/db', () => {
  const copia = () => structuredClone(banco.pagina)
  const antes = () => {
    const n = ++banco.escritas
    const fn = banco.antesDaEscrita[n]
    delete banco.antesDaEscrita[n]
    fn?.()
  }
  const gravar = (data: Record<string, unknown>) => {
    banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
  }
  const db: Record<string, any> = {
    template: {
      findFirst: async () => ({ id: 77, Project: { id: 8, organizationProjects: [] } }),
      update: async () => ({ id: 77, name: 'Programação' }),
    },
    page: {
      findFirst: async () => copia(),
      findUnique: async () => copia(),
      findMany: async ({ where }: { where: Record<string, any> }) => (where.templateId === 77 ? [copia()] : []),
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
        antes()
        if (where.updatedAt && where.updatedAt.getTime() !== banco.pagina.updatedAt.getTime()) return { count: 0 }
        gravar(data)
        return { count: 1 }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        antes()
        gravar(data)
        return copia()
      },
      create: async () => {
        throw new Error('não esperava página nova')
      },
      deleteMany: async () => ({ count: 0 }),
    },
    socialPost: { findMany: async () => [] },
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db }
})

import { PATCH as patchDaCamada } from '@/app/api/pages/[pageId]/layers/[layerId]/route'
import { PUT as putDoTemplate } from '../route'
import { PATCH as patchDaPagina } from '../pages/[pageId]/route'
import { comVisibilidadeDoRevisor, marcaDoRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'
import { VERSAO_DO_CONTRATO, copyAutoralDaPagina, revisaoDaPaginaComCamadas, type CopyAutoral } from '@/lib/copy-autoral'

type Camada = Record<string, any>
function texto(id: string, y: number, content: string): Camada {
  return { id, name: id, type: 'text', content, visible: true, locked: false, order: y, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id } } }
}
const contrato: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake'] },
    { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Sexta é dia'] },
  ],
  revisoes: [],
}
const camadas = [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sexta é dia')]

const req = (body: unknown) => ({ json: async () => structuredClone(body) }) as unknown as Request
const camadasNoBanco = (): Camada[] => (typeof banco.pagina.layers === 'string' ? JSON.parse(banco.pagina.layers) : banco.pagina.layers)
const revisoes = () => copyAutoralDaPagina(banco.pagina.copyAutoral)!.revisoes
const contratoDescreveAsCamadas = () => revisaoDaPaginaComCamadas(banco.pagina.copyAutoral, banco.pagina.layers, { autor: 'sistema', motivo: 'conferência', superficie: 'teste' }).estado === 'sem-mudanca'

/** Depois: a equipe arrasta a caixa do apoio no editor (PATCH da página, só geometria). */
async function soGeometriaPeloPatchPrincipal() {
  const movidas = camadasNoBanco().map((c) => (c.id === 'apoio' ? { ...c, position: { x: 120, y: 420 } } : c))
  const r = await patchDaPagina(req({ layers: movidas }), { params: Promise.resolve({ id: '77', pageId: 'p1' }) })
  expect(r.status).toBe(200)
}

beforeEach(() => {
  banco.pagina = { id: 'p1', templateId: 77, name: 'Sexta', order: 0, isTemplate: false, tags: [], width: 1080, height: 1920, background: '#ffffff', layers: JSON.stringify(camadas), copyAutoral: contrato, updatedAt: new Date(banco.relogio) }
  banco.escritas = 0
  banco.antesDaEscrita = {}
})

describe('PATCH de CAMADA revisa o contrato (PR3-F03)', () => {
  it('texto novo numa camada: revisão da equipe na mesma escrita; a geometria seguinte não acrescenta revisão de texto', async () => {
    const r = await patchDaCamada(req({ content: 'Sábado também' }), { params: Promise.resolve({ pageId: 'p1', layerId: 'apoio' }) })
    expect(r.status).toBe(200)
    expect(contratoDescreveAsCamadas()).toBe(true)
    expect(revisoes()).toHaveLength(1)
    expect(revisoes()[0]).toMatchObject({ autor: 'equipe', superficie: 'editor', blocos: ['apoio'] })
    await soGeometriaPeloPatchPrincipal()
    expect(revisoes()).toHaveLength(1)
  })

  it('a camada é fundida na página RELIDA: um autosave de outra camada no meio não é desfeito, e o contrato descreve as duas', async () => {
    banco.antesDaEscrita[1] = () => {
      const outras = camadasNoBanco().map((c) => (c.id === 'headline' ? { ...c, content: 'Milk-shake em dobro' } : c))
      const rev = revisaoDaPaginaComCamadas(banco.pagina.copyAutoral, outras, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
      banco.pagina = { ...banco.pagina, layers: JSON.stringify(outras), copyAutoral: rev.copy, updatedAt: new Date(++banco.relogio) }
    }
    await patchDaCamada(req({ content: 'Sábado também' }), { params: Promise.resolve({ pageId: 'p1', layerId: 'apoio' }) })
    expect(camadasNoBanco().map((c) => c.content)).toEqual(['Milk-shake em dobro', 'Sábado também'])
    expect(contratoDescreveAsCamadas()).toBe(true)
    expect(revisoes().map((r) => r.blocos)).toEqual([['headline'], ['apoio']])
  })

  it('escrita HUMANA: mostrar a camada que o revisor escondeu tira a marca (e esconder de novo conta como remoção da equipe)', async () => {
    const escondida = comVisibilidadeDoRevisor(camadas[1], false, { em: '2026-09-12T12:00:00.000Z', ajuste: 0 })
    banco.pagina = { ...banco.pagina, layers: JSON.stringify([camadas[0], escondida]) }
    await patchDaCamada(req({ visible: true }), { params: Promise.resolve({ pageId: 'p1', layerId: 'apoio' }) })
    expect(marcaDoRevisor(camadasNoBanco()[1] as never)).toBeNull()
    expect(revisoes()).toHaveLength(0)
    // o editor reenvia a camada com a marca antiga (o estado local nunca recebeu a remoção) — C3-11
    await patchDaCamada(req({ visible: false, metadata: escondida.metadata }), { params: Promise.resolve({ pageId: 'p1', layerId: 'apoio' }) })
    expect(marcaDoRevisor(camadasNoBanco()[1] as never)).toBeNull()
    expect(revisoes()).toHaveLength(1)
    expect(revisoes()[0]).toMatchObject({ autor: 'equipe', blocos: ['apoio'] })
  })

  it('camada que não existe: 404, nada gravado', async () => {
    const r = await patchDaCamada(req({ content: 'x' }), { params: Promise.resolve({ pageId: 'p1', layerId: 'nao-existe' }) })
    expect(r.status).toBe(404)
    expect(banco.escritas).toBe(0)
  })
})

describe('PUT do TEMPLATE revisa o contrato das páginas (PR3-F03)', () => {
  it('"Salvar" com texto novo: revisão da equipe na mesma escrita; a geometria seguinte não acrescenta revisão de texto', async () => {
    const novas = camadas.map((c) => (c.id === 'apoio' ? { ...c, content: 'Sábado também' } : c))
    const r = await putDoTemplate(req({ designData: { canvas: { width: 1080, height: 1920 }, pages: [{ id: 'p1', name: 'Sexta', width: 1080, height: 1920, layers: novas, background: '#ffffff', order: 0 }] } }), { params: Promise.resolve({ id: '77' }) })
    expect(r.status).toBe(200)
    expect(camadasNoBanco()[1].content).toBe('Sábado também')
    expect(contratoDescreveAsCamadas()).toBe(true)
    expect(revisoes()).toHaveLength(1)
    expect(revisoes()[0]).toMatchObject({ autor: 'equipe', superficie: 'editor', blocos: ['apoio'] })
    await soGeometriaPeloPatchPrincipal()
    expect(revisoes()).toHaveLength(1)
  })

  it('controle: salvar camadas idênticas não revisa nada', async () => {
    await putDoTemplate(req({ designData: { canvas: { width: 1080, height: 1920 }, pages: [{ id: 'p1', name: 'Sexta', layers: camadas, order: 0 }] } }), { params: Promise.resolve({ id: '77' }) })
    expect(revisoes()).toHaveLength(0)
    expect(banco.pagina.copyAutoral).toEqual(contrato)
  })
})
