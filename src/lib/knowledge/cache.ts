/**
 * Redis cache for RAG query results
 * Uses Upstash Redis for serverless-friendly caching
 */

import type { SearchResult } from './search'
import type { Redis } from '@upstash/redis'
import { createHash } from 'crypto'

// Redis client singleton (lazy loaded)
let redisClient: Redis | null = null
let missingCredentialsWarned = false

type CacheKeyOptions = {
  category?: string
  topK?: number
  minScore?: number
  includeEntryMetadata?: boolean
}

type CachedPayload = {
  v: number
  t: number
  results: SearchResult[]
}

const CACHE_PREFIX = 'rag'
const CACHE_VERSION_PREFIX = 'rag:ver'

const CACHE_DEBUG =
  process.env.RAG_CACHE_DEBUG === '1' ||
  process.env.RAG_CACHE_DEBUG === 'true' ||
  process.env.RAG_CACHE_DEBUG === 'yes'

const CACHE_LOG_SAMPLE_RATE = (() => {
  const raw = process.env.RAG_CACHE_LOG_SAMPLE_RATE
  if (!raw) return CACHE_DEBUG ? 1 : 0
  const n = Number(raw)
  if (!Number.isFinite(n)) return CACHE_DEBUG ? 1 : 0
  return Math.min(1, Math.max(0, n))
})()

function shouldLogCacheEvent() {
  if (CACHE_DEBUG) return true
  return Math.random() < CACHE_LOG_SAMPLE_RATE
}

function logCache(event: string, details?: Record<string, unknown>) {
  if (!shouldLogCacheEvent()) return
  if (details) {
    console.log(`[cache] ${event}`, details)
  } else {
    console.log(`[cache] ${event}`)
  }
}

/**
 * Disjuntor do backend de cache.
 *
 * O Upstash responde **HTTP 200 com `{"error": ...}` no corpo** quando o banco
 * está suspenso, com rate limit da conta ou credencial inválida. O client só
 * lança em resposta não-2xx, então esse envelope de erro chega inteiro ao
 * auto-pipeline (ligado por padrão desde o @upstash/redis 1.x), que faz
 * `res.map(...)` sobre um objeto e estoura `TypeError: res.map is not a function`.
 *
 * Como o erro é capturado e logado, nada quebra — mas o cache NUNCA acerta e
 * toda busca na base paga a ida ao servidor mais duas linhas de erro. Medido em
 * 11/08/2026 contra o banco rate-limited: ~600ms por busca em regime, ~1,9s a
 * frio. Cache que nunca acerta é só latência e ruído.
 *
 * O disjuntor faz backend derrubado custar ~0: depois de algumas falhas
 * seguidas o cache para de ser consultado, avisa UMA vez com diagnóstico
 * acionável, e volta a testar sozinho — quem consertar o banco não precisa
 * redeployar para o cache voltar.
 *
 * Ele guarda só o caminho quente (leitura/escrita a cada busca). A invalidação
 * é rara e sensível a correção, então segue tentando sempre.
 */
const BREAKER_FAILURE_THRESHOLD = 3
const BREAKER_BASE_COOLDOWN_MS = 60_000
const BREAKER_MAX_COOLDOWN_MS = 10 * 60_000
const BREAKER_PROBE_GUARD_MS = 10_000

let consecutiveFailures = 0
let breakerTripped = false
let breakerOpenUntil = 0
let breakerCooldownMs = BREAKER_BASE_COOLDOWN_MS

/** Exposto para teste: devolve o disjuntor ao estado de processo recém-subido. */
export function __resetCacheBreakerForTests() {
  consecutiveFailures = 0
  breakerTripped = false
  breakerOpenUntil = 0
  breakerCooldownMs = BREAKER_BASE_COOLDOWN_MS
}

function breakerIsOpen(): boolean {
  if (!breakerTripped) return false

  const agora = Date.now()
  if (agora < breakerOpenUntil) return true

  // Meio-aberto: libera UMA sonda e segura as concorrentes durante ela, para o
  // fim do cooldown não virar enxurrada de requisições simultâneas.
  breakerOpenUntil = agora + BREAKER_PROBE_GUARD_MS
  return false
}

function describeCacheFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('res.map is not a function')) {
    return (
      'o servidor respondeu HTTP 200 com corpo de erro — banco suspenso, ' +
      'rate limit da conta ou credencial inválida'
    )
  }
  return message
}

function recordCacheSuccess() {
  if (breakerTripped) {
    console.warn('[cache] backend voltou a responder; cache reativado.')
  }
  consecutiveFailures = 0
  breakerTripped = false
  breakerOpenUntil = 0
  breakerCooldownMs = BREAKER_BASE_COOLDOWN_MS
}

function recordCacheFailure(operacao: string, error: unknown) {
  consecutiveFailures += 1

  // Falha isolada pode ser soluço de rede: loga e segue tentando.
  if (consecutiveFailures < BREAKER_FAILURE_THRESHOLD) {
    console.error(`[cache] falha em ${operacao}:`, error)
    return
  }

  const jaEstavaAberto = breakerTripped
  breakerCooldownMs = jaEstavaAberto
    ? Math.min(breakerCooldownMs * 2, BREAKER_MAX_COOLDOWN_MS)
    : BREAKER_BASE_COOLDOWN_MS
  breakerTripped = true
  breakerOpenUntil = Date.now() + breakerCooldownMs

  if (jaEstavaAberto) {
    logCache('BREAKER_REOPEN', { operacao, cooldownMs: breakerCooldownMs })
    return
  }

  console.warn(
    `[cache] desativado por ${Math.round(breakerCooldownMs / 1000)}s após ` +
      `${consecutiveFailures} falhas seguidas em ${operacao}: ${describeCacheFailure(error)}. ` +
      'A busca na base segue funcionando, só que sem cache. ' +
      'Conserte o banco apontado por UPSTASH_REDIS_REST_URL, ou remova as ' +
      'variáveis UPSTASH_REDIS_* para desligar o cache de vez.'
  )
}

function parseTtlSeconds(raw: string | undefined, fallback: number) {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

const DEFAULT_TTL_SECONDS = parseTtlSeconds(process.env.RAG_CACHE_TTL_SECONDS, 300)
const DEFAULT_EMPTY_TTL_SECONDS = parseTtlSeconds(process.env.RAG_CACHE_EMPTY_TTL_SECONDS, 60)
const TTL_JITTER_PCT = (() => {
  const raw = process.env.RAG_CACHE_TTL_JITTER_PCT
  if (!raw) return 0.1
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0.1
  return Math.min(0.5, n)
})()

function jitterTtl(ttlSeconds: number) {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 1) return Math.max(1, Math.floor(ttlSeconds))
  const jitter = ttlSeconds * TTL_JITTER_PCT
  const min = Math.max(1, ttlSeconds - jitter)
  const max = ttlSeconds + jitter
  return Math.floor(min + Math.random() * (max - min))
}

async function getRedisClient() {
  if (redisClient) {
    return redisClient
  }

  // Only initialize if credentials are available
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!redisUrl || !redisToken) {
    // Uma vez por processo: sem cache configurado, TODA busca passaria por aqui.
    if (!missingCredentialsWarned) {
      missingCredentialsWarned = true
      console.warn('[cache] Upstash Redis não configurado. Cache desligado (a busca na base segue normal).')
    }
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
function getCacheKey(query: string, projectId: number, options: CacheKeyOptions = {}): string {
  const normalized = normalizeQuery(query)
  const queryHash = sha256(normalized)
  const categoryKey = options.category ? String(options.category) : 'all'
  const topKKey = Number.isFinite(options.topK) ? String(options.topK) : 'd'
  const minScoreKey = Number.isFinite(options.minScore) ? String(options.minScore) : 'd'
  const entryMetaKey = options.includeEntryMetadata === false ? '0' : '1'
  return `${CACHE_PREFIX}:${projectId}:${categoryKey}:k${topKKey}:s${minScoreKey}:e${entryMetaKey}:${queryHash}`
}

/**
 * Gera padrão para invalidação de cache por projeto
 */
function getProjectCachePattern(projectId: number): string {
  return `${CACHE_PREFIX}:${projectId}:*`
}

/**
 * Gera padrão para invalidação de cache por categoria
 */
function getCategoryCachePattern(projectId: number, category: string): string {
  return `${CACHE_PREFIX}:${projectId}:${category}:*`
}

function getProjectVersionKey(projectId: number) {
  return `${CACHE_VERSION_PREFIX}:${projectId}`
}

function normalizeQuery(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, ' ')
  try {
    return trimmed.normalize('NFKC').toLowerCase()
  } catch {
    return trimmed.toLowerCase()
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function parseVersion(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return 0
}

function tryParsePayload(value: unknown): CachedPayload | null {
  try {
    if (value == null) return null
    if (typeof value === 'string') {
      return JSON.parse(value) as CachedPayload
    }
    if (typeof value === 'object') {
      return value as CachedPayload
    }
    return null
  } catch {
    return null
  }
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
  category?: string,
  options: Omit<CacheKeyOptions, 'category'> = {}
): Promise<SearchResult[] | null> {
  if (breakerIsOpen()) return null

  const redis = await getRedisClient()
  if (!redis) return null

  try {
    const startedAt = Date.now()
    const versionKey = getProjectVersionKey(projectId)
    const key = getCacheKey(query, projectId, { ...options, category })
    const [versionRaw, cachedRaw] = (await redis.mget(versionKey, key)) as [unknown, unknown]
    recordCacheSuccess()

    if (cachedRaw == null) {
      logCache('MISS', { key, projectId, ms: Date.now() - startedAt })
      return null
    }

    const currentVersion = parseVersion(versionRaw)
    const payload = tryParsePayload(cachedRaw)

    if (!payload || typeof payload !== 'object') {
      logCache('BAD_PAYLOAD', { key, projectId })
      return null
    }

    if (payload.v !== currentVersion) {
      logCache('STALE', { key, projectId, cachedV: payload.v, currentV: currentVersion, ms: Date.now() - startedAt })
      return null
    }

    if (!Array.isArray(payload.results)) {
      logCache('BAD_RESULTS', { key, projectId })
      return null
    }

    logCache('HIT', { key, projectId, results: payload.results.length, ms: Date.now() - startedAt })
    return payload.results
  } catch (error) {
    recordCacheFailure('getCachedResults', error)
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
  ttlSeconds?: number,
  options: Omit<CacheKeyOptions, 'category'> = {}
): Promise<void> {
  if (breakerIsOpen()) return

  const redis = await getRedisClient()
  if (!redis) return

  try {
    const startedAt = Date.now()
    const versionKey = getProjectVersionKey(projectId)
    const versionRaw = await redis.get(versionKey)
    const version = parseVersion(versionRaw)

    const key = getCacheKey(query, projectId, { ...options, category })
    const isEmpty = results.length === 0
    const baseTtl = isEmpty ? DEFAULT_EMPTY_TTL_SECONDS : (ttlSeconds ?? DEFAULT_TTL_SECONDS)
    const finalTtl = jitterTtl(baseTtl)

    const payload: CachedPayload = {
      v: version,
      t: Date.now(),
      results,
    }

    await redis.set(key, JSON.stringify(payload), { ex: finalTtl })
    recordCacheSuccess()

    logCache('SET', { key, projectId, results: results.length, ttl: finalTtl, ms: Date.now() - startedAt })
  } catch (error) {
    recordCacheFailure('setCachedResults', error)
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
    const startedAt = Date.now()
    const versionKey = getProjectVersionKey(projectId)
    const newVersion = await redis.incr(versionKey)
    logCache('BUMP', { projectId, versionKey, newVersion, ms: Date.now() - startedAt })

    // Optional hard invalidation (SCAN + DEL) for manual cleanup/debugging.
    if (process.env.RAG_CACHE_HARD_INVALIDATION !== '1') {
      return 0
    }

    const pattern = getProjectCachePattern(projectId)
    let cursor: string | number = 0
    let deletedCount = 0
    const batchSize = 200

    do {
      const scanResult = await redis.scan(cursor, { match: pattern, count: batchSize })
      if (!Array.isArray(scanResult) || scanResult.length < 2) break
      const [nextCursor, keys] = scanResult
      cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor
      if (Array.isArray(keys) && keys.length > 0) {
        await redis.del(...keys)
        deletedCount += keys.length
      }
    } while (cursor !== 0)

    logCache('HARD_INVALIDATE', { projectId, deletedCount })
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
    // Category-level invalidation is logically a project-level bump because most RAG queries are cross-category.
    // This keeps correctness while keeping the signature for callers.
    const hard = process.env.RAG_CACHE_HARD_INVALIDATION === '1'
    if (!hard) {
      await invalidateProjectCache(projectId)
      return 0
    }

    const pattern = getCategoryCachePattern(projectId, category)
    let cursor: string | number = 0
    let deletedCount = 0
    const batchSize = 200

    do {
      const scanResult = await redis.scan(cursor, { match: pattern, count: batchSize })
      if (!Array.isArray(scanResult) || scanResult.length < 2) break
      const [nextCursor, keys] = scanResult
      cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor
      if (Array.isArray(keys) && keys.length > 0) {
        await redis.del(...keys)
        deletedCount += keys.length
      }
    } while (cursor !== 0)

    logCache('HARD_INVALIDATE_CATEGORY', { projectId, category, deletedCount })
    await invalidateProjectCache(projectId)
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
    const patterns = [`${CACHE_PREFIX}:*`, `${CACHE_VERSION_PREFIX}:*`]
    let cursor: string | number = 0
    let deletedCount = 0
    const batchSize = 500

    for (const pattern of patterns) {
      cursor = 0
      do {
        const scanResult = await redis.scan(cursor, { match: pattern, count: batchSize })
        if (!Array.isArray(scanResult) || scanResult.length < 2) break
        const [nextCursor, keys] = scanResult
        cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor
        if (Array.isArray(keys) && keys.length > 0) {
          await redis.del(...keys)
          deletedCount += keys.length
        }
      } while (cursor !== 0)
    }

    logCache('CLEAR_ALL', { deletedCount })
    return deletedCount
  } catch (error) {
    console.error('[cache] Error clearing cache:', error)
    return 0
  }
}
