import { buildTextFontString, resolveTextRenderState } from './text-layout'
import { resolveContainPlacement, resolveImageCrop } from './image-fit'
import type { KonvaPage, KonvaTextLayer, Layer, LayerEffects } from '@/types/template'

interface RenderPageOptions {
  maxWidth?: number
  mimeType?: 'image/png' | 'image/jpeg'
  quality?: number
  preferBlobDownload?: boolean
}

function normalizePercentageOpacity(value: number | undefined, fallback = 1): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  if (value > 1) return Math.max(0, Math.min(1, value / 100))
  return Math.max(0, Math.min(1, value))
}

function calculateGradientPoints(width: number, height: number, angle = 180) {
  const radians = ((180 - angle) / 180) * Math.PI
  const length = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
  const halfX = (Math.sin(radians) * length) / 2
  const halfY = (Math.cos(radians) * length) / 2
  const centerX = width / 2
  const centerY = height / 2

  return {
    startX: centerX - halfX,
    startY: centerY - halfY,
    endX: centerX + halfX,
    endY: centerY + halfY,
  }
}

function hexToRgbaForCanvas(color: string, opacity: number): string {
  if (opacity >= 1) return color

  // Handle rgba() format - replace alpha
  if (color.startsWith('rgba(')) {
    const match = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/)
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`
    }
  }

  // Handle rgb() format - add alpha
  if (color.startsWith('rgb(')) {
    const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`
    }
  }

  // Handle hex format
  const cleanHex = color.replace('#', '')
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function createRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function measureLineWidth(
  context: CanvasRenderingContext2D,
  text: string,
  layer: KonvaTextLayer,
  fontSize: number,
) {
  context.font = buildTextFontString(fontSize, layer)
  const letterSpacing = layer.textStyle?.letterSpacing ?? 0
  return context.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing
}

function drawTextLine(
  context: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  letterSpacing: number,
  extraSpacePerGap = 0,
) {
  if (!line.length || (letterSpacing === 0 && extraSpacePerGap === 0)) {
    context.fillText(line, x, y)
    return
  }

  let cursorX = x
  for (const character of line) {
    context.fillText(character, cursorX, y)
    cursorX += context.measureText(character).width + letterSpacing
    if (character === ' ') {
      cursorX += extraSpacePerGap
    }
  }
}

function loadImageFromSource(src: string, crossOrigin = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null)
      return
    }

    const image = new Image()
    if (crossOrigin) {
      image.crossOrigin = 'anonymous'
    }
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

async function loadRenderableImage(
  src: string,
  preferBlobDownload: boolean,
): Promise<HTMLImageElement | null> {
  if (!src) {
    return null
  }

  const isRelativeAsset = src.startsWith('/')
  const isDataUrl = src.startsWith('data:')
  const isBlobUrl = src.startsWith('blob:')

  // For data/blob URLs or relative assets, use direct loading
  if (isDataUrl || isBlobUrl || isRelativeAsset) {
    return await loadImageFromSource(src, false) // No crossOrigin for local sources
  }

  // For external URLs, try blob download first (bypasses CORS)
  if (preferBlobDownload && window.electronAPI?.downloadBlob) {
    try {
      const downloaded = await window.electronAPI.downloadBlob(src)
      if (downloaded.ok && downloaded.buffer) {
        const blob = new Blob([downloaded.buffer], { type: downloaded.contentType || 'image/png' })
        const objectUrl = URL.createObjectURL(blob)
        const image = await loadImageFromSource(objectUrl, false)
        URL.revokeObjectURL(objectUrl)
        return image
      }
    } catch (error) {
      console.warn('[RenderPage] Blob download failed for:', src, error)
    }
  }

  // Fallback to direct loading (may cause CORS issues)
  return await loadImageFromSource(src, false) // Try without crossOrigin to avoid tainting
}

async function drawImageLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<Layer, { type: 'image' | 'logo' | 'icon' }>,
  x: number,
  y: number,
  width: number,
  height: number,
  preferBlobDownload: boolean,
) {
  const image = await loadRenderableImage(layer.src ?? '', preferBlobDownload)
  const borderRadius = layer.role === 'background' ? 0 : layer.type === 'image' ? 18 : 0

  if (image) {
    context.save()
    if (borderRadius > 0) {
      createRoundedRectPath(context, x, y, width, height, borderRadius)
      context.clip()
    }

    if (layer.type === 'image' && (layer.fit ?? 'cover') === 'contain') {
      const placement = resolveContainPlacement(image.width, image.height, width, height)
      context.drawImage(image, x + placement.x, y + placement.y, placement.width, placement.height)
    } else if (layer.type === 'image' && (layer.fit ?? 'cover') === 'cover') {
      const crop = resolveImageCrop(layer, image.width, image.height, width, height)
      if (crop) {
        context.drawImage(
          image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          x,
          y,
          width,
          height,
        )
      } else {
        context.drawImage(image, x, y, width, height)
      }
    } else {
      context.drawImage(image, x, y, width, height)
    }

    context.restore()
    return
  }

  context.fillStyle = '#E2E8F0'
  context.strokeStyle = '#94A3B8'
  context.lineWidth = 2
  context.fillRect(x, y, width, height)
  context.strokeRect(x, y, width, height)
}

function applyTextEffects(
  context: CanvasRenderingContext2D,
  effects: LayerEffects | undefined,
  scale: number,
) {
  // Apply drop shadow if enabled
  if (effects?.dropShadow?.enabled) {
    const shadow = effects.dropShadow
    // Opacity is stored as 0-100, convert to 0-1
    const opacity = (shadow.opacity ?? 50) / 100
    const color = shadow.color ?? '#000000'
    // Convert hex color to rgba with opacity
    const shadowColor = hexToRgbaForCanvas(color, opacity)
    context.shadowColor = shadowColor
    context.shadowBlur = (shadow.blur ?? 10) * scale
    context.shadowOffsetX = (shadow.offsetX ?? 4) * scale
    context.shadowOffsetY = (shadow.offsetY ?? 4) * scale
  }
}

function clearTextEffects(context: CanvasRenderingContext2D) {
  context.shadowColor = 'transparent'
  context.shadowBlur = 0
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
}

function drawTextBackground(
  context: CanvasRenderingContext2D,
  effects: LayerEffects | undefined,
  lines: string[],
  layer: KonvaTextLayer,
  frameX: number,
  frameY: number,
  frameWidth: number,
  offsetY: number,
  fontSize: number,
  lineHeight: number,
  scale: number,
  align: string,
) {
  if (!effects?.textBackground?.enabled) return

  const bg = effects.textBackground
  const padding = (bg.padding ?? 8) * scale
  const cornerRadius = (bg.cornerRadius ?? 4) * scale
  const bgColor = bg.color ?? '#000000'
  // Opacity is stored as 0-100, convert to 0-1
  const bgOpacity = (bg.opacity ?? 50) / 100

  context.save()
  context.globalAlpha = bgOpacity

  lines.forEach((line, index) => {
    if (!line.trim()) return

    const lineWidth = measureLineWidth(context, line, layer, fontSize)
    const offsetX =
      align === 'center'
        ? (frameWidth - lineWidth) / 2
        : align === 'right'
          ? frameWidth - lineWidth
          : 0

    const bgX = frameX + offsetX - padding
    const bgY = frameY + offsetY + index * lineHeight - padding * 0.5
    const bgWidth = lineWidth + padding * 2
    const bgHeight = lineHeight + padding

    context.fillStyle = bgColor
    if (cornerRadius > 0) {
      createRoundedRectPath(context, bgX, bgY, bgWidth, bgHeight, cornerRadius)
      context.fill()
    } else {
      context.fillRect(bgX, bgY, bgWidth, bgHeight)
    }
  })

  context.restore()
}

function drawTextWithStroke(
  context: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  letterSpacing: number,
  extraSpacePerGap: number,
  effects: LayerEffects | undefined,
  fillColor: string,
  scale: number,
) {
  const hasStroke = effects?.textStroke?.enabled && (effects.textStroke.width ?? 0) > 0

  if (hasStroke) {
    const stroke = effects.textStroke!
    context.save()

    // Draw stroke first (behind fill)
    context.strokeStyle = stroke.color ?? '#000000'
    context.lineWidth = (stroke.width ?? 2) * scale * 2 // Double width because stroke is centered
    context.lineJoin = 'round'
    context.miterLimit = 2

    if (letterSpacing === 0 && extraSpacePerGap === 0) {
      context.strokeText(line, x, y)
    } else {
      let cursorX = x
      for (const character of line) {
        context.strokeText(character, cursorX, y)
        cursorX += context.measureText(character).width + letterSpacing
        if (character === ' ') {
          cursorX += extraSpacePerGap
        }
      }
    }

    context.restore()
  }

  // Draw fill text
  context.fillStyle = fillColor
  drawTextLine(context, line, x, y, letterSpacing, extraSpacePerGap)
}

function drawTextLayer(
  context: CanvasRenderingContext2D,
  layer: KonvaTextLayer,
  renderState: ReturnType<typeof resolveTextRenderState>,
  scale: number,
) {
  const lines = renderState.text.split('\n')
  const align = layer.textStyle?.align ?? 'left'
  const verticalAlign = layer.textStyle?.verticalAlign ?? 'top'
  const fontSize = Math.max(12, renderState.fontSize * scale)
  const frameX = renderState.x * scale
  const frameY = renderState.y * scale
  const frameWidth = renderState.width * scale
  const frameHeight = renderState.height * scale
  const lineHeight = fontSize * (layer.textStyle?.lineHeight ?? 1.2)
  const letterSpacing = (layer.textStyle?.letterSpacing ?? 0) * scale
  const totalTextHeight = lines.length * lineHeight
  const effects = layer.effects
  const fillColor = layer.textStyle?.fill ?? '#111827'

  const offsetY =
    verticalAlign === 'middle'
      ? (frameHeight - totalTextHeight) / 2
      : verticalAlign === 'bottom'
        ? frameHeight - totalTextHeight
        : 0

  context.font = buildTextFontString(fontSize, layer)
  context.textBaseline = 'top'

  // Draw text background if enabled
  drawTextBackground(
    context,
    effects,
    lines,
    layer,
    frameX,
    frameY,
    frameWidth,
    offsetY,
    fontSize,
    lineHeight,
    scale,
    align,
  )

  // Apply drop shadow effect
  applyTextEffects(context, effects, scale)

  lines.forEach((line, index) => {
    const lineWidth = measureLineWidth(context, line, layer, fontSize)
    const spacesCount = (line.match(/\s/g) ?? []).length
    const shouldJustify = align === 'justify' && index < lines.length - 1 && spacesCount > 0
    const extraSpacePerGap = shouldJustify ? Math.max(0, (frameWidth - lineWidth) / spacesCount) : 0
    const offsetX =
      shouldJustify
        ? 0
        : align === 'center'
        ? (frameWidth - lineWidth) / 2
        : align === 'right'
          ? frameWidth - lineWidth
          : 0

    drawTextWithStroke(
      context,
      line,
      frameX + Math.max(0, offsetX),
      frameY + Math.max(0, offsetY) + index * lineHeight,
      letterSpacing,
      extraSpacePerGap,
      effects,
      fillColor,
      scale,
    )
  })

  // Clear shadow effects
  clearTextEffects(context)
}

function drawShapeLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<Layer, { type: 'shape' }>,
  width: number,
  height: number,
  scale: number,
) {
  // Apply fill with opacity
  const fillColor = layer.fill ?? '#F59E0B'
  const fillOpacity = normalizePercentageOpacity(layer.fillOpacity, 1)
  context.fillStyle = fillOpacity < 1 ? hexToRgbaForCanvas(fillColor, fillOpacity) : fillColor

  // Apply stroke with opacity
  const strokeColor = layer.stroke ?? '#111827'
  const strokeOpacity = normalizePercentageOpacity(layer.strokeOpacity, 1)
  context.strokeStyle = strokeOpacity < 1 ? hexToRgbaForCanvas(strokeColor, strokeOpacity) : strokeColor
  context.lineWidth = (layer.strokeWidth ?? 0) * scale

  switch (layer.shape) {
    case 'circle':
      context.beginPath()
      context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
      context.fill()
      if (layer.strokeWidth) {
        context.stroke()
      }
      return
    case 'triangle':
      context.beginPath()
      context.moveTo(width / 2, 0)
      context.lineTo(width, height)
      context.lineTo(0, height)
      context.closePath()
      context.fill()
      if (layer.strokeWidth) {
        context.stroke()
      }
      return
    case 'star': {
      const outerRadius = Math.min(width, height) / 2
      const innerRadius = outerRadius * 0.36
      const centerX = width / 2
      const centerY = height / 2
      context.beginPath()
      for (let index = 0; index < 10; index += 1) {
        const angle = (-Math.PI / 2) + (index * Math.PI) / 5
        const radius = index % 2 === 0 ? outerRadius : innerRadius
        const pointX = centerX + Math.cos(angle) * radius
        const pointY = centerY + Math.sin(angle) * radius
        if (index === 0) {
          context.moveTo(pointX, pointY)
        } else {
          context.lineTo(pointX, pointY)
        }
      }
      context.closePath()
      context.fill()
      if (layer.strokeWidth) {
        context.stroke()
      }
      return
    }
    case 'arrow': {
      const points = layer.points ?? [
        0,
        height / 2,
        width - 30,
        height / 2,
        width - 60,
        height / 4,
        width,
        height / 2,
        width - 60,
        height * 0.75,
        width - 30,
        height / 2,
      ]
      context.beginPath()
      context.moveTo(points[0], points[1])
      for (let index = 2; index < points.length; index += 2) {
        context.lineTo(points[index], points[index + 1])
      }
      context.closePath()
      context.fill()
      if (layer.strokeWidth) {
        context.stroke()
      }
      return
    }
    case 'line': {
      const points = layer.points ?? [0, height / 2, width, height / 2]
      context.beginPath()
      context.lineCap = 'round'
      context.strokeStyle = layer.stroke ?? layer.fill ?? '#111827'
      context.lineWidth = (layer.strokeWidth ?? 8) * scale
      context.moveTo(points[0], points[1])
      for (let index = 2; index < points.length; index += 2) {
        context.lineTo(points[index], points[index + 1])
      }
      context.stroke()
      return
    }
    case 'rounded-rectangle': {
      const radius = Math.min(layer.cornerRadius ?? 24, width / 2, height / 2)
      createRoundedRectPath(context, 0, 0, width, height, radius)
      context.fill()
      if (layer.strokeWidth) {
        context.stroke()
      }
      return
    }
    case 'rectangle':
    default:
      context.fillRect(0, 0, width, height)
      if (layer.strokeWidth) {
        context.strokeRect(0, 0, width, height)
      }
  }
}

export async function renderPageToDataUrl(
  page: KonvaPage,
  options: RenderPageOptions = {},
): Promise<string> {
  const mimeType = options.mimeType ?? 'image/png'
  const quality = options.quality ?? 0.92
  const outputWidth = options.maxWidth
    ? Math.max(120, Math.round(options.maxWidth))
    : page.width
  const scale = outputWidth / page.width
  const outputHeight = Math.max(120, Math.round(page.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext('2d')
  if (!context) {
    return ''
  }

  context.fillStyle = page.background ?? '#F8F5EF'
  context.fillRect(0, 0, outputWidth, outputHeight)

  for (const layer of page.layers) {
    if (layer.visible === false) {
      continue
    }

    const frameX = layer.x * scale
    const frameY = layer.y * scale
    const frameWidth = (layer.width ?? 240) * scale
    const frameHeight = (layer.height ?? 120) * scale

    context.save()
    context.globalAlpha = layer.opacity ?? 1

    if (layer.type === 'text' || layer.type === 'rich-text') {
      const renderState = resolveTextRenderState(page, layer)

      if (layer.rotation) {
        const centerX = (renderState.x + renderState.width / 2) * scale
        const centerY = (renderState.y + renderState.height / 2) * scale
        context.translate(centerX, centerY)
        context.rotate((layer.rotation * Math.PI) / 180)
        context.translate(-centerX, -centerY)
      }

      drawTextLayer(context, layer, renderState, scale)
      context.restore()
      continue
    }

    context.translate(frameX, frameY)

    if (layer.rotation) {
      context.translate(frameWidth / 2, frameHeight / 2)
      context.rotate((layer.rotation * Math.PI) / 180)
      context.translate(-frameWidth / 2, -frameHeight / 2)
    }

    if (layer.type === 'gradient' || layer.type === 'gradient2') {
      const colors = layer.colors.length > 1 ? layer.colors : ['#111827', '#F59E0B']
      const stops =
        layer.stops && layer.stops.length === colors.length
          ? layer.stops
          : colors.map((_, index) => index / Math.max(colors.length - 1, 1))
      const opacities = layer.opacities && layer.opacities.length === colors.length
        ? layer.opacities
        : colors.map(() => 1)

      let gradient: CanvasGradient

      if (layer.gradientType === 'radial') {
        const centerX = frameWidth / 2
        const centerY = frameHeight / 2
        const radius = Math.max(frameWidth, frameHeight) / 2
        gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
      } else {
        const points = calculateGradientPoints(frameWidth, frameHeight, layer.angle ?? 180)
        gradient = context.createLinearGradient(points.startX, points.startY, points.endX, points.endY)
      }

      colors.forEach((color, index) => {
        const opacity = opacities[index] ?? 1
        const finalColor = hexToRgbaForCanvas(color, opacity)
        gradient.addColorStop(stops[index], finalColor)
      })

      context.fillStyle = gradient
      context.fillRect(0, 0, frameWidth, frameHeight)
      context.restore()
      continue
    }

    if (layer.type === 'shape') {
      drawShapeLayer(context, layer, frameWidth, frameHeight, scale)
      context.restore()
      continue
    }

    if (layer.type === 'image' || layer.type === 'logo' || layer.type === 'icon') {
      await drawImageLayer(context, layer, 0, 0, frameWidth, frameHeight, options.preferBlobDownload ?? false)
      context.restore()
      continue
    }

    context.fillStyle = '#E2E8F0'
    context.strokeStyle = '#94A3B8'
    context.fillRect(0, 0, frameWidth, frameHeight)
    context.strokeRect(0, 0, frameWidth, frameHeight)
    context.restore()
  }

  try {
    const dataUrl = canvas.toDataURL(mimeType, quality)
    return dataUrl
  } catch (error) {
    console.error('[RenderPage] toDataURL failed (canvas may be tainted):', error)
    return ''
  }
}
