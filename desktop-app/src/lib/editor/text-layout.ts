import type { KonvaPage, KonvaTextLayer, Layer, TextTransform } from '@/types/template'

const MEASURE_CANVAS = typeof document !== 'undefined' ? document.createElement('canvas') : null
const DEFAULT_SAFE_AREA_RATIO = 0.06

function getMeasureContext(): CanvasRenderingContext2D | null {
  return MEASURE_CANVAS?.getContext('2d') ?? null
}

export function buildTextFontString(fontSize: number, layer: KonvaTextLayer): string {
  const fontStyle = layer.textStyle?.fontStyle ?? 'normal'
  const fontWeight = layer.textStyle?.fontWeight ?? 'normal'
  const fontFamily = layer.textStyle?.fontFamily ?? 'Inter'
  return `${fontStyle} ${fontWeight} ${Math.max(1, Math.round(fontSize))}px ${fontFamily}`
}

function measureTextWidth(
  context: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  layer: KonvaTextLayer,
) {
  context.font = buildTextFontString(fontSize, layer)
  const letterSpacing = layer.textStyle?.letterSpacing ?? 0
  const measured = context.measureText(text).width
  return measured + Math.max(0, text.length - 1) * letterSpacing
}

function breakLongWord(
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
  fontSize: number,
  layer: KonvaTextLayer,
): string[] {
  const chunks: string[] = []
  let current = ''

  word.split('').forEach((character) => {
    const candidate = `${current}${character}`
    if (current && measureTextWidth(context, candidate, fontSize, layer) > maxWidth) {
      chunks.push(current)
      current = character
      return
    }

    current = candidate
  })

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  layer: KonvaTextLayer,
): string[] {
  const lines: string[] = []
  const paragraphs = text.split('\n')

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      return
    }

    let current = ''

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word
      if (current && measureTextWidth(context, candidate, fontSize, layer) > maxWidth) {
        lines.push(current)
        if (measureTextWidth(context, word, fontSize, layer) > maxWidth) {
          const chunks = breakLongWord(context, word, maxWidth, fontSize, layer)
          chunks.slice(0, -1).forEach((chunk) => lines.push(chunk))
          current = chunks[chunks.length - 1] ?? ''
        } else {
          current = word
        }
        return
      }

      current = candidate
    })

    if (current) {
      lines.push(current)
    }
  })

  return lines.length > 0 ? lines : ['']
}

function trimLineWithEllipsis(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  layer: KonvaTextLayer,
): string {
  const ellipsis = '...'
  let current = text
  while (current && measureTextWidth(context, `${current}${ellipsis}`, fontSize, layer) > maxWidth) {
    current = current.slice(0, -1)
  }

  return current ? `${current}${ellipsis}` : ellipsis
}

function getMaxVisibleLines(height: number, fontSize: number, lineHeight: number) {
  if (height <= 0) {
    return 1
  }

  return Math.max(1, Math.floor(height / Math.max(1, fontSize * lineHeight)))
}

export function applyTextTransform(text: string, transform: TextTransform = 'none'): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'capitalize':
      return text.replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase())
    default:
      return text
  }
}

export function getTextSafeAreaBase(page: KonvaPage, width: number, height: number, layer: KonvaTextLayer) {
  const safeArea = layer.textStyle?.safeArea
  if (!safeArea?.enabled) {
    return { x: 0, y: 0 }
  }

  const insetX = Math.max(40, Math.round(page.width * DEFAULT_SAFE_AREA_RATIO))
  const insetY = Math.max(40, Math.round(page.height * DEFAULT_SAFE_AREA_RATIO))
  const horizontal = safeArea.horizontal ?? 'left'
  const vertical = safeArea.vertical ?? 'top'

  const x =
    horizontal === 'left'
      ? insetX
      : horizontal === 'center'
        ? Math.round((page.width - width) / 2)
        : Math.round(page.width - insetX - width)

  const y =
    vertical === 'top'
      ? insetY
      : vertical === 'center'
        ? Math.round((page.height - height) / 2)
        : Math.round(page.height - insetY - height)

  return { x, y }
}

export function resolveTextLayerFrame(page: KonvaPage, layer: KonvaTextLayer) {
  const width = layer.width ?? Math.round(page.width * 0.8)
  const height = layer.height ?? 160
  const base = getTextSafeAreaBase(page, width, height, layer)

  return {
    x: Math.round(base.x + layer.x),
    y: Math.round(base.y + layer.y),
    width,
    height,
  }
}

export function resolveLayerAbsoluteFrame(page: KonvaPage, layer: Layer) {
  if (layer.type === 'text' || layer.type === 'rich-text') {
    return resolveTextLayerFrame(page, layer)
  }

  return {
    x: layer.x,
    y: layer.y,
    width: layer.width ?? 240,
    height: layer.height ?? 120,
  }
}

export function convertAbsoluteTextPositionToOffsets(
  page: KonvaPage,
  layer: KonvaTextLayer,
  absoluteX: number,
  absoluteY: number,
  width = layer.width ?? Math.round(page.width * 0.8),
  height = layer.height ?? 160,
) {
  const base = getTextSafeAreaBase(page, width, height, layer)
  return {
    x: Math.round(absoluteX - base.x),
    y: Math.round(absoluteY - base.y),
  }
}

export function normalizeTextSafeArea(
  page: KonvaPage,
  layer: KonvaTextLayer,
  enabled: boolean,
  vertical = layer.textStyle?.safeArea?.vertical ?? 'top',
  horizontal = layer.textStyle?.safeArea?.horizontal ?? 'left',
): KonvaTextLayer {
  const currentFrame = resolveTextLayerFrame(page, layer)
  const nextLayer: KonvaTextLayer = {
    ...layer,
    textStyle: {
      ...layer.textStyle,
      safeArea: {
        enabled,
        vertical,
        horizontal,
      },
    },
  }

  const nextOffsets = convertAbsoluteTextPositionToOffsets(
    page,
    nextLayer,
    currentFrame.x,
    currentFrame.y,
    currentFrame.width,
    currentFrame.height,
  )

  return {
    ...nextLayer,
    x: nextOffsets.x,
    y: nextOffsets.y,
  }
}

export function resolveTextRenderState(page: KonvaPage, layer: KonvaTextLayer) {
  const frame = resolveTextLayerFrame(page, layer)
  const transformedText = applyTextTransform(layer.text, layer.textStyle?.textTransform)
  const minFontSize = Math.max(8, layer.textStyle?.minFontSize ?? 12)
  const maxFontSize = Math.max(minFontSize, layer.textStyle?.maxFontSize ?? layer.textStyle?.fontSize ?? 48)
  const behavior = layer.textStyle?.overflowBehavior ?? 'clip'
  const lineHeight = layer.textStyle?.lineHeight ?? 1.2
  const maxLines = layer.textStyle?.maxLines
  const context = getMeasureContext()

  if (!context) {
    return {
      ...frame,
      text: transformedText,
      fontSize: layer.textStyle?.fontSize ?? 48,
    }
  }

  const clampLines = (lines: string[], fontSize: number) => {
    const maxByHeight = getMaxVisibleLines(frame.height, fontSize, lineHeight)
    const maxAllowed = Math.max(1, Math.min(maxLines ?? maxByHeight, maxByHeight))
    return {
      maxAllowed,
      overflowed: lines.length > maxAllowed,
    }
  }

  let resolvedFontSize = Math.min(maxFontSize, Math.max(minFontSize, layer.textStyle?.fontSize ?? maxFontSize))
  let wrappedLines = wrapText(context, transformedText, frame.width, resolvedFontSize, layer)

  if (behavior === 'autoScale') {
    for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
      const nextLines = wrapText(context, transformedText, frame.width, fontSize, layer)
      const { overflowed } = clampLines(nextLines, fontSize)
      if (!overflowed) {
        resolvedFontSize = fontSize
        wrappedLines = nextLines
        break
      }
      resolvedFontSize = fontSize
      wrappedLines = nextLines
    }
  }

  const { maxAllowed, overflowed } = clampLines(wrappedLines, resolvedFontSize)
  let visibleLines = wrappedLines.slice(0, maxAllowed)

  if (overflowed && behavior === 'ellipsis' && visibleLines.length > 0) {
    visibleLines = [
      ...visibleLines.slice(0, -1),
      trimLineWithEllipsis(context, visibleLines[visibleLines.length - 1], frame.width, resolvedFontSize, layer),
    ]
  }

  return {
    ...frame,
    text: visibleLines.join('\n'),
    fontSize: resolvedFontSize,
  }
}
