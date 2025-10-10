export interface DesignData {
  canvas: CanvasConfig
  layers: Layer[]
  [key: string]: unknown
}

export interface CanvasConfig {
  width: number
  height: number
  backgroundColor?: string
}

export type LayerType =
  | 'text'
  | 'image'
  | 'gradient'
  | 'gradient2'
  | 'logo'
  | 'element'
  | 'shape'
  | 'icon'
  | 'video'

export interface Layer {
  id: string
  type: LayerType
  name: string
  visible: boolean
  locked: boolean
  order: number
  position: { x: number; y: number }
  size: { width: number; height: number }
  rotation?: number
  content?: string
  style?: LayerStyle
  isDynamic?: boolean
  textboxConfig?: TextboxConfig
  logoId?: number
  elementId?: number
  fileUrl?: string
  parentId?: string | null
  metadata?: {
    presetId?: string
    presetName?: string
    elementId?: string
    elementLabel?: string
    [key: string]: unknown
  }
  effects?: {
    blur?: { enabled: boolean; blurRadius: number }
    stroke?: { enabled: boolean; strokeColor: string; strokeWidth: number }
    shadow?: { enabled: boolean; shadowColor: string; shadowBlur: number; shadowOffsetX: number; shadowOffsetY: number; shadowOpacity: number }
    background?: { enabled: boolean; backgroundColor: string; padding: number }
    curved?: { enabled: boolean; curvature: number }
  }
  videoMetadata?: {
    duration?: number
    posterUrl?: string
    autoplay?: boolean
    loop?: boolean
    muted?: boolean
    currentTime?: number
    playbackRate?: number
    objectFit?: 'cover' | 'contain' | 'fill'
  }
  [key: string]: unknown
}

export interface LayerStyle {
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic'
  color?: string
  textAlign?: 'left' | 'center' | 'right'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  letterSpacing?: number
  lineHeight?: number
  gradientType?: 'linear' | 'radial'
  gradientAngle?: number
  gradientStops?: GradientStop[]
  objectFit?: 'contain' | 'cover' | 'fill'
  cropPosition?: 'left-top' | 'center-top' | 'right-top' | 'left-middle' | 'center-middle' | 'right-middle' | 'left-bottom' | 'center-bottom' | 'right-bottom'
  opacity?: number
  filter?: string
  shadow?: ShadowStyle
  border?: BorderStyle
  fill?: string
  strokeColor?: string
  strokeWidth?: number
  shapeType?: 'rectangle' | 'rounded-rectangle' | 'circle' | 'triangle' | 'star' | 'arrow' | 'line'
  iconId?: string
  blur?: number
  brightness?: number
  contrast?: number
  grayscale?: boolean
  sepia?: boolean
  invert?: boolean
  [key: string]: unknown
}

export interface GradientStop {
  id: string
  color: string
  position: number
  opacity: number
}

export interface ShadowStyle {
  offsetX: number
  offsetY: number
  blur: number
  color: string
}

export interface BorderStyle {
  width: number
  color: string
  radius: number
}

export interface TextboxConfig {
  spacing?: number
  anchor?: 'top' | 'middle' | 'bottom'
  textMode?: TextMode
  autoResize?: {
    minFontSize: number
    maxFontSize: number
  }
  autoWrap?: {
    lineHeight: number
    breakMode: TextBreakMode
    autoExpand: boolean
  }
  wordBreak?: boolean
  [key: string]: unknown
}

export type TextBreakMode = 'word' | 'char' | 'hybrid'

export type TextMode =
  | 'auto-resize-single'
  | 'auto-resize-multi'
  | 'auto-wrap-fixed'
  | 'fitty'

export interface DynamicField {
  layerId: string
  fieldType: 'text' | 'image' | 'video' | 'color' | 'fontSize'
  label: string
  placeholder?: string
  defaultValue?: unknown
  required?: boolean
  validation?: {
    min?: number
    max?: number
    pattern?: string
  }
}

export type FieldValues = Record<string, unknown>

// Multi-page support interfaces
export interface Page {
  id: string
  name: string
  width: number
  height: number
  layers: Layer[]
  background?: string
  order: number
  thumbnail?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface MultiPageDesignData {
  pages: Page[]
  currentPageId: string
  templateId?: number
}
