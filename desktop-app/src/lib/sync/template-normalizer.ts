/**
 * Template Normalizer - Bidirectional normalization between local Konva format and web format
 *
 * This module ensures templates can be synced between the desktop app and web without data loss.
 *
 * Key differences handled:
 * - Layer position: local uses x/y directly, web uses position: {x, y}
 * - Layer size: local uses width/height directly, web uses size: {width, height}
 * - Text content: local uses layer.text, web uses layer.content
 * - Text style: local uses textStyle object, web uses style object
 * - Color property: local uses textStyle.fill, web uses style.color
 * - Image source: local uses src, web uses fileUrl
 * - Layer order: local uses zIndex, web uses order
 * - Format naming: local uses FEED_PORTRAIT, web uses FEED
 */

import type {
  ArtFormat,
  KonvaPage,
  KonvaTemplateDocument,
  KonvaTextLayer,
  KonvaImageLayer,
  KonvaGradientLayer,
  KonvaShapeLayer,
  KonvaIconLayer,
  KonvaLogoLayer,
  KonvaElementLayer,
  KonvaVideoLayer,
  Layer,
} from '../../types/template'

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

export interface WebVideoMetadata {
  duration?: number
  posterUrl?: string
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  currentTime?: number
  playbackRate?: number
  objectFit?: 'cover' | 'contain' | 'fill'
}

export interface WebDesignData {
  canvas: {
    width: number
    height: number
    backgroundColor?: string
  }
  pages: WebPage[]
  layers?: WebLayer[] // Legacy single-page format
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
  tags?: string[]
}

export interface WebTextboxConfig {
  spacing?: number
  anchor?: 'top' | 'middle' | 'bottom'
  textMode?: string
  autoResize?: {
    minFontSize: number
    maxFontSize: number
  }
  autoWrap?: {
    lineHeight: number
    breakMode: string
    autoExpand: boolean
  }
  wordBreak?: boolean
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
  isDynamic?: boolean
  fileUrl?: string
  logoId?: number
  elementId?: number
  parentId?: string | null
  metadata?: Record<string, unknown>
  effects?: Record<string, unknown>
  videoMetadata?: WebVideoMetadata
  richTextStyles?: unknown[]
  textboxConfig?: WebTextboxConfig
  // Gradient specific
  colors?: string[]
  stops?: number[]
  opacities?: number[]
  angle?: number
  gradientType?: 'linear' | 'radial'
  // Shape specific
  shape?: string
  points?: number[]
  cornerRadius?: number
  // Icon specific
  iconName?: string
  // Logo specific
  preserveAspectRatio?: boolean
  // Element specific
  elementKey?: string
  props?: Record<string, unknown>
  // Video specific
  poster?: string
  muted?: boolean
  loop?: boolean
  // Image specific
  fit?: string
  crop?: { x: number; y: number; width: number; height: number }
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
  cropPosition?: string
  opacity?: number
  strokeColor?: string
  strokeWidth?: number
  shapeType?: string
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
  category?: string
  tags?: string[]
}

// ─────────────────────────────────────────────────────────────────
// Default configuration
// ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: NormalizationConfig = {
  strict: false,
  preserveUnknownFields: true,
  applyDefaults: true,
}

function toRemoteUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return value
    }
  } catch {
    return undefined
  }
  return undefined
}

// ─────────────────────────────────────────────────────────────────
// Format conversion helpers
// ─────────────────────────────────────────────────────────────────

function localFormatToWeb(format: ArtFormat): 'STORY' | 'FEED' | 'SQUARE' {
  if (format === 'FEED_PORTRAIT') return 'FEED'
  return format
}

function webFormatToLocal(type: string): ArtFormat {
  if (type === 'FEED') return 'FEED_PORTRAIT'
  if (type === 'STORY' || type === 'SQUARE') return type
  // Default to STORY for unknown formats
  return 'STORY'
}

function formatToDimensions(format: ArtFormat): string {
  switch (format) {
    case 'STORY':
      return '1080x1920'
    case 'FEED_PORTRAIT':
      return '1080x1350'
    case 'SQUARE':
      return '1080x1080'
    default:
      return '1080x1920'
  }
}

// ─────────────────────────────────────────────────────────────────
// Layer conversion: Local → Web
// ─────────────────────────────────────────────────────────────────

function localLayerToWeb(layer: Layer, warnings: NormalizationWarning[]): WebLayer {
  const baseLayer: WebLayer = {
    id: layer.id,
    type: layer.type,
    name: layer.name || `Layer ${layer.id.slice(0, 6)}`,
    visible: layer.visible ?? true,
    locked: layer.locked ?? false,
    order: layer.zIndex ?? 0,
    position: { x: layer.x, y: layer.y },
    size: {
      width: layer.width ?? 100,
      height: layer.height ?? 100,
    },
    rotation: layer.rotation,
  }

  // Handle opacity
  if (layer.opacity !== undefined) {
    baseLayer.style = { ...baseLayer.style, opacity: layer.opacity }
  }

  // Handle role as metadata
  if (layer.role) {
    baseLayer.metadata = { ...baseLayer.metadata, role: layer.role }
  }

  // Type-specific conversions
  switch (layer.type) {
    case 'text':
    case 'rich-text': {
      const textLayer = layer as KonvaTextLayer
      baseLayer.content = textLayer.text

      if (textLayer.textStyle) {
        const ts = textLayer.textStyle
        baseLayer.style = {
          ...baseLayer.style,
          fontSize: ts.fontSize,
          fontFamily: ts.fontFamily,
          fontWeight: ts.fontWeight,
          fontStyle: ts.fontStyle,
          color: ts.fill, // Rename fill → color
          textAlign: ts.align,
          textTransform: ts.textTransform,
          letterSpacing: ts.letterSpacing,
          lineHeight: ts.lineHeight,
        }

        // Handle overflow behavior as textboxConfig
        if (ts.overflowBehavior || ts.minFontSize || ts.maxFontSize || ts.maxLines) {
          baseLayer.textboxConfig = {
            autoResize:
              ts.minFontSize || ts.maxFontSize
                ? {
                    minFontSize: ts.minFontSize ?? 12,
                    maxFontSize: ts.maxFontSize ?? 72,
                  }
                : undefined,
          }

          // Store Konva-specific fields in metadata
          if (ts.maxLines || ts.overflowBehavior) {
            baseLayer.metadata = {
              ...baseLayer.metadata,
              konvaTextConfig: {
                maxLines: ts.maxLines,
                overflowBehavior: ts.overflowBehavior,
              },
            }
          }
        }

        // Handle safeArea as metadata (local-only feature)
        if (ts.safeArea) {
          baseLayer.metadata = {
            ...baseLayer.metadata,
            konvaSafeArea: ts.safeArea,
          }
          warnings.push({
            field: `layer[${layer.id}].textStyle.safeArea`,
            message: 'Safe area settings stored in metadata (local-only feature)',
            action: 'field_renamed',
          })
        }

        // Handle verticalAlign
        if (ts.verticalAlign) {
          baseLayer.textboxConfig = {
            ...(baseLayer.textboxConfig ?? {}),
            anchor: ts.verticalAlign === 'middle' ? 'middle' : ts.verticalAlign,
          }
        }
      }
      break
    }

    case 'image': {
      const imgLayer = layer as KonvaImageLayer
      baseLayer.fileUrl = imgLayer.src
      baseLayer.fit = imgLayer.fit
      baseLayer.crop = imgLayer.crop
      if (imgLayer.fit) {
        baseLayer.style = { ...baseLayer.style, objectFit: imgLayer.fit }
      }
      break
    }

    case 'gradient':
    case 'gradient2': {
      const gradLayer = layer as KonvaGradientLayer
      baseLayer.colors = gradLayer.colors
      baseLayer.stops = gradLayer.stops
      baseLayer.opacities = gradLayer.opacities
      baseLayer.angle = gradLayer.angle
      baseLayer.gradientType = gradLayer.gradientType
      // Also store in style for web compatibility
      if (gradLayer.colors && gradLayer.colors.length >= 2) {
        baseLayer.style = {
          ...baseLayer.style,
          gradientType: gradLayer.gradientType ?? 'linear',
          gradientAngle: gradLayer.angle ?? 0,
          gradientStops: gradLayer.colors.map((color, i) => ({
            id: `stop-${i}`,
            color,
            position: gradLayer.stops?.[i] ?? i / (gradLayer.colors.length - 1),
            opacity: gradLayer.opacities?.[i] ?? 1,
          })),
        }
      }
      break
    }

    case 'shape': {
      const shapeLayer = layer as KonvaShapeLayer
      baseLayer.shape = shapeLayer.shape
      baseLayer.points = shapeLayer.points
      baseLayer.cornerRadius = shapeLayer.cornerRadius
      baseLayer.style = {
        ...baseLayer.style,
        fill: shapeLayer.fill,
        strokeColor: shapeLayer.stroke,
        strokeWidth: shapeLayer.strokeWidth,
        shapeType: shapeLayer.shape,
      }
      break
    }

    case 'icon': {
      const iconLayer = layer as KonvaIconLayer
      baseLayer.iconName = iconLayer.iconName
      baseLayer.fileUrl = iconLayer.src
      baseLayer.style = { ...baseLayer.style, fill: iconLayer.fill }
      break
    }

    case 'logo': {
      const logoLayer = layer as KonvaLogoLayer
      baseLayer.fileUrl = logoLayer.src
      baseLayer.preserveAspectRatio = logoLayer.preserveAspectRatio
      break
    }

    case 'element': {
      const elemLayer = layer as KonvaElementLayer
      baseLayer.elementKey = elemLayer.elementKey
      baseLayer.props = elemLayer.props
      break
    }

    case 'video': {
      const videoLayer = layer as KonvaVideoLayer
      baseLayer.fileUrl = videoLayer.src
      baseLayer.poster = videoLayer.poster
      baseLayer.muted = videoLayer.muted
      baseLayer.loop = videoLayer.loop
      baseLayer.videoMetadata = {
        posterUrl: videoLayer.poster,
        muted: videoLayer.muted,
        loop: videoLayer.loop,
      }
      break
    }
  }

  // Remove scaleX/scaleY warning (local-only, not needed in web)
  if (layer.scaleX !== undefined && layer.scaleX !== 1) {
    warnings.push({
      field: `layer[${layer.id}].scaleX`,
      message: 'Scale applied to size, scaleX removed',
      action: 'type_coerced',
    })
    baseLayer.size.width = baseLayer.size.width * layer.scaleX
  }
  if (layer.scaleY !== undefined && layer.scaleY !== 1) {
    warnings.push({
      field: `layer[${layer.id}].scaleY`,
      message: 'Scale applied to size, scaleY removed',
      action: 'type_coerced',
    })
    baseLayer.size.height = baseLayer.size.height * layer.scaleY
  }

  return baseLayer
}

// ─────────────────────────────────────────────────────────────────
// Layer conversion: Web → Local
// ─────────────────────────────────────────────────────────────────

function webLayerToLocal(layer: WebLayer, warnings: NormalizationWarning[]): Layer {
  const baseProps = {
    id: layer.id,
    type: layer.type as Layer['type'],
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
    role: (layer.metadata?.role as 'background' | 'content') ?? undefined,
  }

  switch (layer.type) {
    case 'text':
    case 'rich-text': {
      const textLayer: KonvaTextLayer = {
        ...baseProps,
        type: layer.type as 'text' | 'rich-text',
        text: layer.content ?? '',
        textStyle: {
          fontFamily: layer.style?.fontFamily,
          fontSize: layer.style?.fontSize,
          fontWeight: layer.style?.fontWeight as string,
          fontStyle: layer.style?.fontStyle,
          lineHeight: layer.style?.lineHeight,
          letterSpacing: layer.style?.letterSpacing,
          textTransform: layer.style?.textTransform,
          align: layer.style?.textAlign,
          fill: layer.style?.color ?? layer.style?.fill,
        },
      }

      // Restore Konva-specific fields from metadata
      const konvaConfig = layer.metadata?.konvaTextConfig as
        | { maxLines?: number; overflowBehavior?: string }
        | undefined
      if (konvaConfig) {
        textLayer.textStyle = {
          ...textLayer.textStyle,
          maxLines: konvaConfig.maxLines,
          overflowBehavior: konvaConfig.overflowBehavior as 'clip' | 'ellipsis' | 'autoScale',
        }
      }

      // Restore autoResize settings
      const autoResize = layer.textboxConfig?.autoResize
      if (autoResize) {
        textLayer.textStyle = {
          ...textLayer.textStyle,
          minFontSize: autoResize.minFontSize,
          maxFontSize: autoResize.maxFontSize,
        }
      }

      // Restore verticalAlign from anchor
      if (layer.textboxConfig?.anchor) {
        textLayer.textStyle = {
          ...textLayer.textStyle,
          verticalAlign: layer.textboxConfig.anchor as 'top' | 'middle' | 'bottom',
        }
      }

      // Restore safeArea from metadata
      const safeArea = layer.metadata?.konvaSafeArea as
        | { enabled?: boolean; vertical: string; horizontal: string }
        | undefined
      if (safeArea) {
        textLayer.textStyle = {
          ...textLayer.textStyle,
          safeArea: {
            enabled: safeArea.enabled,
            vertical: safeArea.vertical as 'top' | 'center' | 'bottom',
            horizontal: safeArea.horizontal as 'left' | 'center' | 'right',
          },
        }
      }

      return textLayer
    }

    case 'image': {
      const imgLayer: KonvaImageLayer = {
        ...baseProps,
        type: 'image',
        src: layer.fileUrl ?? '',
        fit: (layer.fit as 'cover' | 'contain' | 'fill') ?? layer.style?.objectFit,
        crop: layer.crop,
      }
      return imgLayer
    }

    case 'gradient':
    case 'gradient2': {
      // Prefer direct colors/stops/opacities, fall back to style.gradientStops
      let colors = layer.colors
      let stops = layer.stops
      let opacities = layer.opacities as number[] | undefined
      let angle = layer.angle
      let gradientType = layer.gradientType as 'linear' | 'radial' | undefined

      // If colors not present or empty at root, extract from style.gradientStops
      const hasValidColors = Array.isArray(colors) && colors.length > 0
      if (!hasValidColors && layer.style?.gradientStops && layer.style.gradientStops.length > 0) {
        colors = layer.style.gradientStops.map((s) => s.color)
        stops = layer.style.gradientStops.map((s) => s.position)
        opacities = layer.style.gradientStops.map((s) => s.opacity ?? 1)
        angle = layer.style.gradientAngle
        gradientType = layer.style.gradientType
      } else if (!opacities && layer.style?.gradientStops && layer.style.gradientStops.length > 0) {
        // Extract opacities from gradientStops if not present at root
        opacities = layer.style.gradientStops.map((s) => s.opacity ?? 1)
      }

      // Fall back gradientType from style if not at root
      if (!gradientType && layer.style?.gradientType) {
        gradientType = layer.style.gradientType
      }

      // Ensure colors is always a valid array with at least 2 colors
      const finalColors = Array.isArray(colors) && colors.length >= 2 ? colors : ['#ffffff', '#000000']

      const gradLayer: KonvaGradientLayer = {
        ...baseProps,
        type: layer.type as 'gradient' | 'gradient2',
        colors: finalColors,
        stops: stops ?? finalColors.map((_, i) => i / Math.max(finalColors.length - 1, 1)),
        opacities: opacities ?? finalColors.map(() => 1),
        angle: angle ?? 180,
        gradientType: gradientType ?? 'linear',
      }
      return gradLayer
    }

    case 'shape': {
      const shapeLayer: KonvaShapeLayer = {
        ...baseProps,
        type: 'shape',
        shape: (layer.shape ?? layer.style?.shapeType ?? 'rectangle') as KonvaShapeLayer['shape'],
        fill: layer.style?.fill,
        stroke: layer.style?.strokeColor,
        strokeWidth: layer.style?.strokeWidth,
        cornerRadius: layer.cornerRadius,
        points: layer.points,
      }
      return shapeLayer
    }

    case 'icon': {
      const iconLayer: KonvaIconLayer = {
        ...baseProps,
        type: 'icon',
        iconName: layer.iconName,
        src: layer.fileUrl,
        fill: layer.style?.fill,
      }
      return iconLayer
    }

    case 'logo': {
      const logoLayer: KonvaLogoLayer = {
        ...baseProps,
        type: 'logo',
        src: layer.fileUrl ?? '',
        preserveAspectRatio: layer.preserveAspectRatio,
      }
      return logoLayer
    }

    case 'element': {
      const elemLayer: KonvaElementLayer = {
        ...baseProps,
        type: 'element',
        elementKey: layer.elementKey ?? '',
        props: layer.props,
      }
      return elemLayer
    }

    case 'video': {
      const videoLayer: KonvaVideoLayer = {
        ...baseProps,
        type: 'video',
        src: layer.fileUrl ?? '',
        poster: layer.poster ?? layer.videoMetadata?.posterUrl,
        muted: layer.muted ?? layer.videoMetadata?.muted,
        loop: layer.loop ?? layer.videoMetadata?.loop,
      }
      return videoLayer
    }

    default: {
      warnings.push({
        field: `layer[${layer.id}].type`,
        message: `Unknown layer type "${layer.type}", treating as element`,
        action: 'type_coerced',
      })
      return {
        ...baseProps,
        type: 'element',
        elementKey: layer.type,
      } as KonvaElementLayer
    }
  }
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
    thumbnail: page.thumbnailPath, // Convert path to URL expectation
    tags: page.tags,
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
    tags: page.tags,
  }
}

// ─────────────────────────────────────────────────────────────────
// Main normalization functions
// ─────────────────────────────────────────────────────────────────

/**
 * Normalize a local KonvaTemplateDocument for web API
 *
 * @param template - Local template document
 * @param config - Normalization configuration
 * @returns Normalized web payload with warnings/errors
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
        warnings.push({
          field: 'name',
          message: 'Name was empty, using default',
          action: 'default_applied',
        })
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

    // Convert pages
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
      thumbnailUrl: toRemoteUrl(template.meta?.thumbnailPath),
    }

    // Log warnings for fields that exist only locally
    if (template.identity && Object.keys(template.identity).length > 0) {
      warnings.push({
        field: 'identity',
        message: 'Identity data is local-only, not synced to web',
        action: 'field_removed',
      })
    }
    if (template.slots && template.slots.length > 0) {
      warnings.push({
        field: 'slots',
        message: 'Slots data stored in designData.metadata for reference',
        action: 'field_renamed',
      })
      // Store slots in designData for reference (web can access if needed)
      ;(payload.designData as unknown as Record<string, unknown>).slots = template.slots
    }

    return { success: true, data: payload, warnings, errors }
  } catch (error) {
    errors.push({
      field: 'root',
      message: error instanceof Error ? error.message : 'Unknown normalization error',
      fatal: true,
    })
    return { success: false, data: {} as WebTemplatePayload, warnings, errors }
  }
}

/**
 * Normalize a web template response for local storage
 *
 * @param remote - Remote template metadata from API
 * @param projectId - Project ID
 * @param existingId - Optional existing local ID to preserve
 * @param config - Normalization configuration
 * @returns Normalized local document with warnings/errors
 */
export function normalizeForLocal(
  remote: {
    id: number
    name: string
    type?: string
    updatedAt: string
    designData?: unknown
    localId?: string
  },
  projectId: number,
  existingId?: string,
  _config: NormalizationConfig = DEFAULT_CONFIG
): NormalizationResult<KonvaTemplateDocument> {
  const warnings: NormalizationWarning[] = []
  const errors: NormalizationError[] = []

  try {
    const designData = (remote.designData ?? {}) as Record<string, unknown>
    const canvas = (designData.canvas ?? {}) as Record<string, unknown>
    const rawPages = Array.isArray(designData.pages) ? designData.pages : []

    // Convert pages from web format to local format
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
          tags: pageObj.tags,
        },
        warnings
      )
    })

    // Fallback: create default page if none exist
    if (konvaPages.length === 0) {
      warnings.push({
        field: 'design.pages',
        message: 'No pages found, creating default page',
        action: 'default_applied',
      })

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
      warnings.push({
        field: 'slots',
        message: 'Slots restored from designData.slots',
        action: 'field_renamed',
      })
    }

    const doc: KonvaTemplateDocument = {
      schemaVersion: 2,
      id: existingId ?? remote.localId ?? crypto.randomUUID(),
      projectId,
      engine: 'KONVA',
      name: remote.name,
      format,
      source: 'synced',
      design: {
        pages: konvaPages,
        currentPageId: konvaPages[0]?.id ?? '',
      },
      identity: {
        colors: [],
        fonts: [],
      },
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
    errors.push({
      field: 'root',
      message: error instanceof Error ? error.message : 'Unknown normalization error',
      fatal: true,
    })
    return { success: false, data: {} as KonvaTemplateDocument, warnings, errors }
  }
}

/**
 * Check if normalization is idempotent (applying twice yields same result)
 */
export function verifyIdempotency(template: KonvaTemplateDocument): boolean {
  const first = normalizeForWeb(template)
  if (!first.success) return false

  const back = normalizeForLocal(
    {
      id: 0,
      name: first.data.name,
      type: first.data.type,
      updatedAt: new Date().toISOString(),
      designData: first.data.designData,
      localId: template.id,
    },
    template.projectId,
    template.id
  )
  if (!back.success) return false

  const second = normalizeForWeb(back.data)
  if (!second.success) return false

  // Compare essential fields
  const d1 = JSON.stringify(first.data.designData)
  const d2 = JSON.stringify(second.data.designData)

  return d1 === d2
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
