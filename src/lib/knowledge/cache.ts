/**
 * Redis cache for RAG query results
 * Uses Upstash Redis for serverless-friendly caching
 */

import type { SearchResult } from './search'
import type { Redis } from '@upstash/redis'

// Redis client singleton (lazy loaded)
let redisClient: Redis | null = null

async function getRedisClient() {
  if (redisClient) {
    return redisClient
  }

  // Only initialize if credentials are available
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!redisUrl || !redisToken) {
    console.warn('[cache] Upstash Redis not configured. Caching disabled.')
    return null
  }

  const { Redis } = await import('@upstash/redis')
  redisClient = new Redis({
    url: redisUrl,
    token: redisToken,
  })

  return redisClient
}

/**
 * Gera chave de cache para uma query RAG
 */
function getCacheKey(query: string, projectId: number, category?: string): string {
  const normalized = query.trim().toLowerCase()
  const hash = simpleHash(normalized)
  const categoryPart = category ? `:${category}` : ''
  return `rag:${projectId}${categoryPart}:${hash}`
}

/**
 * Gera padrão para invalidação de cache por projeto
 */
function getProjectCachePattern(projectId: number): string {
  return `rag:${projectId}:*`
}

/**
 * Hash simples para query (para evitar chaves muito longas)
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Busca resultados no cache
 * @param query Query do usuário
 * @param projectId ID do projeto
 * @param category Categoria opcional para segmentação
 * @returns Resultados cacheados ou null
 */
export async function getCachedResults(
  query: string,
  projectId: number,
  category?: string
): Promise<SearchResult[] | null> {
  const redis = await getRedisClient()
  if (!redis) return null

  try {
    const key = getCacheKey(query, projectId, category)
    const cached = await redis.get(key)

    if (!cached) {
      return null
    }

    // Upstash Redis já retorna dados parseados automaticamente
    // Só fazer parse se for string
    let results: SearchResult[]
    if (typeof cached === 'string') {
      results = JSON.parse(cached) as SearchResult[]
    } else {
      results = cached as SearchResult[]
    }

    if (!Array.isArray(results)) {
      console.warn('[cache] Invalid cached data structure, clearing bad cache')
      await redis.del(key)
      return null
    }

    console.log(`[cache] HIT - ${key}`)
    return results
  } catch (error) {
    console.error('[cache] Error getting cached results:', error)
    return null
  }
}

/**
 * Armazena resultados no cache
 * @param query Query do usuário
 * @param projectId ID do projeto
 * @param results Resultados da busca
 * @param category Categoria opcional
 * @param ttlSeconds TTL em segundos (padrão: 5 minutos)
 */
export async function setCachedResults(
  query: string,
  projectId: number,
  results: SearchResult[],
  category?: string,
  ttlSeconds: number = 300 // 5 minutos
): Promise<void> {
  const redis = await getRedisClient()
  if (!redis) return

  try {
    const key = getCacheKey(query, projectId, category)
    await redis.set(key, JSON.stringify(results), { ex: ttlSeconds })

    console.log(`[cache] SET - ${key} (TTL: ${ttlSeconds}s)`)
  } catch (error) {
    console.error('[cache] Error setting cached results:', error)
  }
}

/**
 * Invalida cache para um projeto específico
 * Usa SCAN para evitar bloqueio do Redis
 * @param projectId ID do projeto
 * @returns Número de chaves deletadas
 */
export async function invalidateProjectCache(projectId: number): Promise<number> {
  const redis = await getRedisClient()
  if (!redis) return 0

  try {
    const pattern = getProjectCachePattern(projectId)
    let cursor: string | number = 0
    let deletedCount = 0
    const batchSize = 100

    console.log(`[cache] Invalidating cache for project ${projectId} (pattern: ${pattern})`)

    do {
      // SCAN retorna [nextCursor, keys]
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: batchSize,
      })

      cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor

      if (keys.length > 0) {
        // Deletar em batch
        await redis.del(...keys)
        deletedCount += keys.length
      }
    } while (cursor !== 0)

    console.log(`[cache] Invalidated ${deletedCount} keys for project ${projectId}`)
    return deletedCount
  } catch (error) {
    console.error('[cache] Error invalidating project cache:', error)
    return 0
  }
}

/**
 * Invalida cache para uma categoria específica de um projeto
 * @param projectId ID do projeto
 * @param category Categoria da base de conhecimento
 * @returns Número de chaves deletadas
 */
export async function invalidateCategoryCache(projectId: number, category: string): Promise<number> {
  const redis = await getRedisClient()
  if (!redis) return 0

  try {
    const pattern = `rag:${projectId}:${category}:*`
    let cursor: string | number = 0
    let deletedCount = 0
    const batchSize = 100

    console.log(`[cache] Invalidating cache for project ${projectId} category ${category} (pattern: ${pattern})`)

    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: batchSize,
      })

      cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor

      if (keys.length > 0) {
        await redis.del(...keys)
        deletedCount += keys.length
      }
    } while (cursor !== 0)

    console.log(`[cache] Invalidated ${deletedCount} keys for project ${projectId} category ${category}`)
    return deletedCount
  } catch (error) {
    console.error('[cache] Error invalidating category cache:', error)
    return 0
  }
}

/**
 * Limpa todo o cache (usar com cuidado!)
 * @returns Número de chaves deletadas
 */
export async function clearAllCache(): Promise<number> {
  const redis = await getRedisClient()
  if (!redis) return 0

  try {
    const pattern = 'rag:*'
    let cursor: string | number = 0
    let deletedCount = 0
    const batchSize = 100

    console.log('[cache] CLEARING ALL CACHE (pattern: rag:*)')

    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: batchSize,
      })

      cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor

      if (keys.length > 0) {
        await redis.del(...keys)
        deletedCount += keys.length
      }
    } while (cursor !== 0)

    console.log(`[cache] Cleared ${deletedCount} total cache keys`)
    return deletedCount
  } catch (error) {
    console.error('[cache] Error clearing cache:', error)
    return 0
  }
}
