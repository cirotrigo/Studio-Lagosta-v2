/**
 * A qualidade da copy no BANCO — a leitura da semana por cliente (PR 15 de
 * "Marca simples, copy melhor", 12/09/2026). As regras moram no contrato puro
 * (`qualidade-da-copy-contrato.ts`); aqui mora só O QUE se lê e o orçamento.
 *
 * - **Só leitura, e o banco garante.** Cada cliente é lido numa transação
 *   PRÓPRIA aberta com `SET TRANSACTION READ ONLY` (`executarEmLeitura`). Uma
 *   transação só para a carteira inteira ficava ENVENENADA pelo primeiro erro
 *   tolerado — no Postgres, depois de um erro a transação só aceita o rollback,
 *   e todos os clientes seguintes saíam "erro na leitura" (C15-04).
 * - **O esquema é conferido ANTES** (`lerEsquemaDaCopy`, `information_schema`):
 *   sem `Page.copyAutoral` (PR 3) o cliente sai `indisponivel` dizendo a coluna,
 *   sem emitir a consulta que falharia; sem a tabela `BrandVoice` (PR 7) a
 *   consulta da voz nem é feita e só a versão fica de fora.
 * - 🔴 **O teto por cliente é cumprido NO SERVIDOR** (C15-03). Antes de cada
 *   consulta, o que resta do prazo do cliente vira `SET LOCAL statement_timeout`:
 *   a consulta que passa do tempo é CANCELADA pelo Postgres e a conexão volta
 *   ao pool. Abandonar a promessa (a versão anterior, com `Promise.race`)
 *   deixava a consulta rodando e segurando a ÚNICA conexão do pooler
 *   (`connection_limit=1`): o cliente seguinte e a gravação do relatório de
 *   domingo esperavam por ela.
 */

import { db } from '@/lib/db'
import {
  LIMIAR_DE_AMOSTRA,
  LIMIAR_DE_AMOSTRA_DA_CARTEIRA,
  cancelamentoPorTempo,
  faltaDeEsquema,
  medirPeca,
  medirQualidadeDaCopy,
  montarPecas,
  type ArteLida,
  type BlocoDaCopy,
  type LeituraDaSemana,
  type MedidaDaPeca,
  type QualidadeDaCopy,
} from './qualidade-da-copy-contrato'

/** O que a leitura usa do cliente Prisma — a `tx` de uma transação READ ONLY. */
export type LeitorDoBanco = Pick<typeof db, 'socialPost' | 'page' | 'itemDePlano' | 'learningSignal' | 'brandVoice' | 'project' | '$queryRaw' | '$executeRawUnsafe'>

/** Roda `fn` numa transação só de leitura própria, com teto. */
export type ExecutorDeLeitura = <T>(fn: (leitor: LeitorDoBanco) => Promise<T>, opcoes: { tetoMs: number }) => Promise<T>

/** O executor padrão: uma transação por chamada, `READ ONLY` como primeira instrução. */
export const executarEmLeitura: ExecutorDeLeitura = (fn, { tetoMs }) =>
  db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      return fn(tx)
    },
    // A folga cobre as idas do `SET LOCAL`; quem corta a consulta é o statement_timeout.
    { timeout: tetoMs + 5_000, maxWait: 10_000 },
  )

export interface JanelaDeMedida {
  inicio: Date
  fim: Date
}

export interface EsquemaDaCopy {
  /** `Page.copyAutoral` existe (PR 3). */
  copyAutoralDaPagina: boolean
  /** A tabela `BrandVoice` existe (PR 7). */
  vozDaMarca: boolean
}

/** Artes anteriores à janela entram (a peça agendada nesta semana pode ter nascido antes) — até este teto. */
const HISTORICO_DAS_ARTES_MS = 60 * 24 * 3600_000
const TETO_DE_POSTS = 500
const TETO_DE_ARTES = 2000
const TETO_DE_SINAIS = 2000
/** Teto por cliente dentro do prazo da carteira. */
export const TETO_POR_CLIENTE_MS = 25_000
/** Abaixo disto não vale começar uma consulta: ela seria cancelada antes de responder. */
const MINIMO_POR_CONSULTA_MS = 50

export class TempoEsgotado extends Error {
  constructor() {
    super('passou do teto de tempo por cliente')
    this.name = 'TempoEsgotado'
  }
}

export interface ResultadoDoCliente {
  projectId: number
  nome: string
  qualidade: QualidadeDaCopy | null
  medidas: MedidaDaPeca[]
  /** Por que a medida não saiu (esquema ausente, tempo, erro). `null` = saiu. */
  indisponivel: string | null
  /** O que saiu parcial (a voz sem a tabela do PR 7, por exemplo). */
  avisos: string[]
}

/** Confere no catálogo do Postgres o que os PRs 3 e 7 acrescentaram — sem emitir consulta que falharia. */
export async function lerEsquemaDaCopy(leitor: LeitorDoBanco): Promise<EsquemaDaCopy> {
  const colunas = await leitor.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND ((table_name = 'Page' AND column_name = 'copyAutoral') OR (table_name = 'BrandVoice' AND column_name = 'versao'))
  `
  return {
    copyAutoralDaPagina: colunas.some((c) => c.table_name === 'Page' && c.column_name === 'copyAutoral'),
    vozDaMarca: colunas.some((c) => c.table_name === 'BrandVoice'),
  }
}

/**
 * A leitura da semana de UM cliente. Antes de CADA consulta, o que resta do
 * `prazo` vira o `statement_timeout` da transação (ver o cabeçalho) — por isso
 * o leitor precisa estar dentro de uma transação (`executarEmLeitura`).
 */
export async function lerSemanaDoCliente(
  projectId: number,
  janela: JanelaDeMedida,
  opcoes: { leitor: LeitorDoBanco; esquema: EsquemaDaCopy; prazo: number; agora?: () => number },
): Promise<{ leitura: LeituraDaSemana; versaoDaVoz: number | null; avisos: string[] }> {
  const { leitor, esquema, prazo } = opcoes
  const agora = opcoes.agora ?? Date.now
  const comPrazo = async <T>(consulta: () => Promise<T>): Promise<T> => {
    const resta = Math.floor(prazo - agora())
    if (resta < MINIMO_POR_CONSULTA_MS) throw new TempoEsgotado()
    await leitor.$executeRawUnsafe(`SET LOCAL statement_timeout = ${resta}`)
    return consulta()
  }

  const avisos: string[] = []
  const vazia: LeituraDaSemana = { posts: [], artes: [], paginas: [], itens: [], sinais: [] }

  const posts = await comPrazo(() =>
    leitor.socialPost.findMany({
      where: { projectId, createdAt: { gte: janela.inicio, lt: janela.fim } },
      select: { id: true, pageId: true, generationId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: TETO_DE_POSTS,
    }),
  )
  if (posts.length === TETO_DE_POSTS) avisos.push(`mais de ${TETO_DE_POSTS} posts na janela — a medida olhou os primeiros ${TETO_DE_POSTS}`)
  if (posts.length === 0) return { leitura: vazia, versaoDaVoz: null, avisos }

  const postIds = posts.map((p) => p.id)
  const genIds = [...new Set(posts.map((p) => p.generationId).filter((x): x is string => !!x))]
  const pageIdsDosPosts = [...new Set(posts.map((p) => p.pageId).filter((x): x is string => !!x))]
  const desde = new Date(janela.inicio.getTime() - HISTORICO_DAS_ARTES_MS)

  // Json sem índice: só as chaves que a medida usa (o `layersSnapshot` e a spec
  // não viajam). Id da arte OU página da arte — é a deduplicação por página.
  const artes = await comPrazo(
    () => leitor.$queryRaw<Array<Omit<ArteLida, 'createdAt'> & { createdAt: Date }>>`
      SELECT id, "createdAt", canal,
        "fieldValues"->>'pageId' AS "pageId",
        "fieldValues"->>'source' AS source,
        "fieldValues"->'copyAutoral' AS "copyAutoral",
        "fieldValues"->'revisao' AS revisao,
        "fieldValues"->'ajustes' AS ajustes,
        "fieldValues"->'composicao'->'avisos' AS avisos,
        "fieldValues"->'recomposicao' AS recomposicao,
        "fieldValues"->'vozNaEscrita' AS "vozNaEscrita",
        "fieldValues"->>'modo' AS modo
      FROM "Generation"
      WHERE "projectId" = ${projectId}
        AND "createdAt" >= ${desde}
        AND (id = ANY(${genIds}::text[]) OR "fieldValues"->>'pageId' = ANY(${pageIdsDosPosts}::text[]))
      ORDER BY "createdAt" ASC
      LIMIT ${TETO_DE_ARTES}
    `,
  )
  if (artes.length === TETO_DE_ARTES) avisos.push(`mais de ${TETO_DE_ARTES} artes ligadas — a medida olhou as primeiras`)

  const pageIds = [...new Set([...pageIdsDosPosts, ...artes.filter((a) => genIds.includes(a.id) && a.pageId).map((a) => a.pageId as string)])]
  const arteIds = artes.map((a) => a.id)
  const ligado = { OR: [{ postId: { in: postIds } }, { pageId: { in: pageIds } }, { generationId: { in: arteIds } }] }

  // Em série: numa transação as consultas dividem UMA conexão, e cada uma leva o próprio prazo.
  const paginas = pageIds.length
    ? await comPrazo(() => leitor.page.findMany({ where: { id: { in: pageIds } }, select: { id: true, copyAutoral: true, layers: true } }))
    : []
  const itens = await comPrazo(() =>
    leitor.itemDePlano.findMany({ where: { projectId, ...ligado }, select: { id: true, postId: true, pageId: true, generationId: true, createdAt: true } }),
  )
  const sinais = await comPrazo(() =>
    leitor.learningSignal.findMany({
      where: { projectId, tipo: { in: ['troca-de-arte', 'geometria', 'foto'] }, ...ligado },
      select: { tipo: true, desfecho: true, postId: true, pageId: true, generationId: true },
      take: TETO_DE_SINAIS,
    }),
  )

  let versaoDaVoz: number | null = null
  if (esquema.vozDaMarca) {
    const voz = await comPrazo(() => leitor.brandVoice.findUnique({ where: { projectId }, select: { versao: true, migradaEm: true } }))
    // "Na versão atual" só faz sentido com a voz VALENDO (cliente migrado).
    versaoDaVoz = voz?.migradaEm ? voz.versao : null
  } else {
    avisos.push('voz sem versão: a tabela BrandVoice não existe neste banco (migration do PR 7)')
  }

  return { leitura: { posts, artes, paginas, itens, sinais }, versaoDaVoz, avisos }
}

export async function medirQualidadeDaCopyDoCliente(
  cliente: { projectId: number; nome: string },
  janela: JanelaDeMedida,
  opcoes: { esquema: EsquemaDaCopy; tetoMs?: number; executar?: ExecutorDeLeitura; agora?: () => number },
): Promise<ResultadoDoCliente> {
  const agora = opcoes.agora ?? Date.now
  const tetoMs = opcoes.tetoMs ?? TETO_POR_CLIENTE_MS
  const executar = opcoes.executar ?? executarEmLeitura
  if (!opcoes.esquema.copyAutoralDaPagina) {
    return { ...cliente, qualidade: null, medidas: [], indisponivel: 'o esquema do contrato da copy (PR 3) não está neste banco — coluna ausente: Page.copyAutoral', avisos: [] }
  }
  const prazo = agora() + tetoMs
  try {
    const { leitura, versaoDaVoz, avisos } = await executar(
      (leitor) => lerSemanaDoCliente(cliente.projectId, janela, { leitor, esquema: opcoes.esquema, prazo, agora }),
      { tetoMs },
    )
    const medidas = montarPecas(leitura).map(medirPeca)
    return {
      ...cliente,
      qualidade: medirQualidadeDaCopy(medidas, { limiar: LIMIAR_DE_AMOSTRA, versaoDaVozAtual: versaoDaVoz }),
      medidas,
      indisponivel: null,
      avisos,
    }
  } catch (erro) {
    if (erro instanceof TempoEsgotado || cancelamentoPorTempo(erro)) {
      return { ...cliente, qualidade: null, medidas: [], indisponivel: 'passou do teto de tempo por cliente', avisos: [] }
    }
    const falta = faltaDeEsquema(erro)
    if (falta) {
      return { ...cliente, qualidade: null, medidas: [], indisponivel: `o esquema do contrato da copy (PRs 3/7) não está neste banco — ${falta}`, avisos: [] }
    }
    console.error(`[qualidade-da-copy] projeto ${cliente.projectId} falhou (seguindo sem ele):`, erro)
    return { ...cliente, qualidade: null, medidas: [], indisponivel: `erro na leitura: ${erro instanceof Error ? erro.message.slice(0, 120) : String(erro)}`, avisos: [] }
  }
}

export interface QualidadeDaCarteira {
  porCliente: Map<number, ResultadoDoCliente>
  carteira: QualidadeDaCopy | null
  bloco: BlocoDaCopy
}

/**
 * A carteira inteira, cliente a cliente, dentro de um PRAZO absoluto (epoch
 * ms). Cliente que não cabe no que resta sai em `foraDoOrcamento`; cliente que
 * estoura o teto tem a consulta CANCELADA no servidor e sai `indisponivel`.
 */
export async function medirQualidadeDaCarteira(
  clientes: Array<{ projectId: number; nome: string }>,
  janela: JanelaDeMedida,
  opcoes: { prazo: number; tetoPorClienteMs?: number; executar?: ExecutorDeLeitura; agora?: () => number; esquema?: EsquemaDaCopy },
): Promise<QualidadeDaCarteira> {
  const agora = opcoes.agora ?? Date.now
  const teto = opcoes.tetoPorClienteMs ?? TETO_POR_CLIENTE_MS
  const executar = opcoes.executar ?? executarEmLeitura
  const porCliente = new Map<number, ResultadoDoCliente>()
  const bloco: BlocoDaCopy = { carteira: null, indisponiveis: [], foraDoOrcamento: [] }
  const todas: MedidaDaPeca[] = []

  let esquema = opcoes.esquema ?? null
  if (!esquema && clientes.length > 0) {
    try {
      esquema = await executar((leitor) => lerEsquemaDaCopy(leitor), { tetoMs: 10_000 })
    } catch (erro) {
      const motivo = `não deu para conferir o esquema: ${erro instanceof Error ? erro.message.slice(0, 120) : String(erro)}`
      for (const c of clientes) bloco.indisponiveis.push({ nome: c.nome, motivo })
      return { porCliente, carteira: null, bloco }
    }
  }

  for (const c of clientes) {
    const resta = opcoes.prazo - agora()
    // Um cliente só começa se sobrar ao menos um terço do teto: começar sem
    // tempo é gastar uma consulta que vai ser cancelada.
    if (resta < teto / 3) {
      bloco.foraDoOrcamento.push(c.nome)
      continue
    }
    const resultado = await medirQualidadeDaCopyDoCliente(c, janela, { esquema: esquema!, tetoMs: Math.min(teto, resta), executar, agora })
    porCliente.set(c.projectId, resultado)
    if (resultado.indisponivel) bloco.indisponiveis.push({ nome: c.nome, motivo: resultado.indisponivel })
    todas.push(...resultado.medidas)
  }

  const carteira = todas.length ? medirQualidadeDaCopy(todas, { limiar: LIMIAR_DE_AMOSTRA_DA_CARTEIRA }) : null
  bloco.carteira = carteira
  return { porCliente, carteira, bloco }
}
