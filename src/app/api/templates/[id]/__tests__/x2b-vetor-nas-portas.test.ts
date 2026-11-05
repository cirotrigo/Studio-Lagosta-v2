/**
 * CP-X2b — a guarda vetorial nas portas P1–P5 (preflight X2 v2.1 §4.4 e §6), pelos handlers REAIS.
 *
 * Banco em memória com `$transaction` de rollback por DIÁRIO (o mesmo desenho do teste do CP-X0): a transação anota
 * o valor anterior de cada chave que ela própria escreve e, quando o callback lança, desfaz só isso. Commits
 * externos (`antesDoUpdate`) sobrevivem, como num banco de verdade. Auth, acesso, Blob, invalidação e `after()` são
 * espiões. Três tipos de asserção, sem misturar: (Z) zero escrita, (R) nada confirmado depois de a transação
 * começar, (E) nenhum efeito externo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  template: {} as Record<string, unknown>,
  paginas: {} as Record<string, any>,
  templatesCriados: [] as unknown[],
  relogio: 1_000,
  antesDoUpdate: {} as Record<number, () => void>,
  updates: 0,
  /** Escritas feitas (dentro ou fora de transação), antes de qualquer rollback. */
  escritas: 0,
  diario: null as null | Map<string, unknown>,
  falharNoUpdateMany: false,
  falharNoTemplateUpdate: false,
}))
const acesso = vi.hoisted(() => ({ template: true, projeto: true, chamadasDoProjeto: 0 }))
const efeitos = vi.hoisted(() => ({ blob: [] as string[], invalidados: [] as string[][], after: 0 }))
const guarda = vi.hoisted(() => ({ chamadas: [] as unknown[] }))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: () => {
    efeitos.after++
  },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/templates/access', () => ({
  fetchTemplateWithProject: async () => ({ id: 77, Project: { id: 8 } }),
  hasTemplateReadAccess: () => acesso.template,
  hasTemplateWriteAccess: () => acesso.template,
}))
vi.mock('@/lib/projects/access', () => ({
  hasProjectReadAccess: () => acesso.projeto,
  hasProjectWriteAccess: () => {
    acesso.chamadasDoProjeto++
    return acesso.projeto
  },
  withProjectOwner: async (p: unknown) => p,
}))
vi.mock('@/lib/templates/miniatura', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/templates/miniatura')>()),
  guardarMiniatura: vi.fn(async (u: string, id: number) => {
    efeitos.blob.push(u)
    return u.startsWith('data:') ? `https://blob.teste/templates/thumbnails/${id}.jpg` : u
  }),
}))
vi.mock('@/lib/posts/invalidate-renders', async () => ({
  invalidateScheduledRenders: vi.fn(async (_tx: unknown, args: { pageIds: string[] }) => {
    efeitos.invalidados.push([...args.pageIds])
    return { invalidados: args.pageIds.length, congelados: [] as string[] }
  }),
  normalizeLayersString: (await import('@/lib/posts/page-layers')).normalizeLayersString,
}))
vi.mock('@/lib/compositor/recompor', () => ({ pedirRecomposicaoDaArteCongelada: vi.fn(async () => []) }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ caiNaEscolhaPropria: () => false, fecharDicaDeCopyDaPagina: vi.fn(async () => null) }))
/** Passa adiante para a guarda real e anota o que ela conferiu (o estado de cada volta). */
vi.mock('@/lib/vetor/guarda-de-porta', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/vetor/guarda-de-porta')>()
  return {
    ...real,
    exigirVetoresValidos: (camadas: unknown, onde?: { paginaId?: string }) => {
      guarda.chamadas.push(structuredClone(camadas))
      return real.exigirVetoresValidos(camadas, onde)
    },
  }
})
vi.mock('@/lib/db', () => {
  const anotar = (chave: string, atual: unknown) => {
    banco.escritas++
    if (banco.diario && !banco.diario.has(chave)) banco.diario.set(chave, structuredClone(atual))
  }
  const db: Record<string, any> = {
    template: {
      findFirst: async () => ({ ...structuredClone(banco.template), Project: { id: 8, organizationProjects: [] } }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (banco.falharNoTemplateUpdate) throw new Error('falha interna qualquer')
        anotar('template', banco.template)
        banco.template = { ...banco.template, ...data }
        return { ...banco.template }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        anotar('criados', banco.templatesCriados)
        const t = { id: 900 + banco.templatesCriados.length, ...data }
        banco.templatesCriados = [...banco.templatesCriados, t]
        return t
      },
    },
    project: { findFirst: async () => ({ id: 8, organizationProjects: [] }) },
    page: {
      findFirst: async ({ where }: { where: { id: string } }) => (banco.paginas[where.id] ? structuredClone(banco.paginas[where.id]) : null),
      findUnique: async ({ where }: { where: { id: string } }) => (banco.paginas[where.id] ? structuredClone(banco.paginas[where.id]) : null),
      findMany: async ({ where }: { where: Record<string, any> }) =>
        where.templateId === 77 ? Object.values(banco.paginas).map((p) => structuredClone(p)).sort((a, b) => a.order - b.order) : [],
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
        if (banco.falharNoUpdateMany) throw new Error('falha interna qualquer')
        const n = ++banco.updates
        const fn = banco.antesDoUpdate[n]
        delete banco.antesDoUpdate[n]
        fn?.()
        const p = banco.paginas[where.id]
        if (!p || (where.updatedAt && where.updatedAt.getTime() !== p.updatedAt.getTime())) return { count: 0 }
        anotar(`pagina:${where.id}`, p)
        banco.paginas[where.id] = { ...p, ...data, updatedAt: new Date(++banco.relogio) }
        return { count: 1 }
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        anotar(`pagina:${where.id}`, banco.paginas[where.id])
        banco.paginas[where.id] = { ...banco.paginas[where.id], ...data, updatedAt: new Date(++banco.relogio) }
        return structuredClone(banco.paginas[where.id])
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const id = data.id ?? `nova-${Object.keys(banco.paginas).length}`
        anotar(`pagina:${id}`, banco.paginas[id])
        banco.paginas[id] = { ...data, id, updatedAt: new Date(++banco.relogio), copyAutoral: null }
        return { ...data, id }
      },
    },
    socialPost: { findMany: async () => [] },
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) => {
      banco.diario = new Map()
      try {
        return await fn(db)
      } catch (e) {
        for (const [chave, anterior] of banco.diario) {
          if (chave === 'template') banco.template = anterior as Record<string, unknown>
          else if (chave === 'criados') banco.templatesCriados = anterior as unknown[]
          else {
            const id = chave.slice('pagina:'.length)
            if (anterior === undefined) delete banco.paginas[id]
            else banco.paginas[id] = anterior
          }
        }
        throw e
      } finally {
        banco.diario = null
      }
    },
  }
  return { db }
})

import { PATCH as patchDaPagina } from '../pages/[pageId]/route'
import { POST as postDePagina } from '../pages/route'
import { PUT as putDoTemplate } from '../route'
import { POST as postDeTemplate } from '../../route'
import { PATCH as patchDaCamada } from '@/app/api/pages/[pageId]/layers/[layerId]/route'
import { canonicalizeLayersForPersistence, canonicalizeShapeLayerForPersistence } from '@/lib/shape-style'
import { normalizeForLocal, normalizeForWeb } from '../../../../../../desktop-app/electron/services/sync/template-normalizer'

type Camada = Record<string, any>
type Resposta = { status: number; body: Record<string, any> }
const ETIQUETA = 'M0 0 H55 L100 45 L55 100 L0 55 Z M22 22 A8 8 0 1 0 22 38 A8 8 0 1 0 22 22 Z'
const vetor = (id = 'etq', style: Record<string, unknown> = {}): Camada => ({
  id, type: 'shape', name: 'Etiqueta', visible: true, locked: false, order: 1, position: { x: 10, y: 20 }, size: { width: 300, height: 200 },
  style: { shapeType: 'svg-path', pathData: ETIQUETA, pathViewBox: [0, 0, 100, 100], pathFillRule: 'evenodd', fill: '#f97316', ...style },
})
const texto = (id: string, content = 'Sexta é dia'): Camada => ({
  id, type: 'text', name: id, visible: true, locked: false, order: 2, position: { x: 100, y: 300 }, size: { width: 800, height: 80 }, content, style: { fontSize: 40 },
})
const pagina = (id: string, order: number, name: string, camadas: Camada[]) => ({
  id, templateId: 77, name, order, isTemplate: false, tags: [], width: 1080, height: 1920, background: '#ffffff', audio: null, thumbnail: null,
  layers: JSON.stringify(camadas), copyAutoral: null, updatedAt: new Date(banco.relogio),
})
const req = (body: unknown) => ({ json: async () => structuredClone(body) }) as unknown as Request
const camadasDe = (id: string): Camada[] => JSON.parse(banco.paginas[id].layers)
const fotografia = () => structuredClone({ template: banco.template, paginas: banco.paginas, criados: banco.templatesCriados })

const p1 = (body: unknown) => patchDaPagina(req(body), { params: Promise.resolve({ id: '77', pageId: 'p1' }) }) as unknown as Promise<Resposta>
const p2 = (body: unknown, layerId = 'etq') => patchDaCamada(req(body), { params: Promise.resolve({ pageId: 'p1', layerId }) }) as unknown as Promise<Resposta>
const p3 = (body: unknown) => postDePagina(req(body), { params: Promise.resolve({ id: '77' }) }) as unknown as Promise<Resposta>
const p4 = (body: unknown) => putDoTemplate(req(body), { params: Promise.resolve({ id: '77' }) }) as unknown as Promise<Resposta>
const p5 = (body: unknown) => postDeTemplate(req(body)) as unknown as Promise<Resposta>
const doPayload = (id: string | undefined, order: number, name: string, layers: Camada[]) => ({ ...(id ? { id } : {}), name, width: 1080, height: 1920, layers, background: '#ffffff', order })
const pushDoDesktop = (pages: unknown[], extra: Record<string, unknown> = {}) =>
  p4({ name: 'Programação', designData: { canvas: { width: 1080, height: 1920 }, pages }, localId: 'local-1', ...extra })
const DATA_URL = 'data:image/jpeg;base64,/9j/AAAA'

/** (E): nenhum efeito externo. */
function semEfeitoExterno() {
  expect(efeitos.blob).toEqual([])
  expect(efeitos.invalidados).toEqual([])
  expect(efeitos.after).toBe(0)
}
function recusaVetorial(r: Resposta, ids: string[]) {
  expect(r.status).toBe(422)
  expect(r.body.codigo).toBe('VETOR_INVALIDO')
  expect(r.body.camadas.map((c: { id: string }) => c.id)).toEqual(ids)
}

beforeEach(() => {
  banco.template = { id: 77, name: 'Programação', designData: { canvas: { width: 1080, height: 1920 } } }
  banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t'), vetor()]) }
  banco.templatesCriados = []
  banco.relogio = 1_000
  banco.antesDoUpdate = {}
  banco.updates = 0
  banco.escritas = 0
  banco.diario = null
  banco.falharNoUpdateMany = false
  banco.falharNoTemplateUpdate = false
  acesso.template = true
  acesso.projeto = true
  acesso.chamadasDoProjeto = 0
  efeitos.blob = []
  efeitos.invalidados = []
  efeitos.after = 0
  guarda.chamadas = []
})

const COR_DE_TIPO_ERRADO: Array<[string, Record<string, unknown>, string]> = [
  ['fill: 123', { fill: 123 }, 'COR_INVALIDA:fill'],
  ['strokeColor: {}', { strokeColor: {} }, 'COR_INVALIDA:strokeColor'],
  ['border.color: 5', { border: { width: 2, color: 5 } }, 'COR_INVALIDA:border.color'],
]

describe('P1 — PATCH da página (autosave)', () => {
  it('precedência: sem acesso → 404; página inexistente → 404; zod inválido → 400 — mesmo com vetor inválido', async () => {
    const invalido = [vetor('etq', { pathData: '' })]
    acesso.template = false
    expect((await p1({ layers: invalido })).status).toBe(404)
    acesso.template = true
    expect((await patchDaPagina(req({ layers: invalido }), { params: Promise.resolve({ id: '77', pageId: 'nao-existe' }) }) as unknown as Resposta).status).toBe(404)
    expect((await p1({ layers: invalido, width: -1 })).status).toBe(400)
    expect(banco.escritas).toBe(0)
  })

  it.each(COR_DE_TIPO_ERRADO)('tipo errado antes da canonização (%s) → 422, não 500; zero escrita (Z+E)', async (_n, style, codigo) => {
    const antes = fotografia()
    const r = await p1({ layers: [texto('t'), vetor('etq', style)] })
    recusaVetorial(r, ['etq'])
    expect(r.body.camadas[0].motivos.map((m: { codigo: string }) => m.codigo)).toEqual([codigo])
    expect(banco.escritas).toBe(0)
    expect(fotografia()).toEqual(antes)
    semEfeitoExterno()
  })

  it('cor de contexto (currentcolor) e path inválido → 422 com os códigos; nada gravado', async () => {
    const r = await p1({ layers: [vetor('a', { fill: 'currentcolor' }), vetor('b', { pathData: 'M0 0 Z L1 1' })] })
    recusaVetorial(r, ['a', 'b'])
    expect(r.body.error).toMatch(/nada foi gravado/)
    expect(banco.escritas).toBe(0)
    semEfeitoExterno()
  })

  it('CAS com a base mudando entre as voltas: a guarda roda sobre o estado FINAL de cada volta, e grava a canonização de hoje', async () => {
    const payload = [texto('t', 'Novo'), vetor('etq', { fill: 'rgba(249, 115, 22, 0.5)', flipH: true, vetor: { partes: [{ d: 'M0 0 H10 V10 Z', slot: 'a', alvo: 'fill' }], cores: { a: '#000000' } } })]
    banco.antesDoUpdate[1] = () => {
      banco.paginas.p1 = { ...banco.paginas.p1, layers: JSON.stringify([texto('t', 'Outra aba'), vetor()]), updatedAt: new Date(++banco.relogio) }
    }
    const r = await p1({ layers: payload })
    expect(r.status).toBe(200)
    expect(banco.updates).toBe(2)
    // (a) cru + (b) antes da transação + (b) nas DUAS voltas
    expect(guarda.chamadas).toHaveLength(4)
    expect(guarda.chamadas[0]).toEqual(payload)
    const esperado = canonicalizeLayersForPersistence(payload)
    expect(guarda.chamadas[3]).toEqual(esperado)
    expect(banco.paginas.p1.layers).toBe(JSON.stringify(esperado))
  })

  it('página sem svg-path: mesma resposta e efeitos de hoje (regressão)', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]) }
    const r = await p1({ layers: [texto('t', 'Novo')] })
    expect(r.status).toBe(200)
    expect(camadasDe('p1')[0].content).toBe('Novo')
    expect(efeitos.invalidados).toEqual([['p1']])
  })

  it('erro interno arbitrário continua 500, não 422', async () => {
    banco.falharNoUpdateMany = true
    const r = await p1({ layers: [texto('t', 'Novo'), vetor()] })
    expect(r.status).toBe(500)
  })
})

describe('P2 — PATCH da camada', () => {
  it('precedência: página inexistente → 404; sem acesso → 403 — mesmo com vetor inválido', async () => {
    acesso.template = false
    expect((await p2({ style: { shapeType: 'svg-path' } })).status).toBe(403)
    acesso.template = true
    expect((await patchDaCamada(req({ style: { shapeType: 'svg-path' } }), { params: Promise.resolve({ pageId: 'nada', layerId: 'etq' }) }) as unknown as Resposta).status).toBe(404)
    expect(banco.escritas).toBe(0)
  })

  it.each(COR_DE_TIPO_ERRADO)('tipo errado antes da canonização (%s) → 422, não 500; nada confirmado (R+E)', async (_n, style, codigo) => {
    const antes = fotografia()
    const r = await p2({ style: { ...vetor().style, ...style } })
    recusaVetorial(r, ['etq'])
    expect(r.body.camadas[0].motivos.map((m: { codigo: string }) => m.codigo)).toEqual([codigo])
    expect(fotografia()).toEqual(antes)
    semEfeitoExterno()
  })

  it('updates.style que apaga o pathData de um svg-path → 422 PATH_AUSENTE (R+E)', async () => {
    const antes = fotografia()
    const r = await p2({ style: { shapeType: 'svg-path', fill: '#000000' } })
    recusaVetorial(r, ['etq'])
    expect(r.body.camadas[0].motivos[0].codigo).toBe('PATH_AUSENTE')
    expect(fotografia()).toEqual(antes)
    semEfeitoExterno()
  })

  it('a base muda entre as voltas: a 2ª volta valida o estado FINAL dela (camada inválida gravada por fora) → 422; o commit externo sobrevive', async () => {
    banco.antesDoUpdate[1] = () => {
      banco.paginas.p1 = { ...banco.paginas.p1, layers: JSON.stringify([texto('t'), vetor(), vetor('script', { pathData: 'banana' })]), updatedAt: new Date(++banco.relogio) }
    }
    const r = await p2({ name: 'Etiqueta nova' })
    recusaVetorial(r, ['script'])
    expect(banco.updates).toBe(1)
    expect(camadasDe('p1').map((c) => c.id)).toEqual(['t', 'etq', 'script'])
    expect(camadasDe('p1')[1].name).toBe('Etiqueta')
    semEfeitoExterno()
  })

  it('svg-path válido: grava o resultado do `fundir` de hoje', async () => {
    const updates = { style: { ...vetor().style, fill: 'rgba(0, 0, 0, 0.5)', opacity: 0.5, flipV: true } }
    const r = await p2(updates)
    expect(r.status).toBe(200)
    expect(camadasDe('p1')[1]).toEqual(canonicalizeShapeLayerForPersistence({ ...vetor(), ...updates } as Parameters<typeof canonicalizeShapeLayerForPersistence>[0]))
  })
})

describe('P3 — POST de página', () => {
  const corpo = (layers: unknown[]) => ({ name: 'Nova', width: 1080, height: 1920, layers })
  it('precedência: sem acesso → 403; zod inválido → 400; vetor inválido → 422 sem create (Z+E)', async () => {
    const invalido = [vetor('x', { pathViewBox: null })]
    acesso.projeto = false
    expect((await p3(corpo(invalido))).status).toBe(403)
    acesso.projeto = true
    expect((await p3({ ...corpo(invalido), name: '' })).status).toBe(400)
    const r = await p3(corpo(invalido))
    recusaVetorial(r, ['x'])
    expect(r.body.camadas[0].motivos[0].codigo).toBe('VIEWBOX_INVALIDO')
    expect(banco.escritas).toBe(0)
    semEfeitoExterno()
  })
  it('vetor válido → 201', async () => {
    expect((await p3(corpo([vetor('x')]))).status).toBe(201)
  })
})

describe('P4 — PUT do template, ramo web e raiz do designData', () => {
  const salvarDoWeb = (layers: unknown[], extra: Record<string, unknown> = {}) =>
    p4({ name: 'Nome novo', designData: { canvas: { width: 1080, height: 1920 }, layers }, thumbnailUrl: DATA_URL, ...extra })

  it('precedência: sem acesso → 403; zod inválido → 400 — mesmo com vetor inválido; nada chega ao Blob', async () => {
    const invalido = [vetor('etq', { pathFillRule: 'oddeven' })]
    acesso.projeto = false
    expect((await salvarDoWeb(invalido)).status).toBe(403)
    acesso.projeto = true
    expect((await salvarDoWeb(invalido, { name: '' })).status).toBe(400)
    expect(efeitos.blob).toEqual([])
  })

  it('raiz inválida → 422 ANTES da miniatura e de qualquer escrita (Z+E)', async () => {
    const antes = fotografia()
    const r = await salvarDoWeb([vetor('etq', { pathFillRule: 'oddeven' })])
    recusaVetorial(r, ['etq'])
    expect(banco.escritas).toBe(0)
    expect(fotografia()).toEqual(antes)
    semEfeitoExterno()
  })

  it('raiz inválida JUNTO com pages (o schema aceita os dois) → 422 antes de tudo; as páginas nem são lidas (Z+E)', async () => {
    const antes = fotografia()
    const r = await p4({
      name: 'Nome novo',
      thumbnailUrl: DATA_URL,
      designData: { canvas: { width: 1080, height: 1920 }, layers: [vetor('raiz', { fill: 'inherit' })], pages: [doPayload('p1', 0, 'Sexta', [texto('t', 'Novo'), vetor()])] },
    })
    recusaVetorial(r, ['raiz'])
    expect(banco.escritas).toBe(0)
    expect(fotografia()).toEqual(antes)
    semEfeitoExterno()
  })

  it('raiz válida: segue gravando e a miniatura sobe, como hoje', async () => {
    const r = await salvarDoWeb([vetor('etq')])
    expect(r.status).toBe(200)
    expect(efeitos.blob).toEqual([DATA_URL])
  })

  it('erro interno arbitrário continua 400 "Dados inválidos", não 422', async () => {
    banco.falharNoTemplateUpdate = true
    const r = await salvarDoWeb([vetor('etq')])
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('Dados inválidos')
  })
})

describe("P4' — PUT do template, push do desktop (estado final depois da mescla do X0)", () => {
  beforeEach(() => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]), p2: pagina('p2', 1, 'Sábado', [texto('s'), vetor()]) }
  })

  it('2ª página com camada NOVA crua inválida → 422 com paginaId; rollback do template e da 1ª página (R+E)', async () => {
    const antes = fotografia()
    const r = await pushDoDesktop(
      [doPayload('p1', 0, 'Sexta', [texto('t', 'Gravaria')]), doPayload('p2', 1, 'Sábado', [texto('s'), vetor(), { ...vetor('nova'), style: { shapeType: 'svg-path', fill: '#fff' } }])],
      { name: 'Nome novo', thumbnailUrl: DATA_URL },
    )
    recusaVetorial(r, ['nova'])
    expect(r.body.camadas[0]).toMatchObject({ paginaId: 'p2' })
    expect(banco.escritas).toBeGreaterThan(0) // a transação começou e escreveu…
    expect(fotografia()).toEqual(antes) // …e nada foi confirmado
    semEfeitoExterno()
  })

  it('cor inválida no payload de uma camada protegida → 422 (o X0 mescla, o estado final é inválido); rollback', async () => {
    const antes = fotografia()
    const r = await pushDoDesktop([doPayload('p2', 1, 'Sábado', [texto('s'), { ...vetor(), style: { shapeType: 'svg-path', fill: 'currentcolor' } }])])
    recusaVetorial(r, ['etq'])
    expect(fotografia()).toEqual(antes)
    semEfeitoExterno()
  })

  it('página NOVA (sem par) com vetor inválido → 422 antes do create; rollback do que veio antes (R+E)', async () => {
    const antes = fotografia()
    const r = await pushDoDesktop([doPayload('p1', 0, 'Sexta', [texto('t', 'Gravaria')]), doPayload('p9', 5, 'Domingo', [vetor('n', { pathData: null })])], { name: 'Nome novo' })
    recusaVetorial(r, ['n'])
    expect(r.body.camadas[0]).toMatchObject({ paginaId: 'p9' })
    expect(banco.paginas.p9).toBeUndefined()
    expect(fotografia()).toEqual(antes)
    semEfeitoExterno()
  })

  it('round-trip do normalizador REAL do desktop (svg-path sem pathData no push) → 200, o path da base preservado', async () => {
    const local = normalizeForLocal(
      { id: 77, name: 'Programação', type: 'STORY', updatedAt: '2026-10-21T12:00:00.000Z', designData: { canvas: { width: 1080, height: 1920 }, pages: [doPayload('p2', 1, 'Sábado', camadasDe('p2'))] } },
      8,
    )
    ;(local.data.design.pages[0].layers.find((l) => l.id === 'etq') as Record<string, unknown>).fill = '#00ff00'
    const push = normalizeForWeb(local.data).data as unknown as Record<string, any>
    const doDesktop = push.designData.pages[0].layers.find((l: Camada) => l.id === 'etq')
    expect(doDesktop.style.shapeType).toBe('svg-path')
    expect(doDesktop.style.pathData).toBeUndefined() // o formato real: o desktop não manda o path
    expect(push.designData.layers).toBeUndefined() // nem camadas na raiz
    const r = await p4(push)
    expect(r.status).toBe(200)
    expect(camadasDe('p2').find((c) => c.id === 'etq')!.style).toMatchObject({ shapeType: 'svg-path', pathData: ETIQUETA, fill: '#00ff00' })
  })

  it('`null` no payload (shapeType/pathData/pathViewBox/pathFillRule) → 200, identidade restaurada da base e estado final válido', async () => {
    const r = await pushDoDesktop([doPayload('p2', 1, 'Sábado', [texto('s'), { ...vetor(), style: { shapeType: null, pathData: null, pathViewBox: null, pathFillRule: null, fill: '#00ff00' } }])])
    expect(r.status).toBe(200)
    expect(camadasDe('p2')[1].style).toMatchObject({ shapeType: 'svg-path', pathData: ETIQUETA, pathViewBox: [0, 0, 100, 100], pathFillRule: 'evenodd', fill: '#00ff00' })
  })

  it('as recusas do X0 seguem 409, sem virar 422 (troca de forma, camada protegida ausente, página incerta)', async () => {
    const altera = await pushDoDesktop([doPayload('p2', 1, 'Sábado', [texto('s'), { ...vetor(), style: { shapeType: 'rectangle', fill: 'currentcolor' } }])])
    expect(altera.status).toBe(409)
    expect(altera.body.codigo).toBe('PUSH_ALTERA_VETOR')
    const apaga = await pushDoDesktop([doPayload('p2', 1, 'Sábado', [texto('s')])])
    expect(apaga.status).toBe(409)
    expect(apaga.body.codigo).toBe('PUSH_APAGARIA_CAMADA')
    const incerta = await pushDoDesktop([doPayload(undefined, 1, 'Sábado', [texto('s'), vetor()])])
    expect(incerta.status).toBe(409)
    expect(incerta.body.codigo).toBe('PUSH_PAGINA_INCERTA')
    semEfeitoExterno()
  })

  it('base com path inválido não é salva pela mescla → 422 (não é grandfather)', async () => {
    banco.paginas.p2 = pagina('p2', 1, 'Sábado', [texto('s'), vetor('etq', { pathData: 'M0 0 Z L1 1' })])
    const antes = fotografia()
    const r = await pushDoDesktop([doPayload('p2', 1, 'Sábado', [texto('s', 'Novo'), { id: 'etq', type: 'shape', style: { shapeType: 'svg-path', fill: '#00ff00' } }])])
    recusaVetorial(r, ['etq'])
    expect(fotografia()).toEqual(antes)
  })
})

describe('P5 — POST de template', () => {
  const corpo = (designData: unknown, extra: Record<string, unknown> = {}) => ({ name: 'Novo', type: 'STORY', dimensions: '1080x1920', designData, projectId: 8, thumbnailUrl: DATA_URL, ...extra })
  const comPaginas = (pages: unknown[]) => ({ canvas: { width: 1080, height: 1920 }, pages })

  it('precedência: corpo incompleto → 400 ANTES do acesso (quirk preservado); sem acesso → 403', async () => {
    const invalido = comPaginas([{ id: 'a', layers: [vetor('x', { pathData: '' })] }])
    expect((await p5({ ...corpo(invalido), name: undefined })).status).toBe(400)
    expect(acesso.chamadasDoProjeto).toBe(0)
    acesso.projeto = false
    expect((await p5(corpo(invalido))).status).toBe(403)
    expect(banco.escritas).toBe(0)
  })

  it('uma página inválida → 422 sem template nem páginas (Z+E)', async () => {
    const r = await p5(corpo(comPaginas([{ id: 'a', layers: [vetor('ok')] }, { id: 'b', layers: JSON.stringify([vetor('x', { pathData: '' })]) }])))
    recusaVetorial(r, ['x'])
    expect(r.body.camadas[0]).toMatchObject({ paginaId: 'b' })
    expect(banco.escritas).toBe(0)
    expect(banco.templatesCriados).toEqual([])
    semEfeitoExterno()
  })

  it('raiz inválida (designData em texto) → 422 sem escrita', async () => {
    const r = await p5(corpo(JSON.stringify({ canvas: { width: 1080, height: 1920 }, layers: [vetor('r', { fill: 'unset' })] })))
    recusaVetorial(r, ['r'])
    expect(banco.escritas).toBe(0)
    semEfeitoExterno()
  })

  it('vetores válidos → 201, como hoje', async () => {
    const r = await p5(corpo(comPaginas([{ id: 'a', layers: [vetor('ok')] }])))
    expect(r.status).toBe(201)
    expect(banco.templatesCriados).toHaveLength(1)
  })
})
