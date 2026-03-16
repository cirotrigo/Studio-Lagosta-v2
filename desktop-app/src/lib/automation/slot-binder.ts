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
  { fieldKey: 'pre_title', pattern: /(pre|eyebrow|kicker|superti|assunto|tema|categoria)/i },
  { fieldKey: 'title', pattern: /(title|titulo|headline|hero|manchete)/i },
  { fieldKey: 'description', pattern: /(desc|descricao|descri|texto|copy|body|sub|legenda)/i },
  { fieldKey: 'cta', pattern: /(cta|call|botao|acao|action|button|saiba|confira|reserve)/i },
  { fieldKey: 'badge', pattern: /(badge|selo|tag|chip|sticker|price|preco|destaque|promo)/i },
  { fieldKey: 'footer_info_1', pattern: /(footer|rodape|info|contato|local|horario|endereco)/i },
  { fieldKey: 'footer_info_2', pattern: /(footer|rodape|info|contato|local|horario|endereco)/i },
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

export function inferSlotBindings(document: KonvaTemplateDocument, pageId?: string): SlotBinding[] {
  // Determine target page
  const targetPageId = pageId || document.design.currentPageId
  const targetPage = targetPageId
    ? document.design.pages.find((p) => p.id === targetPageId)
    : getPrimaryPage(document)

  if (!targetPage) {
    // Fallback to original behavior
    const page = getPrimaryPage(document)
    if (!page) return []
    return inferBindingsFromPage(document, page)
  }

  // Filter explicit slots to only include layers from the target page
  const targetLayerIds = new Set(targetPage.layers.map((l) => l.id))
  const explicit = document.slots.filter((binding) =>
    targetLayerIds.has(binding.layerId) && Boolean(findTextLayer(document, binding.layerId))
  )
  if (explicit.length > 0) {
    return explicit
  }

  // Infer from target page
  return inferBindingsFromPage(document, targetPage)
}

function inferBindingsFromPage(_document: KonvaTemplateDocument, page: KonvaPage): SlotBinding[] {
  const textLayers = getTextLayers(page)
  if (textLayers.length === 0) return []

  console.log('[SlotBinder] inferBindingsFromPage - text layers found:', {
    pageId: page.id,
    pageName: page.name,
    textLayersCount: textLayers.length,
    textLayers: textLayers.map((l) => ({
      id: l.id,
      name: l.name,
      fontSize: l.textStyle?.fontSize,
      y: l.y,
      height: l.height,
    })),
  })

  // Sort layers by Y position (top to bottom)
  const layersByY = [...textLayers].sort((a, b) => a.y - b.y)

  // Find the layer with largest font (likely the title)
  const largestFontLayer = [...textLayers].sort(
    (a, b) => (b.textStyle?.fontSize ?? 0) - (a.textStyle?.fontSize ?? 0),
  )[0]

  // Classify layers by their role based on position and size
  const pageMiddleY = page.height * 0.6

  const claimed = new Map<SlotFieldKey, KonvaTextLayer>()
  const usedLayers = new Set<string>()

  // Helper to claim a layer
  const claim = (fieldKey: SlotFieldKey, layer: KonvaTextLayer) => {
    if (!claimed.has(fieldKey) && !usedLayers.has(layer.id)) {
      claimed.set(fieldKey, layer)
      usedLayers.add(layer.id)
      return true
    }
    return false
  }

  // Step 1: Try to match by name patterns first (user-defined names take priority)
  for (const layer of textLayers) {
    for (const pattern of BINDING_PATTERNS) {
      if (pattern.pattern.test(layer.name ?? '')) {
        // Only break if claim succeeds - otherwise try next matching pattern
        if (claim(pattern.fieldKey, layer)) {
          break
        }
      }
    }
  }

  // Step 2: Identify title (largest font or first unclaimed large font)
  if (!claimed.has('title') && largestFontLayer && !usedLayers.has(largestFontLayer.id)) {
    claim('title', largestFontLayer)
  }

  // Step 3: Identify pre_title (small text ABOVE the title)
  const titleLayer = claimed.get('title')
  if (!claimed.has('pre_title') && titleLayer) {
    const preTitle = layersByY.find(
      (l) =>
        !usedLayers.has(l.id) &&
        l.y < titleLayer.y &&
        (l.textStyle?.fontSize ?? 0) < (titleLayer.textStyle?.fontSize ?? 0),
    )
    if (preTitle) claim('pre_title', preTitle)
  }

  // Step 4: Identify description (text below title, before footer zone)
  if (!claimed.has('description') && titleLayer) {
    const desc = layersByY.find(
      (l) =>
        !usedLayers.has(l.id) &&
        l.y > titleLayer.y &&
        l.y < pageMiddleY + page.height * 0.2,
    )
    if (desc) claim('description', desc)
  }

  // Step 5: Identify footer layers (bottom 25% of page)
  const footerThreshold = page.height * 0.75
  const footerLayers = layersByY.filter(
    (l) => !usedLayers.has(l.id) && l.y >= footerThreshold,
  )

  if (footerLayers.length >= 1 && !claimed.has('footer_info_1')) {
    claim('footer_info_1', footerLayers[0])
  }
  if (footerLayers.length >= 2 && !claimed.has('footer_info_2')) {
    claim('footer_info_2', footerLayers[1])
  }

  // Step 6: Identify badge (small height layer in top area)
  if (!claimed.has('badge')) {
    const badge = textLayers.find(
      (l) =>
        !usedLayers.has(l.id) &&
        l.y < page.height * 0.4 &&
        (l.height ?? 100) < page.height * 0.08,
    )
    if (badge) claim('badge', badge)
  }

  // Step 7: Identify CTA (remaining layer, often smaller width)
  if (!claimed.has('cta')) {
    const cta = textLayers.find(
      (l) => !usedLayers.has(l.id) && (l.width ?? page.width) < page.width * 0.6,
    )
    if (cta) claim('cta', cta)
  }

  // Step 8: Map remaining unclaimed layers to available field keys
  const remainingLayers = layersByY.filter((l) => !usedLayers.has(l.id))
  const availableFieldKeys = SLOT_PRIORITY.filter((fk) => !claimed.has(fk))

  for (let i = 0; i < Math.min(remainingLayers.length, availableFieldKeys.length); i++) {
    claim(availableFieldKeys[i], remainingLayers[i])
  }

  const bindings = Array.from(claimed.entries()).map(([fieldKey, layer]) =>
    buildBinding(page, layer, fieldKey),
  )

  console.log('[SlotBinder] inferBindingsFromPage - final bindings:', {
    bindingsCount: bindings.length,
    bindings: bindings.map((b) => ({ fieldKey: b.fieldKey, layerId: b.layerId })),
    unmappedLayers: textLayers
      .filter((l) => !usedLayers.has(l.id))
      .map((l) => ({ id: l.id, name: l.name })),
  })

  return bindings
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

  // Get current page - this is the page we will modify
  const currentPageId = document.design.currentPageId
  const currentPage = document.design.pages.find((p) => p.id === currentPageId)
    ?? document.design.pages[0]

  if (!currentPage) {
    return {
      document,
      slotBindings: [],
      fields: [],
      warnings: ['Template sem página para aplicar conteúdo.'],
    }
  }

  // Infer slots ONLY from the current page
  const slotBindings = inferSlotBindings(document, currentPage.id)
  document.slots = slotBindings
  const sanitizedFieldValues = sanitizeFieldValues(input.fieldValues)

  console.log('[SlotBinder] applyCopyToKonvaTemplate:', {
    currentPageId: currentPage.id,
    currentPageName: currentPage.name,
    slotBindingsCount: slotBindings.length,
    slotBindings: slotBindings.map((b) => ({ fieldKey: b.fieldKey, layerId: b.layerId })),
  })

  const assignedValues = buildLayerAssignments(slotBindings, sanitizedFieldValues)

  // Apply text to layers IN THE CURRENT PAGE ONLY
  for (const binding of slotBindings) {
    // Find layer directly in the current page (not searching all pages)
    const layer = currentPage.layers.find((l) => l.id === binding.layerId)

    if (!layer || !isTextLayer(layer)) {
      warnings.push(`Binding ${binding.fieldKey} sem layer valida na página atual.`)
      continue
    }

    const nextValue = assignedValues[binding.fieldKey] ?? sanitizedFieldValues[binding.fieldKey] ?? ''
    console.log('[SlotBinder] Applying text to layer:', {
      fieldKey: binding.fieldKey,
      layerId: binding.layerId,
      layerName: layer.name,
      pageId: currentPage.id,
      oldText: layer.text?.substring(0, 30),
      newText: nextValue.substring(0, 30),
    })
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

  // Apply media to the current page
  applyMediaToPage(currentPage, input, warnings)

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
