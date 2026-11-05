/**
 * Leitura do branch de DESENVOLVIMENTO para o `--fotos` (contrato § 3.2 e § 3.5). Só SELECT, numa transação que começa por
 * `SET TRANSACTION READ ONLY` (o Postgres recusa qualquer escrita depois dela). Não importa `@/lib/db`: recebe o `tx` de quem
 * abriu a conexão (a casca, depois da guarda `recusaDoExportador`) — por isso o teste usa um `tx` falso que grava as chamadas.
 *
 * Janela e status NÃO entram no SQL: a seleção pura (`selecao-de-fotos.ts`) decide e conta cada descarte.
 */
import type { PostLido, ProvaLida } from './selecao-de-fotos'

export interface TxSomenteLeitura {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<unknown>
  $queryRawUnsafe<T = unknown>(sql: string, ...valores: unknown[]): Promise<T>
}

export const MIGRACAO_DA_PROVA = '20261012120000_post_render_proof'

export const SQL_SOMENTE_LEITURA = 'SET TRANSACTION READ ONLY'
export const SQL_TABELA_DA_PROVA = `SELECT to_regclass('public."PostRenderProof"') IS NOT NULL AS existe`
export const SQL_TABELA_DE_MIGRACOES = `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS existe`
export const SQL_MIGRACAO_DA_PROVA = `SELECT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS registrada`
export const SQL_MARCADOR = `SELECT (SELECT COUNT(*)::int FROM "PostRenderProof") AS provas, (SELECT MIN("createdAt") FROM "PostRenderProof") AS "provaMaisAntiga", (SELECT MAX("createdAt") FROM "PostRenderProof") AS "provaMaisRecente", (SELECT MAX("updatedAt") FROM "SocialPost") AS "postMaisRecente"`
export const SQL_POSTS = `SELECT sp.id, sp.status::text AS status, sp."postType"::text AS "postType", sp."mediaUrls", sp."pageId", sp."sentAt", sp."latePublishedAt", sp."scheduledDatetime", sp."createdAt", COALESCE(json_agg(json_build_object('mediaUrl', pr."mediaUrl", 'proofVersion', pr."proofVersion", 'createdAt', pr."createdAt", 'layersSnapshot', pr."layersSnapshot") ORDER BY pr."mediaUrl") FILTER (WHERE pr."postId" IS NOT NULL), '[]'::json) AS provas FROM "SocialPost" sp LEFT JOIN "PostRenderProof" pr ON pr."postId" = sp.id WHERE sp."projectId" = $1 AND sp."postType" = 'STORY' AND sp."createdAt" < $2 GROUP BY sp.id`

/** Toda string de SQL que este módulo envia — o teste confere que nenhuma escreve. */
export const SQL_DO_MODULO = [SQL_SOMENTE_LEITURA, SQL_TABELA_DA_PROVA, SQL_TABELA_DE_MIGRACOES, SQL_MIGRACAO_DA_PROVA, SQL_MARCADOR, SQL_POSTS]

export interface MarcadorDoSnapshot {
  rotulo: 'estimado pelo dado mais recente do branch (a idade real é a de db:dev:status)'
  provas: number
  provaMaisAntiga: string | null
  provaMaisRecente: string | null
  postMaisRecente: string | null
}
export type LeituraDoBranch =
  | { recusa: string[]; causa: 'indeterminada' }
  | { marcador: MarcadorDoSnapshot; postsPorCliente: Map<number, PostLido[]> }

const aData = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'string') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}
const aIso = (v: unknown) => aData(v)?.toISOString() ?? null

/** Lê os sinais, o marcador e os posts de cada cliente. Sinal ausente = recusa com o(s) sinal(is) exatos, causa indeterminada. */
export async function lerDoBranch(tx: TxSomenteLeitura, clientes: readonly number[], ate: Date): Promise<LeituraDoBranch> {
  await tx.$executeRawUnsafe(SQL_SOMENTE_LEITURA)
  const recusa: string[] = []
  const [tabela] = await tx.$queryRawUnsafe<Array<{ existe: boolean }>>(SQL_TABELA_DA_PROVA)
  if (!tabela?.existe) recusa.push('tabela PostRenderProof ausente')
  const [migracoes] = await tx.$queryRawUnsafe<Array<{ existe: boolean }>>(SQL_TABELA_DE_MIGRACOES)
  let registrada = false
  if (migracoes?.existe) {
    const [m] = await tx.$queryRawUnsafe<Array<{ registrada: boolean }>>(SQL_MIGRACAO_DA_PROVA, MIGRACAO_DA_PROVA)
    registrada = Boolean(m?.registrada)
  }
  if (!registrada) recusa.push(`migração ${MIGRACAO_DA_PROVA} não registrada em _prisma_migrations`)
  if (recusa.length > 0) return { recusa, causa: 'indeterminada' }

  const [m] = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(SQL_MARCADOR)
  const marcador: MarcadorDoSnapshot = {
    rotulo: 'estimado pelo dado mais recente do branch (a idade real é a de db:dev:status)',
    provas: Number(m?.provas ?? 0),
    provaMaisAntiga: aIso(m?.provaMaisAntiga),
    provaMaisRecente: aIso(m?.provaMaisRecente),
    postMaisRecente: aIso(m?.postMaisRecente),
  }
  const postsPorCliente = new Map<number, PostLido[]>()
  for (const cliente of clientes) {
    const linhas = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(SQL_POSTS, cliente, ate)
    postsPorCliente.set(cliente, linhas.map(paraPostLido))
  }
  return { marcador, postsPorCliente }
}

export function paraPostLido(l: Record<string, unknown>): PostLido {
  const provasBrutas = typeof l.provas === 'string' ? (JSON.parse(l.provas) as unknown) : l.provas
  const provas: ProvaLida[] = (Array.isArray(provasBrutas) ? provasBrutas : []).map((p: Record<string, unknown>) => ({
    mediaUrl: String(p.mediaUrl),
    proofVersion: p.proofVersion,
    createdAt: aData(p.createdAt),
    layersSnapshot: p.layersSnapshot,
  }))
  return {
    id: String(l.id),
    status: String(l.status),
    postType: String(l.postType),
    mediaUrls: Array.isArray(l.mediaUrls) ? l.mediaUrls.map(String) : [],
    pageId: typeof l.pageId === 'string' ? l.pageId : null,
    sentAt: aData(l.sentAt),
    latePublishedAt: aData(l.latePublishedAt),
    scheduledDatetime: aData(l.scheduledDatetime),
    createdAt: aData(l.createdAt),
    provas,
  }
}
