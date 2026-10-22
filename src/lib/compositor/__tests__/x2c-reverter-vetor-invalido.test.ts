/**
 * CP-X2c (R1) — `reverterCamadasDaArte` (serviço real) e a rota `generations/[id]/reverter-camadas` com snapshot que
 * tem forma vetorial inválida: 422 `VETOR_INVALIDO` ANTES da transação, sem restauração parcial, sem invalidar nem
 * pedir recomposição. A precedência dos erros de hoje continua na frente. Sem presumir o PR #225.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ arte: null as any, pagina: null as any, transacoes: 0, escritas: 0, acesso: true }))
const efeitos = vi.hoisted(() => ({ invalidados: 0, recomposicoes: 0 }))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/projects/access', () => ({ fetchProjectWithShares: async () => ({ id: 8 }), hasProjectWriteAccess: () => banco.acesso }))
vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    generation: { findUnique: async () => (banco.arte ? structuredClone(banco.arte) : null) },
    page: {
      findUnique: async () => (banco.pagina ? structuredClone(banco.pagina) : null),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.escritas++
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(banco.pagina.updatedAt.getTime() + 1) }
        return { count: 1 }
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) => {
      banco.transacoes++
      return fn(db)
    },
  }
  return { db }
})
vi.mock('@/lib/posts/invalidate-renders', () => ({
  invalidateScheduledRenders: async () => {
    efeitos.invalidados++
    return { invalidados: 1, congelados: [] }
  },
}))
vi.mock('../recompor', () => ({
  pedirRecomposicaoDaArteCongelada: vi.fn(async () => {
    efeitos.recomposicoes++
  }),
}))

import { reverterCamadasDaArte } from '../reverter'
import { POST as rotaReverter } from '@/app/api/generations/[id]/reverter-camadas/route'
import { CreativeError } from '@/lib/creatives/errors'

const ETIQUETA = 'M0 0 H55 L100 45 L55 100 L0 55 Z'
const vetor = (id: string, style: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id, type: 'shape', name: id, visible: true, locked: false, order: 1, position: { x: 10, y: 20 }, size: { width: 300, height: 200 },
  style: { shapeType: 'svg-path', pathData: ETIQUETA, fill: '#f97316', ...style }, ...extra,
})
const texto = (id: string, content: string) => ({ id, type: 'text', name: id, visible: true, locked: false, order: 2, position: { x: 0, y: 0 }, size: { width: 800, height: 80 }, content, style: { fontSize: 40 } })
const INVALIDO = [texto('t', 'Snapshot'), vetor('etq', { pathData: 'M0 0 Z L1 1' })]

async function recusa(promessa: Promise<unknown>) {
  try {
    await promessa
  } catch (e) {
    return e as CreativeError
  }
  throw new Error('esperava recusa')
}
function semEscritaNemEfeito() {
  expect(banco.transacoes).toBe(0)
  expect(banco.escritas).toBe(0)
  expect(efeitos.invalidados).toBe(0)
  expect(efeitos.recomposicoes).toBe(0)
}

beforeEach(() => {
  banco.arte = { id: 'gen-1', projectId: 8, fieldValues: { pageId: 'p1', layersSnapshot: INVALIDO } }
  banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify([texto('t', 'Editada')]), copyAutoral: null, background: '#fff', width: 1080, height: 1920, updatedAt: new Date(1_000) }
  banco.transacoes = 0
  banco.escritas = 0
  banco.acesso = true
  efeitos.invalidados = 0
  efeitos.recomposicoes = 0
})

describe('reverter R1 — snapshot com vetor inválido', () => {
  it('422 VETOR_INVALIDO antes da transação, com as camadas em details; a página fica como estava', async () => {
    const antes = structuredClone(banco.pagina)
    const e = await recusa(reverterCamadasDaArte('gen-1', { projectId: 8 }))
    expect(e).toBeInstanceOf(CreativeError)
    expect(e).toMatchObject({ code: 'VETOR_INVALIDO', status: 422 })
    expect(e.message).toMatch(/nada foi revertido/)
    expect((e.details as { camadas: Array<{ id: string }> }).camadas.map((c) => c.id)).toEqual(['etq'])
    expect(banco.pagina).toEqual(antes)
    semEscritaNemEfeito()
  })

  it('sem restauração parcial: camada vetorial que o schema descartaria (sem `size`) também recusa', async () => {
    const { size: _size, ...semTamanho } = vetor('solta', { fill: 'currentcolor' })
    banco.arte.fieldValues.layersSnapshot = [texto('t', 'Snapshot'), semTamanho]
    const e = await recusa(reverterCamadasDaArte('gen-1', { projectId: 8 }))
    expect(e).toMatchObject({ code: 'VETOR_INVALIDO', status: 422 })
    semEscritaNemEfeito()
  })

  it('snapshot em texto (JSON) é lido igual', async () => {
    banco.arte.fieldValues.layersSnapshot = JSON.stringify(INVALIDO)
    expect(await recusa(reverterCamadasDaArte('gen-1', { projectId: 8 }))).toMatchObject({ code: 'VETOR_INVALIDO' })
    semEscritaNemEfeito()
  })

  it('a precedência de hoje vem antes: 404, 403, SEM_PAGINA, SEM_SNAPSHOT, PAGE_NOT_FOUND, PAGINA_E_MODELO', async () => {
    const casos: Array<[() => void, string, number]> = [
      [() => (banco.arte = null), 'GENERATION_NOT_FOUND', 404],
      [() => (banco.arte.projectId = 99), 'PROJETO_SEM_ACESSO', 403],
      [() => delete banco.arte.fieldValues.pageId, 'SEM_PAGINA', 422],
      [() => (banco.arte.fieldValues.layersSnapshot = [{ id: 'x', type: 'shape', style: { shapeType: 'svg-path' } }]), 'SEM_SNAPSHOT', 422],
      [() => (banco.pagina = null), 'PAGE_NOT_FOUND', 404],
      [() => (banco.pagina.isTemplate = true), 'PAGINA_E_MODELO', 409],
    ]
    for (const [preparar, code, status] of casos) {
      banco.arte = { id: 'gen-1', projectId: 8, fieldValues: { pageId: 'p1', layersSnapshot: INVALIDO } }
      banco.pagina = { id: 'p1', isTemplate: false, layers: '[]', copyAutoral: null, background: '#fff', width: 1080, height: 1920, updatedAt: new Date(1_000) }
      preparar()
      expect(await recusa(reverterCamadasDaArte('gen-1', { projectId: 8 }))).toMatchObject({ code, status })
    }
    semEscritaNemEfeito()
  })

  it('snapshot válido com svg-path: reverte, invalida e pede a recomposição como hoje', async () => {
    banco.arte.fieldValues.layersSnapshot = [texto('t', 'Snapshot'), vetor('etq')]
    const r = await reverterCamadasDaArte('gen-1', { projectId: 8 })
    expect(r).toMatchObject({ pageId: 'p1', camadas: 2, invalidados: 1 })
    expect(JSON.parse(banco.pagina.layers).map((c: { id: string }) => c.id)).toEqual(['t', 'etq'])
    expect(efeitos.invalidados).toBe(1)
    expect(efeitos.recomposicoes).toBe(1)
  })
})

describe('rota reverter-camadas', () => {
  const chamar = () => rotaReverter({} as Request, { params: Promise.resolve({ id: 'gen-1' }) }) as unknown as Promise<{ status: number; body: Record<string, unknown> }>
  it('422 com o corpo das portas { error, codigo, camadas } (e `code` como alias), sem escrita', async () => {
    const r = await chamar()
    expect(r.status).toBe(422)
    expect(r.body).toMatchObject({ codigo: 'VETOR_INVALIDO', code: 'VETOR_INVALIDO' })
    expect(r.body.error).toMatch(/nada foi revertido/)
    expect((r.body.camadas as Array<{ id: string; motivos: Array<{ codigo: string }> }>)[0]).toMatchObject({ id: 'etq' })
    expect((r.body.camadas as Array<{ motivos: Array<{ codigo: string }> }>)[0].motivos[0].codigo).toMatch(/^PATH_INVALIDO:/)
    semEscritaNemEfeito()
  })

  it('os outros CreativeError respondem como antes (sem `codigo`/`camadas`): SEM_PAGINA, PAGINA_E_MODELO, 404 da arte', async () => {
    delete banco.arte.fieldValues.pageId
    expect(await chamar()).toEqual({ status: 422, body: { error: 'Esta arte não tem página editável para reverter', code: 'SEM_PAGINA' } })
    banco.arte = { id: 'gen-1', projectId: 8, fieldValues: { pageId: 'p1', layersSnapshot: INVALIDO } }
    banco.pagina.isTemplate = true
    expect(await chamar()).toEqual({ status: 409, body: { error: 'A página virou modelo do cliente; reverter apagaria a curadoria', code: 'PAGINA_E_MODELO' } })
    banco.arte = null
    expect(await chamar()).toEqual({ status: 404, body: { error: 'Arte não encontrada' } })
    semEscritaNemEfeito()
  })
  it('sem acesso segue 403 antes', async () => {
    banco.acesso = false
    expect((await chamar()).status).toBe(403)
    semEscritaNemEfeito()
  })
})
