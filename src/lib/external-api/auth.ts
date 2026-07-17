import { timingSafeEqual } from 'node:crypto'

/**
 * Service-to-service authentication for /api/external routes.
 * Callers (e.g. Claudinho/insta-automatico) must send:
 *   Authorization: Bearer <EXTERNAL_API_SECRET>
 */
export function isExternalApiAuthorized(authHeader: string | null): boolean {
  const secret = process.env.EXTERNAL_API_SECRET
  if (!secret || !authHeader?.startsWith('Bearer ')) return false

  const token = Buffer.from(authHeader.slice('Bearer '.length))
  const expected = Buffer.from(secret)
  if (token.length !== expected.length) return false
  return timingSafeEqual(token, expected)
}
