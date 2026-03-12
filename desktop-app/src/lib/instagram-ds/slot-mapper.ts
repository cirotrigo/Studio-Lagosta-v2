import { ArtFormat } from '@/stores/generation.store'
import { DsTemplateId } from './template-registry'

export interface SlotFieldLike {
  key: string
  label?: string
  value: string
}

export interface DsMappedContent {
  preTitle: string
  title: string
  description: string
  cta: string
  badge: string
  footerInfo1: string
  footerInfo2: string
  listItems: string[]
  binding: {
    preTitleKey?: string
    titleKey?: string
    descriptionKey?: string
    ctaKey?: string
    badgeKey?: string
    footerInfo1Key?: string
    footerInfo2Key?: string
  }
}

function normalizeText(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function normalizeKey(value: string | undefined): string {
  return normalizeText(value).toLowerCase()
}

function scoreKey(key: string, tokens: string[]): number {
  let score = 0
  for (const token of tokens) {
    if (key.includes(token)) score += 1
  }
  return score
}

function looksLikePrice(value: string): boolean {
  return /r\$\s?\d|\d+[,.]\d{2}/i.test(value)
}

function splitListCandidates(description: string): string[] {
  const source = description.trim()
  if (!source) return []

  if (source.includes('•')) {
    return source.split('•').map((item) => item.trim()).filter(Boolean).slice(0, 4)
  }

  if (source.includes('|')) {
    return source.split('|').map((item) => item.trim()).filter(Boolean).slice(0, 4)
  }

  const lines = source.split(/\n+/).map((item) => item.trim()).filter(Boolean)
  if (lines.length >= 3 && lines.every((item) => item.length <= 50)) {
    return lines.slice(0, 4)
  }

  return []
}

function findBestField(fields: SlotFieldLike[], tokenGroups: string[][]): SlotFieldLike | undefined {
  let bestField: SlotFieldLike | undefined
  let bestScore = 0

  for (const field of fields) {
    const key = `${normalizeKey(field.key)} ${normalizeKey(field.label)}`
    let score = 0
    for (const group of tokenGroups) {
      score += scoreKey(key, group)
    }
    if (score > bestScore) {
      bestScore = score
      bestField = field
    }
  }

  return bestScore > 0 ? bestField : undefined
}

export function mapFieldsToDsContent(fields: SlotFieldLike[]): DsMappedContent {
  const sanitized = fields
    .map((field) => ({ ...field, value: normalizeText(field.value) }))
    .filter((field) => field.value.length > 0)

  const preTitleField = findBestField(sanitized, [['pre', 'eyebrow'], ['label', 'subtitle']])
  const titleField = findBestField(sanitized, [['title', 'headline']])
  const descField = findBestField(sanitized, [['description', 'paragraph', 'desc', 'texto']])
  const ctaField = findBestField(sanitized, [['cta', 'action', 'botao', 'chamada']])
  const badgeField = findBestField(sanitized, [['badge', 'tag', 'preco', 'price', 'offer']])

  const footerCandidates = sanitized.filter((field) => {
    const key = `${normalizeKey(field.key)} ${normalizeKey(field.label)}`
    return (
      key.includes('footer') ||
      key.includes('info') ||
      key.includes('location') ||
      key.includes('contact') ||
      key.includes('address') ||
      key.includes('phone') ||
      key.includes('telefone')
    )
  })

  const firstUnclaimed = (except: Array<SlotFieldLike | undefined>): SlotFieldLike | undefined =>
    sanitized.find((field) => !except.some((item) => item?.key === field.key))

  const claimed = [preTitleField, titleField, descField, ctaField, badgeField]
  const fallbackTitle = titleField || firstUnclaimed(claimed)
  const fallbackDesc = descField || sanitized.find((field) => field.key !== fallbackTitle?.key)
  const fallbackCta = ctaField || sanitized.find((field) => /reserve|agende|clique|saiba|peca|garanta/i.test(field.value))

  const footerInfo1 = footerCandidates[0]?.value || ''
  const footerInfo2 = footerCandidates[1]?.value || ''
  const descriptionText = fallbackDesc?.value || ''
  const listItems = splitListCandidates(descriptionText)

  return {
    preTitle: preTitleField?.value || '',
    title: fallbackTitle?.value || '',
    description: descriptionText,
    cta: fallbackCta?.value || '',
    badge: badgeField?.value || '',
    footerInfo1,
    footerInfo2,
    listItems,
    binding: {
      preTitleKey: preTitleField?.key,
      titleKey: fallbackTitle?.key,
      descriptionKey: fallbackDesc?.key,
      ctaKey: fallbackCta?.key,
      badgeKey: badgeField?.key,
      footerInfo1Key: footerCandidates[0]?.key,
      footerInfo2Key: footerCandidates[1]?.key,
    },
  }
}

function extractTemplateCode(name?: string): DsTemplateId | null {
  if (!name) return null
  const upper = name.toUpperCase()
  const match = upper.match(/\b(S[1-6]|F[1-3])\b/)
  if (!match) return null
  return match[1] as DsTemplateId
}

export function resolveDsTemplateId(params: {
  format: ArtFormat
  mapped: DsMappedContent
  templateName?: string
}): DsTemplateId {
  const explicit = extractTemplateCode(params.templateName)
  if (explicit) return explicit

  const { format, mapped } = params
  if (format === 'SQUARE') return 'F3'

  if (format === 'FEED_PORTRAIT') {
    if (looksLikePrice(mapped.badge) || looksLikePrice(mapped.title) || looksLikePrice(mapped.description)) {
      return 'F1'
    }
    if (mapped.description.length >= 40) return 'F2'
    return 'F1'
  }

  // Story
  if (mapped.footerInfo1 || mapped.footerInfo2 || mapped.listItems.length >= 3) return 'S3'
  if (mapped.badge && mapped.cta) return 'S6'
  if (mapped.description.length >= 80) return 'S2'
  if (mapped.badge) return 'S4'
  if (mapped.footerInfo1) return 'S5'
  return 'S1'
}
