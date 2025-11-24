import crypto from 'crypto'

// Prefixo curto e sem hash (#) para funcionar melhor como Tag no Buffer
export const TAG_REGEX = /^SL-([a-zA-Z0-9]{6})-([A-Z0-9]{4})$/

export function generateVerificationTag(postId: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(postId + Date.now().toString())
    .digest('hex')
    .substring(0, 4)
    .toUpperCase()

  return `SL-${postId.substring(0, 6)}-${hash}`
}

export function validateTag(tag: string): boolean {
  return TAG_REGEX.test(tag)
}

export function extractPostIdFromTag(tag: string): string | null {
  const match = tag.match(TAG_REGEX)
  return match ? match[1] : null
}

// Mantém a tag no final do caption para evitar truncamento inesperado
export function appendTagToCaption(caption: string, tag: string): string {
  const trimmed = (caption || '').trimEnd()
  if (!trimmed) return tag
  return `${trimmed}\n\n${tag}`
}
