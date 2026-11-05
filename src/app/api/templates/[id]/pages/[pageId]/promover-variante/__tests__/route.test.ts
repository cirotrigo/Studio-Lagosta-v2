/**
 * T5 (24/10/2026) — `POST /api/templates/[id]/pages/[pageId]/promover-variante` com o handler REAL, a cópia/validação
 * REAIS (`variante-promovida.ts`) e o banco em memória. Dublados: Clerk, acesso (`withProjectOwner` passa adiante;
 * leitura e curadoria por flag), e as duas chamadas de quem grava `Page.layers` (espiadas).
 *
 * A trava consultiva e o `FOR SHARE` são EMULADOS (fila por chave; o `SELECT … FOR SHARE` relê a linha como está
 * AGORA) e a transação desfaz por diário. Isto prova a ORDEM das chamadas, as recusas e o rollback — não a
 * serialização do PostgreSQL nem o bloqueio real do `FOR SHARE` (D7).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Linha = Record<string, any>
const banco = vi.hoisted(() => ({
  templates: [] as Linha[],
  paginas: [] as Linha[],
  leitura: true,
  curador: true,
  usuario: 'user_dono' as string | null,
  seq: 0,
  /** O que a transação emitiu, na ordem: `tx<n> lock <chave>`, `tx<n> for-share <id>`, `tx<n> count`, `tx<n> origem`… */
  sql: [] as string[],
  /** Roda no começo da transação, antes da trava (um PUT concorrente renomeando, outro "Assinatura" criado…). */
  antesDaTrava: null as null | (() => void),
  /** Roda logo antes da contagem dentro da transação. */
  antesDaContagem: null as null | (() => void),
  falharDepoisDoCreate: false,
  estourarTempo: false,
  escritas: 0,
}))
const espias = vi.hoisted(() => ({ invalidar: vi.fn(), recompor: vi.fn() }))

vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) } }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: banco.usuario, orgId: null, orgRole: null }) }))
vi.mock('@/lib/projects/access', () => ({
  withProjectOwner: async (p: unknown) => p,
  hasProjectReadAccess: () => banco.leitura,
  hasProjectOwnership: () => banco.curador,
}))
vi.mock('@/lib/compositor/recompor', () => ({ pedirRecomposicaoDaArteCongelada: espias.recompor }))
vi.mock('@/lib/posts/invalidate-renders', () => ({
  invalidateScheduledRenders: async (...args: unknown[]) => {
    espias.invalidar(...args)
    return { invalidados: 0, congelados: [] }
  },
}))
vi.mock('@/lib/db', () => {
  const travas = { seq: 0, porChave: new Map<string, Promise<void>>() }
  let diario: Array<() => void> | null = null
  let n = 0
  const casaPagina = (p: Linha, w: Linha) =>
    (w.id === undefined || p.id === w.id) && (w.templateId === undefined || p.templateId === w.templateId) && (w.tags?.has === undefined || (p.tags ?? []).includes(w.tags.has))
  const db: Record<string, any> = {
    template: {
      findFirst: async ({ where }: Linha) => {
        const t = banco.templates.find((x) => x.id === where.id)
        return t ? { ...structuredClone(t), Project: { id: t.projectId, userId: 'u-dono', organizationProjects: [] } } : null
      },
      findMany: async ({ where, take }: Linha) => banco.templates.filter((t) => t.projectId === where.projectId && t.name === where.name).slice(0, take).map((t) => ({ id: t.id })),
      count: async ({ where }: Linha) => {
        banco.antesDaContagem?.()
        banco.antesDaContagem = null
        banco.sql.push(`tx${n} count`)
        return banco.templates.filter((t) => t.projectId === where.projectId && t.name === where.name).length
      },
    },
    page: {
      findFirst: async ({ where, orderBy }: Linha) => {
        const lista = banco.paginas.filter((p) => casaPagina(p, where))
        if (orderBy?.order === 'desc') return structuredClone([...lista].sort((a, b) => b.order - a.order)[0] ?? null)
        banco.sql.push(`tx${n} origem`)
        return structuredClone(lista[0] ?? null)
      },
      findMany: async ({ where }: Linha) => structuredClone(banco.paginas.filter((p) => casaPagina(p, where)).sort((a, b) => a.order - b.order)),
      create: async ({ data }: Linha) => {
        await new Promise((r) => setTimeout(r, 0)) // cede a vez: sem trava, outra promoção intercalaria aqui
        banco.escritas++
        const nova = { id: `variante-${++banco.seq}`, thumbnail: null, audio: null, copyAutoral: null, usedCount: 0, ...structuredClone(data) }
        banco.paginas.push(nova)
        diario?.push(() => (banco.paginas = banco.paginas.filter((p) => p !== nova)))
        banco.sql.push(`tx${n} create`)
        if (banco.falharDepoisDoCreate) throw new Error('falha depois do create')
        return { id: nova.id }
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown, opcoes: Linha) => {
      if (banco.estourarTempo) throw Object.assign(new Error('Transaction already closed: timeout'), { code: 'P2028' })
      expect(opcoes).toMatchObject({ isolationLevel: 'ReadCommitted' })
      const meu = ++travas.seq
      banco.antesDaTrava?.()
      banco.antesDaTrava = null
      const soltar: Array<() => void> = []
      const tx = {
        ...db,
        $queryRaw: async (partes: TemplateStringsArray, ...valores: any[]) => {
          const sql = partes.join('?')
          if (sql.includes('pg_advisory_xact_lock')) {
            const chave = String(valores[0])
            const anterior = travas.porChave.get(chave) ?? Promise.resolve()
            let solta!: () => void
            const minha = new Promise<void>((r) => (solta = r))
            travas.porChave.set(chave, anterior.then(() => minha))
            await anterior
            soltar.push(solta)
            n = meu
            banco.sql.push(`tx${meu} lock ${chave}`)
            return [{ ok: 1 }]
          }
          if (sql.includes('FOR SHARE')) {
            banco.sql.push(`tx${meu} for-share ${valores[0]}`)
            return banco.templates.filter((t) => t.id === valores[0]).map((t) => ({ id: t.id, name: t.name, projectId: t.projectId }))
          }
          throw new Error(`SQL inesperado: ${sql}`)
        },
      }
      diario = []
      try {
        return await fn(tx)
      } catch (e) {
        for (const desfazer of diario.reverse()) desfazer()
        throw e
      } finally {
        diario = null
        soltar.forEach((f) => f())
      }
    },
  }
  return { db }
})

import { POST } from '../route'

const camadas = (fonte = 'Georgia') => [
  { id: 'headline', name: 'headline', type: 'text', visible: true, position: { x: 100, y: 1300 }, size: { width: 880, height: 160 }, content: 'Convite', style: { fontFamily: fonte, fontSize: 80, color: '#1F1A17' }, metadata: { groupId: 'g1', compositor: { papel: 'headline', bloco: 'b1', linhas: [0] } } },
  { id: 'apoio', name: 'apoio', type: 'text', visible: true, position: { x: 100, y: 1500 }, size: { width: 880, height: 100 }, content: 'Sexta, 20h', style: { fontFamily: fonte, fontSize: 40, color: '#1F1A17' } },
]
const ORIGEM = { id: 'origem', name: 'Convite da casa', width: 1080, height: 1920, background: '#F4EFE6', order: 2, templateId: 77, isTemplate: false, tags: ['story', 'layout', 'arquetipo:minimal-tipografico-convite'], copyAutoral: { versao: 1, blocos: [] }, audio: null, thumbnail: 'https://cdn/thumb.jpg', updatedAt: '2026-10-24T10:00:00.000Z', layers: JSON.stringify(camadas()) }
const promover = (corpo: unknown = {}, templateId = '77', pageId = 'origem') =>
  POST({ json: async () => corpo } as unknown as Request, { params: Promise.resolve({ id: templateId, pageId }) }) as unknown as Promise<{ status: number; body: Linha }>
const variantes = () => banco.paginas.filter((p) => p.templateId === 55)
/** O SQL da transação sem o número dela (o contador do dublê é do arquivo inteiro). */
const sqlSemNumero = () => banco.sql.map((s) => s.replace(/^tx\d+ /, ''))
const origemCrua = () => JSON.stringify(banco.paginas.find((p) => p.id === 'origem'))

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(banco, { leitura: true, curador: true, usuario: 'user_dono', seq: 0, sql: [], antesDaTrava: null, antesDaContagem: null, falharDepoisDoCreate: false, estourarTempo: false, escritas: 0 })
  banco.templates = [
    { id: 77, name: 'Peças da semana', projectId: 8 },
    { id: 55, name: 'Assinatura', projectId: 8 },
    { id: 99, name: 'Outro projeto', projectId: 9 },
  ]
  banco.paginas = [
    structuredClone(ORIGEM),
    { id: 'v1', name: 'Clássica', width: 1080, height: 1920, background: '#000', order: 0, templateId: 55, tags: ['story'], layers: JSON.stringify(camadas()) },
    { id: 'v2', name: 'Feed', width: 1080, height: 1350, background: '#000', order: 1, templateId: 55, tags: ['feed'], layers: JSON.stringify(camadas()) },
    { id: 'alheia', name: 'Alheia', width: 1080, height: 1920, background: '#fff', order: 0, templateId: 99, tags: [], layers: JSON.stringify(camadas()) },
  ]
})

/** Toda recusa: status/código, NENHUMA escrita, nenhum invalidador, a origem byte a byte (D5, K12). */
async function recusada(r: Promise<{ status: number; body: Linha }>, status: number, codigo?: string) {
  const antes = origemCrua()
  const total = banco.paginas.length
  const resposta = await r
  expect(resposta.status).toBe(status)
  if (codigo) expect(resposta.body.error).toBe(codigo)
  expect(banco.paginas.length).toBe(total)
  expect(banco.escritas).toBe(0)
  expect(espias.invalidar).not.toHaveBeenCalled()
  expect(espias.recompor).not.toHaveBeenCalled()
  expect(origemCrua()).toBe(antes)
  return resposta
}

describe('T5 · porta de promoção — recusas (P, D5, K12)', () => {
  it('P1: sem sessão → 401', async () => {
    banco.usuario = null
    await recusada(promover(), 401)
  })
  it('P2: template inexistente, ou sem leitura no projeto → 404 TEMPLATE_NAO_ENCONTRADO (não revela existência)', async () => {
    await recusada(promover({}, '1234'), 404, 'TEMPLATE_NAO_ENCONTRADO')
    banco.leitura = false
    await recusada(promover(), 404, 'TEMPLATE_NAO_ENCONTRADO')
  })
  it('P3: lê mas não é curador → 403 SEM_CURADORIA', async () => {
    banco.curador = false
    await recusada(promover(), 403, 'SEM_CURADORIA')
  })
  it('P4: página de outro template/projeto → 404 ORIGEM_NAO_ENCONTRADA', async () => {
    await recusada(promover({}, '77', 'alheia'), 404, 'ORIGEM_NAO_ENCONTRADA')
    await recusada(promover({}, '77', 'v1'), 404, 'ORIGEM_NAO_ENCONTRADA')
  })
  it('P5: origem já no template Assinatura → 422 ORIGEM_JA_NA_ASSINATURA', async () => {
    await recusada(promover({}, '55', 'v1'), 422, 'ORIGEM_JA_NA_ASSINATURA')
  })
  it('P6: corpo não vazio → 400 PEDIDO_INVALIDO', async () => {
    await recusada(promover({ nome: 'outro' }), 400, 'PEDIDO_INVALIDO')
    await recusada(promover([]), 400, 'PEDIDO_INVALIDO')
  })
  it('P7: sem template Assinatura → 422 ASSINATURA_AUSENTE, e nenhum template é criado', async () => {
    banco.templates = banco.templates.filter((t) => t.id !== 55)
    const n = banco.templates.length
    await recusada(promover(), 422, 'ASSINATURA_AUSENTE')
    expect(banco.templates.length).toBe(n)
  })
  it('P8: dois templates Assinatura → 422 ASSINATURA_AMBIGUA', async () => {
    banco.templates.push({ id: 56, name: 'Assinatura', projectId: 8 })
    await recusada(promover(), 422, 'ASSINATURA_AMBIGUA')
  })
  it('P9: a origem sai do template enquanto a promoção espera a trava → 404 relido DENTRO da trava', async () => {
    // A mudança é do cenário (a página foi MOVIDA por outro caminho): a origem não é comparada com a de antes aqui.
    banco.antesDaTrava = () => (banco.paginas.find((p) => p.id === 'origem')!.templateId = 78)
    const total = banco.paginas.length
    const r = await promover()
    expect([r.status, r.body.error]).toEqual([404, 'ORIGEM_NAO_ENCONTRADA'])
    expect([banco.paginas.length, banco.escritas, espias.invalidar.mock.calls.length, espias.recompor.mock.calls.length]).toEqual([total, 0, 0, 0])
    expect(sqlSemNumero()).toEqual(['lock paginas-do-template:55', 'for-share 55', 'count', 'origem'])
  })
  it('P10–P14/P19/P20 pela porta: a recusa da validação volta 422 com o código e os detalhes', async () => {
    const casos: Array<[unknown[], Linha, string]> = [
      [camadas(), { width: 1080, height: 1080, tags: [] }, 'FORMATO_NAO_SUPORTADO'],
      [camadas(), { name: 'Story do feed', tags: [] }, 'FORMATO_NAO_SUPORTADO'],
      [camadas().slice(1), {}, 'VARIANTE_SEM_MANCHETE'],
      [[...camadas(), { id: 'v', name: 'Vetor', type: 'shape', visible: true, position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, style: { shapeType: 'svg-path', pathData: 'banana', pathViewBox: [0, 0, 10, 10], fill: '#000' } }], {}, 'VETOR_INVALIDO'],
      [[...camadas(), { id: 'x', type: 'text' }], {}, 'CAMADAS_INVALIDAS'],
      [[...camadas(), { ...camadas()[1] }], {}, 'IDS_DE_CAMADA_REPETIDOS'],
    ]
    for (const [layers, extra, codigo] of casos) {
      Object.assign(banco.paginas[0], structuredClone(ORIGEM), extra, { layers: JSON.stringify(layers) })
      const r = await recusada(promover(), 422, codigo)
      expect(r.body.message).toEqual(expect.any(String))
    }
  })
  it('P18: a transação estoura o tempo → 503 NAO_TERMINOU, nada gravado', async () => {
    banco.estourarTempo = true
    await recusada(promover(), 503, 'NAO_TERMINOU')
  })
})

describe('T5 · porta de promoção — sucesso, cópia e efeitos (P15–P17, K5–K7, K12, D1–D6, D8, D9)', () => {
  it('P16/K5/K6/K7/K12/D4: página de Layouts COM contrato → 201; a variante nasce no fim da Assinatura, crua, fora do rodízio; origem intacta', async () => {
    const antes = origemCrua()
    const ordens = variantes().map((p) => [p.id, p.order])
    const r = await promover()
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ assinaturaTemplateId: 55, nome: 'Convite da casa', formato: 'story', foraDoRodizio: true, editorUrl: `/templates/55/editor?pageId=${r.body.pageId}` })
    const nova = banco.paginas.find((p) => p.id === r.body.pageId)!
    expect(nova).toMatchObject({ templateId: 55, isTemplate: false, order: 2, tags: ['fora-do-rodizio', 'story'], copyAutoral: null, audio: null, thumbnail: null, usedCount: 0, background: '#F4EFE6', width: 1080, height: 1920 })
    const [h, apoio] = JSON.parse(nova.layers)
    expect(h.metadata).toEqual({ groupId: 'g1', compositor: { papel: 'headline' } })
    expect(apoio).toEqual(camadas()[1])
    expect(variantes().filter((p) => p.id !== nova.id).map((p) => [p.id, p.order])).toEqual(ordens)
    expect(origemCrua()).toBe(antes)
    expect(espias.invalidar).toHaveBeenCalledTimes(1)
    expect(espias.invalidar.mock.calls[0][1]).toEqual({ pageIds: [nova.id] })
    expect(espias.recompor).toHaveBeenCalledWith([nova.id])
    expect(sqlSemNumero()).toEqual(['lock paginas-do-template:55', 'for-share 55', 'count', 'origem', 'create'])
  })
  it('P15: página feita à mão (sem compositor, sem Layouts) → 201', async () => {
    Object.assign(banco.paginas[0], { tags: [], copyAutoral: null, layers: JSON.stringify([{ ...camadas()[0], metadata: undefined, name: 'Título livre', id: 'headline' }, camadas()[1]]) })
    expect((await promover()).status).toBe(201)
  })
  it('P17: modelo (isTemplate) como origem → 201 com a variante isTemplate false', async () => {
    banco.paginas[0].isTemplate = true
    const r = await promover()
    expect(r.status).toBe(201)
    expect(banco.paginas.find((p) => p.id === r.body.pageId)!.isTemplate).toBe(false)
  })
  it('D1: repetir → 200 jaExistia, mesma pageId, zero linhas novas e sem recomposição de novo', async () => {
    const primeira = await promover()
    vi.clearAllMocks()
    const total = banco.paginas.length
    const segunda = await promover()
    expect(segunda.status).toBe(200)
    expect(segunda.body).toMatchObject({ pageId: primeira.body.pageId, jaExistia: true })
    expect(banco.paginas.length).toBe(total)
    expect(espias.invalidar).not.toHaveBeenCalled()
    expect(espias.recompor).not.toHaveBeenCalled()
  })
  it('D2: duas promoções paralelas, serializadas pela trava → uma linha só', async () => {
    const [a, b] = await Promise.all([promover(), promover()])
    expect([a.status, b.status].sort()).toEqual([200, 201])
    expect(a.body.pageId).toBe(b.body.pageId)
    expect(variantes().filter((p) => p.tags.includes('fora-do-rodizio'))).toHaveLength(1)
  })
  it('D3: falha depois do create, dentro da transação → rollback, zero linhas, e nada pedido depois', async () => {
    banco.falharDepoisDoCreate = true
    const total = banco.paginas.length
    const r = await promover()
    expect(r.status).toBe(500)
    expect(banco.paginas.length).toBe(total)
    expect(espias.recompor).not.toHaveBeenCalled()
  })
  it('D6: a origem reeditada e promovida de novo → variante nova (as duas ficam)', async () => {
    const primeira = await promover()
    banco.paginas[0].layers = JSON.stringify(camadas('Montserrat'))
    const segunda = await promover()
    expect(segunda.status).toBe(201)
    expect(segunda.body.pageId).not.toBe(primeira.body.pageId)
    expect(banco.paginas.find((p) => p.id === segunda.body.pageId)!.order).toBe(3)
  })
  it('D8: o destino é renomeado, movido ou apagado entre a resolução e a trava → 409 ASSINATURA_MUDOU, sem página', async () => {
    const mudancas: Array<() => void> = [
      () => (banco.templates.find((t) => t.id === 55)!.name = 'Assinatura antiga'),
      () => (banco.templates.find((t) => t.id === 55)!.projectId = 9),
      () => (banco.templates = banco.templates.filter((t) => t.id !== 55)),
    ]
    for (const mudar of mudancas) {
      banco.templates = [{ id: 77, name: 'Peças da semana', projectId: 8 }, { id: 55, name: 'Assinatura', projectId: 8 }]
      banco.sql = []
      banco.antesDaTrava = mudar
      await recusada(promover(), 409, 'ASSINATURA_MUDOU')
      expect(banco.sql.slice(0, 2)).toEqual([expect.stringMatching(/lock paginas-do-template:55$/), expect.stringMatching(/for-share 55$/)])
    }
  })
  it('D9: um segundo "Assinatura" entra entre a resolução e a contagem dentro da transação → 422 ASSINATURA_AMBIGUA, sem página', async () => {
    banco.antesDaContagem = () => banco.templates.push({ id: 57, name: 'Assinatura', projectId: 8 })
    await recusada(promover(), 422, 'ASSINATURA_AMBIGUA')
  })
})
