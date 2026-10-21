/**
 * CP-X0 — a guarda do push do desktop no PUT real do template (contrato v3, 21/10/2026).
 *
 * Banco em memória com VÁRIAS páginas e `$transaction` com rollback de verdade: um DIÁRIO guarda o valor anterior de
 * cada chave que a própria transação escreve, e o rollback desfaz SÓ essas escritas. Escritas EXTERNAS (outra aba,
 * autosave — `antesDaLeitura`/`antesDoUpdate`) são commits separados e sobrevivem ao rollback, como num banco de
 * verdade. A recusa tardia numa página tem de desfazer o template e as páginas gravadas antes dela.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  template: { id: 77, name: 'Programação' } as Record<string, unknown>,
  paginas: {} as Record<string, any>,
  relogio: 1_000,
  /** Roda uma vez ANTES da N-ésima leitura de página pelo helper (findUnique). */
  antesDaLeitura: {} as Record<number, () => void>,
  leituras: 0,
  /** Roda uma vez ANTES do N-ésimo updateMany (commit externo entre a leitura e o compare-and-set). */
  antesDoUpdate: {} as Record<number, () => void>,
  updates: 0,
  /** Diário da transação aberta: chave → valor anterior. null = fora de transação. */
  diario: null as null | Map<string, unknown>,
  apagadas: [] as string[],
  criadas: [] as string[],
}))
const invalidados = vi.hoisted(() => [] as string[][])

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: () => {},
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/projects/access', () => ({ hasProjectReadAccess: () => true, hasProjectWriteAccess: () => true, withProjectOwner: async (p: unknown) => p }))
/** Spy da miniatura: sem Blob de verdade; anota se a chamada caiu DENTRO de uma transação aberta e quantas páginas já tinham sido gravadas. */
const miniatura = vi.hoisted(() => ({ chamadas: [] as Array<{ valor: string; dentroDaTransacao: boolean; paginasGravadas: number }> }))
vi.mock('@/lib/templates/miniatura', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/templates/miniatura')>()),
  guardarMiniatura: vi.fn(async (u: string, id: number) => {
    miniatura.chamadas.push({ valor: u, dentroDaTransacao: banco.diario !== null, paginasGravadas: banco.updates })
    return u.startsWith('data:') ? `https://blob.teste/templates/thumbnails/${id}.jpg` : u
  }),
}))
vi.mock('@/lib/posts/invalidate-renders', async () => ({
  invalidateScheduledRenders: vi.fn(async (_tx: unknown, args: { pageIds: string[] }) => {
    invalidados.push([...args.pageIds])
    return { invalidados: args.pageIds.length, congelados: [] as string[] }
  }),
  normalizeLayersString: (await import('@/lib/posts/page-layers')).normalizeLayersString,
}))
vi.mock('@/lib/compositor/recompor', () => ({ pedirRecomposicaoDaArteCongelada: vi.fn(async () => []) }))
vi.mock('@/lib/db', () => {
  /** Anota o valor anterior antes de a TRANSAÇÃO escrever numa chave (uma vez por chave). */
  const anotar = (chave: string, atual: unknown) => {
    if (banco.diario && !banco.diario.has(chave)) banco.diario.set(chave, structuredClone(atual))
  }
  const db: Record<string, any> = {
    template: {
      findFirst: async () => ({ ...structuredClone(banco.template), Project: { id: 8, organizationProjects: [] } }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        anotar('template', banco.template)
        banco.template = { ...banco.template, ...data }
        return { ...banco.template }
      },
    },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const n = ++banco.leituras
        const fn = banco.antesDaLeitura[n]
        delete banco.antesDaLeitura[n]
        fn?.()
        return banco.paginas[where.id] ? structuredClone(banco.paginas[where.id]) : null
      },
      findMany: async ({ where }: { where: Record<string, any> }) => {
        if (where.templateId === 77) return Object.values(banco.paginas).map((p) => structuredClone(p)).sort((a, b) => a.order - b.order)
        return [] // nenhuma página de outro template neste banco
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
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
      create: async ({ data }: { data: Record<string, any> }) => {
        anotar(`pagina:${data.id}`, banco.paginas[data.id])
        banco.paginas[data.id] = { ...data, updatedAt: new Date(++banco.relogio), copyAutoral: null }
        banco.criadas.push(data.id)
        return { ...data }
      },
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        for (const id of where.id.in) {
          anotar(`pagina:${id}`, banco.paginas[id])
          delete banco.paginas[id]
        }
        banco.apagadas.push(...where.id.in)
        return { count: where.id.in.length }
      },
    },
    socialPost: { findMany: async () => [] },
    $transaction: async (fn: (tx: unknown) => unknown) => {
      banco.diario = new Map()
      try {
        return await fn(db)
      } catch (e) {
        // rollback: desfaz SÓ o que esta transação escreveu; commits externos ficam
        for (const [chave, anterior] of banco.diario) {
          if (chave === 'template') banco.template = anterior as Record<string, unknown>
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

import { GET as getDoTemplate, PUT as putDoTemplate } from '../route'
import { normalizeForLocal, normalizeForWeb } from '../../../../../../desktop-app/electron/services/sync/template-normalizer'

type Camada = Record<string, any>
const ETIQUETA = 'M0 0 H55 L100 45 L55 100 L0 55 Z M22 22 A8 8 0 1 0 22 38 A8 8 0 1 0 22 22 Z'
const vetor = (id = 'etq'): Camada => ({
  id, type: 'shape', name: 'Etiqueta', visible: true, locked: false, order: 1, position: { x: 10, y: 20 }, size: { width: 300, height: 200 },
  style: { shapeType: 'svg-path', pathData: ETIQUETA, pathViewBox: [0, 0, 100, 100], pathFillRule: 'evenodd', fill: '#f97316' },
})
const texto = (id: string, content = 'Sexta é dia'): Camada => ({
  id, type: 'text', name: id, visible: true, locked: false, order: 2, position: { x: 100, y: 300 }, size: { width: 800, height: 80 }, content, style: { fontSize: 40 },
})
const pagina = (id: string, order: number, name: string, camadas: Camada[]) => ({
  id, templateId: 77, name, order, isTemplate: false, tags: [], width: 1080, height: 1920, background: '#ffffff',
  layers: JSON.stringify(camadas), copyAutoral: null, updatedAt: new Date(banco.relogio),
})
const doPayload = (id: string | undefined, order: number, name: string, layers: Camada[]) => ({ ...(id ? { id } : {}), name, width: 1080, height: 1920, layers, background: '#ffffff', order })
const req = (body: unknown) => ({ json: async () => structuredClone(body) }) as unknown as Request
const put = (body: Record<string, unknown>) => putDoTemplate(req(body), { params: Promise.resolve({ id: '77' }) }) as unknown as Promise<{ status: number; body: Record<string, any> }>
const pushDoDesktop = (pages: unknown[], extra: Record<string, unknown> = {}) =>
  put({ name: 'Programação', designData: { canvas: { width: 1080, height: 1920 }, pages }, localId: 'local-1', ...extra })
const camadasDe = (id: string): Camada[] => JSON.parse(banco.paginas[id].layers)

beforeEach(() => {
  banco.template = { id: 77, name: 'Programação' }
  banco.paginas = {}
  banco.relogio = 1_000
  banco.antesDaLeitura = {}
  banco.leituras = 0
  banco.antesDoUpdate = {}
  banco.updates = 0
  banco.diario = null
  banco.apagadas = []
  banco.criadas = []
  invalidados.length = 0
  miniatura.chamadas.length = 0
})

describe('CP-X0 — o PUT do desktop não perde o que o desktop não representa', () => {
  it('T1 página só do web, ausente do payload: preservada, listada e nunca apagada', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]), p2: pagina('p2', 1, 'Só no web', [vetor()]) }
    const r = await pushDoDesktop([doPayload('p1', 0, 'Sexta', [texto('t', 'Novo')])])
    expect(r.status).toBe(200)
    expect(r.body.paginasPreservadas).toEqual(['p2'])
    expect(banco.apagadas).toEqual([])
    expect(camadasDe('p2')[0].style.pathData).toBe(ETIQUETA)
    expect(camadasDe('p1')[0].content).toBe('Novo')
  })

  it('T2 recusa na 2ª página: 409 e ROLLBACK do template e da 1ª página', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]), p2: pagina('p2', 1, 'Sábado', [vetor()]) }
    const r = await put({
      name: 'Nome novo',
      localId: 'local-1',
      designData: { canvas: { width: 1080, height: 1920 }, pages: [doPayload('p1', 0, 'Sexta', [texto('t', 'Gravaria')]), doPayload('p2', 1, 'Sábado', [{ ...vetor(), style: { shapeType: 'rectangle', fill: '#fff' } }])] },
    })
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ codigo: 'PUSH_ALTERA_VETOR', paginaId: 'p2', camadaId: 'etq' })
    expect(banco.template.name).toBe('Programação')
    expect(camadasDe('p1')[0].content).toBe('Sexta é dia')
    expect(camadasDe('p2')[0].style).toMatchObject({ shapeType: 'svg-path', pathData: ETIQUETA })
    expect(invalidados).toEqual([])
  })

  it('T3 ids de página repetidos no payload: 409 sem escrita', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]) }
    const r = await pushDoDesktop([doPayload('p1', 0, 'Sexta', [texto('t', 'A')]), doPayload('p1', 1, 'Sexta 2', [texto('t', 'B')])], { name: 'Nome novo' })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('PUSH_PAGINAS_DUPLICADAS')
    expect(banco.template.name).toBe('Programação')
    expect(camadasDe('p1')[0].content).toBe('Sexta é dia')
  })

  it('T3b ids diferentes no MESMO destino (ordem/nome e depois id): 409 PUSH_DESTINO_REPETIDO e rollback', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]) }
    const r = await pushDoDesktop([doPayload(undefined, 0, 'Sexta', [texto('t', 'Pelo fallback')]), doPayload('p1', 3, 'Outra', [texto('t', 'Pelo id')])])
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ codigo: 'PUSH_DESTINO_REPETIDO', paginaId: 'p1' })
    expect(camadasDe('p1')[0].content).toBe('Sexta é dia')
    expect(banco.criadas).toEqual([])
  })

  it('T4 a mescla usa a base RELIDA: um vetor gravado depois da leitura inicial não é apagado (409)', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]) }
    banco.antesDaLeitura[1] = () => {
      banco.paginas.p1 = { ...banco.paginas.p1, layers: JSON.stringify([texto('t'), vetor()]), updatedAt: new Date(++banco.relogio) }
    }
    const r = await pushDoDesktop([doPayload('p1', 0, 'Sexta', [texto('t', 'Novo')])])
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ codigo: 'PUSH_APAGARIA_CAMADA', camadaId: 'etq' })
    expect(camadasDe('p1').map((c) => c.id)).toEqual(['t', 'etq'])
  })

  it('T4b a proteção do casamento por ordem/nome é medida na base RELIDA', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]) }
    banco.antesDaLeitura[1] = () => {
      banco.paginas.p1 = { ...banco.paginas.p1, layers: JSON.stringify([texto('t'), vetor()]), updatedAt: new Date(++banco.relogio) }
    }
    const r = await pushDoDesktop([doPayload(undefined, 0, 'Sexta', [texto('t', 'Novo'), vetor()])])
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('PUSH_PAGINA_INCERTA')
  })

  it('T4c casamento por ordem/nome em página SEM proteção segue gravando, como hoje', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]) }
    const r = await pushDoDesktop([doPayload('id-de-outro-lugar', 0, 'Sexta', [texto('t', 'Novo')])])
    expect(r.status).toBe(200)
    expect(camadasDe('p1')[0].content).toBe('Novo')
  })

  it('T7a SEGUNDA volta do compare-and-set: commit externo troca o path entre a leitura e o update → count 0 → a mescla usa o path NOVO', async () => {
    const P2 = 'M0 0 H100 V100 Z'
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [vetor()]) }
    banco.antesDoUpdate[1] = () => {
      const camadas = camadasDe('p1')
      camadas[0].style.pathData = P2
      banco.paginas.p1 = { ...banco.paginas.p1, layers: JSON.stringify(camadas), updatedAt: new Date(++banco.relogio) }
    }
    const doDesktop = { id: 'etq', type: 'shape', shape: 'svg-path', position: { x: 10, y: 20 }, size: { width: 300, height: 200 }, style: { shapeType: 'svg-path', fill: '#00ff00' } }
    const r = await pushDoDesktop([doPayload('p1', 0, 'Sexta', [doDesktop])])
    expect(r.status).toBe(200)
    expect(banco.updates).toBe(2) // a 1ª volta perdeu o compare-and-set
    expect(banco.leituras).toBe(2) // e a 2ª releu a base
    expect(camadasDe('p1')[0].style).toMatchObject({ shapeType: 'svg-path', pathData: P2, fill: '#00ff00' })
  })

  it('T7b SEGUNDA volta: commit externo acrescenta um vetor → count 0 → a 2ª volta recusa (409); o commit externo sobrevive ao rollback', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]) }
    banco.antesDoUpdate[1] = () => {
      banco.paginas.p1 = { ...banco.paginas.p1, layers: JSON.stringify([texto('t'), vetor()]), updatedAt: new Date(++banco.relogio) }
    }
    const r = await pushDoDesktop([doPayload('p1', 0, 'Sexta', [texto('t', 'Novo')])], { name: 'Nome novo' })
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ codigo: 'PUSH_APAGARIA_CAMADA', paginaId: 'p1', camadaId: 'etq' })
    expect(banco.leituras).toBe(2)
    expect(banco.template.name).toBe('Programação') // escrita própria desfeita
    expect(camadasDe('p1').map((c) => c.id)).toEqual(['t', 'etq']) // commit externo intacto
    expect(camadasDe('p1')[0].content).toBe('Sexta é dia')
  })

  it('T8 PUT → GET → normalizador real: o GET devolve o path e a página preservada, e um 2º ciclo do desktop não perde nada', async () => {
    banco.template = { id: 77, name: 'Programação', designData: { canvas: { width: 1080, height: 1920 }, pages: [] } }
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t'), vetor()]), p2: pagina('p2', 1, 'Só no web', [vetor('etq2')]) }
    // o desktop conhece só a p1 (puxou antes da p2 existir) e muda o fill
    const local1 = normalizeForLocal(
      { id: 77, name: 'Programação', type: 'STORY', updatedAt: '2026-10-21T12:00:00.000Z', designData: { canvas: { width: 1080, height: 1920 }, pages: [doPayload('p1', 0, 'Sexta', camadasDe('p1'))] } },
      8,
    )
    ;(local1.data.design.pages[0].layers.find((l) => l.id === 'etq') as Record<string, unknown>).fill = '#00ff00'
    const push1 = normalizeForWeb(local1.data).data as unknown as Record<string, any>
    const r1 = await put(push1)
    expect(r1.status).toBe(200)
    expect(r1.body.paginasPreservadas).toEqual(['p2'])

    // o GET que o app usa (fetchRemoteTemplateById) devolve as páginas FINAIS
    const g = (await getDoTemplate(req({}), { params: Promise.resolve({ id: '77' }) })) as unknown as { status: number; body: Record<string, any> }
    expect(g.status).toBe(200)
    const pages = g.body.designData.pages as Array<Record<string, any>>
    expect(pages.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(pages[0].layers.find((c: Camada) => c.id === 'etq').style).toMatchObject({ pathData: ETIQUETA, fill: '#00ff00' })
    expect(pages[1].layers[0].style.pathData).toBe(ETIQUETA)
    // o resto do designData é o que o push mandou (só `pages` foi reconstruído)
    expect(g.body.designData.canvas).toEqual(push1.designData.canvas)

    // o normalizador real consome o GET, e o 2º push (agora com as duas páginas) segue sem perda
    const local2 = normalizeForLocal({ id: 77, name: 'Programação', type: 'STORY', updatedAt: '2026-10-21T12:05:00.000Z', designData: g.body.designData }, 8)
    expect(local2.success).toBe(true)
    expect(local2.data.design.pages.map((p) => p.id)).toEqual(['p1', 'p2'])
    const r2 = await put(normalizeForWeb(local2.data).data as unknown as Record<string, unknown>)
    expect(r2.status).toBe(200)
    expect(r2.body.paginasPreservadas).toBeUndefined()
    expect(camadasDe('p1').find((c) => c.id === 'etq')!.style).toMatchObject({ pathData: ETIQUETA, fill: '#00ff00' })
    expect(camadasDe('p2')[0].style.pathData).toBe(ETIQUETA)
    expect(banco.apagadas).toEqual([])
  })

  it('T5 PUT sem pages (o Salvar do web) não passa pela guarda', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t'), vetor()]) }
    const r = await put({ name: 'Nome novo', designData: { canvas: { width: 1080, height: 1920 }, layers: [] } })
    expect(r.status).toBe(200)
    expect(r.body.paginasPreservadas).toBeUndefined()
    expect(banco.template.name).toBe('Nome novo')
    expect(banco.leituras).toBe(0)
    expect(camadasDe('p1').map((c) => c.id)).toEqual(['t', 'etq'])
  })

  it('T6 push real do desktop (normalizador real) sem perda: 200, path preservado, fill aplicado e invalidação pela base efetiva', async () => {
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t'), vetor()]) }
    const local = normalizeForLocal(
      { id: 77, name: 'Programação', type: 'STORY', updatedAt: '2026-10-21T12:00:00.000Z', designData: { canvas: { width: 1080, height: 1920 }, pages: [{ ...doPayload('p1', 0, 'Sexta', camadasDe('p1')) }] } },
      8,
    )
    const etq = local.data.design.pages[0].layers.find((l) => l.id === 'etq') as Record<string, unknown>
    etq.fill = '#00ff00'
    const web = normalizeForWeb(local.data)
    const r = await put(web.data as unknown as Record<string, unknown>)
    expect(r.status).toBe(200)
    const gravada = camadasDe('p1').find((c) => c.id === 'etq')!
    expect(gravada.style).toMatchObject({ shapeType: 'svg-path', pathData: ETIQUETA, pathViewBox: [0, 0, 100, 100], pathFillRule: 'evenodd', fill: '#00ff00' })
    expect(invalidados).toEqual([['p1']])
    expect(banco.apagadas).toEqual([])
  })
  const MINIATURA = 'data:image/jpeg;base64,/9j/AAAA'
  const MINIATURA_ANTIGA = 'https://blob.teste/templates/thumbnails/77.jpg?v=antiga'

  it('T9a recusa tardia (2ª página) com miniatura data URL: 409, ZERO upload e thumbnailUrl antigo intacto', async () => {
    banco.template = { id: 77, name: 'Programação', thumbnailUrl: MINIATURA_ANTIGA }
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]), p2: pagina('p2', 1, 'Sábado', [vetor()]) }
    const r = await pushDoDesktop(
      [doPayload('p1', 0, 'Sexta', [texto('t', 'Gravaria')]), doPayload('p2', 1, 'Sábado', [{ ...vetor(), style: { shapeType: 'rectangle', fill: '#fff' } }])],
      { thumbnailUrl: MINIATURA },
    )
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('PUSH_ALTERA_VETOR')
    expect(miniatura.chamadas).toEqual([])
    expect(banco.template.thumbnailUrl).toBe(MINIATURA_ANTIGA)
  })

  it('T9b push válido com miniatura data URL: sobe UMA vez, FORA da transação (depois do commit), e a coluna guarda a URL', async () => {
    banco.template = { id: 77, name: 'Programação', thumbnailUrl: MINIATURA_ANTIGA }
    banco.paginas = { p1: pagina('p1', 0, 'Sexta', [texto('t')]) }
    const r = await pushDoDesktop([doPayload('p1', 0, 'Sexta', [texto('t', 'Novo')])], { thumbnailUrl: MINIATURA })
    expect(r.status).toBe(200)
    expect(miniatura.chamadas).toEqual([{ valor: MINIATURA, dentroDaTransacao: false, paginasGravadas: 1 }])
    expect(banco.template.thumbnailUrl).toBe('https://blob.teste/templates/thumbnails/77.jpg')
    expect(r.body.thumbnailUrl).toBe('https://blob.teste/templates/thumbnails/77.jpg')
    expect(camadasDe('p1')[0].content).toBe('Novo')
  })

  it('T9c Salvar do web (sem pages) com miniatura data URL segue como antes: sobe e grava a URL', async () => {
    banco.template = { id: 77, name: 'Programação', thumbnailUrl: MINIATURA_ANTIGA }
    const r = await put({ name: 'Nome novo', thumbnailUrl: MINIATURA })
    expect(r.status).toBe(200)
    expect(miniatura.chamadas).toHaveLength(1)
    expect(banco.template.thumbnailUrl).toBe('https://blob.teste/templates/thumbnails/77.jpg')
  })
})
