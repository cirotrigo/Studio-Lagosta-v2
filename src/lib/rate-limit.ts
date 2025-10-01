interface RateLimitOptions {
  /** Unique identifier for the caller (e.g., user ID or IP). */
  key: string
  /** Maximum number of requests allowed in the window. */
  limit?: number
  /** Window size in milliseconds (default: 1 hour). */
  windowMs?: number
  /** Optional override to inject current time (useful for tests). */
  now?: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  reset: number
  retryAfter?: number
}

const DEFAULT_LIMIT = 100
const DEFAULT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

const buckets = new Map<string, number[]>()

export class RateLimitError extends Error {
  constructor(message: string, public readonly retryAfter: number) {
    super(message)
    this.name = 'RateLimitError'
  }
}

function pruneOldEntries(entries: number[], cutoff: number) {
  let index = 0
  while (index < entries.length && entries[index] <= cutoff) {
    index += 1
  }
  if (index > 0) {
    entries.splice(0, index)
  }
}

export function checkRateLimit({ key, limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS, now = Date.now() }: RateLimitOptions): RateLimitResult {
  if (!key) {
    throw new Error('Rate limit key is required')
  }

  const cutoff = now - windowMs
  const bucket = buckets.get(key) ?? []
  if (!buckets.has(key)) {
    buckets.set(key, bucket)
  }

  pruneOldEntries(bucket, cutoff)

  if (bucket.length >= limit) {
    const oldest = bucket[0] ?? now
    const retryAfter = Math.max(Math.ceil((oldest + windowMs - now) / 1000), 1)
    return {
      ok: false,
      remaining: 0,
      reset: oldest + windowMs,
      retryAfter,
    }
  }

  bucket.push(now)

  return {
    ok: true,
    remaining: Math.max(limit - bucket.length, 0),
    reset: bucket[0]! + windowMs,
  }
}

export function assertRateLimit(options: RateLimitOptions) {
  const result = checkRateLimit(options)
  if (!result.ok) {
    throw new RateLimitError('Too many requests', result.retryAfter ?? Math.ceil(DEFAULT_WINDOW_MS / 1000))
  }
  return result
}

export function resetRateLimitBucket(key: string) {
  buckets.delete(key)
}

export function getRateLimitBucketSize(key: string) {
  return buckets.get(key)?.length ?? 0
}
