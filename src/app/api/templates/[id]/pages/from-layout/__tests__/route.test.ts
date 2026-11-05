/**
 * CP-T2 — `POST/GET /api/templates/[id]/pages/from-layout` com o handler REAL, o acesso REAL
 * (`hasProjectWriteAccess` + `withProjectOwner`), o contrato de camadas e o leitor da copy REAIS, e o banco em
 * memória. Dublados: o Clerk, o compositor (`comporPeca`/`paginasDeAssinatura` — sem foto, fonte nem rede) e as
 * duas chamadas de quem grava `Page.layers` (espiadas). A reabertura usa o GET real de `pages/route.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreativeError } from '@/lib/creatives/errors'

type Pagina = Record<string, any>
const banco = vi.hoisted(() => ({
  paginas: [] as Pagina[],
  escritas: 0,
  assinatura: [] as unknown[],
  usuario: 'user_dono' as string | null,
  seq: 0,
  /** O SQL cru na ordem em que cada transação o emitiu: `tx<n> lock <chave>` / `tx<n> for-update <id>`. */
  sql: [] as string[],
}))
const espias = vi.hoisted(() => ({
  compor: vi.fn(),
  invalidar: vi.fn(),
  recompor: vi.fn(),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
    }),
  },
}))
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: banco.usuario, orgId: null }),
}))
vi.mock('@/lib/compositor/compor', () => ({
  comporPeca: espias.compor,
  paginasDeAssinatura: async () => ({
    templateId: 1,
    paginas: banco.assinatura,
  }),
}))
vi.mock('@/lib/compositor/recompor', () => ({
  pedirRecomposicaoDaArteCongelada: espias.recompor,
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({
  invalidateScheduledRenders: async (...args: unknown[]) => {
    espias.invalidar(...args)
    return { invalidados: 0, congelados: [], reabertos: 0 }
  },
}))
vi.mock('@/lib/db', () => {
  const projeto = { id: 8, userId: 'u-dono', organizationProjects: [] }
  const casa = (p: Pagina, where: Record<string, any>) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'gte' in v ? p[k] >= v.gte : p[k] === v))
  const db: Record<string, any> = {
    template: {
      findFirst: async ({ where }: any) =>
        where.id === 77
          ? { id: 77, projectId: 8, Project: projeto }
          : where.id === 99
            ? { id: 99, projectId: 9, Project: { ...projeto, id: 9 } }
            : where.id === 55
              ? { id: 55, projectId: 8, name: 'Assinatura', Project: projeto }
              : null,
    },
    user: {
      findUnique: async ({ where }: any) => (where.id === 'u-dono' ? { clerkId: 'user_dono' } : null),
    },
    page: {
      findFirst: async ({ where }: any) => structuredClone(banco.paginas.find((p) => casa(p, where)) ?? null),
      findMany: async ({ where }: any) =>
        structuredClone(banco.paginas.filter((p) => casa(p, where)).sort((a, b) => a.order - b.order)),
      updateMany: async ({ where, data }: any) => {
        await new Promise((r) => setTimeout(r, 0)) // cede a vez: sem trava, outra requisição intercala aqui
        banco.escritas++
        const alvo = banco.paginas.filter((p) => casa(p, where))
        alvo.forEach((p) => (p.order += data.order.increment))
        return { count: alvo.length }
      },
      create: async ({ data }: any) => {
        await new Promise((r) => setTimeout(r, 0))
        banco.escritas++
        const nova = {
          id: `nova-${++banco.seq}`,
          thumbnail: null,
          audio: null,
          copyAutoral: null,
          ...data,
        }
        banco.paginas.push(nova)
        return { id: nova.id }
      },
    },
    // A semântica que a rota pede ao Postgres, emulada: `pg_advisory_xact_lock` serializa por chave até o fim da
    // transação; o `SELECT … FOR UPDATE` relê a linha da origem como está AGORA. É um dublê — prova que a rota pega a
    // trava e relê dentro dela, não o isolamento do Postgres.
    $transaction: async (fn: (tx: unknown) => unknown) => {
      const n = ++travas.seq
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
            travas.porChave.set(
              chave,
              anterior.then(() => minha),
            )
            await anterior
            soltar.push(solta)
            banco.sql.push(`tx${n} lock ${chave}`)
            return [{ ok: 1 }]
          }
          if (sql.includes('FOR UPDATE')) {
            banco.sql.push(`tx${n} for-update ${valores[0]}`)
            return banco.paginas
              .filter((p) => p.id === valores[0] && p.templateId === valores[1])
              .map((p) => ({ order: p.order }))
          }
          throw new Error(`SQL inesperado: ${sql}`)
        },
      }
      try {
        return await fn(tx)
      } finally {
        soltar.forEach((f) => f())
      }
    },
  }
  const travas = { seq: 0, porChave: new Map<string, Promise<void>>() }
  return { db }
})

import { GET, POST } from '../route'
import { GET as listarPaginas } from '../../route'

const ARQ = 'minimal-fb-topo-esquerda'
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
  style: { fontFamily: 'Inter', fontSize: 64, fill: '#ffffff' },
})
const foto = (url: string) => ({
  id: 'bg-foto',
  name: 'Foto',
  type: 'image',
  visible: true,
  locked: false,
  order: 0,
  fileUrl: url,
  position: { x: 0, y: 0 },
  size: { width: 1080, height: 1920 },
  rotation: 0,
  style: { objectFit: 'cover' },
})
const camadasDaOrigem = [
  foto('https://blob.test/origem.jpg'),
  texto('t1', 'headline', 'Feijoada de sábado', 300),
  texto('t2', 'servico', 'Sáb 12h às 16h', 1500),
  texto('t3', 'cta', 'Reserve', 1700),
]

function pagina(id: string, order: number, extra: Pagina = {}): Pagina {
  return {
    id,
    name: id,
    templateId: 77,
    width: 1080,
    height: 1920,
    order,
    isTemplate: false,
    tags: [],
    background: '#101010',
    layers: JSON.stringify([]),
    copyAutoral: null,
    ...extra,
  }
}

/** O que `comporPeca` devolveria: as camadas na posição do arquétipo, a foto como `bg-foto`. */
function composicaoDe(spec: any) {
  return {
    persistido: null,
    prova: null,
    diagnostico: { avisos: ['aviso do compositor'] },
    layers: [
      foto(spec.foto.url),
      ...spec.blocos.map((b: any, i: number) => ({
        ...texto(b.papel, b.papel, b.linhas.join('\n'), 200 + i * 300),
        metadata: { compositor: { papel: b.papel } },
      })),
    ],
  }
}

const params = (id = '77') => ({ params: Promise.resolve({ id }) })
const post = (corpo: unknown, id = '77') =>
  POST(
    new Request(`http://studio.test/api/templates/${id}/pages/from-layout`, {
      method: 'POST',
      body: JSON.stringify(corpo),
    }),
    params(id),
  ) as any
const pedido = (extra: Record<string, unknown> = {}) => ({
  arquetipo: { id: ARQ, versao: 1 },
  aPartirDaPagina: 'origem',
  ...extra,
})

let origemAntes: Pagina
beforeEach(() => {
  vi.clearAllMocks()
  banco.usuario = 'user_dono'
  banco.escritas = 0
  banco.sql = []
  banco.assinatura = [{ id: 'assin', formato: 'story' }]
  banco.paginas = [
    pagina('p0', 0),
    pagina('origem', 1, {
      layers: JSON.stringify(camadasDaOrigem),
      copyAutoral: null,
    }),
    pagina('p2', 2),
    pagina('p3', 3),
    pagina('alheia', 2, { templateId: 99 }),
  ]
  origemAntes = structuredClone(banco.paginas[1])
  espias.compor.mockImplementation(async (spec: unknown) => composicaoDe(spec))
})

function semEscrita() {
  expect(banco.escritas).toBe(0)
  expect(banco.paginas.map((p) => [p.id, p.order])).toEqual([
    ['p0', 0],
    ['origem', 1],
    ['p2', 2],
    ['p3', 3],
    ['alheia', 2],
  ])
  expect(banco.paginas[1]).toEqual(origemAntes)
  expect(espias.invalidar).not.toHaveBeenCalled()
  expect(espias.recompor).not.toHaveBeenCalled()
}

describe('POST from-layout — falhas sem escrita', () => {
  it('401 sem sessão', async () => {
    banco.usuario = null
    expect((await post(pedido())).status).toBe(401)
    semEscrita()
  })

  it('403 sem escrita no projeto (o gate real de acesso)', async () => {
    banco.usuario = 'user_intruso'
    const r = await post(pedido())
    expect([r.status, r.body.error]).toEqual([403, 'SEM_ACESSO'])
    semEscrita()
  })

  it('404 origem de outro template (cruzada)', async () => {
    const r = await post(pedido({ aPartirDaPagina: 'alheia' }))
    expect([r.status, r.body.error]).toEqual([404, 'ORIGEM_NAO_ENCONTRADA'])
    expect(espias.compor).not.toHaveBeenCalled()
    semEscrita()
  })

  it('404 template inexistente', async () => {
    expect((await post(pedido(), '5')).status).toBe(404)
    semEscrita()
  })

  it('400 parâmetro não suportado, chave a mais ou fotoUrl sem https — recusado, nunca ignorado', async () => {
    for (const corpo of [
      pedido({ arquetipo: { id: ARQ, params: { cor: 'azul' } } }),
      pedido({ aplicarNaAberta: true }),
      pedido({ fotoUrl: 'http://inseguro.test/f.jpg' }),
      { arquetipo: { id: ARQ } },
    ]) {
      const r = await post(corpo)
      expect([r.status, r.body.error]).toEqual([400, 'PEDIDO_INVALIDO'])
    }
    expect(espias.compor).not.toHaveBeenCalled()
    semEscrita()
  })

  it('422 arquétipo fora do catálogo', async () => {
    const r = await post(pedido({ arquetipo: { id: 'nao-existe' } }))
    expect([r.status, r.body.error]).toEqual([422, 'ARQUETIPO_DESCONHECIDO'])
    semEscrita()
  })

  it('409 LAYOUT_SEM_FOTO quando a página não tem foto nem imagem cobrindo 90%', async () => {
    banco.paginas[1].layers = JSON.stringify(camadasDaOrigem.slice(1))
    origemAntes = structuredClone(banco.paginas[1])
    const r = await post(pedido())
    expect([r.status, r.body.error]).toEqual([409, 'LAYOUT_SEM_FOTO'])
    expect(espias.compor).not.toHaveBeenCalled()
    semEscrita()
  })

  it('T5: 422 LAYOUT_NA_ASSINATURA no template "Assinatura" — a página entraria no rodízio sem curador', async () => {
    banco.paginas.push(pagina('variante', 0, { templateId: 55, layers: JSON.stringify(camadasDaOrigem) }))
    const r = await post(pedido({ aPartirDaPagina: 'variante' }), '55')
    expect([r.status, r.body.error]).toEqual([422, 'LAYOUT_NA_ASSINATURA'])
    expect(espias.compor).not.toHaveBeenCalled()
    banco.paginas.pop()
    semEscrita()
    // O editor sem escrita segue barrado antes (403).
    banco.usuario = 'user_intruso'
    expect((await post(pedido({ aPartirDaPagina: 'variante' }), '55')).status).toBe(403)
  })

  it('422 ASSINATURA_INCOMPLETA quando a marca não tem página de assinatura', async () => {
    banco.assinatura = []
    const r = await post(pedido())
    expect([r.status, r.body.error]).toEqual([422, 'ASSINATURA_INCOMPLETA'])
    expect(espias.compor).not.toHaveBeenCalled()
    semEscrita()
  })

  it('a recusa do compositor sai com o código e a mensagem dele', async () => {
    espias.compor.mockRejectedValueOnce(
      new CreativeError('ARQUETIPO_TEXTO_NAO_CABE', 'A manchete não cabe.', 422, { papel: 'headline' }),
    )
    const r = await post(pedido())
    expect(r.status).toBe(422)
    expect(r.body).toEqual({
      error: 'ARQUETIPO_TEXTO_NAO_CABE',
      message: 'A manchete não cabe.',
      papel: 'headline',
    })
    semEscrita()
  })

  it('camada inválida que voltasse do compositor não vira página (500 sem escrita)', async () => {
    espias.compor.mockResolvedValueOnce({
      persistido: null,
      prova: null,
      diagnostico: { avisos: [] },
      layers: [{ id: '', type: 'nada' }],
    })
    const r = await post(pedido())
    expect([r.status, r.body.error]).toEqual([500, 'ERRO_INTERNO'])
    semEscrita()
  })
})

describe('POST from-layout — sucesso', () => {
  it('cria a página NOVA logo depois da origem, editável, e o GET a reabre com as camadas', async () => {
    const r = await post(pedido())
    expect(r.status).toBe(201)
    const id = r.body.pageId
    expect(id).toMatch(/^nova-/)

    // O compositor recebeu a spec do arquétipo, só para avaliar: textos por papel, foto da bg-foto.
    expect(espias.compor).toHaveBeenCalledTimes(1)
    const [spec, opcoes] = espias.compor.mock.calls[0]
    expect(opcoes).toEqual({ somenteAvaliar: true })
    expect(spec).toEqual({
      projectId: 8,
      formato: 'story',
      foto: { url: 'https://blob.test/origem.jpg' },
      blocos: [
        { papel: 'headline', linhas: ['Feijoada de sábado'] },
        { papel: 'servico', linhas: ['Sáb 12h às 16h'] },
      ],
      arquetipo: { id: ARQ, versao: 1 },
    })

    // Ordem: nova em 2, irmãos de baixo descem, o outro template não se mexe; a origem fica igual.
    expect(banco.paginas.map((p) => [p.id, p.order])).toEqual([
      ['p0', 0],
      ['origem', 1],
      ['p2', 3],
      ['p3', 4],
      ['alheia', 2],
      [id, 2],
    ])
    expect(banco.paginas[1]).toEqual(origemAntes)

    const nova = banco.paginas.find((p) => p.id === id)!
    expect(nova).toMatchObject({
      templateId: 77,
      isTemplate: false,
      width: 1080,
      height: 1920,
      background: '#101010',
      name: 'Layout — Foto inteira, título no topo à esquerda',
      tags: ['layout', `arquetipo:${ARQ}`],
    })
    // O contrato da copy da página (a efetiva) nasce como o compositor grava.
    expect(nova.copyAutoral).toBeTruthy()

    // Quem grava Page.layers chama as DUAS, com a página nova.
    expect(espias.invalidar).toHaveBeenCalledWith(expect.anything(), {
      pageIds: [id],
    })
    expect(espias.recompor).toHaveBeenCalledWith([id])

    // O cta da origem não tem lugar no layout: volta DITO.
    expect(r.body.foraDoLayout).toEqual([
      {
        camada: 't3',
        nome: 'cta',
        motivo: 'papel-fora-do-layout',
        papel: 'cta',
      },
    ])
    expect(r.body.avisos).toEqual([
      'aviso do compositor',
      '1 texto(s) da página não entraram no layout (sem papel ou sem lugar nele).',
    ])

    const lista = (await listarPaginas(new Request('http://studio.test/api/templates/77/pages'), params())) as any
    const reaberta = lista.body.find((p: Pagina) => p.id === id)
    expect(reaberta.layers.map((c: Pagina) => [c.id, c.type, c.content ?? c.fileUrl])).toEqual([
      ['bg-foto', 'image', 'https://blob.test/origem.jpg'],
      ['headline', 'text', 'Feijoada de sábado'],
      ['servico', 'text', 'Sáb 12h às 16h'],
    ])
    expect(lista.body.map((p: Pagina) => p.id)).toEqual(['p0', 'origem', id, 'p2', 'p3'])
  })

  it('sem manchete: placeholder, nome "(rascunho)" e página sem contrato de copy', async () => {
    banco.paginas[1].layers = JSON.stringify([
      foto('https://blob.test/origem.jpg'),
      texto('t2', 'servico', 'Sáb 12h', 1500),
    ])
    const r = await post(pedido())
    expect(r.status).toBe(201)
    expect(r.body.placeholders).toEqual(['headline'])
    const nova = banco.paginas.find((p) => p.id === r.body.pageId)!
    expect(nova.name).toBe('Layout — Foto inteira, título no topo à esquerda (rascunho)')
    expect(nova.copyAutoral).toBeNull()
    expect(espias.compor.mock.calls[0][0].blocos[0]).toEqual({
      papel: 'headline',
      linhas: ['Título'],
    })
  })

  it('fotoUrl explícita vence a foto da página; feed gera página feed', async () => {
    banco.paginas[1].height = 1350
    const r = await post(pedido({ fotoUrl: 'https://blob.test/outra.jpg' }))
    expect(r.status).toBe(201)
    expect(espias.compor.mock.calls[0][0]).toMatchObject({
      formato: 'feed',
      foto: { url: 'https://blob.test/outra.jpg' },
    })
    expect(banco.paginas.find((p) => p.id === r.body.pageId)).toMatchObject({
      width: 1080,
      height: 1350,
    })
  })
})

describe('GET from-layout — a vitrine', () => {
  it('dez layouts disponíveis (os três do T0 + o título gigante do T4-A + a lista do #15 + o convite do #16 + a divisão do #8 + o topo centrado do #5 + o arco do #9 + os 2 lados da coluna do #10; a base centrada do #4 e o centro óptico do #3 guardados fora da vitrine) com a geometria de referência; assinatura dita', async () => {
    const r = (await GET(new Request('http://studio.test/x'), params())) as any
    expect(r.status).toBe(200)
    // H9: o #9@1 publicado entra em 1º (ordem por id); IH #10: os 2 da coluna antes dele; o #4 guardado sai (25/10); o #3 guardado sai (26/10).
    expect(r.body.arquetipos.map((a: Pagina) => [a.id, a.disponibilidade])).toEqual([
      ['minimal-coluna-foto', 'disponivel'],
      ['minimal-coluna-foto-esquerda', 'disponivel'],
      ['minimal-divisao-cor-topo-arco', 'disponivel'],
      ['minimal-divisao-foto-topo', 'disponivel'],
      ['minimal-fb-base-esquerda', 'disponivel'],
      ['minimal-fb-topo-centro', 'disponivel'],
      ['minimal-fb-topo-esquerda', 'disponivel'],
      ['minimal-tipografico-convite', 'disponivel'],
      ['minimal-tipografico-lista', 'disponivel'],
      ['minimal-titulo-gigante', 'disponivel'],
    ])
    // O #15 e o #16 se dizem sem foto (fundo liso claro); o #10 (2 lados), o #9 e o #8, foto em caixa; os outros, de foto.
    expect(r.body.arquetipos.map((a: Pagina) => a.fundo)).toEqual(['foto-em-caixa', 'foto-em-caixa', 'foto-em-caixa', 'foto-em-caixa', 'foto', 'foto', 'foto', 'liso-claro', 'liso-claro', 'foto'])
    const topo = r.body.arquetipos.find((a: Pagina) => a.id === ARQ)
    expect(topo.geometria.story.headline).toEqual({
      x: 0.085,
      y: 0.155,
      w: 0.7,
      h: 0.12,
    })
    expect(r.body.assinatura).toEqual({ disponivel: true })

    banco.assinatura = []
    const sem = (await GET(new Request('http://studio.test/x'), params())) as any
    expect(sem.body.assinatura.disponivel).toBe(false)
    expect(sem.body.assinatura.motivo).toMatch(/assinatura/)
  })

  it('T5: no template "Assinatura" a vitrine nasce desabilitada com o motivo (a UI não oferece o botão)', async () => {
    const r = (await GET(new Request('http://studio.test/x'), params('55'))) as any
    expect(r.status).toBe(200)
    expect(r.body.assinatura.disponivel).toBe(false)
    expect(r.body.assinatura.motivo).toMatch(/rodízio/)
  })

  it('403 sem acesso de leitura', async () => {
    banco.usuario = 'user_intruso'
    expect(((await GET(new Request('http://studio.test/x'), params())) as any).status).toBe(403)
  })
})

describe('rodada 1 · P2-3: a posição é decidida na transação, sob trava', () => {
  it('a origem REORDENADA durante a composição: a página nova entra logo depois da posição VIGENTE dela', async () => {
    espias.compor.mockImplementationOnce(async (spec: unknown) => {
      // Outra pessoa arrasta a origem para o fim enquanto o compositor trabalha.
      const ordem: Record<string, number> = { p0: 0, p2: 1, p3: 2, origem: 3 }
      banco.paginas.forEach((p) => p.templateId === 77 && (p.order = ordem[p.id]))
      return composicaoDe(spec)
    })
    const r = await post(pedido())
    expect(r.status).toBe(201)
    expect(
      banco.paginas
        .filter((p) => p.templateId === 77)
        .sort((a, b) => a.order - b.order)
        .map((p) => [p.id, p.order]),
    ).toEqual([
      ['p0', 0],
      ['p2', 1],
      ['p3', 2],
      ['origem', 3],
      [r.body.pageId, 4],
    ])
    expect(banco.sql.map((l) => l.replace(/^tx\d+ /, ''))).toEqual(['lock paginas-do-template:77', 'for-update origem'])
  })

  it('a origem APAGADA durante a composição: 404, nada criado', async () => {
    espias.compor.mockImplementationOnce(async (spec: unknown) => {
      banco.paginas = banco.paginas.filter((p) => p.id !== 'origem')
      return composicaoDe(spec)
    })
    const r = await post(pedido())
    expect([r.status, r.body.error]).toEqual([404, 'ORIGEM_NAO_ENCONTRADA'])
    expect(banco.paginas.some((p) => String(p.id).startsWith('nova-'))).toBe(false)
    expect(espias.recompor).not.toHaveBeenCalled()
  })

  it('duas criações AO MESMO TEMPO na mesma origem: posições distintas e contíguas, uma transação de cada vez', async () => {
    // As duas param no compositor até as duas chegarem: só então disputam a escrita.
    let chegaram = 0
    let soltar!: () => void
    const ambas = new Promise<void>((r) => (soltar = r))
    espias.compor.mockImplementation(async (spec: unknown) => {
      if (++chegaram === 2) soltar()
      await ambas
      return composicaoDe(spec)
    })
    const [a, b] = await Promise.all([post(pedido()), post(pedido())])
    expect([a.status, b.status]).toEqual([201, 201])
    const lista = banco.paginas.filter((p) => p.templateId === 77).sort((x, y) => x.order - y.order)
    expect(lista.map((p) => p.order)).toEqual([0, 1, 2, 3, 4, 5])
    expect(lista.slice(0, 2).map((p) => p.id)).toEqual(['p0', 'origem'])
    expect(
      lista
        .slice(2, 4)
        .map((p) => p.id)
        .sort(),
    ).toEqual([a.body.pageId, b.body.pageId].sort())
    expect(lista.slice(4).map((p) => p.id)).toEqual(['p2', 'p3'])
    // Uma transação inteira antes da outra: trava → releitura de uma, depois trava → releitura da outra.
    expect(banco.sql.map((l) => l.replace(/^tx\d+ /, ''))).toEqual([
      'lock paginas-do-template:77',
      'for-update origem',
      'lock paginas-do-template:77',
      'for-update origem',
    ])
    expect(banco.sql[0].split(' ')[0]).toBe(banco.sql[1].split(' ')[0])
  })
})

describe('rodada 2 · P2-1: contrato da origem que não transporta → 422 antes de compor e gravar', () => {
  const revisao = { em: '2026-10-20T12:00:00.000Z', autor: 'equipe', motivo: 'edição', blocos: ['manchete'] }
  const contratoCheio = (manchete: string[]) => ({
    versao: 'copy-autoral-v1',
    origem: { autor: 'equipe' },
    blocos: [
      { id: 'manchete', funcao: 'headline', ordem: 0, linhas: manchete },
      { id: 'horario', funcao: 'servico', ordem: 1, linhas: ['Sáb 12h às 16h'] },
      { id: 'chamada', funcao: 'cta', ordem: 2, linhas: ['Reserve'] },
    ],
    // O teto do contrato (MAX_REVISOES_DA_COPY): válido, mas sem lugar para mais uma revisão.
    revisoes: Array.from({ length: 200 }, () => revisao),
  })
  const camadasCom = (manchete: string) => [
    foto('https://blob.test/origem.jpg'),
    texto('t1', 'headline', manchete, 300),
    texto('t2', 'servico', 'Sáb 12h às 16h', 1500),
    texto('t3', 'cta', 'Reserve', 1700),
  ]
  function comOrigem(camadas: unknown[], copyAutoral: unknown) {
    banco.paginas[1] = { ...banco.paginas[1], layers: JSON.stringify(camadas), copyAutoral }
    origemAntes = structuredClone(banco.paginas[1])
  }
  async function recusado(motivo: RegExp) {
    const r = await post(pedido())
    expect([r.status, r.body.error]).toEqual([422, 'COPY_DA_ORIGEM_NAO_TRANSPORTAVEL'])
    expect(r.body.message).toMatch(/nada foi criado e a página continua igual/)
    expect(r.body.motivo).toMatch(motivo)
    expect(espias.compor).not.toHaveBeenCalled()
    semEscrita()
  }

  it('histórico cheio + manchete de 2 linhas sem voz 2 + CTA: o recorte não cabe → recusa (nunca a spec legada)', async () => {
    comOrigem(camadasCom('Costela\nna brasa'), contratoCheio(['Costela', 'na brasa']))
    await recusado(/não comportou o recorte do layout/)
  })

  it('reconciliação recusada (as camadas mudaram e o histórico está cheio) → a mesma recusa', async () => {
    comOrigem(camadasCom('Costela\nno bafo'), contratoCheio(['Costela', 'na brasa']))
    await recusado(/limite de 200 revisões/)
  })

  it('contrato gravado ilegível → a mesma recusa', async () => {
    comOrigem(camadasCom('Costela\nna brasa'), { versao: 'outra', blocos: 'lixo' })
    await recusado(/o contrato gravado é ilegível/)
  })
})
