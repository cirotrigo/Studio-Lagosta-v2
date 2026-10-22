/**
 * CP-X2c (P6) — `ornamentos[].camada` com `svg-path` inválido nas rotas REAIS de combinações (POST e PUT): 422
 * `VETOR_INVALIDO`, separado do 400 do zod, depois de auth/acesso/zod e antes de qualquer escrita.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ logado: true, projeto: true, escrita: true, escritas: 0, combinacaoDoProjeto: 8 }))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => (estado.logado ? { userId: 'user_equipe', orgId: null } : { userId: null }) }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async () => (estado.projeto ? { id: 8 } : null),
  hasProjectReadAccess: () => true,
  hasProjectWriteAccess: () => estado.escrita,
}))
vi.mock('@/lib/db', () => {
  const escrever = (r: unknown) => {
    estado.escritas++
    return r
  }
  return {
    db: {
      fontCombination: {
        findFirst: async () => ({ order: 3 }),
        findUnique: async () => ({ id: 'fc1', projectId: estado.combinacaoDoProjeto }),
        create: async ({ data }: { data: unknown }) => escrever({ id: 'nova', ...(data as object) }),
        update: async ({ data }: { data: unknown }) => escrever({ id: 'fc1', ...(data as object) }),
      },
    },
  }
})

import { POST } from '../route'
import { PUT } from '../[combinationId]/route'
import { FONT_COMBO_LAYOUTS } from '@/lib/font-combinations'
import { exigirOrnamentosValidos } from '@/lib/vetor/guarda-dos-ornamentos'

type Resposta = { status: number; body: Record<string, any> }
const req = (body: unknown) => ({ json: async () => structuredClone(body) }) as never
const post = (body: unknown) => POST(req(body), { params: Promise.resolve({ projectId: '8' }) }) as unknown as Promise<Resposta>
const put = (body: unknown) => PUT(req(body), { params: Promise.resolve({ projectId: '8', combinationId: 'fc1' }) }) as unknown as Promise<Resposta>

const ETIQUETA = 'M0 0 H55 L100 45 L55 100 L0 55 Z'
/** O formato REAL do ornamento: `camada` é o objeto Layer cru do editor. */
const ornamento = (camada: Record<string, unknown>) => ({ camada, width: 40, height: 40, lado: 'antes', offsetX: 0, offsetY: 0 })
const forma = (style: Record<string, unknown>, id = 'filete') => ({ id, type: 'shape', name: id, position: { x: 0, y: 0 }, size: { width: 40, height: 40 }, style: { shapeType: 'svg-path', pathData: ETIQUETA, fill: '#ffffff', ...style } })
const elemento = (ornamentos: unknown[], id = 'e1') => ({ id, label: 'Título', role: 'title', text: 'Sexta', fontSize: 80, fontWeight: '700', lineHeight: 1.1, x: 0.1, y: 0.1, width: 0.8, ornamentos })
const combinacao = (elements: unknown[]) => ({ name: 'Rodapé', elements })

beforeEach(() => {
  Object.assign(estado, { logado: true, projeto: true, escrita: true, escritas: 0, combinacaoDoProjeto: 8 })
})

describe.each([
  ['POST', post],
  ['PUT', put],
] as const)('P6 %s', (_nome, chamar) => {
  it('ornamento com svg-path inválido → 422 VETOR_INVALIDO com o elemento e o índice do ornamento; zero escrita', async () => {
    const r = await chamar(combinacao([elemento([ornamento(forma({})), ornamento(forma({ pathData: 'x' }, 'ruim'))])]))
    expect(r.status).toBe(422)
    expect(r.body.codigo).toBe('VETOR_INVALIDO')
    expect(r.body.camadas).toEqual([expect.objectContaining({ id: 'ruim', elemento: 'e1', ornamento: 1 })])
    expect(r.body.camadas[0].motivos[0].codigo).toMatch(/^PATH_INVALIDO:/)
    expect(estado.escritas).toBe(0)
  })

  it('camada sem id e cor de contexto: id composto pelo elemento e o índice', async () => {
    const { id: _id, ...semId } = forma({ fill: 'currentcolor' })
    const r = await chamar(combinacao([elemento([ornamento(semId)])]))
    expect(r.status).toBe(422)
    expect(r.body.camadas[0]).toMatchObject({ id: 'elemento e1, ornamento 0', ornamento: 0 })
    expect(estado.escritas).toBe(0)
  })

  it('precedência: sem login 401, projeto inexistente 404, sem acesso 403, zod 400 — mesmo com vetor inválido', async () => {
    const invalido = combinacao([elemento([ornamento(forma({ pathData: '' }))])])
    estado.logado = false
    expect((await chamar(invalido)).status).toBe(401)
    estado.logado = true
    estado.projeto = false
    expect((await chamar(invalido)).status).toBe(404)
    estado.projeto = true
    estado.escrita = false
    expect((await chamar(invalido)).status).toBe(403)
    estado.escrita = true
    expect((await chamar({ ...invalido, name: '' })).status).toBe(400)
    expect(estado.escritas).toBe(0)
  })

  it('`shapeType` na RAIZ da camada não é candidato: segue o comportamento de hoje', async () => {
    const r = await chamar(combinacao([elemento([ornamento({ id: 'f', type: 'shape', shapeType: 'svg-path', pathData: 'x' })])]))
    expect(r.status).toBe(_nome === 'POST' ? 201 : 200)
    expect(estado.escritas).toBe(1)
  })

  it('vetor válido e ornamento por imagem: grava como hoje', async () => {
    const r = await chamar(combinacao([elemento([ornamento(forma({})), { url: 'https://cdn.teste/a.png', width: 10, height: 10, lado: 'depois', offsetX: 0, offsetY: 0 }])]))
    expect(r.status).toBe(_nome === 'POST' ? 201 : 200)
    expect(estado.escritas).toBe(1)
  })
})

it('P6 PUT de combinação de OUTRO projeto segue 404 antes da guarda', async () => {
  estado.combinacaoDoProjeto = 99
  const r = await put(combinacao([elemento([ornamento(forma({ pathData: '' }))])]))
  expect(r.status).toBe(404)
  expect(estado.escritas).toBe(0)
})

it('P6 PUT sem `elements` (só nome/ordem) não passa pela guarda e grava', async () => {
  const r = await put({ name: 'Novo nome' })
  expect(r.status).toBe(200)
})

it('o catálogo base (FONT_COMBO_LAYOUTS, semeado pelo GET e pela arte-livre) não tem ornamento vetorial inválido', () => {
  expect(() => exigirOrnamentosValidos(FONT_COMBO_LAYOUTS.flatMap((l) => l.elements))).not.toThrow()
})
