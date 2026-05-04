/**
 * Zernio post status → local PostStatus mapping.
 *
 * Centralized so all callers (sendToLater, tryAdoptExistingPost, MCP recover-stuck-post,
 * sync-zernio-posts) agree on the rules. Treating "partial" as FAILED matters: when one
 * platform succeeds and another fails, the user-facing outcome is failure.
 */
export type ZernioStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'partial'
  | (string & {})

export type LocalPostStatus = 'DRAFT' | 'SCHEDULED' | 'POSTING' | 'POSTED' | 'FAILED'

/**
 * Map a Zernio status string to the corresponding local PostStatus.
 * Unknown strings fall back to POSTING (we have a laterPostId, just don't know yet).
 */
export function mapZernioStatusToLocal(status: ZernioStatus | undefined | null): LocalPostStatus {
  switch (status) {
    case 'published':
      return 'POSTED'
    case 'failed':
    case 'partial':
      return 'FAILED'
    case 'scheduled':
      return 'SCHEDULED'
    case 'draft':
      return 'DRAFT'
    case 'publishing':
      return 'POSTING'
    default:
      return 'POSTING'
  }
}

/**
 * Pull a user-facing failure message out of a Zernio post payload.
 * Zernio sometimes populates `error` as a string, sometimes `errors` as an array.
 * Returns null if neither is present.
 */
export function extractZernioErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>

  if (typeof obj.error === 'string' && obj.error.trim().length > 0) {
    return obj.error
  }

  if (Array.isArray(obj.errors)) {
    const stringErrors = obj.errors.filter((e): e is string => typeof e === 'string')
    if (stringErrors.length > 0) {
      return stringErrors.join(' | ')
    }
  }

  return null
}
