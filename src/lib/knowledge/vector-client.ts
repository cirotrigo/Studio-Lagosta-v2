/**
 * Upstash Vector Database client
 * Handles vector storage and retrieval with multi-tenant filtering
 */

import { Index } from '@upstash/vector'

// Singleton Upstash Vector index (lazy init to allow builds without env vars)
let _vectorIndex: Index | null = null

export const vectorIndex = new Proxy({} as Index, {
  get(_target, prop: string | symbol) {
    if (!_vectorIndex) {
      if (!process.env.UPSTASH_VECTOR_REST_URL) {
        throw new Error('UPSTASH_VECTOR_REST_URL is not defined')
      }

      if (!process.env.UPSTASH_VECTOR_REST_TOKEN) {
        throw new Error('UPSTASH_VECTOR_REST_TOKEN is not defined')
      }

      _vectorIndex = new Index({
        url: process.env.UPSTASH_VECTOR_REST_URL,
        token: process.env.UPSTASH_VECTOR_REST_TOKEN,
      })
    }

    return _vectorIndex[prop as keyof Index]
  },
})

/**
 * Tenant identifier for multi-tenant isolation
 */
export type TenantKey = {
  userId?: string
  workspaceId?: string
}

/**
 * Vector metadata stored with each embedding
 */
export interface VectorMetadata extends TenantKey {
  entryId: string
  ordinal: number
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
}

/**
 * Upsert vectors for knowledge base chunks
 * @param chunks Array of chunks with embeddings
 * @param tenant Tenant isolation keys
 */
export async function upsertVectors(
  chunks: Array<{
    id: string
    entryId: string
    ordinal: number
    embedding: number[]
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  }>,
  tenant: TenantKey
) {
  const vectors = chunks.map(chunk => ({
    id: chunk.id,
    vector: chunk.embedding,
    metadata: {
      entryId: chunk.entryId,
      ordinal: chunk.ordinal,
      status: chunk.status,
      userId: tenant.userId || '',
      workspaceId: tenant.workspaceId || '',
    },
  }))

  await vectorIndex.upsert(vectors as Parameters<typeof vectorIndex.upsert>[0])
}

/**
 * Query relevant vectors by semantic similarity
 * @param embedding Query embedding vector
 * @param tenant Tenant isolation keys
 * @param options Query options (topK, status filter)
 * @returns Matching vectors with scores
 */
export async function queryVectors(
  embedding: number[],
  tenant: TenantKey,
  options: {
    topK?: number
    includeStatuses?: ('ACTIVE' | 'DRAFT' | 'ARCHIVED')[]
  } = {}
) {
  const { topK = 5, includeStatuses = ['ACTIVE'] } = options

  // Build filter for multi-tenant isolation and status
  const filter: string[] = []

  if (tenant.userId) {
    filter.push(`userId = '${tenant.userId}'`)
  }

  if (tenant.workspaceId) {
    filter.push(`workspaceId = '${tenant.workspaceId}'`)
  }

  if (includeStatuses.length > 0) {
    const statusFilter = includeStatuses.map(s => `status = '${s}'`).join(' OR ')
    filter.push(`(${statusFilter})`)
  }

  const filterString = filter.length > 0 ? filter.join(' AND ') : undefined

  const results = await vectorIndex.query({
    vector: embedding,
    topK,
    includeMetadata: true,
    filter: filterString,
  })

  return results
}

/**
 * Delete vectors by entry ID
 * Used when deleting a knowledge base entry
 * @param entryId Entry ID to delete
 * @param tenant Tenant isolation keys
 */
export async function deleteVectorsByEntry(entryId: string, tenant: TenantKey) {
  // Build filter for the specific entry and tenant
  const filter: string[] = [`entryId = '${entryId}'`]

  if (tenant.userId) {
    filter.push(`userId = '${tenant.userId}'`)
  }

  if (tenant.workspaceId) {
    filter.push(`workspaceId = '${tenant.workspaceId}'`)
  }

  const filterString = filter.join(' AND ')

  // Fetch matching vectors to get their IDs
  const results = await vectorIndex.query({
    vector: new Array(1536).fill(0), // Dummy vector for fetching by filter
    topK: 1000, // Max vectors per entry
    includeMetadata: true,
    filter: filterString,
  })

  // Delete all matching vectors
  if (results.length > 0) {
    const idsToDelete = results.map(r => String(r.id))
    await vectorIndex.delete(idsToDelete)
  }
}

/**
 * Delete specific vector by chunk ID
 * @param chunkId Chunk ID (vector ID)
 */
export async function deleteVector(chunkId: string) {
  await vectorIndex.delete(chunkId)
}
