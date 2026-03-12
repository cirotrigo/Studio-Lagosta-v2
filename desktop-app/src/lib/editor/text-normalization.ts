const TAG_BREAK_PATTERN = /<\s*br\s*\/?\s*>/gi
const BLOCK_CLOSE_PATTERN = /<\s*\/\s*(p|div|li|ul|ol|h[1-6])\s*>/gi
const BLOCK_OPEN_PATTERN = /<\s*(p|div|li|ul|ol|h[1-6])(?:\s+[^>]*)?>/gi
const ANY_TAG_PATTERN = /<[^>]+>/g

const HTML_ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(nbsp|amp|lt|gt|quot|#39);/gi, (match) => HTML_ENTITY_MAP[match.toLowerCase()] ?? match)
}

export function normalizeKonvaTextValue(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  const normalizedLineBreaks = value.replace(/\r\n?/g, '\n')
  const withLegacyBreaks = normalizedLineBreaks
    .replace(TAG_BREAK_PATTERN, '\n')
    .replace(BLOCK_CLOSE_PATTERN, '\n')
    .replace(BLOCK_OPEN_PATTERN, '')

  const withoutTags = withLegacyBreaks.replace(ANY_TAG_PATTERN, '')
  const decoded = decodeHtmlEntities(withoutTags)

  return decoded
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
