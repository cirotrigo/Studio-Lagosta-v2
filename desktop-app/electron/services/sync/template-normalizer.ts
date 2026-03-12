/**
 * Template Normalizer - Bidirectional normalization between local Konva format and web format
 *
 * This module ensures templates can be synced between the desktop app and web without data loss.
 */

import type { KonvaTemplateDocument, KonvaPage, KonvaLayer } from '../../ipc/konva-ipc-types'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface NormalizationWarning {
  field: string
  message: string
  action: 'default_applied' | 'field_removed' | 'type_coerced' | 'field_renamed'
}

export interface NormalizationError {
  field: string
  message: string
  fatal: boolean
}

export interface NormalizationResult<T> {
  success: boolean
  data: T
  warnings: NormalizationWarning[]
  errors: NormalizationError[]
}

export interface NormalizationConfig {
  strict: boolean
  preserveUnknownFields: boolean
  applyDefaults: boolean
}

export interface WebDesignData {
  canvas: {
    width: number
    height: number
    backgroundColor?: string
  }
  pages: WebPage[]
  layers?: WebLayer[]
  slots?: unknown[]
}

export interface WebPage {
  id: string
  name: string
  width: number
  height: number
  layers: WebLayer[]
  background?: string
  order: number
  thumbnail?: string
}

export interface WebLayer {
  id: string
  type: string
  name: string
  visible: boolean
  locked: boolean
  order: number
  position: { x: number; y: number }
  size: { width: number; height: number }
  rotation?: number
  content?: string
  style?: WebLayerStyle
  textboxConfig?: WebTextboxConfig
  [key: string]: unknown
}

export interface WebTextboxConfig {
  spacing?: number
  anchor?: 'top' | 'middle' | 'bottom'
  autoResize?: { minFontSize: number; maxFontSize: number }
  [key: string]: unknown
}

export interface WebLayerStyle {
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic'
  color?: string
  fill?: string
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  letterSpacing?: number
  lineHeight?: number
  gradientType?: 'linear' | 'radial'
  gradientAngle?: number
  gradientStops?: Array<{ id: string; color: string; position: number; opacity: number }>
  objectFit?: 'contain' | 'cover' | 'fill'
  opacity?: number
  [key: string]: unknown
}

export interface WebTemplatePayload {
  name: string
  type: 'STORY' | 'FEED' | 'SQUARE'
  dimensions: string
  designData: WebDesignData
  localId: string
  projectId: number
  thumbnailUrl?: string
}

// ─────────────────────────────────────────────────────────────────
// Default configuration
// ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: NormalizationConfig = {
  strict: false,
  preserveUnknownFields: true,
  applyDefaults: true,
}

// ─────────────────────────────────────────────────────────────────
// Format conversion helpers
// ─────────────────────────────────────────────────────────────────

function localFormatToWeb(format: string): 'STORY' | 'FEED' | 'SQUARE' {
  if (format === 'FEED_PORTRAIT') return 'FEED'
  if (format === 'STORY' || format === 'SQUARE') return format
  return 'STORY'
}

function webFormatToLocal(type: string): 'STORY' | 'FEED_PORTRAIT' | 'SQUARE' {
  if (type === 'FEED') return 'FEED_PORTRAIT'
  if (type === 'STORY' || type === 'SQUARE') return type
  return 'STORY'
}

function formatToDimensions(format: string): string {
  switch (format) {
    case 'STORY': return '1080x1920'
    case 'FEED_PORTRAIT': return '1080x1350'
    case 'FEED': return '1080x1350'
    case 'SQUARE': return '1080x1080'
    default: return '1080x1920'
  }
}

// ─────────────────────────────────────────────────────────────────
// Layer conversion: Local → Web
// ─────────────────────────────────────────────────────────────────

function localLayerToWeb(layer: KonvaLayer, warnings: NormalizationWarning[]): WebLayer {
  const layerType = layer.type || 'element'
  const x = typeof layer.x === 'number' ? layer.x : 0
  const y = typeof layer.y === 'number' ? layer.y : 0
  const width = typeof layer.width === 'number' ? layer.width : 100
  const height = typeof layer.height === 'number' ? layer.height : 100

  const baseLayer: WebLayer = {
    id: layer.id,
    type: layerType,
    name: typeof layer.name === 'string' ? layer.name : `Layer ${layer.id.slice(0, 6)}`,
    visible: layer.visible !== false,
    locked: layer.locked === true,
    order: typeof layer.zIndex === 'number' ? layer.zIndex : 0,
    position: { x, y },
    size: { width, height },
    rotation: typeof layer.rotation === 'number' ? layer.rotation : undefined,
  }

  // Handle opacity
  if (typeof layer.opacity === 'number') {
    baseLayer.style = { ...(baseLayer.style ?? {}), opacity: layer.opacity }
  }

  // Handle role as metadata
  if (layer.role) {
    baseLayer.metadata = { ...(baseLayer.metadata ?? {}), role: layer.role }
  }

  // Type-specific conversions
  if (layerType === 'text' || layerType === 'rich-text') {
    baseLayer.content = typeof layer.text === 'string' ? layer.text : ''

    const textStyle = layer.textStyle as Record<string, unknown> | undefined
    if (textStyle) {
      baseLayer.style = {
        ...baseLayer.style,
        fontSize: textStyle.fontSize as number,
        fontFamily: textStyle.fontFamily as string,
        fontWeight: textStyle.fontWeight as string,
        fontStyle: textStyle.fontStyle as 'normal' | 'italic',
        color: textStyle.fill as string,
        textAlign: textStyle.align as 'left' | 'center' | 'right' | 'justify',
        textTransform: textStyle.textTransform as 'none' | 'uppercase' | 'lowercase' | 'capitalize',
        letterSpacing: textStyle.letterSpacing as number,
        lineHeight: textStyle.lineHeight as number,
      }

      // Handle overflow behavior as textboxConfig
      if (textStyle.minFontSize || textStyle.maxFontSize) {
        baseLayer.textboxConfig = {
          autoResize: {
            minFontSize: (textStyle.minFontSize as number) ?? 12,
            maxFontSize: (textStyle.maxFontSize as number) ?? 72,
          },
        }
      }

      // Store Konva-specific fields in metadata
      if (textStyle.maxLines || textStyle.overflowBehavior) {
        baseLayer.metadata = {
          ...(baseLayer.metadata ?? {}),
          konvaTextConfig: {
            maxLines: textStyle.maxLines,
            overflowBehavior: textStyle.overflowBehavior,
          },
        }
      }

      // Handle safeArea as metadata
      if (textStyle.safeArea) {
        baseLayer.metadata = {
          ...(baseLayer.metadata ?? {}),
          konvaSafeArea: textStyle.safeArea,
        }
        warnings.push({
          field: `layer[${layer.id}].textStyle.safeArea`,
          message: 'Safe area settings stored in metadata (local-only feature)',
          action: 'field_renamed',
        })
      }

      // Handle verticalAlign
      if (textStyle.verticalAlign) {
        baseLayer.textboxConfig = {
          ...baseLayer.textboxConfig,
          anchor: textStyle.verticalAlign as 'top' | 'middle' | 'bottom',
        }
      }
    }
  } else if (layerType === 'image') {
    baseLayer.fileUrl = layer.src as string
    baseLayer.fit = layer.fit as string
    baseLayer.crop = layer.crop as { x: number; y: number; width: number; height: number }
    if (layer.fit) {
      baseLayer.style = { ...baseLayer.style, objectFit: layer.fit as 'contain' | 'cover' | 'fill' }
    }
  } else if (layerType === 'gradient' || layerType === 'gradient2') {
    const colors = layer.colors as string[]
    const stops = layer.stops as number[]
    const angle = layer.angle as number
    baseLayer.colors = colors
    baseLayer.stops = stops
    baseLayer.angle = angle
    if (colors && colors.length >= 2) {
      baseLayer.style = {
        ...baseLayer.style,
        gradientType: 'linear',
        gradientAngle: angle ?? 0,
        gradientStops: colors.map((color, i) => ({
          id: `stop-${i}`,
          color,
          position: stops?.[i] ?? i / (colors.length - 1),
          opacity: 1,
        })),
      }
    }
  } else if (layerType === 'shape') {
    baseLayer.shape = layer.shape as string
    baseLayer.points = layer.points as number[]
    baseLayer.cornerRadius = layer.cornerRadius as number
    baseLayer.style = {
      ...baseLayer.style,
      fill: layer.fill as string,
      strokeColor: layer.stroke as string,
      strokeWidth: layer.strokeWidth as number,
      shapeType: layer.shape as string,
    }
  } else if (layerType === 'icon') {
    baseLayer.iconName = layer.iconName as string
    baseLayer.fileUrl = layer.src as string
    baseLayer.style = { ...baseLayer.style, fill: layer.fill as string }
  } else if (layerType === 'logo') {
    baseLayer.fileUrl = layer.src as string
    baseLayer.preserveAspectRatio = layer.preserveAspectRatio as boolean
  } else if (layerType === 'element') {
    baseLayer.elementKey = layer.elementKey as string
    baseLayer.props = layer.props as Record<string, unknown>
  } else if (layerType === 'video') {
    baseLayer.fileUrl = layer.src as string
    baseLayer.poster = layer.poster as string
    baseLayer.muted = layer.muted as boolean
    baseLayer.loop = layer.loop as boolean
    baseLayer.videoMetadata = {
      posterUrl: layer.poster,
      muted: layer.muted,
      loop: layer.loop,
    }
  }

  // Handle scale
  const scaleX = layer.scaleX as number
  const scaleY = layer.scaleY as number
  if (typeof scaleX === 'number' && scaleX !== 1) {
    warnings.push({
      field: `layer[${layer.id}].scaleX`,
      message: 'Scale applied to size, scaleX removed',
      action: 'type_coerced',
    })
    baseLayer.size.width = baseLayer.size.width * scaleX
  }
  if (typeof scaleY === 'number' && scaleY !== 1) {
    warnings.push({
      field: `layer[${layer.id}].scaleY`,
      message: 'Scale applied to size, scaleY removed',
      action: 'type_coerced',
    })
    baseLayer.size.height = baseLayer.size.height * scaleY
  }

  return baseLayer
}

// ─────────────────────────────────────────────────────────────────
// Layer conversion: Web → Local
// ─────────────────────────────────────────────────────────────────

function webLayerToLocal(layer: WebLayer, warnings: NormalizationWarning[]): KonvaLayer {
  const baseProps: KonvaLayer = {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    x: layer.position?.x ?? 0,
    y: layer.position?.y ?? 0,
    width: layer.size?.width ?? 100,
    height: layer.size?.height ?? 100,
    rotation: layer.rotation,
    opacity: layer.style?.opacity,
    visible: layer.visible ?? true,
    locked: layer.locked ?? false,
    zIndex: layer.order ?? 0,
    role: (layer.metadata as Record<string, unknown>)?.role,
  }

  if (layer.type === 'text' || layer.type === 'rich-text') {
    baseProps.text = layer.content ?? ''

    // Build textStyle object
    const textStyle: Record<string, unknown> = {
      fontFamily: layer.style?.fontFamily,
      fontSize: layer.style?.fontSize,
      fontWeight: layer.style?.fontWeight,
      fontStyle: layer.style?.fontStyle,
      lineHeight: layer.style?.lineHeight,
      letterSpacing: layer.style?.letterSpacing,
      textTransform: layer.style?.textTransform,
      align: layer.style?.textAlign,
      fill: layer.style?.color ?? layer.style?.fill,
    }

    // Restore Konva-specific fields from metadata
    const metadata = layer.metadata as Record<string, unknown> | undefined
    const konvaConfig = metadata?.konvaTextConfig as Record<string, unknown> | undefined
    if (konvaConfig) {
      textStyle.maxLines = konvaConfig.maxLines
      textStyle.overflowBehavior = konvaConfig.overflowBehavior
    }

    // Restore autoResize settings
    if (layer.textboxConfig?.autoResize) {
      textStyle.minFontSize = layer.textboxConfig.autoResize.minFontSize
      textStyle.maxFontSize = layer.textboxConfig.autoResize.maxFontSize
    }

    // Restore verticalAlign from anchor
    if (layer.textboxConfig?.anchor) {
      textStyle.verticalAlign = layer.textboxConfig.anchor
    }

    // Restore safeArea from metadata
    const safeArea = metadata?.konvaSafeArea as Record<string, unknown> | undefined
    if (safeArea) {
      textStyle.safeArea = safeArea
    }

    baseProps.textStyle = textStyle
  } else if (layer.type === 'image') {
    baseProps.src = layer.fileUrl ?? ''
    baseProps.fit = layer.fit ?? layer.style?.objectFit
    baseProps.crop = layer.crop
  } else if (layer.type === 'gradient' || layer.type === 'gradient2') {
    let colors = layer.colors as string[]
    let stops = layer.stops as number[]
    let angle = layer.angle as number

    if (!colors && layer.style?.gradientStops) {
      colors = layer.style.gradientStops.map((s) => s.color)
      stops = layer.style.gradientStops.map((s) => s.position)
      angle = layer.style.gradientAngle ?? 0
    }

    baseProps.colors = colors ?? ['#ffffff', '#000000']
    baseProps.stops = stops
    baseProps.angle = angle
  } else if (layer.type === 'shape') {
    baseProps.shape = layer.shape ?? layer.style?.shapeType ?? 'rectangle'
    baseProps.fill = layer.style?.fill
    baseProps.stroke = layer.style?.strokeColor
    baseProps.strokeWidth = layer.style?.strokeWidth
    baseProps.cornerRadius = layer.cornerRadius
    baseProps.points = layer.points
  } else if (layer.type === 'icon') {
    baseProps.iconName = layer.iconName
    baseProps.src = layer.fileUrl
    baseProps.fill = layer.style?.fill
  } else if (layer.type === 'logo') {
    baseProps.src = layer.fileUrl ?? ''
    baseProps.preserveAspectRatio = layer.preserveAspectRatio
  } else if (layer.type === 'element') {
    baseProps.elementKey = layer.elementKey ?? ''
    baseProps.props = layer.props
  } else if (layer.type === 'video') {
    const vm = layer.videoMetadata as Record<string, unknown>
    baseProps.src = layer.fileUrl ?? ''
    baseProps.poster = layer.poster ?? vm?.posterUrl
    baseProps.muted = layer.muted ?? vm?.muted
    baseProps.loop = layer.loop ?? vm?.loop
  } else {
    warnings.push({
      field: `layer[${layer.id}].type`,
      message: `Unknown layer type "${layer.type}", treating as element`,
      action: 'type_coerced',
    })
    baseProps.elementKey = layer.type
  }

  return baseProps
}

// ─────────────────────────────────────────────────────────────────
// Page conversion
// ─────────────────────────────────────────────────────────────────

function localPageToWeb(page: KonvaPage, warnings: NormalizationWarning[]): WebPage {
  return {
    id: page.id,
    name: page.name,
    width: page.width,
    height: page.height,
    layers: page.layers.map((layer) => localLayerToWeb(layer, warnings)),
    background: page.background,
    order: page.order,
    thumbnail: page.thumbnailPath,
  }
}

function webPageToLocal(page: WebPage, warnings: NormalizationWarning[]): KonvaPage {
  return {
    id: page.id,
    name: page.name,
    width: page.width,
    height: page.height,
    layers: page.layers.map((layer) => webLayerToLocal(layer, warnings)),
    background: page.background,
    order: page.order,
    thumbnailPath: page.thumbnail,
  }
}

// ─────────────────────────────────────────────────────────────────
// Main normalization functions
// ─────────────────────────────────────────────────────────────────

/**
 * Normalize a local KonvaTemplateDocument for web API
 */
export function normalizeForWeb(
  template: KonvaTemplateDocument,
  config: NormalizationConfig = DEFAULT_CONFIG
): NormalizationResult<WebTemplatePayload> {
  const warnings: NormalizationWarning[] = []
  const errors: NormalizationError[] = []

  try {
    // Validate required fields
    if (!template.id) {
      errors.push({ field: 'id', message: 'Template ID is required', fatal: true })
    }
    if (!template.name) {
      if (config.applyDefaults) {
        warnings.push({ field: 'name', message: 'Name was empty, using default', action: 'default_applied' })
      } else {
        errors.push({ field: 'name', message: 'Template name is required', fatal: true })
      }
    }
    if (!template.projectId) {
      errors.push({ field: 'projectId', message: 'Project ID is required', fatal: true })
    }

    if (config.strict && errors.some((e) => e.fatal)) {
      return { success: false, data: {} as WebTemplatePayload, warnings, errors }
    }

    const firstPage = template.design?.pages?.[0]
    const webType = localFormatToWeb(template.format)
    const dimensions = formatToDimensions(template.format)

    const webPages = (template.design?.pages ?? []).map((page) => localPageToWeb(page, warnings))

    const payload: WebTemplatePayload = {
      name: template.name || 'Template sem nome',
      type: webType,
      dimensions,
      designData: {
        canvas: {
          width: firstPage?.width ?? 1080,
          height: firstPage?.height ?? 1920,
          backgroundColor: firstPage?.background ?? '#ffffff',
        },
        pages: webPages,
      },
      localId: template.id,
      projectId: template.projectId,
      thumbnailUrl: template.meta?.thumbnailPath,
    }

    // Log warnings for fields that exist only locally
    if (template.identity && Object.keys(template.identity).length > 0) {
      warnings.push({ field: 'identity', message: 'Identity data is local-only, not synced to web', action: 'field_removed' })
    }
    if (template.slots && template.slots.length > 0) {
      warnings.push({ field: 'slots', message: 'Slots data stored in designData for reference', action: 'field_renamed' })
      payload.designData.slots = template.slots
    }

    return { success: true, data: payload, warnings, errors }
  } catch (error) {
    errors.push({ field: 'root', message: error instanceof Error ? error.message : 'Unknown normalization error', fatal: true })
    return { success: false, data: {} as WebTemplatePayload, warnings, errors }
  }
}

/**
 * Normalize a web template response for local storage
 */
export function normalizeForLocal(
  remote: { id: number; name: string; type?: string; updatedAt: string; designData?: unknown; localId?: string },
  projectId: number,
  existingId?: string
): NormalizationResult<KonvaTemplateDocument> {
  const warnings: NormalizationWarning[] = []
  const errors: NormalizationError[] = []

  try {
    const designData = (remote.designData ?? {}) as Record<string, unknown>
    const canvas = (designData.canvas ?? {}) as Record<string, unknown>
    const rawPages = Array.isArray(designData.pages) ? designData.pages : []

    const konvaPages: KonvaPage[] = rawPages.map((page, index) => {
      const pageObj = page as WebPage
      return webPageToLocal(
        {
          id: pageObj.id ?? crypto.randomUUID(),
          name: pageObj.name ?? `Pagina ${index + 1}`,
          width: pageObj.width ?? Number(canvas.width) ?? 1080,
          height: pageObj.height ?? Number(canvas.height) ?? 1920,
          layers: Array.isArray(pageObj.layers) ? pageObj.layers : [],
          background: pageObj.background ?? (canvas.backgroundColor as string) ?? '#ffffff',
          order: pageObj.order ?? index,
          thumbnail: pageObj.thumbnail,
        },
        warnings
      )
    })

    // Fallback: create default page if none exist
    if (konvaPages.length === 0) {
      warnings.push({ field: 'design.pages', message: 'No pages found, creating default page', action: 'default_applied' })

      // Check for legacy single-page format with layers at root
      const legacyLayers = Array.isArray(designData.layers) ? designData.layers : []

      konvaPages.push({
        id: crypto.randomUUID(),
        name: 'Pagina 1',
        width: Number(canvas.width) || 1080,
        height: Number(canvas.height) || 1920,
        background: (canvas.backgroundColor as string) ?? '#ffffff',
        order: 0,
        layers: legacyLayers.map((l) => webLayerToLocal(l as WebLayer, warnings)),
      })
    }

    const format = webFormatToLocal(remote.type ?? 'STORY')

    // Restore slots from designData if present
    const slots = Array.isArray(designData.slots) ? designData.slots : []
    if (slots.length > 0) {
      warnings.push({ field: 'slots', message: 'Slots restored from designData.slots', action: 'field_renamed' })
    }

    const doc: KonvaTemplateDocument = {
      schemaVersion: 2,
      id: existingId ?? remote.localId ?? crypto.randomUUID(),
      projectId,
      engine: 'KONVA',
      name: remote.name,
      format,
      source: 'synced',
      design: { pages: konvaPages, currentPageId: konvaPages[0]?.id ?? '' },
      identity: { colors: [], fonts: [] },
      slots: slots as KonvaTemplateDocument['slots'],
      meta: {
        createdAt: new Date().toISOString(),
        updatedAt: remote.updatedAt,
        syncedAt: new Date().toISOString(),
        isDirty: false,
        remoteId: remote.id,
      },
    }

    return { success: true, data: doc, warnings, errors }
  } catch (error) {
    errors.push({ field: 'root', message: error instanceof Error ? error.message : 'Unknown normalization error', fatal: true })
    return { success: false, data: {} as KonvaTemplateDocument, warnings, errors }
  }
}

/**
 * Log normalization warnings in a structured format
 */
export function logNormalizationWarnings(
  operation: 'push' | 'pull',
  templateId: string,
  warnings: NormalizationWarning[]
): void {
  if (warnings.length === 0) return
  console.log(`[TemplateNormalizer] ${operation} ${templateId}: ${warnings.length} warnings`)
  for (const w of warnings) {
    console.log(`  - [${w.action}] ${w.field}: ${w.message}`)
  }
}
