/**
 * T4-E — a rota de Layouts com um arquétipo SEM FOTO (fixture `liso-claro` injetada no catálogo; o #15 não é
 * publicado): a página sem foto não recebe 409, o compositor recebe a spec SEM foto e a página nova grava o fundo
 * EFETIVO que ele devolveu — o mesmo que o GET real de `pages/route.ts` reabre. O ramo com foto segue com o 409 e o
 * fundo da origem. Handler, acesso e leitor da copy REAIS; dublados o Clerk, o compositor e o banco (em memória — não
 * é Postgres: prova a rota, não o banco).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreativeError } from '@/lib/creatives/errors'

type Pagina = Record<string, any>
const banco = vi.hoisted(() => ({ paginas: [] as Pagina[], escritas: 0, seq: 0 }))
const espias = vi.hoisted(() => ({ compor: vi.fn(), invalidar: vi.fn(), recompor: vi.fn() }))
const CLARO = '#F4EFE6'

vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) } }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_dono', orgId: null }) }))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: espias.compor, paginasDeAssinatura: async () => ({ templateId: 1, paginas: [{ id: 'assin', formato: 'story' }] }) }))
vi.mock('@/lib/compositor/recompor', () => ({ pedirRecomposicaoDaArteCongelada: espias.recompor }))
vi.mock('@/lib/posts/invalidate-renders', () => ({
  invalidateScheduledRenders: async (...args: unknown[]) => {
    espias.invalidar(...args)
    return { invalidados: 0, congelados: [], reabertos: 0 }
  },
}))
vi.mock('@/lib/compositor/arquetipos/catalogo', async (original) =>
  (await import('@/lib/compositor/arquetipos/__tests__/suporte/arquetipo-sem-foto')).catalogoComAFixture(original as never),
)
vi.mock('@/lib/db', () => {
  const projeto = { id: 8, userId: 'u-dono', organizationProjects: [] }
  const casa = (p: Pagina, where: Record<string, any>) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'gte' in v ? p[k] >= v.gte : p[k] === v))
  const db: Record<string, any> = {
    template: { findFirst: async ({ where }: any) => (where.id === 77 ? { id: 77, projectId: 8, Project: projeto } : null) },
    user: { findUnique: async ({ where }: any) => (where.id === 'u-dono' ? { clerkId: 'user_dono' } : null) },
    page: {
      findFirst: async ({ where }: any) => structuredClone(banco.paginas.find((p) => casa(p, where)) ?? null),
      findMany: async ({ where }: any) => structuredClone(banco.paginas.filter((p) => casa(p, where)).sort((a, b) => a.order - b.order)),
      updateMany: async ({ where, data }: any) => {
        banco.escritas++
        const alvo = banco.paginas.filter((p) => casa(p, where))
        alvo.forEach((p) => (p.order += data.order.increment))
        return { count: alvo.length }
      },
      create: async ({ data }: any) => {
        banco.escritas++
        const nova = { id: `nova-${++banco.seq}`, thumbnail: null, audio: null, copyAutoral: null, ...data }
        banco.paginas.push(nova)
        return { id: nova.id }
      },
    },
    // Um dublê da trava (pg_advisory_xact_lock) e do FOR UPDATE — o comportamento concorrente já é provado no CP-T2.
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        ...db,
        $queryRaw: async (partes: TemplateStringsArray, ...valores: any[]) =>
          partes.join('?').includes('FOR UPDATE') ? banco.paginas.filter((p) => p.id === valores[0] && p.templateId === valores[1]).map((p) => ({ order: p.order })) : [{ ok: 1 }],
      }),
  }
  return { db }
})

import { POST } from '../route'
import { GET as listarPaginas } from '../../route'
import { ID_SEM_FOTO } from '@/lib/compositor/arquetipos/__tests__/suporte/arquetipo-sem-foto'

const texto = (id: string, name: string, content: string, y: number) => ({
  id,
  name,
  type: 'text',
  visible: true,
  locked: false,
  order: 1,
  content,
  position: { x: 80, y },
  size: { width: 900, height: 120 },
  rotation: 0,
  style: { fontFamily: 'Inter', fontSize: 64, fill: '#1f1f1f' },
})
const foto = { id: 'bg-foto', name: 'Foto', type: 'image', visible: true, locked: false, order: 0, fileUrl: 'https://blob.test/origem.jpg', position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, rotation: 0, style: { objectFit: 'cover' } }
const textos = [texto('t1', 'headline', 'Nesta semana', 300), texto('t2', 'apoio', 'Ter · Feijoada\nQua · Moqueca\nSex · Rodízio', 900), texto('t3', 'servico', 'Seg a sáb · 11h às 15h', 1600)]

const pagina = (id: string, order: number, extra: Pagina = {}): Pagina => ({ id, name: id, templateId: 77, width: 1080, height: 1920, order, isTemplate: false, tags: [], background: '#101010', layers: '[]', copyAutoral: null, ...extra })

/** O que o compositor devolveria SEM foto: só os textos e o fundo efetivo (claro da marca). */
function composicaoDe(spec: any) {
  return {
    persistido: null,
    prova: null,
    fundo: spec.arquetipo.id === ID_SEM_FOTO ? CLARO : '#0B0B0B',
    diagnostico: { avisos: [] },
    layers: [
      ...(spec.foto ? [{ ...foto, fileUrl: spec.foto.url }] : []),
      ...spec.blocos.map((b: any, i: number) => ({ ...texto(b.papel, b.papel, b.linhas.join('\n'), 200 + i * 300), metadata: { compositor: { papel: b.papel } } })),
    ],
  }
}

const params = () => ({ params: Promise.resolve({ id: '77' }) })
const post = (corpo: unknown) => POST(new Request('http://studio.test/api/templates/77/pages/from-layout', { method: 'POST', body: JSON.stringify(corpo) }), params()) as any

beforeEach(() => {
  vi.clearAllMocks()
  banco.escritas = 0
  banco.paginas = [pagina('origem', 0, { layers: JSON.stringify(textos) }), pagina('p1', 1)]
  espias.compor.mockImplementation(async (spec: unknown) => composicaoDe(spec))
})

describe('T4-E · Layouts sem foto', () => {
  it('página SEM foto + layout sem foto: 201, spec sem foto, página nova com o fundo efetivo — e o GET a reabre igual', async () => {
    const r = await post({ arquetipo: { id: ID_SEM_FOTO, versao: 1 }, aPartirDaPagina: 'origem' })
    expect(r.status).toBe(201)
    const [spec, opcoes] = espias.compor.mock.calls[0]
    expect(opcoes).toEqual({ somenteAvaliar: true })
    expect(spec).not.toHaveProperty('foto')
    expect(spec.blocos).toEqual([
      { papel: 'headline', linhas: ['Nesta semana'] },
      { papel: 'apoio', linhas: ['Ter · Feijoada', 'Qua · Moqueca', 'Sex · Rodízio'] },
      { papel: 'servico', linhas: ['Seg a sáb · 11h às 15h'] },
    ])
    const nova = banco.paginas.find((p) => p.id === r.body.pageId)!
    expect(nova.background).toBe(CLARO)
    expect(banco.paginas.find((p) => p.id === 'origem')!.background).toBe('#101010')
    expect(espias.invalidar).toHaveBeenCalledWith(expect.anything(), { pageIds: [nova.id] })
    expect(espias.recompor).toHaveBeenCalledWith([nova.id])
    const lista = (await listarPaginas(new Request('http://studio.test/api/templates/77/pages'), params())) as any
    const reaberta = lista.body.find((p: Pagina) => p.id === nova.id)
    expect(reaberta.background).toBe(CLARO)
    expect(reaberta.layers.some((c: Pagina) => c.type === 'image')).toBe(false)
    expect(reaberta.layers.find((c: Pagina) => c.id === 'apoio').content).toBe('Ter · Feijoada\nQua · Moqueca\nSex · Rodízio')
  })

  it('página COM foto + layout sem foto: a foto da origem não vai para o compositor (não é procurada)', async () => {
    banco.paginas[0].layers = JSON.stringify([foto, ...textos])
    const r = await post({ arquetipo: { id: ID_SEM_FOTO, versao: 1 }, aPartirDaPagina: 'origem' })
    expect(r.status).toBe(201)
    expect(espias.compor.mock.calls[0][0]).not.toHaveProperty('foto')
    expect(banco.paginas.find((p) => p.id === r.body.pageId)!.background).toBe(CLARO)
  })

  it('fotoUrl explícita num layout sem foto segue para o compositor, que a recusa: 422 e nada gravado', async () => {
    espias.compor.mockImplementation(async (spec: any) => {
      if (spec.foto) throw new CreativeError('ARQUETIPO_FOTO_NAO_SUPORTADA', 'sem foto', 422)
      return composicaoDe(spec)
    })
    const r = await post({ arquetipo: { id: ID_SEM_FOTO, versao: 1 }, aPartirDaPagina: 'origem', fotoUrl: 'https://blob.test/outra.jpg' })
    expect([r.status, r.body.code ?? r.body.error]).toEqual([422, 'ARQUETIPO_FOTO_NAO_SUPORTADA'])
    expect(espias.compor.mock.calls[0][0].foto).toEqual({ url: 'https://blob.test/outra.jpg' })
    expect(banco.escritas).toBe(0)
  })

  it('a recusa de fundo do compositor (marca sem fundo claro) sai como 422, sem página', async () => {
    espias.compor.mockRejectedValue(new CreativeError('ARQUETIPO_FUNDO_INDISPONIVEL', 'sem fundo claro', 422))
    const r = await post({ arquetipo: { id: ID_SEM_FOTO, versao: 1 }, aPartirDaPagina: 'origem' })
    expect([r.status, r.body.code ?? r.body.error]).toEqual([422, 'ARQUETIPO_FUNDO_INDISPONIVEL'])
    expect(banco.escritas).toBe(0)
  })

  it('ramo A intacto: layout COM foto numa página sem foto segue 409; com foto, grava o fundo da origem', async () => {
    const semFoto = await post({ arquetipo: { id: 'minimal-fb-topo-esquerda', versao: 1 }, aPartirDaPagina: 'origem' })
    expect([semFoto.status, semFoto.body.error]).toEqual([409, 'LAYOUT_SEM_FOTO'])
    expect(espias.compor).not.toHaveBeenCalled()
    banco.paginas[0].layers = JSON.stringify([foto, texto('t1', 'headline', 'Nesta semana', 300), texto('t3', 'servico', 'Seg a sáb · 11h às 15h', 1600)])
    const comFoto = await post({ arquetipo: { id: 'minimal-fb-topo-esquerda', versao: 1 }, aPartirDaPagina: 'origem' })
    expect(comFoto.status).toBe(201)
    expect(espias.compor.mock.calls[0][0].foto).toEqual({ url: 'https://blob.test/origem.jpg' })
    expect(banco.paginas.find((p) => p.id === comFoto.body.pageId)!.background).toBe('#101010')
  })
})
