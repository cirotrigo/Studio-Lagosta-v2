/**
 * O serviço da qualidade da copy com um BANCO FALSO que se comporta como o de
 * produção no que importa aqui:
 *  - UMA conexão (o pooler roda com `connection_limit=1`): a transação segura a
 *    conexão enquanto roda, e quem vem depois espera;
 *  - `SET LOCAL statement_timeout` cancela a consulta NO SERVIDOR (57014) e
 *    devolve a conexão;
 *  - depois de um erro, a transação fica ABORTADA e recusa todo comando.
 * As regras de medida estão no teste do contrato.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Consulta = { projectId: number }
type ArteNoBanco = { id: string; pageId: string | null; [chave: string]: unknown }
interface Comportamento {
  /** As linhas de "Generation" que a consulta crua das artes filtra (ids, páginas, ids a excluir, limite). */
  generations: ArteNoBanco[]
  paginas: Array<{ id: string; copyAutoral: unknown; layers: unknown }>
  esquema: { copyAutoralDaPagina: boolean; vozDaMarca: boolean }
  /** Quanto a leitura das artes (a consulta crua em "Generation") demora, por projeto. */
  artesMs: (projectId: number) => number
  postsDe: (projectId: number) => Array<{ id: string; pageId: string | null; generationId: string | null; createdAt: Date }>
  vozDe: (projectId: number) => Promise<unknown>
  posts: (projectId: number) => Promise<void>
}

const estado = vi.hoisted(() => ({ banco: null as null | { transacao: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> } }))
vi.mock('@/lib/db', () => ({
  db: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => estado.banco!.transacao(fn) },
}))

import { medirQualidadeDaCarteira, medirQualidadeDaCopyDoCliente, type EsquemaDaCopy } from '../qualidade-da-copy'

const janela = { inicio: new Date('2026-09-07T03:00:00Z'), fim: new Date('2026-09-14T03:00:00Z') }
const espeto = { projectId: 6, nome: 'Espeto Gaúcho' }
const byRock = { projectId: 7, nome: 'By Rock' }
const ESQUEMA_COMPLETO: EsquemaDaCopy = { copyAutoralDaPagina: true, vozDaMarca: true }

function erroPrisma(code: string, meta: Record<string, unknown>, message = `Prisma ${code}`) {
  return Object.assign(new Error(message), { code, meta })
}

function criarBanco(parcial: Partial<Comportamento> = {}) {
  const comp: Comportamento = {
    esquema: ESQUEMA_COMPLETO,
    generations: [],
    paginas: [],
    artesMs: () => 0,
    postsDe: (projectId) => [{ id: `post-${projectId}`, pageId: `page-${projectId}`, generationId: null, createdAt: new Date('2026-09-08T12:00:00Z') }],
    vozDe: async () => null,
    posts: async () => {},
    ...parcial,
  }
  const transacoes: string[][] = []
  const consultasDeArtes: Array<{ ids: string[]; paginas: string[]; excluir: string[] }> = []
  const chamadas: Record<string, number> = {}
  const conta = (nome: string) => (chamadas[nome] = (chamadas[nome] ?? 0) + 1)
  let conexao: Promise<void> = Promise.resolve()

  /** A única conexão do pool: quem pega segura até terminar. */
  async function comConexao<T>(fn: () => Promise<T>): Promise<T> {
    const antes = conexao
    let liberar!: () => void
    conexao = new Promise<void>((r) => (liberar = r))
    await antes
    try {
      return await fn()
    } finally {
      liberar()
    }
  }

  function transacao(fn: (tx: unknown) => Promise<unknown>) {
    return comConexao(async () => {
      const log: string[] = []
      transacoes.push(log)
      let abortada = false
      let timeoutMs: number | null = null
      const comando = async <T>(nome: string, op: () => Promise<T>): Promise<T> => {
        log.push(nome)
        if (abortada) throw new Error('current transaction is aborted, commands ignored until end of transaction block')
        try {
          return await op()
        } catch (e) {
          abortada = true
          throw e
        }
      }
      const demora = <T>(ms: number, valor: T) =>
        new Promise<T>((resolve, reject) => {
          const pronto = setTimeout(() => resolve(valor), ms)
          if (timeoutMs != null && timeoutMs < ms) {
            setTimeout(() => {
              clearTimeout(pronto)
              reject(erroPrisma('P2010', { code: '57014' }, 'canceling statement due to statement timeout'))
            }, timeoutMs)
          }
        })
      const tx = {
        $executeRawUnsafe: (sql: string) =>
          comando(sql, async () => {
            const m = sql.match(/statement_timeout = (\d+)/)
            if (m) timeoutMs = Number(m[1])
            return 0
          }),
        $queryRaw: (strings: TemplateStringsArray, ...valores: unknown[]) => {
          const sql = strings.join('?')
          if (sql.includes('information_schema')) {
            return comando('esquema', async () => [
              ...(comp.esquema.copyAutoralDaPagina ? [{ table_name: 'Page', column_name: 'copyAutoral' }] : []),
              ...(comp.esquema.vozDaMarca ? [{ table_name: 'BrandVoice', column_name: 'versao' }] : []),
            ])
          }
          return comando('artes', () => {
            conta(`artes-${valores[0]}`)
            const [, , ids, paginas, excluir, limite] = valores as [number, Date, string[], string[], string[], number]
            consultasDeArtes.push({ ids, paginas, excluir })
            const linhas = comp.generations
              .filter((g) => (ids.includes(g.id) || (g.pageId != null && paginas.includes(g.pageId))) && !excluir.includes(g.id))
              .slice(0, limite)
            return demora(comp.artesMs(valores[0] as number), linhas)
          })
        },
        socialPost: { findMany: (a: { where: Consulta }) => comando('posts', async () => (conta('posts'), await comp.posts(a.where.projectId), comp.postsDe(a.where.projectId))) },
        page: { findMany: (a: { where: { id: { in: string[] } } }) => comando('paginas', async () => comp.paginas.filter((p) => a.where.id.in.includes(p.id))) },
        itemDePlano: { findMany: () => comando('itens', async () => []) },
        learningSignal: { findMany: () => comando('sinais', async () => []) },
        brandVoice: { findUnique: (a: { where: Consulta }) => comando('voz', () => (conta('voz'), comp.vozDe(a.where.projectId))) },
        project: { findMany: () => comando('projetos', async () => []) },
      }
      return fn(tx)
    })
  }

  return { transacao, comConexao, transacoes, chamadas, consultasDeArtes }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('C15-03 · o teto por cliente é cumprido NO SERVIDOR', () => {
  it('a leitura lenta é cancelada pelo statement_timeout, o cliente seguinte é medido e a gravação não espera a órfã', async () => {
    const banco = criarBanco({ artesMs: (projectId) => (projectId === 6 ? 400 : 5) })
    estado.banco = banco
    const r = await medirQualidadeDaCarteira([espeto, byRock], janela, { prazo: Date.now() + 5_000, tetoPorClienteMs: 150, esquema: ESQUEMA_COMPLETO })

    expect(r.porCliente.get(6)?.indisponivel).toBe('passou do teto de tempo por cliente')
    expect(r.porCliente.get(7)?.indisponivel).toBeNull()
    expect(r.porCliente.get(7)?.qualidade?.pecas).toBe(1)

    // A "gravação do relatório" pega a única conexão na hora: nada ficou rodando.
    const t0 = Date.now()
    await banco.comConexao(async () => {})
    expect(Date.now() - t0).toBeLessThan(50)

    // Todo comando de leitura veio depois de um statement_timeout que cabe no teto.
    for (const log of banco.transacoes) {
      const timeouts = log.filter((c) => c.startsWith('SET LOCAL statement_timeout')).map((c) => Number(c.split('= ')[1]))
      expect(timeouts.length).toBeGreaterThan(0)
      expect(Math.max(...timeouts)).toBeLessThanOrEqual(150)
    }
  })

  it('prazo que já passou não emite a consulta', async () => {
    const banco = criarBanco()
    estado.banco = banco
    let relogio = 0
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 100, agora: () => (relogio += 80) })
    expect(r.indisponivel).toBe('passou do teto de tempo por cliente')
    expect(banco.chamadas.posts ?? 0).toBe(0)
  })

  it('cliente que não cabe no prazo da carteira sai em foraDoOrcamento, nunca some', async () => {
    estado.banco = criarBanco()
    let relogio = 0
    const r = await medirQualidadeDaCarteira([espeto, byRock], janela, {
      prazo: 30_000,
      tetoPorClienteMs: 25_000,
      esquema: ESQUEMA_COMPLETO,
      agora: () => (relogio += 20_000),
    })
    expect(r.porCliente.has(6)).toBe(true)
    expect(r.bloco.foraDoOrcamento).toEqual(['By Rock'])
  })
})

describe('C15-04 · uma transação READ ONLY por cliente, esquema conferido antes', () => {
  it('toda transação começa por SET TRANSACTION READ ONLY — a do esquema e a de cada cliente', async () => {
    const banco = criarBanco()
    estado.banco = banco
    await medirQualidadeDaCarteira([espeto, byRock], janela, { prazo: Date.now() + 5_000, tetoPorClienteMs: 1_000 })
    expect(banco.transacoes).toHaveLength(3)
    for (const log of banco.transacoes) expect(log[0]).toBe('SET TRANSACTION READ ONLY')
  })

  it('sem a tabela BrandVoice, a consulta da voz nem é emitida e os DOIS clientes são medidos', async () => {
    const banco = criarBanco({ esquema: { copyAutoralDaPagina: true, vozDaMarca: false } })
    estado.banco = banco
    const r = await medirQualidadeDaCarteira([espeto, byRock], janela, { prazo: Date.now() + 5_000, tetoPorClienteMs: 1_000 })
    expect(banco.chamadas.voz ?? 0).toBe(0)
    for (const id of [6, 7]) {
      expect(r.porCliente.get(id)?.indisponivel).toBeNull()
      expect(r.porCliente.get(id)?.avisos.join(' ')).toMatch(/BrandVoice/)
    }
  })

  it('sem Page.copyAutoral, cada cliente sai indisponível NOMEANDO a coluna, sem ler nada', async () => {
    const banco = criarBanco({ esquema: { copyAutoralDaPagina: false, vozDaMarca: false } })
    estado.banco = banco
    const r = await medirQualidadeDaCarteira([espeto, byRock], janela, { prazo: Date.now() + 5_000, tetoPorClienteMs: 1_000 })
    expect(banco.chamadas.posts ?? 0).toBe(0)
    expect(r.bloco.indisponiveis.map((i) => i.nome)).toEqual(['Espeto Gaúcho', 'By Rock'])
    for (const i of r.bloco.indisponiveis) expect(i.motivo).toMatch(/Page\.copyAutoral/)
  })

  it('um erro que aborta a transação de um cliente não envenena o seguinte', async () => {
    const banco = criarBanco({ vozDe: async (projectId) => { if (projectId === 6) throw erroPrisma('P2021', { table: 'public.BrandVoice' }); return null } })
    estado.banco = banco
    const r = await medirQualidadeDaCarteira([espeto, byRock], janela, { prazo: Date.now() + 5_000, tetoPorClienteMs: 1_000, esquema: ESQUEMA_COMPLETO })
    expect(r.porCliente.get(6)?.indisponivel).toMatch(/BrandVoice/)
    expect(r.porCliente.get(7)?.indisponivel).toBeNull()
    expect(r.porCliente.get(7)?.qualidade?.pecas).toBe(1)
  })

  it('erro que não é de esquema também não derruba — vira indisponível com o motivo', async () => {
    const banco = criarBanco({ posts: async () => { throw new Error('conexão caiu') } })
    estado.banco = banco
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO })
    expect(r.indisponivel).toMatch(/conexão caiu/)
  })

  it('semana sem posts: zero peças, sem ir às outras tabelas', async () => {
    const banco = criarBanco({ postsDe: () => [] })
    estado.banco = banco
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO })
    expect(r.qualidade?.pecas).toBe(0)
    expect(banco.chamadas['artes-6'] ?? 0).toBe(0)
  })

  it('esquema que não dá para conferir deixa todos indisponíveis com o motivo', async () => {
    estado.banco = { transacao: async () => { throw new Error('banco fora do ar') } }
    const r = await medirQualidadeDaCarteira([espeto, byRock], janela, { prazo: Date.now() + 5_000, tetoPorClienteMs: 1_000 })
    expect(r.bloco.indisponiveis).toHaveLength(2)
    expect(r.bloco.indisponiveis[0].motivo).toMatch(/banco fora do ar/)
  })
})

describe('C15-11 · post agendado por generationId (sem pageId)', () => {
  const original = {
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude', em: '2026-09-08T10:00:00.000Z', superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Sexta é dia', 'de churrasco'] },
      { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Vem pra cá'] },
    ],
    revisoes: [],
  }
  const gen = (id: string, over: Partial<ArteNoBanco>): ArteNoBanco => ({
    id,
    createdAt: new Date('2026-09-08T10:00:00Z'),
    canal: null,
    pageId: 'p',
    source: 'compositor',
    copyAutoral: { original, efetiva: original, comparavel: true },
    revisao: null,
    ajustes: null,
    avisos: [],
    recomposicao: null,
    vozNaEscrita: null,
    modo: null,
    ...over,
  })
  // O formato que o PR 0 grava na arte do ajuste (`ajustarArte` → `fieldValues.revisao`).
  const ajusteQueEscondeCta = gen('g2', {
    createdAt: new Date('2026-09-08T10:05:00Z'),
    source: 'ajuste-arte',
    ajustes: {},
    revisao: {
      versaoAntes: 'v1',
      ajustes: [{ tipo: 'visibilidade', camadas: ['cta'], visivel: false }],
      aplicados: [{ indice: 0, tipo: 'visibilidade', camadas: ['cta'], detalhe: 'escondidas' }],
      recusados: [],
    },
  })
  // A equipe mostrou o CTA de novo no editor: visível e sem a marca.
  const pagina = {
    id: 'p',
    copyAutoral: original,
    layers: JSON.stringify([
      { id: 'headline', type: 'text', content: 'Sexta é dia\nde churrasco' },
      { id: 'cta', type: 'text', content: 'Vem pra cá', visible: true },
    ]),
  }
  const postPelaArte = (generationId: string) => () => [{ id: 'post-g', pageId: null, generationId, createdAt: new Date('2026-09-08T12:00:00Z') }]

  it('a página vem pela arte, as OUTRAS artes dela são lidas, e o ajuste do revisor desfeito aparece', async () => {
    const banco = criarBanco({ postsDe: postPelaArte('g1'), generations: [gen('g1', {}), ajusteQueEscondeCta], paginas: [pagina] })
    estado.banco = banco
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.indisponivel).toBeNull()
    expect(banco.consultasDeArtes).toEqual([
      { ids: ['g1'], paginas: [], excluir: [] },
      { ids: [], paginas: ['p'], excluir: ['g1'] },
    ])
    expect(r.medidas).toHaveLength(1)
    expect(r.medidas[0]).toMatchObject({ chave: 'page:p', semPagina: false, visibilidadeDoRevisor: { aceitos: 0, desfeitos: 1, removidas: 0 } })
    expect(r.medidas[0].correcoes.revisor).toBe(1)
    expect(r.medidas[0].indevidas).toEqual([{ tipo: 'ajuste-do-revisor-revertido', bloco: null, camada: 'cta' }])
    expect(r.qualidade?.visibilidadeDoRevisor).toMatchObject({ desfeitos: 1, semPagina: 0 })
  })

  it('a arte não aponta página: a peça sai SEM PÁGINA na contagem, nunca zerada em silêncio', async () => {
    const banco = criarBanco({ postsDe: postPelaArte('g9'), generations: [gen('g9', { pageId: null, source: 'arte-ia' })] })
    estado.banco = banco
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(banco.consultasDeArtes).toHaveLength(1)
    expect(r.medidas).toHaveLength(1)
    expect(r.medidas[0]).toMatchObject({ comparavel: true, semPagina: true })
    expect(r.qualidade?.visibilidadeDoRevisor.semPagina).toBe(1)
  })

  it('a página que a arte aponta não veio do banco: também sem página', async () => {
    const banco = criarBanco({ postsDe: postPelaArte('g1'), generations: [gen('g1', {})], paginas: [] })
    estado.banco = banco
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.medidas[0]).toMatchObject({ chave: 'page:p', semPagina: true })
    expect(r.qualidade?.visibilidadeDoRevisor.semPagina).toBe(1)
  })
})

describe('C15-13 · o Prisma desistindo do tempo também é o teto por cliente', () => {
  it.each([
    ['P2028', 'Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction.'],
    ['P2024', 'Timed out fetching a new connection from the connection pool.'],
  ])('%s sai "passou do teto de tempo por cliente", não "erro na leitura"', async (code, message) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, {
      esquema: ESQUEMA_COMPLETO,
      executar: async () => {
        throw Object.assign(new Error(message), { code })
      },
    })
    expect(r.indisponivel).toBe('passou do teto de tempo por cliente')
    expect(log).not.toHaveBeenCalled()
  })
})
