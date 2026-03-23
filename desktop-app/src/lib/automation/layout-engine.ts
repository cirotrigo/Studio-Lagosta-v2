/**
 * Adaptive Layout Engine
 *
 * Generates dynamic Konva template layouts based on selected fields,
 * format, and brand assets. Replaces the fixed fallback template with
 * intelligent compositions that adapt to the content.
 *
 * Layout strategies:
 * - hero:      1-2 fields  → large centered title, optional CTA
 * - headline:  2-3 fields  → prominent title + support text
 * - card:      3-5 fields  → semi-transparent card overlay
 * - full:      5-7 fields  → structured card with all info
 */

import type {
  ArtFormat,
  KonvaPage,
  KonvaTextLayer,
  KonvaShapeLayer,
  KonvaImageLayer,
  KonvaLogoLayer,
  KonvaGradientLayer,
  Layer,
  SlotFieldKey,
  SlotBinding,
  KonvaTemplateDocument,
} from '@/types/template'
import { createBlankPage } from '@/lib/editor/document'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LayoutStrategy = 'hero' | 'headline' | 'card' | 'full'

interface BrandContext {
  titleFont: string
  bodyFont: string
  primary: string
  accent: string
  surface: string
  logoUrl?: string
  projectName?: string
}

interface LayoutEngineInput {
  format: ArtFormat
  includedFields: SlotFieldKey[]
  photoUrl?: string
  brand: BrandContext
  projectId: number
}

interface FieldLayout {
  fieldKey: SlotFieldKey
  layerId: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontWeight: string
  fontFamily: string
  fill: string
  maxLines: number
  minFontSize: number
  maxFontSize: number
  lineHeight: number
  align?: 'left' | 'center' | 'right'
  textTransform?: 'uppercase' | 'none'
  overflowBehavior: 'autoScale' | 'ellipsis' | 'clip'
}

// ---------------------------------------------------------------------------
// Strategy selection
// ---------------------------------------------------------------------------

function pickStrategy(fields: SlotFieldKey[]): LayoutStrategy {
  const count = fields.length
  if (count <= 2) return 'hero'
  if (count <= 3) return 'headline'
  if (count <= 5) return 'card'
  return 'full'
}

// ---------------------------------------------------------------------------
// Dimension helpers
// ---------------------------------------------------------------------------

function dims(format: ArtFormat) {
  const sizes: Record<ArtFormat, { w: number; h: number }> = {
    STORY: { w: 1080, h: 1920 },
    FEED_PORTRAIT: { w: 1080, h: 1350 },
    SQUARE: { w: 1080, h: 1080 },
  }
  return sizes[format]
}

/** Horizontal margin from edges */
function mx(format: ArtFormat) {
  return Math.round(dims(format).w * 0.08)
}

/** Content width */
function cw(format: ArtFormat) {
  return dims(format).w - mx(format) * 2
}

// ---------------------------------------------------------------------------
// Layout strategies
// ---------------------------------------------------------------------------

function layoutHero(format: ArtFormat, fields: SlotFieldKey[], brand: BrandContext): FieldLayout[] {
  const { w, h } = dims(format)
  const margin = mx(format)
  const contentW = cw(format)
  const layouts: FieldLayout[] = []

  const hasTitle = fields.includes('title')
  const hasCta = fields.includes('cta')
  const hasBadge = fields.includes('badge')
  const hasPreTitle = fields.includes('pre_title')
  const hasDesc = fields.includes('description')

  // Title — big and centered
  if (hasTitle) {
    const titleFontSize = format === 'SQUARE' ? 72 : 82
    layouts.push({
      fieldKey: 'title',
      layerId: crypto.randomUUID(),
      x: margin,
      y: Math.round(h * 0.38),
      width: contentW,
      height: Math.round(h * 0.22),
      fontSize: titleFontSize,
      fontWeight: '800',
      fontFamily: brand.titleFont,
      fill: '#FFFFFF',
      maxLines: 3,
      minFontSize: 32,
      maxFontSize: titleFontSize,
      lineHeight: 1.05,
      align: 'center',
      overflowBehavior: 'autoScale',
    })
  }

  // Pre-title above the title
  if (hasPreTitle) {
    layouts.push({
      fieldKey: 'pre_title',
      layerId: crypto.randomUUID(),
      x: margin,
      y: Math.round(h * 0.33),
      width: contentW,
      height: 50,
      fontSize: 26,
      fontWeight: '600',
      fontFamily: brand.bodyFont,
      fill: brand.accent,
      maxLines: 1,
      minFontSize: 18,
      maxFontSize: 26,
      lineHeight: 1.1,
      align: 'center',
      textTransform: 'uppercase',
      overflowBehavior: 'ellipsis',
    })
  }

  // Description below title
  if (hasDesc) {
    layouts.push({
      fieldKey: 'description',
      layerId: crypto.randomUUID(),
      x: Math.round(w * 0.12),
      y: Math.round(h * 0.62),
      width: Math.round(w * 0.76),
      height: Math.round(h * 0.1),
      fontSize: 28,
      fontWeight: '500',
      fontFamily: brand.bodyFont,
      fill: 'rgba(255,255,255,0.9)',
      maxLines: 3,
      minFontSize: 20,
      maxFontSize: 28,
      lineHeight: 1.3,
      align: 'center',
      overflowBehavior: 'autoScale',
    })
  }

  // CTA at bottom
  if (hasCta) {
    layouts.push({
      fieldKey: 'cta',
      layerId: crypto.randomUUID(),
      x: Math.round(w * 0.2),
      y: Math.round(h * 0.78),
      width: Math.round(w * 0.6),
      height: 60,
      fontSize: 24,
      fontWeight: '800',
      fontFamily: brand.bodyFont,
      fill: brand.accent,
      maxLines: 1,
      minFontSize: 18,
      maxFontSize: 24,
      lineHeight: 1,
      align: 'center',
      textTransform: 'uppercase',
      overflowBehavior: 'autoScale',
    })
  }

  // Badge floating top
  if (hasBadge) {
    layouts.push({
      fieldKey: 'badge',
      layerId: crypto.randomUUID(),
      x: Math.round(w * 0.3),
      y: Math.round(h * 0.25),
      width: Math.round(w * 0.4),
      height: 46,
      fontSize: 22,
      fontWeight: '700',
      fontFamily: brand.bodyFont,
      fill: brand.accent,
      maxLines: 1,
      minFontSize: 16,
      maxFontSize: 22,
      lineHeight: 1,
      align: 'center',
      textTransform: 'uppercase',
      overflowBehavior: 'ellipsis',
    })
  }

  return layouts
}

function layoutHeadline(format: ArtFormat, fields: SlotFieldKey[], brand: BrandContext): FieldLayout[] {
  const { h } = dims(format)
  const margin = mx(format)
  const contentW = cw(format)
  const layouts: FieldLayout[] = []

  // Content area: bottom 40% of canvas
  const contentTop = Math.round(h * 0.55)
  let cursor = contentTop

  if (fields.includes('badge')) {
    layouts.push({
      fieldKey: 'badge',
      layerId: crypto.randomUUID(),
      x: margin,
      y: cursor,
      width: Math.round(contentW * 0.5),
      height: 42,
      fontSize: 22,
      fontWeight: '700',
      fontFamily: brand.bodyFont,
      fill: brand.accent,
      maxLines: 1,
      minFontSize: 16,
      maxFontSize: 22,
      lineHeight: 1.1,
      textTransform: 'uppercase',
      overflowBehavior: 'ellipsis',
    })
    cursor += 50
  }

  if (fields.includes('pre_title')) {
    layouts.push({
      fieldKey: 'pre_title',
      layerId: crypto.randomUUID(),
      x: margin,
      y: cursor,
      width: contentW,
      height: 42,
      fontSize: 24,
      fontWeight: '600',
      fontFamily: brand.bodyFont,
      fill: brand.accent,
      maxLines: 1,
      minFontSize: 18,
      maxFontSize: 24,
      lineHeight: 1.1,
      textTransform: 'uppercase',
      overflowBehavior: 'ellipsis',
    })
    cursor += 48
  }

  if (fields.includes('title')) {
    const titleH = Math.round(h * 0.14)
    const titleFs = format === 'SQUARE' ? 56 : 64
    layouts.push({
      fieldKey: 'title',
      layerId: crypto.randomUUID(),
      x: margin,
      y: cursor,
      width: contentW,
      height: titleH,
      fontSize: titleFs,
      fontWeight: '800',
      fontFamily: brand.titleFont,
      fill: '#FFFFFF',
      maxLines: 3,
      minFontSize: 28,
      maxFontSize: titleFs,
      lineHeight: 1.05,
      overflowBehavior: 'autoScale',
    })
    cursor += titleH + 12
  }

  if (fields.includes('description')) {
    const descH = Math.round(h * 0.08)
    layouts.push({
      fieldKey: 'description',
      layerId: crypto.randomUUID(),
      x: margin,
      y: cursor,
      width: Math.round(contentW * 0.85),
      height: descH,
      fontSize: 26,
      fontWeight: '500',
      fontFamily: brand.bodyFont,
      fill: 'rgba(255,255,255,0.85)',
      maxLines: 3,
      minFontSize: 18,
      maxFontSize: 26,
      lineHeight: 1.3,
      overflowBehavior: 'autoScale',
    })
    cursor += descH + 16
  }

  if (fields.includes('cta')) {
    layouts.push({
      fieldKey: 'cta',
      layerId: crypto.randomUUID(),
      x: margin,
      y: cursor,
      width: Math.round(contentW * 0.5),
      height: 48,
      fontSize: 22,
      fontWeight: '800',
      fontFamily: brand.bodyFont,
      fill: brand.accent,
      maxLines: 1,
      minFontSize: 16,
      maxFontSize: 22,
      lineHeight: 1,
      textTransform: 'uppercase',
      overflowBehavior: 'autoScale',
    })
  }

  return layouts
}

function layoutCard(format: ArtFormat, fields: SlotFieldKey[], brand: BrandContext): FieldLayout[] {
  const { h } = dims(format)
  const margin = mx(format)
  const contentW = cw(format)
  const layouts: FieldLayout[] = []

  // Calculate card dimensions based on field count
  const fieldCount = fields.length
  const cardPadding = 40
  const innerW = contentW - cardPadding * 2

  // Estimate content height per field
  const fieldHeights: Record<SlotFieldKey, number> = {
    badge: 44,
    pre_title: 44,
    title: format === 'SQUARE' ? 130 : 160,
    description: 110,
    cta: 50,
    footer_info_1: 50,
    footer_info_2: 46,
  }

  const totalContentH = fields.reduce((sum, f) => sum + fieldHeights[f], 0)
    + (fieldCount - 1) * 8 // gap between fields
  const cardH = totalContentH + cardPadding * 2
  const cardTop = Math.round(h * 0.52 - cardH * 0.1) // anchor slightly above center-bottom
  const cardX = margin
  let cursor = cardTop + cardPadding

  // Build field layouts inside card
  if (fields.includes('badge')) {
    layouts.push({
      fieldKey: 'badge',
      layerId: crypto.randomUUID(),
      x: cardX + cardPadding,
      y: cursor,
      width: Math.round(innerW * 0.5),
      height: 44,
      fontSize: 24,
      fontWeight: '700',
      fontFamily: brand.bodyFont,
      fill: brand.accent,
      maxLines: 1,
      minFontSize: 16,
      maxFontSize: 24,
      lineHeight: 1.1,
      textTransform: 'uppercase',
      overflowBehavior: 'ellipsis',
    })
    cursor += 52
  }

  if (fields.includes('pre_title')) {
    layouts.push({
      fieldKey: 'pre_title',
      layerId: crypto.randomUUID(),
      x: cardX + cardPadding,
      y: cursor,
      width: innerW,
      height: 44,
      fontSize: 24,
      fontWeight: '600',
      fontFamily: brand.bodyFont,
      fill: brand.primary,
      maxLines: 1,
      minFontSize: 18,
      maxFontSize: 24,
      lineHeight: 1.1,
      textTransform: 'uppercase',
      overflowBehavior: 'ellipsis',
    })
    cursor += 50
  }

  if (fields.includes('title')) {
    const titleFs = format === 'SQUARE' ? 52 : 60
    const titleH = fieldHeights.title
    layouts.push({
      fieldKey: 'title',
      layerId: crypto.randomUUID(),
      x: cardX + cardPadding,
      y: cursor,
      width: innerW,
      height: titleH,
      fontSize: titleFs,
      fontWeight: '800',
      fontFamily: brand.titleFont,
      fill: brand.primary,
      maxLines: 3,
      minFontSize: 26,
      maxFontSize: titleFs,
      lineHeight: 1.05,
      overflowBehavior: 'autoScale',
    })
    cursor += titleH + 8
  }

  if (fields.includes('description')) {
    layouts.push({
      fieldKey: 'description',
      layerId: crypto.randomUUID(),
      x: cardX + cardPadding,
      y: cursor,
      width: innerW,
      height: 110,
      fontSize: 26,
      fontWeight: '500',
      fontFamily: brand.bodyFont,
      fill: '#4B5563',
      maxLines: 4,
      minFontSize: 18,
      maxFontSize: 26,
      lineHeight: 1.3,
      overflowBehavior: 'autoScale',
    })
    cursor += 118
  }

  // Footer area at bottom of card
  const hasFooter1 = fields.includes('footer_info_1')
  const hasFooter2 = fields.includes('footer_info_2')
  const hasCta = fields.includes('cta')

  if (hasFooter1) {
    layouts.push({
      fieldKey: 'footer_info_1',
      layerId: crypto.randomUUID(),
      x: cardX + cardPadding,
      y: cursor,
      width: hasCta ? Math.round(innerW * 0.6) : innerW,
      height: 50,
      fontSize: 20,
      fontWeight: '600',
      fontFamily: brand.bodyFont,
      fill: brand.primary,
      maxLines: 2,
      minFontSize: 14,
      maxFontSize: 20,
      lineHeight: 1.2,
      overflowBehavior: 'autoScale',
    })
    cursor += 54
  }

  if (hasFooter2) {
    layouts.push({
      fieldKey: 'footer_info_2',
      layerId: crypto.randomUUID(),
      x: cardX + cardPadding,
      y: cursor,
      width: innerW,
      height: 46,
      fontSize: 18,
      fontWeight: '500',
      fontFamily: brand.bodyFont,
      fill: '#6B7280',
      maxLines: 2,
      minFontSize: 14,
      maxFontSize: 18,
      lineHeight: 1.2,
      overflowBehavior: 'autoScale',
    })
    cursor += 50
  }

  if (hasCta) {
    const ctaY = hasFooter1 ? cursor - 104 : cursor
    layouts.push({
      fieldKey: 'cta',
      layerId: crypto.randomUUID(),
      x: cardX + cardPadding + Math.round(innerW * 0.62),
      y: ctaY,
      width: Math.round(innerW * 0.35),
      height: 50,
      fontSize: 22,
      fontWeight: '800',
      fontFamily: brand.bodyFont,
      fill: brand.accent,
      maxLines: 1,
      minFontSize: 16,
      maxFontSize: 22,
      lineHeight: 1,
      align: 'right',
      textTransform: 'uppercase',
      overflowBehavior: 'autoScale',
    })
  }

  return layouts
}

// Full layout reuses card but with more density
function layoutFull(format: ArtFormat, fields: SlotFieldKey[], brand: BrandContext): FieldLayout[] {
  return layoutCard(format, fields, brand)
}

// ---------------------------------------------------------------------------
// Layer builders
// ---------------------------------------------------------------------------

function buildTextLayer(fl: FieldLayout): KonvaTextLayer {
  return {
    id: fl.layerId,
    type: 'text',
    name: fieldLabel(fl.fieldKey),
    x: fl.x,
    y: fl.y,
    width: fl.width,
    height: fl.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    draggable: true,
    text: '',
    textStyle: {
      fontFamily: fl.fontFamily,
      fontSize: fl.fontSize,
      fontWeight: fl.fontWeight,
      lineHeight: fl.lineHeight,
      fill: fl.fill,
      maxLines: fl.maxLines,
      minFontSize: fl.minFontSize,
      maxFontSize: fl.maxFontSize,
      overflowBehavior: fl.overflowBehavior,
      align: fl.align,
      textTransform: fl.textTransform,
    },
  }
}

function fieldLabel(key: SlotFieldKey): string {
  const labels: Record<SlotFieldKey, string> = {
    pre_title: 'Pre-titulo',
    title: 'Titulo',
    description: 'Descricao',
    badge: 'Badge',
    cta: 'CTA',
    footer_info_1: 'Info rodape 1',
    footer_info_2: 'Info rodape 2',
  }
  return labels[key]
}

function buildBackgroundLayer(page: KonvaPage, photoUrl?: string): KonvaImageLayer {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    name: 'Fundo',
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
    src: photoUrl ?? '',
    fit: 'cover',
  }
}

function buildDarkOverlay(page: KonvaPage, strategy: LayoutStrategy): KonvaGradientLayer {
  // Hero and headline get a gradient from bottom for text readability
  // Card and full get a lighter overlay since the card provides contrast
  const isHeroLike = strategy === 'hero' || strategy === 'headline'

  return {
    id: crypto.randomUUID(),
    type: 'gradient',
    name: 'Overlay escuro',
    x: 0,
    y: 0,
    width: page.width,
    height: page.height,
    rotation: 0,
    opacity: isHeroLike ? 0.7 : 0.35,
    visible: true,
    locked: true,
    draggable: false,
    colors: ['transparent', '#000000'],
    stops: isHeroLike ? [0.15, 0.95] : [0.0, 1.0],
    angle: 180,
    gradientType: 'linear',
  }
}

function buildCardShape(
  page: KonvaPage,
  fields: SlotFieldKey[],
  brand: BrandContext,
  format: ArtFormat,
): KonvaShapeLayer | null {
  const strategy = pickStrategy(fields)
  if (strategy !== 'card' && strategy !== 'full') return null

  const margin = mx(format)
  const cardPadding = 40

  // Recalculate card height to match field layout
  const fieldHeights: Record<SlotFieldKey, number> = {
    badge: 44,
    pre_title: 44,
    title: format === 'SQUARE' ? 130 : 160,
    description: 110,
    cta: 50,
    footer_info_1: 50,
    footer_info_2: 46,
  }
  const totalContentH = fields.reduce((sum, f) => sum + fieldHeights[f], 0)
    + (fields.length - 1) * 8
  const cardH = totalContentH + cardPadding * 2
  const cardTop = Math.round(page.height * 0.52 - cardH * 0.1)

  return {
    id: crypto.randomUUID(),
    type: 'shape',
    name: 'Card',
    x: margin,
    y: cardTop,
    width: page.width - margin * 2,
    height: cardH,
    rotation: 0,
    opacity: 0.94,
    visible: true,
    locked: false,
    draggable: true,
    shape: 'rounded-rectangle',
    fill: brand.surface,
    stroke: brand.accent,
    strokeWidth: 2,
    cornerRadius: 36,
  }
}

function buildLogoLayer(page: KonvaPage, logoUrl?: string): KonvaLogoLayer {
  return {
    id: crypto.randomUUID(),
    type: 'logo',
    name: 'Logo',
    x: Math.round(page.width * 0.78),
    y: Math.round(page.height * 0.04),
    width: 160,
    height: 160,
    rotation: 0,
    opacity: 1,
    visible: Boolean(logoUrl),
    locked: false,
    draggable: true,
    src: logoUrl || '',
    preserveAspectRatio: true,
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateAdaptiveLayout(input: LayoutEngineInput): KonvaTemplateDocument {
  const { format, includedFields, photoUrl, brand, projectId } = input

  // Ensure title is always present
  const fields = includedFields.includes('title')
    ? includedFields
    : ['title' as SlotFieldKey, ...includedFields]

  // Determine strategy
  const strategy = pickStrategy(fields)

  // Create blank page
  const page = createBlankPage(format, 0, {
    background: brand.primary,
  })

  // Pick layout function
  const layoutFn = {
    hero: layoutHero,
    headline: layoutHeadline,
    card: layoutCard,
    full: layoutFull,
  }[strategy]

  const fieldLayouts = layoutFn(format, fields, brand)

  // Build layers in visual order (back to front)
  const layers: Layer[] = []

  // 1. Background image
  layers.push(buildBackgroundLayer(page, photoUrl))

  // 2. Overlay gradient (for hero/headline) or card shape
  if (strategy === 'hero' || strategy === 'headline') {
    layers.push(buildDarkOverlay(page, strategy))
  }

  const cardShape = buildCardShape(page, fields, brand, format)
  if (cardShape) {
    // Light overlay behind card for depth
    layers.push(buildDarkOverlay(page, strategy))
    layers.push(cardShape)
  }

  // 3. Text layers
  for (const fl of fieldLayouts) {
    layers.push(buildTextLayer(fl))
  }

  // 4. Logo
  layers.push(buildLogoLayer(page, brand.logoUrl))

  page.layers = layers

  // Build slot bindings
  const slots: SlotBinding[] = fieldLayouts.map((fl) => ({
    id: `slot-${fl.layerId}`,
    layerId: fl.layerId,
    fieldKey: fl.fieldKey,
    label: fieldLabel(fl.fieldKey),
    constraints: {
      maxLines: fl.maxLines,
      minFontSize: fl.minFontSize,
      maxFontSize: fl.maxFontSize,
      overflowBehavior: fl.overflowBehavior === 'autoScale' ? 'scale-down' : fl.overflowBehavior,
    },
  }))

  const strategyLabels: Record<LayoutStrategy, string> = {
    hero: 'Hero',
    headline: 'Headline',
    card: 'Card',
    full: 'Completo',
  }

  const now = new Date().toISOString()

  return {
    schemaVersion: 2,
    id: `adaptive-${projectId}-${format.toLowerCase()}-${strategy}`,
    projectId,
    engine: 'KONVA',
    name: `${strategyLabels[strategy]} ${format}`,
    format,
    source: 'local',
    design: {
      pages: [page],
      currentPageId: page.id,
    },
    identity: {
      brandName: brand.projectName,
      logoUrl: brand.logoUrl,
      colors: [brand.primary, brand.accent, brand.surface],
      fonts: [],
    },
    slots,
    meta: {
      createdAt: now,
      updatedAt: now,
      isDirty: true,
    },
  }
}

export { pickStrategy, type LayoutStrategy }
