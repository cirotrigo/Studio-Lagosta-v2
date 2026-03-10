export interface InstagramPreviewTokens {
  primaryColor: string
  secondaryColor?: string
  textColor: string
  bgColor: string
  fontHeading: string
  fontBody: string
}

export interface ImportedDsTemplateSummary {
  id: string
  name: string
  format: 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'
}

function extractFirstHex(value: string): string | undefined {
  const match = value.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/)
  return match?.[0]
}

function extractFontName(value: string): string | undefined {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/["']/g, '')
    .trim()

  if (!cleaned) return undefined

  // Example: "Montserrat (bold/black)" -> "Montserrat"
  const withoutMeta = cleaned.split('(')[0]?.trim()
  if (!withoutMeta) return undefined
  return withoutMeta
}

function parseBrandTokenRows(html: string): Record<string, string> {
  const rows: Record<string, string> = {}

  const tokenRegex = /<span[^>]*class=["'][^"']*ig-token-key[^"']*["'][^>]*>\s*([^<]+?)\s*<\/span>\s*<span[^>]*class=["'][^"']*ig-token-value[^"']*["'][^>]*>\s*([^<]+?)\s*<\/span>/gi
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(html)) !== null) {
    const key = match[1]?.trim().toUpperCase()
    const value = match[2]?.trim()
    if (key && value) {
      rows[key] = value
    }
  }

  return rows
}

function mapTemplateFormatFromId(templateId: string): 'STORY' | 'FEED_PORTRAIT' | 'SQUARE' {
  const normalized = templateId.toUpperCase()
  if (normalized.startsWith('S')) return 'STORY'
  if (normalized === 'F3') return 'SQUARE'
  return 'FEED_PORTRAIT'
}

function sanitizeTemplateName(value: string | undefined, fallbackId: string): string {
  const base = (value || '')
    .replace(/\s+/g, ' ')
    .replace(/photo/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!base) return fallbackId
  return base
}

function sortTemplates(a: ImportedDsTemplateSummary, b: ImportedDsTemplateSummary): number {
  const aPrefix = a.id[0]
  const bPrefix = b.id[0]
  if (aPrefix !== bPrefix) return aPrefix.localeCompare(bPrefix)
  const aNum = Number(a.id.slice(1))
  const bNum = Number(b.id.slice(1))
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum
  return a.id.localeCompare(b.id)
}

function hasAnyPreviewToken(tokens: Partial<InstagramPreviewTokens>): boolean {
  return Boolean(
    tokens.primaryColor
      || tokens.secondaryColor
      || tokens.textColor
      || tokens.bgColor
      || tokens.fontHeading
      || tokens.fontBody,
  )
}

function htmlEntryPriority(path: string): number {
  const lower = path.toLowerCase()

  if (/(^|\/)index\.html?$/.test(lower)) return 0
  if (lower.includes('design-system')) return 1
  if (lower.includes('instagram')) return 2
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 3
  return 4
}

export function extractInstagramPreviewTokensFromDesignSystemHtml(
  html: string,
): Partial<InstagramPreviewTokens> {
  const rows = parseBrandTokenRows(html)
  const tokens: Partial<InstagramPreviewTokens> = {}

  const primary = rows.BRAND_PRIMARY ? extractFirstHex(rows.BRAND_PRIMARY) : undefined
  const secondary = rows.BRAND_SECONDARY ? extractFirstHex(rows.BRAND_SECONDARY) : undefined
  const text = rows.BRAND_TEXT_COLOR ? extractFirstHex(rows.BRAND_TEXT_COLOR) : undefined
  const bg = rows.BRAND_BG_COLOR ? extractFirstHex(rows.BRAND_BG_COLOR) : undefined
  const heading = rows.BRAND_FONT_HEADING ? extractFontName(rows.BRAND_FONT_HEADING) : undefined
  const body = rows.BRAND_FONT_BODY ? extractFontName(rows.BRAND_FONT_BODY) : undefined

  if (primary) tokens.primaryColor = primary
  if (secondary) tokens.secondaryColor = secondary
  if (text) tokens.textColor = text
  if (bg) tokens.bgColor = bg
  if (heading) tokens.fontHeading = heading
  if (body) tokens.fontBody = body

  return tokens
}

export function extractImportedDsTemplatesFromDesignSystemHtml(
  html: string,
): ImportedDsTemplateSummary[] {
  const map = new Map<string, ImportedDsTemplateSummary>()

  const commentRegex = /<!--\s*([SF]\d+)\s*([^>]*)-->/gi
  let match: RegExpExecArray | null
  while ((match = commentRegex.exec(html)) !== null) {
    const templateId = (match[1] || '').toUpperCase()
    const description = sanitizeTemplateName(match[2], templateId)
    map.set(templateId, {
      id: templateId,
      name: `${templateId} — ${description}`,
      format: mapTemplateFormatFromId(templateId),
    })
  }

  // Fallback for files without comments: use image alt tags like "S1 Story Photo".
  const altRegex = /alt\s*=\s*["']\s*([SF]\d+)\s*([^"']*)["']/gi
  while ((match = altRegex.exec(html)) !== null) {
    const templateId = (match[1] || '').toUpperCase()
    if (map.has(templateId)) continue
    const description = sanitizeTemplateName(match[2], templateId)
    map.set(templateId, {
      id: templateId,
      name: `${templateId} — ${description}`,
      format: mapTemplateFormatFromId(templateId),
    })
  }

  return Array.from(map.values()).sort(sortTemplates)
}

export async function extractInstagramPreviewTokensFromDesignSystemZip(
  zipBuffer: ArrayBuffer,
): Promise<Partial<InstagramPreviewTokens>> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(zipBuffer)

  const htmlEntries: string[] = []
  zip.forEach((relativePath, file) => {
    if (file.dir) return
    if (!/\.html?$/i.test(relativePath)) return
    htmlEntries.push(relativePath)
  })

  if (htmlEntries.length === 0) return {}

  htmlEntries.sort((a, b) => {
    const scoreDiff = htmlEntryPriority(a) - htmlEntryPriority(b)
    if (scoreDiff !== 0) return scoreDiff
    return a.length - b.length
  })

  for (const path of htmlEntries) {
    const file = zip.file(path)
    if (!file) continue
    const html = await file.async('text')
    const tokens = extractInstagramPreviewTokensFromDesignSystemHtml(html)
    if (hasAnyPreviewToken(tokens)) {
      return tokens
    }
  }

  return {}
}

export async function extractDesignSystemMetadataFromZip(
  zipBuffer: ArrayBuffer,
): Promise<{
  tokens: Partial<InstagramPreviewTokens>
  templates: ImportedDsTemplateSummary[]
}> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(zipBuffer)

  const htmlEntries: string[] = []
  zip.forEach((relativePath, file) => {
    if (file.dir) return
    if (!/\.html?$/i.test(relativePath)) return
    htmlEntries.push(relativePath)
  })

  if (htmlEntries.length === 0) {
    return { tokens: {}, templates: [] }
  }

  htmlEntries.sort((a, b) => {
    const scoreDiff = htmlEntryPriority(a) - htmlEntryPriority(b)
    if (scoreDiff !== 0) return scoreDiff
    return a.length - b.length
  })

  let tokens: Partial<InstagramPreviewTokens> = {}
  const templateMap = new Map<string, ImportedDsTemplateSummary>()

  for (const path of htmlEntries) {
    const file = zip.file(path)
    if (!file) continue
    const html = await file.async('text')

    if (!hasAnyPreviewToken(tokens)) {
      const extractedTokens = extractInstagramPreviewTokensFromDesignSystemHtml(html)
      if (hasAnyPreviewToken(extractedTokens)) {
        tokens = extractedTokens
      }
    }

    const extractedTemplates = extractImportedDsTemplatesFromDesignSystemHtml(html)
    for (const template of extractedTemplates) {
      if (!templateMap.has(template.id)) {
        templateMap.set(template.id, template)
      }
    }
  }

  return {
    tokens,
    templates: Array.from(templateMap.values()).sort(sortTemplates),
  }
}
