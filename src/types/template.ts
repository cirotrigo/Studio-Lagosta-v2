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
  opacity?: number
  filter?: string
  shadow?: ShadowStyle
  border?: BorderStyle
  [key: string]: unknown
}

export interface GradientStop {
  color: string
  position: number
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
  fieldType: 'text' | 'image' | 'color' | 'fontSize'
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
