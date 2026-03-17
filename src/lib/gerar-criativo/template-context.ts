import type { Layer } from '@/types/template'

export type TemplateFieldKey =
  | 'pre_title'
  | 'title'
  | 'description'
  | 'cta'
  | 'badge'
  | 'footer_info_1'
  | 'footer_info_2'

export type TemplateSlotPriority = 'primary' | 'secondary' | 'tertiary'
export type TemplateLayoutStyle = 'hero-title' | 'balanced' | 'info-dense' | 'minimal'
export type TemplatePurpose = 'promotional' | 'informational' | 'menu' | 'event' | 'generic'
export type TemplateFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'

export interface ExtractedTemplateSlot {
  fieldKey: TemplateFieldKey
  layerId: string
  layerName: string
  currentText: string
  fontSize: number
  maxLines: number
  maxWords?: number
  maxCharactersPerLine?: number
  priority: TemplateSlotPriority
  textLength: number
  wordCount: number
}

export interface ExtractedTemplateContext {
  templateId: string
  templateName: string
  format: TemplateFormat
  pageId: string
  pageName: string
  slots: ExtractedTemplateSlot[]
  visualHierarchy: {
    primarySlot: TemplateFieldKey | null
    secondarySlots: TemplateFieldKey[]
    slotOrder: TemplateFieldKey[]
    layoutStyle: TemplateLayoutStyle
  }
  inferredPurpose: TemplatePurpose
  stats: {
    totalSlots: number
    filledSlots: number
    totalWordCount: number
    averageTextLength: number
    textDensity: 'low' | 'medium' | 'high'
  }
  slotToLayerMap: Partial<Record<TemplateFieldKey, string>>
}

export function inferTemplateFormatFromDimensions(
  width: number,
  height: number,
): TemplateFormat {
  if (!width || !height) return 'STORY'

  const ratio = width / height

  if (Math.abs(ratio - 1) < 0.08) {
    return 'SQUARE'
  }

  if (Math.abs(ratio - (4 / 5)) < 0.08) {
    return 'FEED_PORTRAIT'
  }

  return 'STORY'
}

interface BuildTemplateContextParams {
  templateId: string
  templateName: string
  format: TemplateFormat
  pageId: string
  pageName: string
  layers: Layer[]
}

function isTextLayer(layer: Layer): boolean {
  return (layer.type === 'text' || layer.type === 'rich-text') && layer.visible !== false
}

function normalizeWords(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function getLayerFontSize(layer: Layer): number {
  const fontSize = Number(layer.style?.fontSize)
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16
}

function getLayerLineHeight(layer: Layer): number {
  const lineHeight = Number(layer.style?.lineHeight)
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 1.2
}

function inferMaxLines(layer: Layer): number {
  const fontSize = getLayerFontSize(layer)
  const lineHeightPx = fontSize * getLayerLineHeight(layer)
  const estimated = Math.max(1, Math.floor(layer.size.height / Math.max(1, lineHeightPx)))
  return Math.min(6, estimated)
}

function inferMaxCharactersPerLine(layer: Layer): number | undefined {
  const fontSize = getLayerFontSize(layer)
  if (fontSize <= 0 || layer.size.width <= 0) return undefined

  // Approximation good enough for prompt guidance only.
  const approxChars = Math.floor(layer.size.width / Math.max(6, fontSize * 0.62))
  return approxChars > 0 ? approxChars : undefined
}

function inferMaxWords(layer: Layer, maxLines: number): number | undefined {
  const perLine = inferMaxCharactersPerLine(layer)
  if (!perLine) return undefined
  const wordsPerLine = Math.max(2, Math.floor(perLine / 6))
  return Math.max(2, wordsPerLine * maxLines)
}

function inferFieldKeyFromName(name: string): TemplateFieldKey | null {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (/(cta|call.?to.?action|botao|button|whats|zap)/.test(normalized)) return 'cta'
  if (/(badge|selo|tag|sticker)/.test(normalized)) return 'badge'
  if (/(pre.?title|pre.?titulo|eyebrow|kicker|label|subtitulo curto)/.test(normalized)) return 'pre_title'
  if (/(footer|rodape|info|informacao|horario|endereco|telefone)/.test(normalized)) return 'footer_info_1'
  if (/(desc|description|texto|body|paragrafo|subtitulo)/.test(normalized)) return 'description'
  if (/(title|titulo|headline|hero)/.test(normalized)) return 'title'
  return null
}

function inferFieldKeyFallback(
  layer: Layer,
  sortedByProminence: Layer[],
  footerCount: number,
): TemplateFieldKey {
  const index = sortedByProminence.findIndex((candidate) => candidate.id === layer.id)
  if (index === 0) return 'title'
  if (index === 1) return 'description'

  const lowerY = layer.position.y > sortedByProminence[0].position.y + sortedByProminence[0].size.height
  if (lowerY && footerCount === 0) return 'footer_info_1'
  if (lowerY && footerCount === 1) return 'footer_info_2'

  return 'badge'
}

function inferPriority(index: number): TemplateSlotPriority {
  if (index === 0) return 'primary'
  if (index <= 2) return 'secondary'
  return 'tertiary'
}

function inferLayoutStyle(slots: ExtractedTemplateSlot[]): TemplateLayoutStyle {
  if (slots.length <= 2) return 'minimal'

  const title = slots.find((slot) => slot.fieldKey === 'title')
  const description = slots.find((slot) => slot.fieldKey === 'description')

  if (title && title.fontSize >= 42 && (!description || description.textLength <= 80)) {
    return 'hero-title'
  }

  if (slots.length >= 5) return 'info-dense'
  return 'balanced'
}

function inferPurpose(slots: ExtractedTemplateSlot[]): TemplatePurpose {
  const names = slots.map((slot) => slot.layerName.toLowerCase()).join(' ')
  if (/(menu|cardapio|prato|produto)/.test(names)) return 'menu'
  if (/(evento|agenda|data|horario)/.test(names)) return 'event'
  if (slots.some((slot) => slot.fieldKey === 'cta' || slot.fieldKey === 'badge')) return 'promotional'
  if (slots.length >= 4) return 'informational'
  return 'generic'
}

export function buildTemplateContextFromLayers(
  params: BuildTemplateContextParams,
): ExtractedTemplateContext | null {
  const textLayers = params.layers.filter((layer) => isTextLayer(layer) && layer.isDynamic !== false)
  if (textLayers.length === 0) return null

  const sortedByProminence = [...textLayers].sort((a, b) => {
    const fontDiff = getLayerFontSize(b) - getLayerFontSize(a)
    if (fontDiff !== 0) return fontDiff
    return a.position.y - b.position.y
  })

  const usedKeys = new Set<TemplateFieldKey>()
  let footerCount = 0

  const slots: ExtractedTemplateSlot[] = sortedByProminence.map((layer, index) => {
    let fieldKey = inferFieldKeyFromName(layer.name)

    if (fieldKey === 'footer_info_1' && usedKeys.has('footer_info_1')) {
      fieldKey = 'footer_info_2'
    }

    if (!fieldKey || usedKeys.has(fieldKey)) {
      fieldKey = inferFieldKeyFallback(layer, sortedByProminence, footerCount)
      if (fieldKey === 'footer_info_1' && usedKeys.has('footer_info_1')) {
        fieldKey = 'footer_info_2'
      }
    }

    if (fieldKey.startsWith('footer_info')) {
      footerCount += 1
    }

    usedKeys.add(fieldKey)

    const currentText = String(layer.content || '').trim()
    const maxLines = inferMaxLines(layer)
    const maxCharactersPerLine = inferMaxCharactersPerLine(layer)
    const maxWords = inferMaxWords(layer, maxLines)

    return {
      fieldKey,
      layerId: layer.id,
      layerName: layer.name,
      currentText,
      fontSize: getLayerFontSize(layer),
      maxLines,
      maxWords,
      maxCharactersPerLine,
      priority: inferPriority(index),
      textLength: currentText.length,
      wordCount: normalizeWords(currentText).length,
    }
  })

  const filledSlots = slots.filter((slot) => slot.currentText.length > 0)
  const totalWordCount = slots.reduce((sum, slot) => sum + slot.wordCount, 0)
  const averageTextLength = slots.length > 0
    ? Math.round(slots.reduce((sum, slot) => sum + slot.textLength, 0) / slots.length)
    : 0

  const slotOrder = slots.map((slot) => slot.fieldKey)
  const primarySlot = slots.find((slot) => slot.priority === 'primary')?.fieldKey ?? null
  const secondarySlots = slots
    .filter((slot) => slot.priority === 'secondary')
    .map((slot) => slot.fieldKey)

  const slotToLayerMap = slots.reduce<Partial<Record<TemplateFieldKey, string>>>((acc, slot) => {
    if (!(slot.fieldKey in acc)) {
      acc[slot.fieldKey] = slot.layerId
    }
    return acc
  }, {})

  const textDensity = totalWordCount <= 10 ? 'low' : totalWordCount <= 24 ? 'medium' : 'high'

  return {
    templateId: params.templateId,
    templateName: params.templateName,
    format: params.format,
    pageId: params.pageId,
    pageName: params.pageName,
    slots,
    visualHierarchy: {
      primarySlot,
      secondarySlots,
      slotOrder,
      layoutStyle: inferLayoutStyle(slots),
    },
    inferredPurpose: inferPurpose(slots),
    stats: {
      totalSlots: slots.length,
      filledSlots: filledSlots.length,
      totalWordCount,
      averageTextLength,
      textDensity,
    },
    slotToLayerMap,
  }
}
