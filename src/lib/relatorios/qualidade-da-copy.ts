/**
 * A qualidade da copy no BANCO — a leitura da semana por cliente (PR 15 de
 * "Marca simples, copy melhor", 12/09/2026). As regras moram no contrato puro
 * (`qualidade-da-copy-contrato.ts`); aqui mora só O QUE se lê e o orçamento.
 *
 * - **Só leitura.** Nada aqui escreve; o leitor pode ser uma transação
 *   `READ ONLY` (é o que o script de medida faz).
 * - **Esquema ausente degrada, nunca derruba.** Num banco sem a migration do
 *   PR 3 (`Page.copyAutoral`) a leitura das páginas falha com P2022; a medida
 *   do cliente sai `indisponivel` DIZENDO o que falta, e o relatório segue.
 *   Sem a tabela do PR 7 (`BrandVoice`), só a parte da voz fica sem versão.
 * - **Orçamento de tempo.** O cron do relatório tem 300 s e a coleta de
 *   métricas antes dele já consome parte; a carteira inteira recebe um PRAZO
 *   absoluto e um teto por cliente. Quem não coube sai em `foraDoOrcamento`,
 *   nunca some.
 */

import { db } from '@/lib/db'
import {
  LIMIAR_DE_AMOSTRA,
  LIMIAR_DE_AMOSTRA_DA_CARTEIRA,
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

/** O que a leitura usa do cliente Prisma — `db` ou a `tx` de uma transação READ ONLY. */
export type LeitorDoBanco = Pick<typeof db, 'socialPost' | 'page' | 'itemDePlano' | 'learningSignal' | 'brandVoice' | '$queryRaw'>

export interface JanelaDeMedida {
  inicio: Date
  fim: Date
}

/** Artes anteriores à janela entram (a peça agendada nesta semana pode ter nascido antes) — até este teto. */
const HISTORICO_DAS_ARTES_MS = 60 * 24 * 3600_000
const TETO_DE_POSTS = 500
const TETO_DE_ARTES = 2000
const TETO_DE_SINAIS = 2000
/** Teto por cliente dentro do prazo da carteira. */
export const TETO_POR_CLIENTE_MS = 25_000

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

export async function lerSemanaDoCliente(
  projectId: number,
  janela: JanelaDeMedida,
  leitor: LeitorDoBanco = db,
): Promise<{ leitura: LeituraDaSemana; versaoDaVoz: number | null; avisos: string[] }> {
  const avisos: string[] = []
  const vazia: LeituraDaSemana = { posts: [], artes: [], paginas: [], itens: [], sinais: [] }

  const posts = await leitor.socialPost.findMany({
    where: { projectId, createdAt: { gte: janela.inicio, lt: janela.fim } },
    select: { id: true, pageId: true, generationId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: TETO_DE_POSTS,
  })
  if (posts.length === TETO_DE_POSTS) avisos.push(`mais de ${TETO_DE_POSTS} posts na janela — a medida olhou os primeiros ${TETO_DE_POSTS}`)
  if (posts.length === 0) return { leitura: vazia, versaoDaVoz: null, avisos }

  const postIds = posts.map((p) => p.id)
  const genIds = [...new Set(posts.map((p) => p.generationId).filter((x): x is string => !!x))]
  const pageIdsDosPosts = [...new Set(posts.map((p) => p.pageId).filter((x): x is string => !!x))]
  const desde = new Date(janela.inicio.getTime() - HISTORICO_DAS_ARTES_MS)

  // Json sem índice: só as chaves que a medida usa (o `layersSnapshot` e a spec
  // não viajam). Id da arte OU página da arte — é a deduplicação por página.
  const artes = await leitor.$queryRaw<Array<Omit<ArteLida, 'createdAt'> & { createdAt: Date }>>`
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
  `
  if (artes.length === TETO_DE_ARTES) avisos.push(`mais de ${TETO_DE_ARTES} artes ligadas — a medida olhou as primeiras`)

  const pageIds = [...new Set([...pageIdsDosPosts, ...artes.filter((a) => genIds.includes(a.id) && a.pageId).map((a) => a.pageId as string)])]
  const arteIds = artes.map((a) => a.id)
  const ligado = { OR: [{ postId: { in: postIds } }, { pageId: { in: pageIds } }, { generationId: { in: arteIds } }] }

  const [paginas, itens, sinais] = await Promise.all([
    // `copyAutoral` é a coluna do PR 3: sem ela, P2022 — tratado por quem chama.
    pageIds.length ? leitor.page.findMany({ where: { id: { in: pageIds } }, select: { id: true, copyAutoral: true, layers: true } }) : Promise.resolve([]),
    leitor.itemDePlano.findMany({ where: { projectId, ...ligado }, select: { id: true, postId: true, pageId: true, generationId: true, createdAt: true } }),
    leitor.learningSignal.findMany({
      where: { projectId, tipo: { in: ['troca-de-arte', 'geometria', 'foto'] }, ...ligado },
      select: { tipo: true, desfecho: true, postId: true, pageId: true, generationId: true },
      take: TETO_DE_SINAIS,
    }),
  ])

  let versaoDaVoz: number | null = null
  try {
    const voz = await leitor.brandVoice.findUnique({ where: { projectId }, select: { versao: true, migradaEm: true } })
    // "Na versão atual" só faz sentido com a voz VALENDO (cliente migrado).
    versaoDaVoz = voz?.migradaEm ? voz.versao : null
  } catch (erro) {
    const falta = faltaDeEsquema(erro)
    if (!falta) throw erro
    avisos.push(`voz sem versão: ${falta} (migration do PR 7)`)
  }

  return { leitura: { posts, artes, paginas, itens, sinais }, versaoDaVoz, avisos }
}

export async function medirQualidadeDaCopyDoCliente(
  cliente: { projectId: number; nome: string },
  janela: JanelaDeMedida,
  leitor: LeitorDoBanco = db,
): Promise<ResultadoDoCliente> {
  try {
    const { leitura, versaoDaVoz, avisos } = await lerSemanaDoCliente(cliente.projectId, janela, leitor)
    const medidas = montarPecas(leitura).map(medirPeca)
    return {
      ...cliente,
      qualidade: medirQualidadeDaCopy(medidas, { limiar: LIMIAR_DE_AMOSTRA, versaoDaVozAtual: versaoDaVoz }),
      medidas,
      indisponivel: null,
      avisos,
    }
  } catch (erro) {
    const falta = faltaDeEsquema(erro)
    if (falta) {
      return { ...cliente, qualidade: null, medidas: [], indisponivel: `o esquema do contrato da copy (PRs 3/7) não está neste banco — ${falta}`, avisos: [] }
    }
    console.error(`[qualidade-da-copy] projeto ${cliente.projectId} falhou (seguindo sem ele):`, erro)
    return { ...cliente, qualidade: null, medidas: [], indisponivel: `erro na leitura: ${erro instanceof Error ? erro.message.slice(0, 120) : String(erro)}`, avisos: [] }
  }
}

const ESGOTOU = Symbol('esgotou')

async function comTeto<T>(promessa: Promise<T>, ms: number): Promise<T | typeof ESGOTOU> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promessa, new Promise<typeof ESGOTOU>((resolve) => (timer = setTimeout(() => resolve(ESGOTOU), ms)))])
  } finally {
    if (timer) clearTimeout(timer)
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
 * estoura o teto sai `indisponivel` (a consulta não é cancelada — só deixa de
 * ser esperada).
 */
export async function medirQualidadeDaCarteira(
  clientes: Array<{ projectId: number; nome: string }>,
  janela: JanelaDeMedida,
  opcoes: { prazo: number; tetoPorClienteMs?: number; leitor?: LeitorDoBanco; agora?: () => number },
): Promise<QualidadeDaCarteira> {
  const agora = opcoes.agora ?? Date.now
  const teto = opcoes.tetoPorClienteMs ?? TETO_POR_CLIENTE_MS
  const porCliente = new Map<number, ResultadoDoCliente>()
  const bloco: BlocoDaCopy = { carteira: null, indisponiveis: [], foraDoOrcamento: [] }
  const todas: MedidaDaPeca[] = []

  for (const c of clientes) {
    const resta = opcoes.prazo - agora()
    // Um cliente só começa se sobrar ao menos um terço do teto: começar sem
    // tempo é esperar um resultado que vai ser descartado.
    if (resta < teto / 3) {
      bloco.foraDoOrcamento.push(c.nome)
      continue
    }
    const r = await comTeto(medirQualidadeDaCopyDoCliente(c, janela, opcoes.leitor), Math.min(teto, resta))
    const resultado: ResultadoDoCliente = r === ESGOTOU ? { ...c, qualidade: null, medidas: [], indisponivel: 'passou do teto de tempo por cliente', avisos: [] } : r
    porCliente.set(c.projectId, resultado)
    if (resultado.indisponivel) bloco.indisponiveis.push({ nome: c.nome, motivo: resultado.indisponivel })
    todas.push(...resultado.medidas)
  }

  const carteira = todas.length ? medirQualidadeDaCopy(todas, { limiar: LIMIAR_DE_AMOSTRA_DA_CARTEIRA }) : null
  bloco.carteira = carteira
  return { porCliente, carteira, bloco }
}
