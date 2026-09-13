/**
 * C3-11 pelo caminho REAL da escrita humana: o PATCH da página
 * (`src/app/api/templates/[id]/pages/[pageId]/route.ts`) com a base em memória.
 * O editor reenvia a marca do revisor que o servidor já tirou; mostrar →
 * esconder de novo → outra edição não pode devolvê-la à camada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ pagina: null as Record<string, any> | null }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_prova', orgId: null }) }))
vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: () => undefined,
}))
vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    page: {
      findFirst: async ({ where }: { where: { id: string } }) => (banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina } : null),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina!, ...data }
        return { ...banco.pagina }
      },
    },
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db }
})
vi.mock('@/lib/templates/access', () => ({
  fetchTemplateWithProject: async () => ({ id: 77, Project: { id: 8 } }),
  hasTemplateReadAccess: () => true,
  hasTemplateWriteAccess: () => true,
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({
  invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }),
  normalizeLayersString: (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v)),
}))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn() }))
vi.mock('@/lib/aprendizado/diff-copy', () => ({ copyParaDecisao: () => null, diffDeCopy: () => null }))
vi.mock('@/lib/aprendizado/diff-geometria', () => ({ descreverDiff: () => '', diffDeGeometria: () => ({ ilegivel: true, mudou: false }) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ caiNaEscolhaPropria: () => false, fecharDicaDeCopyDaPagina: vi.fn() }))
vi.mock('@/lib/shape-style', () => ({ canonicalizeLayersForPersistence: (l: unknown) => l }))

import { PATCH } from '@/app/api/templates/[id]/pages/[pageId]/route'
import { comVisibilidadeDoRevisor, marcaDoRevisor, ocultaPeloRevisor } from '../oculta-pelo-revisor'

const marca = { em: '2026-09-12T10:00:00.000Z', ajuste: 0 }
const titulo = { id: 'headline', type: 'text', content: 'Almoço', visible: true }
const marcada = comVisibilidadeDoRevisor({ id: 'cta', type: 'text', content: 'Vem', visible: true }, false, marca)

async function salvar(layers: unknown[]): Promise<Array<Record<string, any>>> {
  const r = (await PATCH(new Request('http://studio.test', { method: 'PATCH', body: JSON.stringify({ layers }) }), {
    params: Promise.resolve({ id: '77', pageId: 'p1' }),
  })) as unknown as { status: number }
  expect(r.status).toBe(200)
  return JSON.parse(String(banco.pagina!.layers)) as Array<Record<string, any>>
}
const cta = (camadas: Array<Record<string, any>>) => camadas.find((l) => l.id === 'cta')!

beforeEach(() => {
  // a base como o ajuste do revisor a gravou: o CTA escondido e marcado
  banco.pagina = { id: 'p1', templateId: 77, tags: [], background: null, width: 1080, height: 1920, layers: JSON.stringify([titulo, marcada]) }
})

describe('PATCH da página — a marca do revisor não ressuscita (C3-11)', () => {
  it('autosave logo depois do ajuste mantém a marca; mostrar → esconder → outra edição termina SEM ela', async () => {
    expect(ocultaPeloRevisor(cta(await salvar([titulo, marcada])))).toBe(true)
    expect(marcaDoRevisor(cta(await salvar([titulo, { ...marcada, visible: true }])))).toBeNull()
    expect(marcaDoRevisor(cta(await salvar([titulo, { ...marcada, visible: false }])))).toBeNull()
    const depois = await salvar([{ ...titulo, content: 'Almoço executivo' }, { ...marcada, visible: false }])
    expect(marcaDoRevisor(cta(depois))).toBeNull()
    expect(ocultaPeloRevisor(cta(depois))).toBe(false)
    expect(depois.find((l) => l.id === 'headline')!.content).toBe('Almoço executivo')
  })
})
