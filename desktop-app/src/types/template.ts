export const KONVA_TEMPLATE_SCHEMA_VERSION = 2 as const

export type ArtFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'

export type KonvaTemplateEngine = 'KONVA'
export type KonvaTemplateSource = 'local' | 'synced'

export type KonvaLayerType =
  | 'text'
  | 'rich-text'
  | 'image'
  | 'gradient'
  | 'gradient2'
  | 'shape'
  | 'icon'
  | 'logo'
  | 'element'
  | 'video'

export type KonvaShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'arrow'
  | 'line'

export type SlotFieldKey =
  | 'pre_title'
  | 'title'
  | 'description'
  | 'cta'
  | 'badge'
  | 'footer_info_1'
  | 'footer_info_2'

export type SlotOverflowBehavior = 'scale-down' | 'ellipsis' | 'clip'
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
export type TextOverflowBehavior = 'clip' | 'ellipsis' | 'autoScale'
export type SafeAreaVertical = 'top' | 'center' | 'bottom'
export type SafeAreaHorizontal = 'left' | 'center' | 'right'

export interface KonvaLayerBase {
  id: string
  type: KonvaLayerType
  name?: string
  x: number
  y: number
  width?: number
  height?: number
  rotation?: number
  scaleX?: number
  scaleY?: number
  opacity?: number
  visible?: boolean
  locked?: boolean
  draggable?: boolean
  zIndex?: number
  role?: 'background' | 'content'
}

export interface KonvaTextLayer extends KonvaLayerBase {
  type: 'text' | 'rich-text'
  text: string
  textStyle?: {
    fontFamily?: string
    fontSize?: number
    fontWeight?: string
    fontStyle?: 'normal' | 'italic'
    lineHeight?: number
    letterSpacing?: number
    textTransform?: TextTransform
    maxLines?: number
    overflowBehavior?: TextOverflowBehavior
    minFontSize?: number
    maxFontSize?: number
    align?: 'left' | 'center' | 'right' | 'justify'
    verticalAlign?: 'top' | 'middle' | 'bottom'
    safeArea?: {
      enabled?: boolean
      vertical: SafeAreaVertical
      horizontal: SafeAreaHorizontal
    }
    fill?: string
  }
}

export interface KonvaImageLayer extends KonvaLayerBase {
  type: 'image'
  src: string
  fit?: 'cover' | 'contain' | 'fill'
  crop?: { x: number; y: number; width: number; height: number }
}

export interface KonvaGradientLayer extends KonvaLayerBase {
  type: 'gradient' | 'gradient2'
  colors: string[]
  stops?: number[]
  opacities?: number[]
  angle?: number
  gradientType?: 'linear' | 'radial'
}

export interface KonvaShapeLayer extends KonvaLayerBase {
  type: 'shape'
  shape: KonvaShapeType
  fill?: string
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
  points?: number[]
}

export interface KonvaIconLayer extends KonvaLayerBase {
  type: 'icon'
  iconName?: string
  src?: string
  fill?: string
}

export interface KonvaLogoLayer extends KonvaLayerBase {
  type: 'logo'
  src: string
  preserveAspectRatio?: boolean
}

export interface KonvaElementLayer extends KonvaLayerBase {
  type: 'element'
  elementKey: string
  props?: Record<string, unknown>
}

export interface KonvaVideoLayer extends KonvaLayerBase {
  type: 'video'
  src: string
  poster?: string
  muted?: boolean
  loop?: boolean
}

export type Layer =
  | KonvaTextLayer
  | KonvaImageLayer
  | KonvaGradientLayer
  | KonvaShapeLayer
  | KonvaIconLayer
  | KonvaLogoLayer
  | KonvaElementLayer
  | KonvaVideoLayer

export interface KonvaPage {
  id: string
  name: string
  width: number
  height: number
  background?: string
  order: number
  layers: Layer[]
  thumbnailPath?: string
  tags?: string[]
}

export interface ProjectTag {
  id: string
  name: string
  color: string
  projectId: number
  createdAt?: string
}

export interface SlotBinding {
  id: string
  layerId: string
  fieldKey: SlotFieldKey
  label: string
  constraints?: {
    maxLines?: number
    maxCharsPerLine?: number
    minFontSize?: number
    maxFontSize?: number
    overflowBehavior?: SlotOverflowBehavior
  }
}

export interface KonvaTemplateDocument {
  schemaVersion: typeof KONVA_TEMPLATE_SCHEMA_VERSION
  id: string
  projectId: number
  engine: KonvaTemplateEngine
  name: string
  format: ArtFormat
  source: KonvaTemplateSource
  design: {
    pages: KonvaPage[]
    currentPageId: string
  }
  identity: {
    brandName?: string
    logoUrl?: string
    colors: string[]
    fonts: Array<{ name: string; fontFamily: string; fileUrl?: string }>
    textColorPreferences?: {
      titleColor?: string
      subtitleColor?: string
      infoColor?: string
      ctaColor?: string
    }
  }
  slots: SlotBinding[]
  meta: {
    fingerprint?: string
    createdAt: string
    updatedAt: string
    syncedAt?: string
    isDirty: boolean
    thumbnailPath?: string
    remoteId?: number
  }
}
