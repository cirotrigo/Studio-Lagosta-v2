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
type ArteNoBanco = { id: string; pageId: string | null; resultUrl?: string | null; [chave: string]: unknown }
type PostNoBanco = { id: string; pageId: string | null; generationId: string | null; createdAt: Date; mediaUrls: string[]; status: string; laterPostId: string | null }
interface Comportamento {
  /** As linhas de "Generation" que a consulta crua das artes filtra (ids, URLs das mídias, páginas, ids a excluir, limite). */
  generations: ArteNoBanco[]
  paginas: Array<{ id: string; copyAutoral: unknown; layers: unknown }>
  /** As linhas de "LearningSignal" (o serviço filtra pelo vínculo; o banco falso devolve todas). */
  sinais: Array<Record<string, unknown>>
  esquema: { copyAutoralDaPagina: boolean; vozDaMarca: boolean }
  /** Quanto a leitura das artes (a consulta crua em "Generation") demora, por projeto. */
  artesMs: (projectId: number) => number
  postsDe: (projectId: number) => PostNoBanco[]
  vozDe: (projectId: number) => Promise<unknown>
  posts: (projectId: number) => Promise<void>
}

const estado = vi.hoisted(() => ({ banco: null as null | { transacao: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> } }))
vi.mock('@/lib/db', () => ({
  db: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => estado.banco!.transacao(fn) },
}))

import { medirQualidadeDaCarteira, medirQualidadeDaCopyDoCliente, type EsquemaDaCopy } from '../qualidade-da-copy'
import { aplicarRevisao } from '@/lib/copy-autoral/revisao'

const janela = { inicio: new Date('2026-09-07T03:00:00Z'), fim: new Date('2026-09-14T03:00:00Z') }
const espeto = { projectId: 6, nome: 'Espeto Gaúcho' }
const byRock = { projectId: 7, nome: 'By Rock' }
const ESQUEMA_COMPLETO: EsquemaDaCopy = { copyAutoralDaPagina: true, vozDaMarca: true }

/** Post agendado e ainda não entregue ao publicador (segue a página), sem mídia. */
function postNoBanco(over: Partial<PostNoBanco> & Pick<PostNoBanco, 'id'>): PostNoBanco {
  return { pageId: null, generationId: null, createdAt: new Date('2026-09-08T12:00:00Z'), mediaUrls: [], status: 'SCHEDULED', laterPostId: null, ...over }
}

function erroPrisma(code: string, meta: Record<string, unknown>, message = `Prisma ${code}`) {
  return Object.assign(new Error(message), { code, meta })
}

/** O `select` do Prisma: só as chaves pedidas voltam (o banco não inventa coluna que a consulta não leu). */
function selecionar<T extends Record<string, unknown>>(linha: T, select?: Record<string, boolean>): Partial<T> {
  if (!select) return linha
  return Object.fromEntries(Object.entries(linha).filter(([k]) => select[k])) as Partial<T>
}

/**
 * A linha de "Generation" como a consulta crua a PROJETA: só as colunas e os
 * caminhos de `fieldValues` que o SELECT pede (linha com `fieldValues`; a linha
 * já projetada dos testes antigos volta como está).
 */
function projetar(sql: string, g: ArteNoBanco): Record<string, unknown> {
  const fv = g.fieldValues as Record<string, unknown> | undefined
  if (!fv) return g
  const selecao = sql.slice(sql.indexOf('SELECT'), sql.indexOf('FROM'))
  const linha: Record<string, unknown> = { id: g.id, createdAt: g.createdAt, canal: g.canal ?? null }
  if (selecao.includes('"resultUrl"')) linha.resultUrl = g.resultUrl ?? null
  for (const m of selecao.matchAll(/"fieldValues"((?:->>?'[^']+')+)\s+AS\s+"?(\w+)"?/g)) {
    let v: unknown = fv
    for (const [, chave] of m[1].matchAll(/->>?'([^']+)'/g)) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[chave] : undefined
    linha[m[2]] = v ?? null
  }
  return linha
}

const criadoEm = (g: ArteNoBanco): number => {
  if (!(g.createdAt instanceof Date)) throw new Error(`a arte ${g.id} do banco falso precisa de createdAt (Date)`)
  return g.createdAt.getTime()
}

/**
 * Os parâmetros da consulta das artes pelo PAPEL de cada um — o texto do SQL
 * logo antes do `${}` —, nunca pela posição: o banco falso aplica cada filtro
 * onde a consulta o põe, inclusive a data (PR15-08: o dublê que ignorava o
 * limite de data deixava passar a referência direta cortada por ele).
 */
function consultaDeArtes(strings: TemplateStringsArray, valores: unknown[]) {
  const q = { projectId: 0, ids: [] as string[], urls: [] as string[], urlsAnteriores: [] as string[], desde: new Date(0), paginas: [] as string[], excluir: [] as string[], limite: Infinity }
  valores.forEach((v, i) => {
    const antes = strings[i].replace(/\s+/g, ' ')
    if (antes.endsWith('"projectId" = ')) q.projectId = v as number
    else if (antes.endsWith('NOT (id = ANY(')) q.excluir = v as string[]
    else if (antes.endsWith('id = ANY(')) q.ids = v as string[]
    else if (antes.endsWith('"resultUrl" = ANY(')) q.urls = v as string[]
    else if (antes.endsWith('anterior.url = ANY(')) q.urlsAnteriores = v as string[]
    else if (antes.endsWith('"createdAt" >= ')) q.desde = v as Date
    else if (antes.endsWith(`->>'pageId' = ANY(`)) q.paginas = v as string[]
    else if (antes.endsWith('LIMIT ')) q.limite = v as number
    else throw new Error(`parâmetro da consulta das artes sem papel conhecido: …${antes.slice(-40)}`)
  })
  // O WHERE com cada `${}` trocado por `$i`: é ele que o banco falso AVALIA.
  const sql = strings.reduce((t, parte, i) => t + parte + (i < valores.length ? `$${i}` : ''), '').replace(/\s+/g, ' ')
  const onde = sql.slice(sql.indexOf(' WHERE ') + 7, sql.indexOf(' ORDER BY '))
  return { ...q, onde }
}

/** Divide `expr` no operador `op` só onde os parênteses estão fechados. */
function dividirNoNivel(expr: string, op: 'AND' | 'OR'): string[] {
  const partes: string[] = []
  let nivel = 0
  let inicio = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (c === '(') nivel++
    else if (c === ')') nivel--
    else if (nivel === 0 && expr.startsWith(` ${op} `, i)) {
      partes.push(expr.slice(inicio, i))
      inicio = i + op.length + 2
      i = inicio - 1
    }
  }
  partes.push(expr.slice(inicio))
  return partes
}

/** Os parênteses de fora envolvem a expressão INTEIRA? */
function envolveTudo(expr: string): boolean {
  if (!expr.startsWith('(') || !expr.endsWith(')')) return false
  let nivel = 0
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') nivel++
    else if (expr[i] === ')') nivel--
    if (nivel === 0 && i < expr.length - 1) return false
  }
  return true
}

/**
 * O WHERE da consulta das artes avaliado como o Postgres o avaliaria: AND, OR,
 * NOT e parênteses, com cada condição conhecida sobre a linha. Condição que o
 * banco falso não conhece LANÇA — um filtro novo esquecido aqui não pode
 * passar como "tudo casa".
 */
function avaliarOnde(expr: string, valores: unknown[], g: ArteNoBanco): boolean {
  let e = expr.trim()
  while (envolveTudo(e)) e = e.slice(1, -1).trim()
  const ou = dividirNoNivel(e, 'OR')
  if (ou.length > 1) return ou.some((x) => avaliarOnde(x, valores, g))
  const e_ = dividirNoNivel(e, 'AND')
  if (e_.length > 1) return e_.every((x) => avaliarOnde(x, valores, g))
  if (e.startsWith('NOT ')) return !avaliarOnde(e.slice(4), valores, g)
  const v = (i: string) => valores[Number(i)]
  let m: RegExpMatchArray | null
  if ((m = e.match(/^"projectId" = \$(\d+)$/))) return true
  if ((m = e.match(/^id = ANY\(\$(\d+)::text\[\]\)$/))) return (v(m[1]) as string[]).includes(g.id)
  if ((m = e.match(/^"resultUrl" = ANY\(\$(\d+)::text\[\]\)$/))) return g.resultUrl != null && (v(m[1]) as string[]).includes(g.resultUrl)
  if ((m = e.match(/^"createdAt" >= \$(\d+)$/))) return criadoEm(g) >= (v(m[1]) as Date).getTime()
  if ((m = e.match(/^"fieldValues"->>'pageId' = ANY\(\$(\d+)::text\[\]\)$/))) return g.pageId != null && (v(m[1]) as string[]).includes(g.pageId)
  // O rastro de URLs da arte (`recomposicao.urlsAnteriores`), só quando é array (PR15-06).
  if ((m = e.match(/^EXISTS \(SELECT 1 FROM jsonb_array_elements_text\(CASE WHEN jsonb_typeof\("fieldValues"->'recomposicao'->'urlsAnteriores'\) = 'array' THEN "fieldValues"->'recomposicao'->'urlsAnteriores' ELSE '\[\]'::jsonb END\) AS anterior\(url\) WHERE anterior\.url = ANY\(\$(\d+)::text\[\]\)\)$/))) {
    const r = (g.fieldValues as Record<string, unknown> | undefined)?.recomposicao ?? g.recomposicao
    const rastro = r && typeof r === 'object' && Array.isArray((r as { urlsAnteriores?: unknown }).urlsAnteriores) ? ((r as { urlsAnteriores: unknown[] }).urlsAnteriores) : []
    return rastro.some((u) => typeof u === 'string' && (v(m![1]) as string[]).includes(u))
  }
  throw new Error(`condição da consulta das artes que o banco falso não conhece: ${e}`)
}

function criarBanco(parcial: Partial<Comportamento> = {}) {
  const comp: Comportamento = {
    esquema: ESQUEMA_COMPLETO,
    generations: [],
    paginas: [],
    sinais: [],
    artesMs: () => 0,
    postsDe: (projectId) => [postNoBanco({ id: `post-${projectId}`, pageId: `page-${projectId}` })],
    vozDe: async () => null,
    posts: async () => {},
    ...parcial,
  }
  const transacoes: string[][] = []
  const consultasDeArtes: Array<{ ids: string[]; urls: string[]; paginas: string[]; excluir: string[] }> = []
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
            const q = consultaDeArtes(strings, valores)
            conta(`artes-${q.projectId}`)
            consultasDeArtes.push({ ids: q.ids, urls: q.urls, paginas: q.paginas, excluir: q.excluir })
            const linhas = comp.generations
              .filter((g) => avaliarOnde(q.onde, valores, g))
              .sort((a, b) => criadoEm(a) - criadoEm(b))
              .slice(0, q.limite)
              .map((g) => projetar(sql, g))
            return demora(comp.artesMs(q.projectId), linhas)
          })
        },
        socialPost: {
          findMany: (a: { where: Consulta; select?: Record<string, boolean> }) =>
            comando('posts', async () => (conta('posts'), await comp.posts(a.where.projectId), comp.postsDe(a.where.projectId).map((p) => selecionar(p, a.select)))),
        },
        page: { findMany: (a: { where: { id: { in: string[] } } }) => comando('paginas', async () => comp.paginas.filter((p) => a.where.id.in.includes(p.id))) },
        itemDePlano: { findMany: () => comando('itens', async () => []) },
        learningSignal: { findMany: (a: { select?: Record<string, boolean>; take?: number }) => comando('sinais', async () => comp.sinais.slice(0, a.take ?? Infinity).map((s) => selecionar(s, a.select))) },
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
    resultUrl: null,
    source: 'compositor',
    copyAutoral: { original, efetiva: original, comparavel: true },
    revisao: null,
    ajustes: null,
    avisos: [],
    recomposicao: null,
    recusaDaRecomposicao: null,
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
  const postPelaArte = (generationId: string) => () => [postNoBanco({ id: 'post-g', generationId })]

  it('a página vem pela arte, as OUTRAS artes dela são lidas, e o ajuste do revisor desfeito aparece', async () => {
    const banco = criarBanco({ postsDe: postPelaArte('g1'), generations: [gen('g1', {}), ajusteQueEscondeCta], paginas: [pagina] })
    estado.banco = banco
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.indisponivel).toBeNull()
    expect(banco.consultasDeArtes).toEqual([
      { ids: ['g1'], urls: [], paginas: [], excluir: [] },
      { ids: [], urls: [], paginas: ['p'], excluir: ['g1'] },
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

// ─── revisão final do Codex sobre ff2baaf0 (18/09/2026), pelo caminho real ──

describe('revisão final · a leitura do serviço alimenta as quatro correções', () => {
  const original = {
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude', em: '2026-09-08T10:00:00.000Z', superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Sexta é dia', 'de churrasco'] },
      { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Vem pra cá'] },
    ],
    revisoes: [],
  } as const
  const revisada = (mudancas: Record<string, string[]>, quem: { autor: 'sistema' | 'equipe'; motivo: string; superficie: string; em: string }) =>
    aplicarRevisao(original as never, original.blocos.map((b) => ({ ...b, linhas: mudancas[b.id] ?? [...b.linhas] })) as never, quem).copy
  const doCompositor = revisada({ cta: ['Vem pra cá →'] }, { autor: 'sistema', motivo: 'o que foi desenhado (compositor)', superficie: 'compositor', em: '2026-09-08T10:01:00.000Z' })
  const daEquipe = revisada({ headline: ['Sexta tem', 'churrasco'] }, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', em: '2026-09-08T11:30:00.000Z' })
  const camadas = (c: { blocos?: ReadonlyArray<{ id?: string; linhas?: readonly string[] }> }) =>
    JSON.stringify((c.blocos ?? []).map((b) => ({ id: b.id, name: b.id, type: 'text', content: (b.linhas ?? []).join('\n') })))
  /** A linha de "Generation" como está no banco: `fieldValues` inteiro, projetado pela consulta. */
  const linha = (id: string, pageId: string | null, resultUrl: string, fieldValues: Record<string, unknown>): ArteNoBanco => ({
    id,
    pageId,
    resultUrl,
    createdAt: new Date('2026-09-08T10:00:00Z'),
    canal: null,
    fieldValues: { pageId, source: 'compositor', ...fieldValues },
  })
  const peca = (efetiva: unknown = original) => ({ copyAutoral: { original, efetiva, comparavel: true } })

  it('PR15-01 · carrossel de três páginas: três peças, a mudança do terceiro slide contada', async () => {
    const banco = criarBanco({
      postsDe: () => [postNoBanco({ id: 'carrossel', generationId: 'g1', mediaUrls: ['u1', 'u2', 'u3'] })],
      generations: [linha('g1', 'p1', 'u1', peca()), linha('g2', 'p2', 'u2', peca()), linha('g3', 'p3', 'u3', peca(doCompositor))],
      paginas: [
        { id: 'p1', copyAutoral: original, layers: camadas(original) },
        { id: 'p2', copyAutoral: original, layers: camadas(original) },
        { id: 'p3', copyAutoral: doCompositor, layers: camadas(doCompositor) },
      ],
    })
    estado.banco = banco
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.indisponivel).toBeNull()
    expect(banco.consultasDeArtes[0]).toMatchObject({ ids: ['g1'], urls: ['u1', 'u2', 'u3'] })
    expect(r.medidas.map((m) => m.chave).sort()).toEqual(['page:p1', 'page:p2', 'page:p3'])
    expect(r.medidas.find((m) => m.chave === 'page:p3')).toMatchObject({ comparavel: true, sistemaMudouLinhas: true })
    expect(r.qualidade?.indevidas.porTipo['sistema-mudou-linhas']).toBe(1)
  })

  it('PR15-02 · post congelado com A, página editada depois para B: a medida é A, e o que veio depois não conta', async () => {
    const congelado = (status: string, laterPostId: string | null) =>
      criarBanco({
        postsDe: () => [postNoBanco({ id: 'slide', generationId: 'g1', mediaUrls: ['u1'], status, laterPostId })],
        generations: [linha('g1', 'p', 'u1', peca())],
        paginas: [{ id: 'p', copyAutoral: daEquipe, layers: camadas(daEquipe) }],
        // A edição de geometria veio DEPOIS do PNG publicado.
        sinais: [{ tipo: 'geometria', desfecho: 'escolha-propria', postId: null, pageId: 'p', generationId: null, createdAt: new Date('2026-09-08T11:31:00Z') }],
      })
    estado.banco = congelado('POSTED', 'zernio-1')
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.medidas[0]).toMatchObject({ comparavel: true, preservada: true })
    expect(r.medidas[0].correcoes).toMatchObject({ redacao: 0, design: 0 })
    // Controle: o mesmo post ainda vivo segue a página — a edição e a geometria contam.
    estado.banco = congelado('SCHEDULED', null)
    const vivo = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(vivo.medidas[0]).toMatchObject({ preservada: false })
    expect(vivo.medidas[0].correcoes).toMatchObject({ redacao: 1, design: 1 })
  })

  it('PR15-04 · a recusa gravada em `recusaDaRecomposicao` chega à contagem do compositor', async () => {
    estado.banco = criarBanco({
      postsDe: () => [postNoBanco({ id: 'slide', generationId: 'g1', mediaUrls: ['u1'] })],
      generations: [
        linha('g1', 'p', 'u1', {
          ...peca(),
          recomposicao: { estado: 're-renderizada', em: '2026-09-08T10:30:00.000Z', urlsAnteriores: [] },
          recusaDaRecomposicao: { em: '2026-09-08T10:40:00.000Z', erro: 'A linha não cabe na coluna.', errorCode: 'TEXTO_NAO_CABE_NA_COLUNA', detalhes: null, arteTrocada: false },
        }),
      ],
      paginas: [{ id: 'p', copyAutoral: original, layers: camadas(original) }],
    })
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.medidas[0].correcoes.compositor).toBe(1)
  })
})

// ─── revisão FINAL do Codex sobre e3486221 (21/09/2026), pelo caminho real ──

describe('PR15-08 · a referência DIRETA do post não cai no limite do histórico', () => {
  const original = {
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude', em: '2026-06-01T10:00:00.000Z', superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Sexta é dia', 'de churrasco'] },
      { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Vem pra cá'] },
    ],
    revisoes: [],
  }
  const camadas = JSON.stringify(original.blocos.map((b) => ({ id: b.id, name: b.id, type: 'text', content: b.linhas.join('\n') })))
  // Três meses antes da semana medida: bem antes do limite de 60 dias do histórico.
  const ANTIGA = new Date('2026-06-01T10:00:00Z')
  const linha = (id: string, pageId: string, resultUrl: string | null, fieldValues: Record<string, unknown>, createdAt = ANTIGA): ArteNoBanco => ({
    id,
    pageId,
    resultUrl,
    createdAt,
    canal: null,
    fieldValues: { pageId, source: 'compositor', copyAutoral: { original, efetiva: original, comparavel: true }, ...fieldValues },
  })
  const paginas = ['p1', 'p2', 'p3'].map((id) => ({ id, copyAutoral: original, layers: camadas }))
  // Um ajuste do revisor, também antigo, que o post NÃO referencia: é histórico, e o histórico continua limitado.
  const ajusteAntigo = linha('g1-ajuste', 'p1', null, { source: 'ajuste-arte', ajustes: {}, revisao: { aplicados: [{ indice: 0, tipo: 'corpo', camadas: ['headline'] }] } }, new Date('2026-06-02T10:00:00Z'))

  it('post desta semana com três artes antigas: as três peças existem, com o contrato, e o histórico incompleto é declarado', async () => {
    estado.banco = criarBanco({
      postsDe: () => [postNoBanco({ id: 'carrossel', generationId: 'g1', mediaUrls: ['u1', 'u2', 'u3'] })],
      generations: [linha('g1', 'p1', 'u1', {}), linha('g2', 'p2', 'u2', {}), linha('g3', 'p3', 'u3', {}), ajusteAntigo],
      paginas,
    })
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.indisponivel).toBeNull()
    expect(r.medidas.map((m) => m.chave).sort()).toEqual(['page:p1', 'page:p2', 'page:p3'])
    for (const m of r.medidas) expect(m).toMatchObject({ comparavel: true, exclusao: null, preservada: true })
    // A busca do histórico continua limitada: o ajuste antigo não foi lido — e isso é dito, nunca um zero calado.
    expect(r.medidas.find((m) => m.chave === 'page:p1')!.correcoes.revisor).toBe(0)
    expect(r.avisos.join(' ')).toMatch(/3 arte\(s\) ligada\(s\) direto aos posts.*60 dias.*incompleta/)
  })

  it('story sem mídia que aponta só pela coluna uma arte antiga: a peça é reconhecida pelo contrato dela', async () => {
    estado.banco = criarBanco({
      postsDe: () => [postNoBanco({ id: 'story', generationId: 'g-velha' })],
      generations: [linha('g-velha', 'p1', 'u-velha', {})],
      paginas: [paginas[0]],
    })
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.medidas).toHaveLength(1)
    expect(r.medidas[0]).toMatchObject({ chave: 'page:p1', comparavel: true, exclusao: null })
  })

  it('controle: artes recentes, histórico completo — nenhum aviso, e o ajuste recente da página entra', async () => {
    const RECENTE = new Date('2026-09-08T10:00:00Z')
    estado.banco = criarBanco({
      postsDe: () => [postNoBanco({ id: 'story', generationId: 'g1', mediaUrls: ['u1'] })],
      generations: [linha('g1', 'p1', 'u1', {}, RECENTE), { ...ajusteAntigo, createdAt: new Date('2026-09-08T10:05:00Z') }],
      paginas: [paginas[0]],
    })
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.avisos).toEqual([])
    expect(r.medidas[0].correcoes.revisor).toBe(1)
  })
})

describe('PR15-06 · a consulta das artes acha a mídia congelada pelo rastro de URLs', () => {
  const original = {
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude', em: '2026-09-08T10:00:00.000Z', superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Sexta é dia', 'de churrasco'] },
      { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Vem pra cá'] },
    ],
    revisoes: [],
  }
  const camadas = JSON.stringify(original.blocos.map((b) => ({ id: b.id, name: b.id, type: 'text', content: b.linhas.join('\n') })))
  const linha = (id: string, pageId: string, resultUrl: string, fieldValues: Record<string, unknown> = {}): ArteNoBanco => ({
    id,
    pageId,
    resultUrl,
    createdAt: new Date('2026-09-08T10:00:00Z'),
    canal: null,
    fieldValues: { pageId, source: 'compositor', copyAutoral: { original, efetiva: original, comparavel: true }, ...fieldValues },
  })

  it('carrossel publicado de três páginas com o slide 2 recomposto para outro post: três peças, a segunda sem prova', async () => {
    const banco = criarBanco({
      postsDe: () => [postNoBanco({ id: 'carrossel', generationId: 'g1', mediaUrls: ['u1', 'u2', 'u3'], status: 'POSTED', laterPostId: 'zernio-1' })],
      generations: [
        linha('g1', 'p1', 'u1'),
        // A arte do slide 2 tem hoje OUTRA URL; a da mídia congelada ficou no rastro.
        linha('g2', 'p2', 'u2-novo', { recomposicao: { estado: 'feita', em: '2026-09-09T10:00:00.000Z', urlsAnteriores: ['u2'] } }),
        linha('g3', 'p3', 'u3'),
      ],
      paginas: ['p1', 'p2', 'p3'].map((id) => ({ id, copyAutoral: original, layers: camadas })),
    })
    estado.banco = banco
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.indisponivel).toBeNull()
    expect(r.medidas.map((m) => m.chave).sort()).toEqual(['page:p1', 'page:p2', 'page:p3'])
    expect(r.medidas.find((m) => m.chave === 'page:p2')).toMatchObject({ comparavel: false, exclusao: 'congelada-sem-prova' })
    expect(r.qualidade?.foraDoDenominador.congeladaSemProva).toBe(1)
  })
})

describe('varredura das classes (PR15-08): o teto dos sinais ligados é declarado, nunca um corte calado', () => {
  const sinal = (i: number) => ({ tipo: 'geometria', desfecho: 'escolha-propria', postId: null, pageId: 'page-6', generationId: null, createdAt: new Date(Date.parse('2026-09-08T12:00:00Z') + i * 1000) })

  it('no teto de 2000 sinais ligados, a medida diz que olhou só esses; abaixo dele, nada é dito', async () => {
    estado.banco = criarBanco({ sinais: Array.from({ length: 2001 }, (_, i) => sinal(i)) })
    const r = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(r.avisos.join(' ')).toMatch(/2000 sinais/)
    estado.banco = criarBanco({ sinais: Array.from({ length: 1999 }, (_, i) => sinal(i)) })
    const abaixo = await medirQualidadeDaCopyDoCliente(espeto, janela, { esquema: ESQUEMA_COMPLETO, tetoMs: 1_000 })
    expect(abaixo.avisos.join(' ')).not.toMatch(/sinais/)
  })
})
