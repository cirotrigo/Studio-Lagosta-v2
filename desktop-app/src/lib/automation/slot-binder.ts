import { cloneKonvaDocument, getCurrentPage, sortPages } from '@/lib/editor/document'
import { normalizeKonvaTextValue } from '@/lib/editor/text-normalization'
import type {
  KonvaImageLayer,
  KonvaPage,
  KonvaTemplateDocument,
  KonvaTextLayer,
  Layer,
  SlotBinding,
  SlotFieldKey,
} from '@/types/template'
import type { ReviewField } from '@/stores/generation.store'

const SLOT_LABELS: Record<SlotFieldKey, string> = {
  pre_title: 'Pre-title',
  title: 'Titulo',
  description: 'Descricao',
  cta: 'CTA',
  badge: 'Badge',
  footer_info_1: 'Info rodape 1',
  footer_info_2: 'Info rodape 2',
}

const SLOT_PRIORITY: SlotFieldKey[] = [
  'pre_title',
  'title',
  'description',
  'badge',
  'cta',
  'footer_info_1',
  'footer_info_2',
]

const BINDING_PATTERNS: Array<{ fieldKey: SlotFieldKey; pattern: RegExp }> = [
  { fieldKey: 'pre_title', pattern: /(pre|eyebrow|kicker|superti)/i },
  { fieldKey: 'title', pattern: /(title|titulo|headline|hero)/i },
  { fieldKey: 'description', pattern: /(desc|descricao|descri|texto|copy|body|sub)/i },
  { fieldKey: 'cta', pattern: /(cta|call|botao|acao|action|button)/i },
  { fieldKey: 'badge', pattern: /(badge|selo|tag|chip|sticker|price|preco)/i },
  { fieldKey: 'footer_info_1', pattern: /(footer|rodape|info|contato|local|horario)/i },
  { fieldKey: 'footer_info_2', pattern: /(footer|rodape|info|contato|local|horario)/i },
]

const PLACEHOLDER_IMAGE_SOURCES = new Set(['', '/logo.png', '/icon.png'])

export interface SlotBinderInput {
  fieldValues: Partial<Record<SlotFieldKey, string>>
  backgroundMode: 'photo' | 'ai'
  photoUrl?: string
  backgroundImageUrl?: string
  brandLogoUrl?: string | null
  brandColors?: string[]
}

export interface SlotBinderResult {
  document: KonvaTemplateDocument
  slotBindings: SlotBinding[]
  fields: ReviewField[]
  warnings: string[]
}

export interface TemplateAnalysis {
  bindings: SlotBinding[]
  textLayerCount: number
  textCapacityScore: number
  supportsBadge: boolean
  supportsCta: boolean
  supportsFooter: boolean
  hasPhotoSlot: boolean
}

function sanitizeFieldValues(fieldValues: Partial<Record<SlotFieldKey, string>>) {
  return Object.fromEntries(
    Object.entries(fieldValues).map(([fieldKey, value]) => [fieldKey, normalizeKonvaTextValue(value)]),
  ) as Partial<Record<SlotFieldKey, string>>
}

function isTextLayer(layer: Layer): layer is KonvaTextLayer {
  return layer.type === 'text' || layer.type === 'rich-text'
}

function isImageLayer(layer: Layer): layer is KonvaImageLayer {
  return layer.type === 'image'
}

function getPrimaryPage(document: KonvaTemplateDocument): KonvaPage | null {
  const currentPage = getCurrentPage(document)
  if (currentPage?.layers.length) {
    return currentPage
  }

  return sortPages(document.design.pages).find((page) => page.layers.length > 0) ?? currentPage
}

function estimateMaxLines(layer: KonvaTextLayer): number {
  const fontSize = Math.max(12, layer.textStyle?.fontSize ?? 24)
  const lineHeight = layer.textStyle?.lineHeight ?? 1.2
  const height = Math.max(fontSize * lineHeight, layer.height ?? fontSize * lineHeight * 2)
  return Math.max(1, Math.floor(height / (fontSize * lineHeight)))
}

function buildBinding(page: KonvaPage, layer: KonvaTextLayer, fieldKey: SlotFieldKey): SlotBinding {
  return {
    id: `slot-${page.id}-${layer.id}-${fieldKey}`,
    layerId: layer.id,
    fieldKey,
    label: SLOT_LABELS[fieldKey],
    constraints: {
      maxLines: layer.textStyle?.maxLines ?? estimateMaxLines(layer),
      minFontSize: layer.textStyle?.minFontSize ?? Math.max(12, Math.round((layer.textStyle?.fontSize ?? 24) * 0.65)),
      maxFontSize: layer.textStyle?.maxFontSize ?? Math.max(12, Math.round(layer.textStyle?.fontSize ?? 24)),
      overflowBehavior:
        layer.textStyle?.overflowBehavior === 'ellipsis'
          ? 'ellipsis'
          : layer.textStyle?.overflowBehavior === 'clip'
            ? 'clip'
            : 'scale-down',
    },
  }
}

function getTextLayers(page: KonvaPage): KonvaTextLayer[] {
  return page.layers.filter(isTextLayer)
}

function sortTextLayers(page: KonvaPage): KonvaTextLayer[] {
  return getTextLayers(page).slice().sort((left, right) => {
    const fontDiff = (right.textStyle?.fontSize ?? 0) - (left.textStyle?.fontSize ?? 0)
    if (fontDiff !== 0) return fontDiff

    const areaDiff =
      ((right.width ?? 0) * (right.height ?? 0)) - ((left.width ?? 0) * (left.height ?? 0))
    if (areaDiff !== 0) return areaDiff

    return left.y - right.y
  })
}

function findLayerPage(document: KonvaTemplateDocument, layerId: string): KonvaPage | null {
  for (const page of document.design.pages) {
    if (page.layers.some((layer) => layer.id === layerId)) {
      return page
    }
  }

  return null
}

function findTextLayer(document: KonvaTemplateDocument, layerId: string): KonvaTextLayer | null {
  const page = findLayerPage(document, layerId)
  const layer = page?.layers.find((item) => item.id === layerId)
  return layer && isTextLayer(layer) ? layer : null
}

function claimLayer(
  claimed: Map<SlotFieldKey, KonvaTextLayer>,
  available: KonvaTextLayer[],
  fieldKey: SlotFieldKey,
  predicate: (layer: KonvaTextLayer) => boolean,
) {
  if (claimed.has(fieldKey)) return

  const nextLayer = available.find((layer) => !Array.from(claimed.values()).some((item) => item.id === layer.id) && predicate(layer))
  if (nextLayer) {
    claimed.set(fieldKey, nextLayer)
  }
}

export function inferSlotBindings(document: KonvaTemplateDocument): SlotBinding[] {
  const explicit = document.slots.filter((binding) => Boolean(findTextLayer(document, binding.layerId)))
  if (explicit.length > 0) {
    return explicit
  }

  const page = getPrimaryPage(document)
  if (!page) return []

  const sortedLayers = sortTextLayers(page)
  if (sortedLayers.length === 0) return []

  const claimed = new Map<SlotFieldKey, KonvaTextLayer>()

  for (const pattern of BINDING_PATTERNS) {
    claimLayer(claimed, sortedLayers, pattern.fieldKey, (layer) => pattern.pattern.test(layer.name ?? ''))
  }

  claimLayer(claimed, sortedLayers, 'title', (layer) => (layer.textStyle?.fontSize ?? 0) >= 28)
  claimLayer(claimed, sortedLayers, 'description', () => true)

  const titleLayer = claimed.get('title')
  if (titleLayer) {
    claimLayer(
      claimed,
      sortedLayers,
      'pre_title',
      (layer) => layer.y <= titleLayer.y && (layer.textStyle?.fontSize ?? 0) < (titleLayer.textStyle?.fontSize ?? 0),
    )
  }

  const bottomLayers = sortedLayers.slice().sort((left, right) => right.y - left.y)
  claimLayer(claimed, bottomLayers, 'footer_info_1', () => true)
  claimLayer(claimed, bottomLayers, 'footer_info_2', () => true)
  claimLayer(claimed, sortedLayers, 'cta', (layer) => (layer.width ?? page.width) <= page.width * 0.75)
  claimLayer(claimed, sortedLayers, 'badge', (layer) => (layer.height ?? 0) <= page.height * 0.12)

  for (const fieldKey of SLOT_PRIORITY) {
    claimLayer(claimed, sortedLayers, fieldKey, () => true)
  }

  return Array.from(claimed.entries()).map(([fieldKey, layer]) => buildBinding(page, layer, fieldKey))
}

function toOverflowBehavior(
  binding: SlotBinding,
): NonNullable<KonvaTextLayer['textStyle']>['overflowBehavior'] {
  if (binding.constraints?.overflowBehavior === 'ellipsis') return 'ellipsis'
  if (binding.constraints?.overflowBehavior === 'clip') return 'clip'
  return 'autoScale'
}

function isPlaceholderImageSource(src: string | undefined): boolean {
  if (!src) return true
  if (PLACEHOLDER_IMAGE_SOURCES.has(src.trim())) return true
  return !/^(https?:|blob:|data:)/i.test(src.trim())
}

function findPreferredImageTarget(page: KonvaPage): KonvaImageLayer | null {
  const background =
    page.layers.find((layer) => isImageLayer(layer) && layer.role === 'background') ?? null
  if (background && isImageLayer(background)) {
    return background
  }

  const fullCanvas =
    page.layers.find(
      (layer) =>
        isImageLayer(layer) &&
        Math.abs((layer.width ?? 0) - page.width) <= 4 &&
        Math.abs((layer.height ?? 0) - page.height) <= 4,
    ) ?? null
  if (fullCanvas && isImageLayer(fullCanvas)) {
    return fullCanvas
  }

  const sortedImages = page.layers
    .filter(isImageLayer)
    .slice()
    .sort(
      (left, right) =>
        ((right.width ?? 0) * (right.height ?? 0)) - ((left.width ?? 0) * (left.height ?? 0)),
    )

  return sortedImages[0] ?? null
}

function applyMediaToPage(
  page: KonvaPage,
  input: SlotBinderInput,
  warnings: string[],
) {
  const resolvedBackgroundUrl =
    input.backgroundImageUrl ??
    (input.backgroundMode === 'photo' ? input.photoUrl : undefined)

  if (resolvedBackgroundUrl) {
    const target = findPreferredImageTarget(page)
    if (target) {
      const updatedTarget: KonvaImageLayer = {
        ...target,
        src: resolvedBackgroundUrl,
        fit: 'cover',
        visible: true,
      }
      page.layers = page.layers.map((layer) => (layer.id === target.id ? updatedTarget : layer))
      return
    }

    page.layers = [
      {
        id: crypto.randomUUID(),
        type: 'image',
        name: 'Fundo gerado',
        role: 'background',
        x: 0,
        y: 0,
        width: page.width,
        height: page.height,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        draggable: true,
        src: resolvedBackgroundUrl,
        fit: 'cover',
      },
      ...page.layers,
    ]
    return
  }

  page.layers = page.layers.map((layer) => {
    if (layer.type === 'image' && isPlaceholderImageSource(layer.src)) {
      return { ...layer, visible: false }
    }

    if (layer.type === 'logo') {
      if (input.brandLogoUrl) {
        return { ...layer, src: input.brandLogoUrl, visible: true }
      }

      if (isPlaceholderImageSource(layer.src)) {
        return { ...layer, visible: false }
      }
    }

    return layer
  })

  const hasVisibleBackground = page.layers.some(
    (layer) => isImageLayer(layer) && layer.visible !== false,
  )

  if (!hasVisibleBackground) {
    page.background = input.brandColors?.[0] || page.background || '#111827'
    if (input.backgroundMode === 'ai') {
      warnings.push('Nao foi possivel aplicar o fundo IA; o template manteve o fundo padrao.')
    }
  }
}

function buildLayerAssignments(
  bindings: SlotBinding[],
  fieldValues: Partial<Record<SlotFieldKey, string>>,
): Partial<Record<SlotFieldKey, string>> {
  const assigned: Partial<Record<SlotFieldKey, string>> = {}
  const availableKeys = new Set(bindings.map((binding) => binding.fieldKey))

  for (const binding of bindings) {
    assigned[binding.fieldKey] = fieldValues[binding.fieldKey] ?? ''
  }

  const extras: string[] = []
  if (!availableKeys.has('badge') && fieldValues.badge) extras.push(fieldValues.badge)
  if (!availableKeys.has('footer_info_1') && fieldValues.footer_info_1) extras.push(fieldValues.footer_info_1)
  if (!availableKeys.has('footer_info_2') && fieldValues.footer_info_2) extras.push(fieldValues.footer_info_2)
  if (!availableKeys.has('cta') && fieldValues.cta) extras.push(fieldValues.cta)

  const descriptionTarget =
    (availableKeys.has('description') && 'description') ||
    (availableKeys.has('footer_info_1') && 'footer_info_1') ||
    (availableKeys.has('footer_info_2') && 'footer_info_2') ||
    (availableKeys.has('title') && 'title') ||
    bindings[0]?.fieldKey

  if (descriptionTarget) {
    const baseContent =
      fieldValues[descriptionTarget] ||
      (descriptionTarget === 'title' ? fieldValues.title : fieldValues.description) ||
      ''
    const merged = [baseContent, ...extras].filter(Boolean).join(descriptionTarget === 'title' ? ' - ' : '\n')
    assigned[descriptionTarget] = merged
  }

  if (!availableKeys.has('title') && fieldValues.title && descriptionTarget) {
    assigned[descriptionTarget] = [fieldValues.title, assigned[descriptionTarget]].filter(Boolean).join('\n')
  }

  return assigned
}

function toReviewFields(fieldValues: Partial<Record<SlotFieldKey, string>>): ReviewField[] {
  const sanitized = sanitizeFieldValues(fieldValues)

  return SLOT_PRIORITY.map((fieldKey) => ({
    key: fieldKey,
    label: SLOT_LABELS[fieldKey],
    value: sanitized[fieldKey] ?? '',
  })).filter((field) => field.value.trim().length > 0)
}

export function analyzeKonvaTemplate(template: KonvaTemplateDocument): TemplateAnalysis {
  const page = getPrimaryPage(template)
  const bindings = inferSlotBindings(template)
  const textLayers = page ? getTextLayers(page) : []
  const textCapacityScore = textLayers.reduce(
    (total, layer) =>
      total + Math.max(1, (layer.width ?? 0) * Math.max(1, layer.height ?? 0) / 10_000),
    0,
  )

  return {
    bindings,
    textLayerCount: textLayers.length,
    textCapacityScore,
    supportsBadge: bindings.some((binding) => binding.fieldKey === 'badge'),
    supportsCta: bindings.some((binding) => binding.fieldKey === 'cta'),
    supportsFooter: bindings.some((binding) =>
      binding.fieldKey === 'footer_info_1' || binding.fieldKey === 'footer_info_2',
    ),
    hasPhotoSlot: Boolean(page?.layers.some((layer) => isImageLayer(layer))),
  }
}

export function applyCopyToKonvaTemplate(
  template: KonvaTemplateDocument,
  input: SlotBinderInput,
): SlotBinderResult {
  const document = cloneKonvaDocument(template)
  const warnings: string[] = []
  const slotBindings = inferSlotBindings(document)
  document.slots = slotBindings
  const sanitizedFieldValues = sanitizeFieldValues(input.fieldValues)

  const assignedValues = buildLayerAssignments(slotBindings, sanitizedFieldValues)

  for (const binding of slotBindings) {
    const page = findLayerPage(document, binding.layerId)
    const layer = findTextLayer(document, binding.layerId)

    if (!page || !layer) {
      warnings.push(`Binding ${binding.fieldKey} sem layer valida no template.`)
      continue
    }

    const nextValue = assignedValues[binding.fieldKey] ?? sanitizedFieldValues[binding.fieldKey] ?? ''
    layer.text = nextValue
    layer.textStyle = {
      ...layer.textStyle,
      maxLines: binding.constraints?.maxLines ?? layer.textStyle?.maxLines ?? estimateMaxLines(layer),
      minFontSize: binding.constraints?.minFontSize ?? layer.textStyle?.minFontSize ?? 12,
      maxFontSize:
        binding.constraints?.maxFontSize ??
        layer.textStyle?.maxFontSize ??
        layer.textStyle?.fontSize ??
        24,
      overflowBehavior: toOverflowBehavior(binding),
    }
  }

  for (const page of document.design.pages) {
    applyMediaToPage(page, input, warnings)
  }

  if (input.brandLogoUrl) {
    document.identity.logoUrl = input.brandLogoUrl
  }

  if (input.brandColors && input.brandColors.length > 0) {
    document.identity.colors = input.brandColors
  }

  document.meta.updatedAt = new Date().toISOString()
  document.meta.isDirty = true

  return {
    document,
    slotBindings,
    fields: toReviewFields(sanitizedFieldValues),
    warnings: Array.from(new Set(warnings)),
  }
}
