/**
 * Smart Guides (Alignment Guides) for Konva.js
 *
 * Implementação completa de guias de alinhamento inteligentes inspiradas em editores
 * como Figma, Canva e Adobe XD.
 *
 * Features:
 * - Alinhamento com canvas (bordas e centro)
 * - Alinhamento entre objetos (bordas e centros)
 * - Snap automático com threshold configurável
 * - Visual customizável (cor, espessura, dash pattern)
 * - Toggle on/off com tecla Alt
 * - Detecção de dimensões iguais
 * - Performance otimizada
 *
 * @module konva-smart-guides
 */

// ===========================
// Types & Interfaces
// ===========================

export interface SnapConfig {
  /** Habilitar/desabilitar sistema de snap */
  enabled: boolean
  /** Distância de encaixe em pixels */
  threshold: number
  /** Encaixar nas bordas do canvas */
  snapToStage: boolean
  /** Encaixar em outros objetos */
  snapToObjects: boolean
  /** Mostrar linhas guia */
  showGuides: boolean
  /** Cor das guias */
  guideColor: string
  /** Padrão de tracejado [dash, space] */
  guideDash: [number, number]
  /** Mostrar quando dimensões são iguais */
  showDimensions: boolean
  /** Espessura da linha */
  guideWidth: number
  /** Opacidade das guias */
  guideOpacity: number
}

export interface RectInfo {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export interface GuideLine {
  orientation: 'horizontal' | 'vertical'
  position: number
  /** Tipo de alinhamento detectado */
  snapType?: 'start' | 'center' | 'end'
}

export interface SnapEdge {
  /** Posição da guia no eixo */
  guide: number
  /** Offset do objeto em relação à guia */
  offset: number
  /** Tipo de snap (borda inicial, centro, borda final) */
  snap: 'start' | 'center' | 'end'
}

export interface SnapResult {
  guides: GuideLine[]
  position: { x: number; y: number }
  /** Dimensões que coincidem com outros objetos */
  matchedDimensions?: {
    width?: number[]  // IDs dos objetos com mesma largura
    height?: number[] // IDs dos objetos com mesma altura
  }
}

// ===========================
// Default Configuration
// ===========================

export const DEFAULT_SNAP_CONFIG: SnapConfig = {
  enabled: true,
  threshold: 5,
  snapToStage: true,
  snapToObjects: true,
  showGuides: true,
  guideColor: '#FF00FF', // Magenta (padrão de editores profissionais)
  guideDash: [4, 6],
  showDimensions: false,
  guideWidth: 3, // Aumentado de 1 para 3 para melhor visibilidade
  guideOpacity: 0.9, // Aumentado de 0.8 para 0.9 para melhor visibilidade
}

// ===========================
// Core Functions
// ===========================

/**
 * Extrai as bordas de snap de um objeto retangular.
 *
 * Retorna 3 pontos verticais (esquerda, centro, direita) e
 * 3 pontos horizontais (topo, centro, fundo).
 */
export function getObjectSnappingEdges(rect: RectInfo): {
  vertical: SnapEdge[]
  horizontal: SnapEdge[]
} {
  const { x, y, width, height } = rect

  return {
    vertical: [
      { guide: x, offset: 0, snap: 'start' },              // Borda esquerda
      { guide: x + width / 2, offset: width / 2, snap: 'center' }, // Centro
      { guide: x + width, offset: width, snap: 'end' },    // Borda direita
    ],
    horizontal: [
      { guide: y, offset: 0, snap: 'start' },              // Borda superior
      { guide: y + height / 2, offset: height / 2, snap: 'center' }, // Centro
      { guide: y + height, offset: height, snap: 'end' }, // Borda inferior
    ],
  }
}

/**
 * Obtém as guias de alinhamento do stage (canvas).
 */
export function getStageGuides(stageWidth: number, stageHeight: number): {
  vertical: number[]
  horizontal: number[]
} {
  return {
    vertical: [
      0,                  // Borda esquerda
      stageWidth / 2,     // Centro
      stageWidth,         // Borda direita
    ],
    horizontal: [
      0,                  // Borda superior
      stageHeight / 2,    // Centro
      stageHeight,        // Borda inferior
    ],
  }
}

/**
 * Gera todas as guias possíveis a partir de um conjunto de objetos.
 */
export function getLineGuideStops(
  stageWidth: number,
  stageHeight: number,
  rects: RectInfo[],
  config: SnapConfig = DEFAULT_SNAP_CONFIG
): {
  vertical: number[]
  horizontal: number[]
} {
  const vertical: number[] = []
  const horizontal: number[] = []

  // Adicionar guias do stage
  if (config.snapToStage) {
    const stageGuides = getStageGuides(stageWidth, stageHeight)
    vertical.push(...stageGuides.vertical)
    horizontal.push(...stageGuides.horizontal)
  }

  // Adicionar guias de outros objetos
  if (config.snapToObjects) {
    rects.forEach((rect) => {
      const edges = getObjectSnappingEdges(rect)
      vertical.push(...edges.vertical.map((e) => e.guide))
      horizontal.push(...edges.horizontal.map((e) => e.guide))
    })
  }

  return { vertical, horizontal }
}

/**
 * Detecta alinhamentos e retorna as guias a serem exibidas.
 */
export function detectAlignmentGuides(
  itemBounds: ReturnType<typeof getObjectSnappingEdges>,
  lineGuides: { vertical: number[]; horizontal: number[] },
  threshold: number
): {
  vertical: Array<{ lineGuide: number; diff: number; snap: 'start' | 'center' | 'end'; offset: number }>
  horizontal: Array<{ lineGuide: number; diff: number; snap: 'start' | 'center' | 'end'; offset: number }>
} {
  const resultV: Array<{ lineGuide: number; diff: number; snap: 'start' | 'center' | 'end'; offset: number }> = []
  const resultH: Array<{ lineGuide: number; diff: number; snap: 'start' | 'center' | 'end'; offset: number }> = []

  // Detectar alinhamento vertical (esquerda, centro, direita)
  lineGuides.vertical.forEach((lineGuide) => {
    itemBounds.vertical.forEach((itemBound) => {
      const diff = Math.abs(lineGuide - itemBound.guide)

      if (diff < threshold) {
        resultV.push({
          lineGuide: lineGuide,
          diff: diff,
          snap: itemBound.snap,
          offset: itemBound.offset,
        })
      }
    })
  })

  // Detectar alinhamento horizontal (topo, centro, fundo)
  lineGuides.horizontal.forEach((lineGuide) => {
    itemBounds.horizontal.forEach((itemBound) => {
      const diff = Math.abs(lineGuide - itemBound.guide)

      if (diff < threshold) {
        resultH.push({
          lineGuide: lineGuide,
          diff: diff,
          snap: itemBound.snap,
          offset: itemBound.offset,
        })
      }
    })
  })

  return {
    vertical: resultV,
    horizontal: resultH,
  }
}

/**
 * Detecta se as dimensões do objeto sendo arrastado coincidem com outros objetos.
 */
export function detectMatchingDimensions(
  movingRect: RectInfo,
  otherRects: RectInfo[],
  threshold: number
): {
  width: string[]
  height: string[]
} {
  const matchedWidth: string[] = []
  const matchedHeight: string[] = []

  otherRects.forEach((rect) => {
    // Mesma largura
    if (Math.abs(movingRect.width - rect.width) < threshold) {
      matchedWidth.push(rect.id)
    }

    // Mesma altura
    if (Math.abs(movingRect.height - rect.height) < threshold) {
      matchedHeight.push(rect.id)
    }
  })

  return {
    width: matchedWidth,
    height: matchedHeight,
  }
}

/**
 * Função principal: Calcula guias de alinhamento e posição com snap.
 *
 * Esta é a função principal que você deve usar para implementar smart guides.
 *
 * @param moving - Objeto sendo arrastado
 * @param others - Outros objetos no canvas
 * @param stageWidth - Largura do canvas
 * @param stageHeight - Altura do canvas
 * @param config - Configurações de snap
 * @returns Guias a serem desenhadas e nova posição com snap aplicado
 *
 * @example
 * ```ts
 * const result = computeAlignmentGuides(
 *   { id: '1', x: 100, y: 100, width: 50, height: 50 },
 *   [{ id: '2', x: 200, y: 100, width: 50, height: 50 }],
 *   800,
 *   600
 * )
 *
 * // Aplicar snap
 * node.position(result.position)
 *
 * // Desenhar guias
 * result.guides.forEach(guide => {
 *   // Renderizar linha
 * })
 * ```
 */
export function computeAlignmentGuides(
  moving: RectInfo,
  others: RectInfo[],
  stageWidth: number,
  stageHeight: number,
  config: SnapConfig = DEFAULT_SNAP_CONFIG
): SnapResult {
  if (!config.enabled) {
    return {
      guides: [],
      position: { x: moving.x, y: moving.y },
    }
  }

  const lineGuideStops = getLineGuideStops(stageWidth, stageHeight, others, config)
  const itemBounds = getObjectSnappingEdges(moving)

  const detectedGuides = detectAlignmentGuides(itemBounds, lineGuideStops, config.threshold)

  let snapX = moving.x
  let snapY = moving.y
  let vGuide: GuideLine | null = null
  let hGuide: GuideLine | null = null
  let minDiffV = config.threshold
  let minDiffH = config.threshold

  // Encontrar a guia vertical mais próxima (menor diff)
  detectedGuides.vertical.forEach((guide) => {
    if (guide.diff < minDiffV) {
      minDiffV = guide.diff
      snapX = guide.lineGuide - guide.offset
      vGuide = {
        orientation: 'vertical',
        position: guide.lineGuide,
        snapType: guide.snap,
      }
    }
  })

  // Encontrar a guia horizontal mais próxima (menor diff)
  detectedGuides.horizontal.forEach((guide) => {
    if (guide.diff < minDiffH) {
      minDiffH = guide.diff
      snapY = guide.lineGuide - guide.offset
      hGuide = {
        orientation: 'horizontal',
        position: guide.lineGuide,
        snapType: guide.snap,
      }
    }
  })

  const guides: GuideLine[] = []

  // Adicionar guias apenas se estiverem dentro do threshold
  if (vGuide && minDiffV < config.threshold) {
    guides.push(vGuide)
  } else {
    snapX = moving.x
  }

  if (hGuide && minDiffH < config.threshold) {
    guides.push(hGuide)
  } else {
    snapY = moving.y
  }

  // Detectar dimensões iguais (opcional)
  let matchedDimensions
  if (config.showDimensions) {
    const matches = detectMatchingDimensions(moving, others, config.threshold)
    if (matches.width.length > 0 || matches.height.length > 0) {
      matchedDimensions = {
        width: matches.width.length > 0 ? matches.width : undefined,
        height: matches.height.length > 0 ? matches.height : undefined,
      }
    }
  }

  return {
    guides: config.showGuides ? guides : [],
    position: {
      x: snapX,
      y: snapY,
    },
    matchedDimensions,
  }
}

// ===========================
// Helper Functions
// ===========================

/**
 * Throttle para otimização de performance.
 * Limita a frequência de execução de uma função.
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0
  return function (...args: Parameters<T>) {
    const now = Date.now()
    if (now - lastCall >= delay) {
      lastCall = now
      func(...args)
    }
  }
}

/**
 * Formata coordenadas para exibição.
 */
export function formatCoordinates(x: number, y: number): string {
  return `X: ${Math.round(x)} Y: ${Math.round(y)}`
}

/**
 * Formata dimensões para exibição.
 */
export function formatDimensions(width: number, height: number): string {
  return `${Math.round(width)} × ${Math.round(height)}`
}
