export interface DesignData {
  canvas: CanvasConfig
  layers: Layer[]
  /** Trilha sonora da página (persistida em Page.audio). null/undefined = sem trilha configurada. */
  audio?: PageAudioConfig | null
  [key: string]: unknown
}

/**
 * Trilha sonora persistida por página. Mesmo shape do AudioConfig do
 * AudioSelectionModal (que agora é um alias deste tipo) — a aba Músicas e o
 * modal de export leem/gravam a MESMA config.
 */
export interface PageAudioConfig {
  source: 'original' | 'library' | 'mute' | 'mix'
  musicId?: number
  audioVersion?: 'original' | 'instrumental' | 'vocals'
  /** Apenas para exibição no resumo (não afeta a renderização) */
  musicName?: string
  musicThumbnailUrl?: string | null
  startTime: number
  endTime: number
  volume: number
  volumeOriginal?: number
  volumeMusic?: number
  fadeIn: boolean
  fadeOut: boolean
  fadeInDuration: number
  fadeOutDuration: number
}

export interface CanvasConfig {
  width: number
  height: number
  backgroundColor?: string
}

export type LayerType =
  | 'text'
  | 'rich-text' // Texto com múltiplos estilos (cores, fontes) na mesma frase
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
    /**
     * Fundo atrás do texto. `fit: 'texto'` cobre só a TINTA das linhas (o
     * `width: fit-content` do halo do canvas de design); `blur` > 0 borra a
     * mancha nos próprios pixels (nunca a foto atrás) — ver
     * `src/lib/creatives/halo/fundo-de-texto.ts`. Campos novos são opcionais
     * para o fundo antigo (caixa inteira, nítido, opaco) continuar igual.
     */
    background?: {
      enabled: boolean
      backgroundColor: string
      padding: number
      fit?: 'caixa' | 'texto'
      /** 0..1 — a "tinta" do halo. Vai na opacidade do nó, não na cor. */
      opacity?: number
      borderRadius?: number
      /** Raio VISUAL do desfoque em px (0 = nítido). Borrado em escala reduzida acima de 200. */
      blur?: number
      offsetX?: number
      offsetY?: number
      /** Quando presentes vencem `padding` no eixo correspondente. */
      paddingX?: number
      paddingY?: number
      /** Só a UI lê: a cor escolhida e a posição do slider de tom. */
      baseColor?: string
      tone?: number
    }
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
    /** Trim do vídeo em segundos (editor E export reproduzem só o trecho). */
    trimStart?: number
    trimEnd?: number
  }
  // Rich text support - estilos aplicados a trechos específicos do texto
  richTextStyles?: RichTextStyle[]
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
  /**
   * Início/fim do gradiente linear, relativos à layer (0..1). Quando ausentes,
   * o eixo é derivado de gradientAngle cobrindo a layer inteira.
   */
  gradientStartX?: number
  gradientStartY?: number
  gradientEndX?: number
  gradientEndY?: number
  /** Centro do gradiente radial, relativo à layer (0..1). Default 0.5 (centro). */
  gradientCenterX?: number
  gradientCenterY?: number
  /** Escala do raio do gradiente radial. Default 1 (metade da maior dimensão). */
  gradientRadiusScale?: number
  objectFit?: 'contain' | 'cover' | 'fill'
  cropPosition?: 'left-top' | 'center-top' | 'right-top' | 'left-middle' | 'center-middle' | 'right-middle' | 'left-bottom' | 'center-bottom' | 'right-bottom'
  /**
   * Recorte manual da imagem, em FRAÇÕES (0..1) da imagem original.
   * Quando presente, tem precedência sobre objectFit/cropPosition.
   * Fração (e não pixel) porque imagem dinâmica troca o arquivo por outro de
   * resolução diferente — a fração sobrevive à troca.
   */
  crop?: { x: number; y: number; width: number; height: number }
  /** Espelhamento — desenhado no node interno, NUNCA no scale (o transformEnd reseta o scale) */
  flipH?: boolean
  flipV?: boolean
  /** Máscara de forma aplicada à imagem. path é um SVG path CONGELADO em viewBox 0 0 100 100. */
  mask?: { shapeId: string; path: string }
  opacity?: number
  filter?: string
  shadow?: ShadowStyle
  border?: BorderStyle
  fill?: string
  fillOpacity?: number
  strokeColor?: string
  strokeOpacity?: number
  strokeWidth?: number
  shapeType?: 'rectangle' | 'rounded-rectangle' | 'circle' | 'triangle' | 'star' | 'arrow' | 'line' | 'svg-path'
  /** Forma vetorial genérica: SVG path d normalizado (viewBox 0 0 100 100 por padrão) */
  pathData?: string
  pathViewBox?: [number, number, number, number]
  pathFillRule?: 'nonzero' | 'evenodd'
  /** Estilo do traço de shapeType 'line' */
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  lineStartCap?: 'none' | 'arrow'
  lineEndCap?: 'none' | 'arrow'
  iconId?: string
  // Image filters and adjustments
  blur?: number
  exposure?: number // -1 to 1 (replaces brightness)
  contrast?: number
  highlights?: number // -100 to 100
  shadows?: number // -100 to 100
  whites?: number // -100 to 100
  blacks?: number // -100 to 100
  saturation?: number // -2 to 2
  vignette?: number // 0 to 1
  // Legacy filters (deprecated)
  brightness?: number // @deprecated use exposure instead
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

/**
 * Rich Text Style - Define estilos aplicados a trechos específicos de texto
 * Permite múltiplas cores, fontes e formatações na mesma frase
 */
export interface RichTextStyle {
  // Posição do trecho no texto (índices de caractere)
  start: number
  end: number

  // Estilos de texto
  fontFamily?: string
  fontSize?: number
  fill?: string
  fontStyle?: 'normal' | 'italic' | 'bold' | 'bold italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  letterSpacing?: number

  // Efeitos inline
  stroke?: {
    color: string
    width: number
  }
  shadow?: {
    color: string
    blur: number
    offset: { x: number; y: number }
  }
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
  audio?: PageAudioConfig | null
  order: number
  thumbnail?: string
  isTemplate?: boolean
  templateName?: string
  tags?: string[]
  createdAt?: Date
  updatedAt?: Date
}

export interface MultiPageDesignData {
  pages: Page[]
  currentPageId: string
  templateId?: number
}
