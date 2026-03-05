/**
 * Layout Engine — Pure JavaScript, NO canvas/IPC/LLM dependencies.
 * Runs in the Electron renderer process (frontend).
 *
 * Exports:
 * - buildDraftLayout()  (Pass 1)
 * - resolveLayoutWithMeasurements()  (Pass 3)
 * - validateAnchorGraph()
 * - All types: DraftLayout, FinalLayout, MeasuredLayout, FontSources, etc.
 */

// --- Constants ---

export const SUPPORTED_ENGINE_VERSION = 1
export const SUPPORTED_SCHEMA_VERSION = 1

export const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  FEED_PORTRAIT: { width: 1080, height: 1350 },
  STORY: { width: 1080, height: 1920 },
  SQUARE: { width: 1024, height: 1024 },
}

const LINE_HEIGHT_MULTIPLIER = 1.2

const DEFAULT_SCALE: Record<string, number> = {
  xs: 18, sm: 24, md: 32, lg: 48, xl: 72,
}

// --- Types ---

export interface FontSources {
  title: { family: string; url: string | null }
  body: { family: string; url: string | null }
}

export interface SlotInput {
  [slotName: string]: string
}

interface SlotConfig {
  type: string
  anchor: string
  anchor_offset?: number
  margin_top?: number
  margin_bottom?: number
  max_words?: number
  max_lines?: number
  max_characters_per_line?: number
  line_break_strategy?: 'balanced' | 'natural' | 'fixed'
  allow_auto_scale?: boolean
  font_size?: string
  weight?: number
  uppercase?: boolean
  max_height_pct?: number
}

interface TemplateData {
  canvas: {
    format?: string
    ratio?: string
    safe_margin?: number
    safe_area?: { top?: number; bottom?: number }
  }
  zones?: {
    text_zone?: { x: number; width: number }
    image_focus_zone?: { x: number; width: number }
    gradient_zone?: { x: number; width: number }
  }
  layout?: {
    text_alignment?: string
    visual_balance?: string
  }
  overlay?: {
    type?: string
    direction?: string
    start_color?: string
    end_opacity?: number
    end_color?: string
    position?: string
    opacity?: number
  }
  typography?: {
    title_font?: string
    body_font?: string
    font_fallbacks?: string[]
    scale?: Record<string, number>
  }
  text_density?: {
    ideal_words?: number
    max_words?: number
  }
  colors?: Record<string, string>
  default_content?: Record<string, string>
  slot_priority?: string[]
  slot_drop_order?: string[]
  content_slots?: Record<string, SlotConfig>
  logo?: {
    placement?: string
    anchor_offset?: number
    min_margin?: number
    max_size_ratio?: number
  }
}

export interface DraftLayoutElement {
  slotName: string
  text: string
  font: string
  fontFallbacks: string[]
  sizePx: number
  weight: number
  color: string
  x: number
  y_draft: number
  align: 'left' | 'center' | 'right'
  maxWidth: number
  // Measurement params (Pass 2)
  uppercase: boolean
  lineBreakStrategy: 'balanced' | 'natural' | 'fixed'
  maxCharactersPerLine: number
  maxLines: number
  allowAutoScale: boolean
  slotMaxHeight: number
  // Recalculation metadata (Pass 3)
  anchorType: 'top_fixed' | 'bottom_fixed' | 'after' | 'before'
  anchorRef?: string
  anchorOffset?: number
  marginTop: number
  marginBottom: number
  estimatedHeight: number
  // Group tracking
  _group: 'top' | 'bottom'
}

export interface DraftLayout {
  elements: DraftLayoutElement[]
  overlay: {
    enabled: boolean
    type?: 'solid' | 'gradient'
    direction?: string
    position: 'top' | 'bottom' | 'full'
    opacity: number
    startColor?: string
    endOpacity?: number
    endColor?: string
  }
  fontSources: FontSources
  logo?: {
    placement: string
    anchorOffset: number
    minMargin: number
    maxSizeRatio: number
    logoUrl?: string
  }
  canvas: {
    width: number
    height: number
    usableTop: number
    usableBottom: number
  }
  shadow: boolean
  safeMargin?: number
  strictMode: boolean
}

export interface MeasuredSlot {
  slotName: string
  measuredHeight: number
  adjustedFontSize: number
  lines: string[]
  overflow: boolean
  fontFallbackUsed: boolean
}

export interface MeasuredLayout {
  slots: MeasuredSlot[]
}

export interface FinalLayoutElement {
  slotName: string
  text: string
  font: string
  fontFallbacks: string[]
  sizePx: number
  weight: number
  color: string
  x: number
  y_final: number
  align: 'left' | 'center' | 'right'
  maxWidth: number
  uppercase: boolean
  lines: string[]
  measuredHeight: number
  overflow: boolean
  fontFallbackUsed: boolean
}

export interface FinalLayout {
  elements: FinalLayoutElement[]
  overlay: DraftLayout['overlay']
  logo?: DraftLayout['logo']
  canvas: DraftLayout['canvas']
  shadow: boolean
  safeMargin?: number
}

// --- Errors ---

export class TemplateEngineVersionError extends Error {
  constructor(required: number, supported: number) {
    super(`Template requires engine version ${required}, but current engine supports up to ${supported}. Update the application.`)
    this.name = 'TemplateEngineVersionError'
  }
}

export class SlotOverflowError extends Error {
  public slotName: string
  constructor(slotName: string, message: string) {
    super(message)
    this.name = 'SlotOverflowError'
    this.slotName = slotName
  }
}

export class GroupOverlapError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GroupOverlapError'
  }
}

// --- Anchor Validation ---

export function validateAnchorGraph(slots: Record<string, SlotConfig>): void {
  const deps = new Map<string, string>()
  const groups = new Map<string, 'top' | 'bottom'>()

  for (const [name, config] of Object.entries(slots)) {
    const anchor = config.anchor
    if (anchor === 'top_fixed' || anchor.startsWith('after:')) {
      groups.set(name, 'top')
    } else if (anchor === 'bottom_fixed' || anchor.startsWith('before:')) {
      groups.set(name, 'bottom')
    }
  }

  for (const [name, config] of Object.entries(slots)) {
    const anchor = config.anchor
    if (anchor.startsWith('after:') || anchor.startsWith('before:')) {
      const ref = anchor.split(':')[1]
      if (!slots[ref]) {
        throw new Error(`Slot '${name}' referencia slot inexistente '${ref}'`)
      }
      deps.set(name, ref)

      const myGroup = groups.get(name)
      const refGroup = groups.get(ref)
      if (myGroup && refGroup && myGroup !== refGroup) {
        throw new Error(`Slot '${name}' (${myGroup}_group) referencia slot '${ref}' (${refGroup}_group)`)
      }
    }
  }

  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycle = [...path.slice(path.indexOf(node)), node]
      throw new Error(`Dependencia circular: ${cycle.join(' → ')}`)
    }
    if (visited.has(node)) return
    inStack.add(node)
    const dep = deps.get(node)
    if (dep) dfs(dep, [...path, node])
    inStack.delete(node)
    visited.add(node)
  }

  for (const name of Object.keys(slots)) {
    dfs(name, [])
  }
}

// --- Pass 1: Build Draft Layout ---

export function buildDraftLayout(
  slots: SlotInput,
  templateData: TemplateData,
  format: string,
  fontSources: FontSources,
  strictMode: boolean = false,
): DraftLayout {
  const dims = FORMAT_DIMENSIONS[format] ?? FORMAT_DIMENSIONS.FEED_PORTRAIT
  const { width: canvasWidth, height: canvasHeight } = dims

  const safeArea = templateData.canvas?.safe_area ?? { top: 0, bottom: 0 }
  const safeMargin = templateData.canvas?.safe_margin ?? 0
  const usableTop = safeArea.top ?? 0
  const usableBottom = canvasHeight - (safeArea.bottom ?? 0)
  const usableHeight = usableBottom - usableTop

  const contentSlots = templateData.content_slots ?? {}
  const typography = templateData.typography ?? {}
  const scale = typography.scale ?? DEFAULT_SCALE
  const fontFallbacks = typography.font_fallbacks ?? ['sans-serif']
  const colors = templateData.colors ?? {}
  const alignment = (templateData.layout?.text_alignment ?? 'left') as 'left' | 'center' | 'right'

  // Validate anchors
  if (Object.keys(contentSlots).length > 0) {
    validateAnchorGraph(contentSlots)
  }

  // Calculate text zone (C4)
  const textZone = templateData.zones?.text_zone
  let xBase: number
  let maxWidth: number

  if (textZone) {
    const zoneLeft = (textZone.x / 100) * canvasWidth
    const zoneWidth = (textZone.width / 100) * canvasWidth
    xBase = Math.max(zoneLeft, safeMargin)
    maxWidth = Math.min(zoneLeft + zoneWidth, canvasWidth - safeMargin) - xBase
  } else {
    xBase = safeMargin || Math.round(canvasWidth * 0.06)
    maxWidth = canvasWidth - 2 * xBase
  }

  // Resolve x position based on alignment
  let xPx: number
  if (alignment === 'center') {
    xPx = Math.round(canvasWidth / 2)
  } else if (alignment === 'right') {
    xPx = Math.round(xBase + maxWidth)
  } else {
    xPx = Math.round(xBase)
  }

  // Build elements
  const elements: DraftLayoutElement[] = []
  const slotPriority = templateData.slot_priority ?? Object.keys(contentSlots)

  for (const slotName of slotPriority) {
    const slotConfig = contentSlots[slotName]
    if (!slotConfig) continue

    const text = slots[slotName]
    if (!text || !text.trim()) continue

    const sizePx = scale[slotConfig.font_size ?? 'md'] ?? scale.md
    const maxLines = slotConfig.max_lines ?? 3
    const maxCharsPerLine = slotConfig.max_characters_per_line ?? 30

    // Estimate height (C3 heuristic)
    const estimatedLines = Math.min(
      maxLines,
      Math.ceil(text.length / maxCharsPerLine)
    )
    const estimatedHeight = estimatedLines * sizePx * LINE_HEIGHT_MULTIPLIER

    // Determine slot max height
    let slotMaxHeight: number
    if (slotConfig.max_height_pct) {
      slotMaxHeight = usableHeight * (slotConfig.max_height_pct / 100)
    } else {
      slotMaxHeight = maxLines * sizePx * LINE_HEIGHT_MULTIPLIER
    }

    // Determine font family based on slot type
    const isHeadline = ['label', 'headline'].includes(slotConfig.type) ||
      ['eyebrow', 'title'].includes(slotName)
    const font = isHeadline ? fontSources.title.family : fontSources.body.family

    // Determine anchor type
    let anchorType: 'top_fixed' | 'bottom_fixed' | 'after' | 'before'
    let anchorRef: string | undefined
    let anchorOffset: number | undefined
    let group: 'top' | 'bottom'

    const anchor = slotConfig.anchor
    if (anchor === 'top_fixed') {
      anchorType = 'top_fixed'
      anchorOffset = slotConfig.anchor_offset
      group = 'top'
    } else if (anchor === 'bottom_fixed') {
      anchorType = 'bottom_fixed'
      anchorOffset = slotConfig.anchor_offset
      group = 'bottom'
    } else if (anchor.startsWith('after:')) {
      anchorType = 'after'
      anchorRef = anchor.split(':')[1]
      group = 'top'
    } else if (anchor.startsWith('before:')) {
      anchorType = 'before'
      anchorRef = anchor.split(':')[1]
      group = 'bottom'
    } else {
      anchorType = 'top_fixed'
      group = 'top'
    }

    elements.push({
      slotName,
      text: text.trim(),
      font,
      fontFallbacks,
      sizePx,
      weight: slotConfig.weight ?? 400,
      color: colors[slotName] ?? '#FFFFFF',
      x: xPx,
      y_draft: 0, // calculated below
      align: alignment,
      maxWidth: Math.round(maxWidth),
      uppercase: slotConfig.uppercase ?? false,
      lineBreakStrategy: slotConfig.line_break_strategy ?? 'natural',
      maxCharactersPerLine: maxCharsPerLine,
      maxLines,
      allowAutoScale: slotConfig.allow_auto_scale !== false,
      slotMaxHeight: Math.round(slotMaxHeight),
      anchorType,
      anchorRef,
      anchorOffset,
      marginTop: slotConfig.margin_top ?? 0,
      marginBottom: slotConfig.margin_bottom ?? 0,
      estimatedHeight: Math.round(estimatedHeight),
      _group: group,
    })
  }

  // Resolve draft positions
  resolvePositions(elements, usableTop, usableBottom, usableHeight, 'estimated')

  // Build overlay config
  const overlay = templateData.overlay
  const overlayConfig = {
    enabled: !!overlay && overlay.type !== 'none',
    type: (overlay?.type ?? 'gradient') as 'solid' | 'gradient',
    direction: overlay?.direction,
    position: (overlay?.position ?? 'bottom') as 'top' | 'bottom' | 'full',
    opacity: typeof overlay?.opacity === 'number' ? overlay.opacity : 0.4,
    startColor: overlay?.start_color,
    endOpacity: overlay?.end_opacity,
    endColor: overlay?.end_color,
  }

  // Logo config
  const logoConfig = templateData.logo
    ? {
        placement: String(templateData.logo.placement ?? 'center_bottom'),
        anchorOffset: Number(templateData.logo.anchor_offset ?? 12),
        minMargin: Number(templateData.logo.min_margin ?? 80),
        maxSizeRatio: Number(templateData.logo.max_size_ratio ?? 0.12),
      }
    : undefined

  return {
    elements,
    overlay: overlayConfig,
    fontSources,
    logo: logoConfig,
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      usableTop,
      usableBottom,
    },
    shadow: true,
    safeMargin: safeMargin || undefined,
    strictMode,
  }
}

// --- Position Resolution (shared between draft and final) ---

function resolvePositions(
  elements: Array<{ slotName: string; anchorType: string; anchorRef?: string; anchorOffset?: number; marginTop: number; marginBottom: number; estimatedHeight: number; y_draft: number; _group: string }>,
  usableTop: number,
  usableBottom: number,
  usableHeight: number,
  _mode: 'estimated' | 'measured',
): void {
  const elementMap = new Map(elements.map(el => [el.slotName, el]))

  // Resolve top_group (top → bottom)
  const topGroup = elements.filter(el => el._group === 'top')
  // Sort: top_fixed first, then by dependency order
  const resolvedTop = new Set<string>()

  // First resolve top_fixed
  for (const el of topGroup) {
    if (el.anchorType === 'top_fixed') {
      const offset = el.anchorOffset ?? 0
      el.y_draft = usableTop + (usableHeight * offset / 100)
      resolvedTop.add(el.slotName)
    }
  }

  // Then resolve after: chains
  let changed = true
  while (changed) {
    changed = false
    for (const el of topGroup) {
      if (resolvedTop.has(el.slotName)) continue
      if (el.anchorType === 'after' && el.anchorRef) {
        const ref = elementMap.get(el.anchorRef)
        if (ref && resolvedTop.has(el.anchorRef)) {
          const refBottomY = ref.y_draft + ref.estimatedHeight
          el.y_draft = refBottomY + el.marginTop
          resolvedTop.add(el.slotName)
          changed = true
        }
      }
    }
  }

  // Resolve bottom_group (bottom → top)
  const bottomGroup = elements.filter(el => el._group === 'bottom')
  const resolvedBottom = new Set<string>()

  // First resolve bottom_fixed
  for (const el of bottomGroup) {
    if (el.anchorType === 'bottom_fixed') {
      const offset = el.anchorOffset ?? 0
      el.y_draft = usableBottom - (usableHeight * offset / 100) - el.estimatedHeight
      resolvedBottom.add(el.slotName)
    }
  }

  // Then resolve before: chains
  changed = true
  while (changed) {
    changed = false
    for (const el of bottomGroup) {
      if (resolvedBottom.has(el.slotName)) continue
      if (el.anchorType === 'before' && el.anchorRef) {
        const ref = elementMap.get(el.anchorRef)
        if (ref && resolvedBottom.has(el.anchorRef)) {
          el.y_draft = ref.y_draft - el.estimatedHeight - el.marginBottom
          resolvedBottom.add(el.slotName)
          changed = true
        }
      }
    }
  }

  // Round all positions
  for (const el of elements) {
    el.y_draft = Math.round(el.y_draft)
  }
}

// --- Pass 3: Resolve Layout with Measurements ---

export function resolveLayoutWithMeasurements(
  draft: DraftLayout,
  measurements: MeasuredLayout,
  options: { strictMode?: boolean } = {},
): FinalLayout {
  const strictMode = options.strictMode ?? draft.strictMode
  const { usableTop, usableBottom } = draft.canvas
  const usableHeight = usableBottom - usableTop

  // Build measurement map
  const measureMap = new Map(measurements.slots.map(m => [m.slotName, m]))

  // Build final elements with real heights
  const finalElements: (FinalLayoutElement & { _group: string; anchorType: string; anchorRef?: string; anchorOffset?: number; marginTop: number; marginBottom: number })[] = []

  for (const draftEl of draft.elements) {
    const measured = measureMap.get(draftEl.slotName)
    if (!measured) continue

    finalElements.push({
      slotName: draftEl.slotName,
      text: draftEl.text,
      font: draftEl.font,
      fontFallbacks: draftEl.fontFallbacks,
      sizePx: measured.adjustedFontSize,
      weight: draftEl.weight,
      color: draftEl.color,
      x: draftEl.x,
      y_final: 0, // resolved below
      align: draftEl.align,
      maxWidth: draftEl.maxWidth,
      uppercase: draftEl.uppercase,
      lines: measured.lines,
      measuredHeight: measured.measuredHeight,
      overflow: measured.overflow,
      fontFallbackUsed: measured.fontFallbackUsed,
      // Metadata for position resolution
      _group: draftEl._group,
      anchorType: draftEl.anchorType,
      anchorRef: draftEl.anchorRef,
      anchorOffset: draftEl.anchorOffset,
      marginTop: draftEl.marginTop,
      marginBottom: draftEl.marginBottom,
    })
  }

  // Resolve positions with real heights
  const elementMap = new Map(finalElements.map(el => [el.slotName, el]))

  // Top group
  const topGroup = finalElements.filter(el => el._group === 'top')
  const resolvedTop = new Set<string>()

  for (const el of topGroup) {
    if (el.anchorType === 'top_fixed') {
      const offset = el.anchorOffset ?? 0
      el.y_final = usableTop + (usableHeight * offset / 100)
      resolvedTop.add(el.slotName)
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const el of topGroup) {
      if (resolvedTop.has(el.slotName)) continue
      if (el.anchorType === 'after' && el.anchorRef) {
        const ref = elementMap.get(el.anchorRef)
        if (ref && resolvedTop.has(el.anchorRef)) {
          el.y_final = ref.y_final + ref.measuredHeight + el.marginTop
          resolvedTop.add(el.slotName)
          changed = true
        }
      }
    }
  }

  // Bottom group
  const bottomGroup = finalElements.filter(el => el._group === 'bottom')
  const resolvedBottom = new Set<string>()

  for (const el of bottomGroup) {
    if (el.anchorType === 'bottom_fixed') {
      const offset = el.anchorOffset ?? 0
      el.y_final = usableBottom - (usableHeight * offset / 100) - el.measuredHeight
      resolvedBottom.add(el.slotName)
    }
  }

  changed = true
  while (changed) {
    changed = false
    for (const el of bottomGroup) {
      if (resolvedBottom.has(el.slotName)) continue
      if (el.anchorType === 'before' && el.anchorRef) {
        const ref = elementMap.get(el.anchorRef)
        if (ref && resolvedBottom.has(el.anchorRef)) {
          el.y_final = ref.y_final - el.measuredHeight - el.marginBottom
          resolvedBottom.add(el.slotName)
          changed = true
        }
      }
    }
  }

  // Round positions
  for (const el of finalElements) {
    el.y_final = Math.round(el.y_final)
  }

  // Validate group overlap (C22 invariant 5)
  if (topGroup.length > 0 && bottomGroup.length > 0) {
    const topGroupBottom = Math.max(
      ...topGroup.map(el => el.y_final + el.measuredHeight)
    )
    const bottomGroupTop = Math.min(
      ...bottomGroup.map(el => el.y_final)
    )

    if (topGroupBottom > bottomGroupTop) {
      const overlapPx = Math.round(topGroupBottom - bottomGroupTop)
      if (strictMode) {
        throw new GroupOverlapError(
          `Top e bottom groups se sobrepoem em ${overlapPx}px`
        )
      } else {
        console.warn(`[layout-engine] Warning: group_overlap:${overlapPx}px`)
      }
    }
  }

  // Validate overflow visual (C21)
  const warnings: string[] = []
  for (const el of finalElements) {
    if (el.y_final < usableTop) {
      if (strictMode) {
        throw new SlotOverflowError(el.slotName, `Slot '${el.slotName}' overflow top`)
      }
      warnings.push(`slot_overflow_top:${el.slotName}`)
    }

    const bottomY = el.y_final + el.measuredHeight
    if (bottomY > usableBottom) {
      if (strictMode) {
        throw new SlotOverflowError(el.slotName, `Slot '${el.slotName}' overflow bottom`)
      }
      warnings.push(`slot_overflow_bottom:${el.slotName}`)
    }

    // Check slot overflow from Pass 2
    if (el.overflow && strictMode) {
      throw new SlotOverflowError(
        el.slotName,
        `Texto excede limite do slot '${el.slotName}'. Reduza o texto ou desative modo estrito.`
      )
    }
  }

  if (warnings.length > 0) {
    console.warn('[layout-engine] Overflow warnings:', warnings)
  }

  // Strip internal metadata from final output
  const cleanElements: FinalLayoutElement[] = finalElements.map(el => ({
    slotName: el.slotName,
    text: el.text,
    font: el.font,
    fontFallbacks: el.fontFallbacks,
    sizePx: el.sizePx,
    weight: el.weight,
    color: el.color,
    x: el.x,
    y_final: el.y_final,
    align: el.align,
    maxWidth: el.maxWidth,
    uppercase: el.uppercase,
    lines: el.lines,
    measuredHeight: el.measuredHeight,
    overflow: el.overflow,
    fontFallbackUsed: el.fontFallbackUsed,
  }))

  return {
    elements: cleanElements,
    overlay: draft.overlay,
    logo: draft.logo,
    canvas: draft.canvas,
    shadow: draft.shadow,
    safeMargin: draft.safeMargin,
  }
}
