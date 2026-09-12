/**
 * Upstash Vector Database client
 * Handles vector storage and retrieval with multi-tenant filtering
 */

import { Index } from '@upstash/vector'
import { lancarSeAbortado } from './aborto'

type VectorStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED'

/**
 * Tenant identifier for project isolation (project is mandatory)
 */
export type TenantKey = {
  projectId: number
  // Deprecated: kept during migration for backward compatibility metadata
  userId?: string
  workspaceId?: string
}

/**
 * Vector metadata stored with each embedding
 */
export interface VectorMetadata extends TenantKey {
  entryId: string
  ordinal: number
  category: string
  status: VectorStatus
}

let _vectorIndex: Index | null = null

function credenciaisDoIndice(): { url: string; token: string } {
  if (!process.env.UPSTASH_VECTOR_REST_URL) {
    throw new Error('UPSTASH_VECTOR_REST_URL is not defined')
  }

  if (!process.env.UPSTASH_VECTOR_REST_TOKEN) {
    throw new Error('UPSTASH_VECTOR_REST_TOKEN is not defined')
  }

  return { url: process.env.UPSTASH_VECTOR_REST_URL, token: process.env.UPSTASH_VECTOR_REST_TOKEN }
}

export function getVectorClient(): Index {
  if (!_vectorIndex) {
    _vectorIndex = new Index(credenciaisDoIndice())
  }

  return _vectorIndex
}

/**
 * Um cliente cujas requisições são ABORTADAS com o sinal (PR13-41): a escrita
 * que passa do prazo do passo é cancelada em vez de terminar depois de outra
 * execução já ter tomado a entrada. O singleton não serve — o sinal é da config.
 */
function clienteComSinal(signal: AbortSignal | undefined): Index {
  return signal ? new Index({ ...credenciaisDoIndice(), signal }) : getVectorClient()
}

/**
 * Upsert vectors for knowledge base chunks
 * @param vectors Array of vectors with metadata (must include projectId)
 */
export async function upsertVectors(
  vectors: Array<{
    id: string
    vector: number[]
    metadata: VectorMetadata
  }>,
  opcoes: { signal?: AbortSignal } = {}
) {
  const index = clienteComSinal(opcoes.signal)

  for (const vec of vectors) {
    if (!vec.metadata.projectId) {
      throw new Error(`Vector ${vec.id} missing required projectId`)
    }
    if (!vec.metadata.category) {
      throw new Error(`Vector ${vec.id} missing required category`)
    }
  }

  // Type assertion needed because VectorMetadata has stricter types than Index expects
  await index.upsert(vectors as unknown as Parameters<Index['upsert']>[0])
}

/**
 * Query relevant vectors by semantic similarity
 * @param embedding Query embedding vector
 * @param tenant Tenant isolation keys (requires projectId)
 * @param options Query options (topK, status filter, category filter)
 * @returns Matching vectors with scores
 */
export async function queryVectors(
  embedding: number[],
  tenant: TenantKey,
  options: {
    topK?: number
    includeStatuses?: VectorStatus[]
    category?: string
  } = {}
) {
  const { topK = 5, includeStatuses = ['ACTIVE'], category } = options

  if (!tenant?.projectId) {
    throw new Error('projectId is required for vector queries')
  }

  const filter: string[] = [`projectId = ${tenant.projectId}`]

  if (includeStatuses.length > 0) {
    const statusFilter = includeStatuses.map(s => `status = '${s}'`).join(' OR ')
    filter.push(`(${statusFilter})`)
  }

  if (category) {
    filter.push(`category = '${category}'`)
  }

  const filterString = filter.join(' AND ')

  const index = getVectorClient()
  const results = await index.query({
    vector: embedding,
    topK,
    includeMetadata: true,
    filter: filterString,
  })

  return results.map(result => ({
    id: String(result.id),
    score: result.score,
    metadata: result.metadata as unknown as VectorMetadata,
  }))
}

/**
 * Delete vectors by entry ID and project
 * Used when deleting a knowledge base entry
 * @param entryId Entry ID to delete
 * @param tenant Tenant isolation keys (requires projectId)
 * @returns Number of vectors deleted
 */
/**
 * `opcoes.signal`: aborto cooperativo (PR13-20/22) — conferido DEPOIS da consulta
 * e ANTES do `index.delete`: quem perdeu a posse externa não pode apagar vetores
 * que outra aplicação já recuperou. O mesmo sinal cancela a requisição do delete.
 *
 * `opcoes.antesDeApagar` (PR13-41): roda entre a consulta dos ids e o delete —
 * é onde a reindexação RENOVA o arrendamento da entrada. A consulta pode ter
 * esperado o bastante para o arrendamento vencer e outra execução recuperar os
 * MESMOS ids; renovação que falha lança, e o delete não começa.
 */
export async function deleteVectorsByEntry(
  entryId: string,
  tenant: TenantKey,
  opcoes: { signal?: AbortSignal; antesDeApagar?: () => Promise<void> } = {}
): Promise<number> {
  if (!tenant?.projectId) {
    throw new Error('projectId is required to delete vectors')
  }

  const filter = [`entryId = '${entryId}'`, `projectId = ${tenant.projectId}`].join(' AND ')
  const index = getVectorClient()

  const results = await index.query({
    vector: new Array(1536).fill(0), // Dummy vector for fetching by filter
    topK: 1000, // Max vectors per entry
    includeMetadata: true,
    filter,
  })

  if (results.length > 0) {
    const idsToDelete = results.map(r => String(r.id))
    lancarSeAbortado(opcoes.signal, 'apagar vetores')
    if (opcoes.antesDeApagar) {
      await opcoes.antesDeApagar()
      lancarSeAbortado(opcoes.signal, 'apagar vetores')
    }
    await clienteComSinal(opcoes.signal).delete(idsToDelete)
    // Abortada no meio, a resposta do cliente não prova nada: quem chamou precisa saber que o delete ficou incerto.
    lancarSeAbortado(opcoes.signal, 'confirmar a exclusão de vetores')
    return results.length
  }

  return 0
}

/**
 * Delete specific vector by chunk ID
 * @param chunkId Chunk ID (vector ID)
 */
export async function deleteVector(chunkId: string) {
  const index = getVectorClient()
  await index.delete(chunkId)
}
