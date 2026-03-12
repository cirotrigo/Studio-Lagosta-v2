import { buildTextFontString, resolveTextRenderState } from './text-layout'
import { resolveContainPlacement, resolveImageCrop } from './image-fit'
import type { KonvaPage, KonvaTextLayer, Layer } from '@/types/template'

interface RenderPageOptions {
  maxWidth?: number
  mimeType?: 'image/png' | 'image/jpeg'
  quality?: number
  preferBlobDownload?: boolean
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
  if (
    !preferBlobDownload ||
    !window.electronAPI?.downloadBlob ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    isRelativeAsset
  ) {
    return await loadImageFromSource(src)
  }

  try {
    const downloaded = await window.electronAPI.downloadBlob(src)
    if (!downloaded.ok || !downloaded.buffer) {
      return await loadImageFromSource(src)
    }

    const blob = new Blob([downloaded.buffer], { type: downloaded.contentType || 'image/png' })
    const objectUrl = URL.createObjectURL(blob)

    try {
      return await loadImageFromSource(objectUrl, false)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch (_error) {
    return await loadImageFromSource(src)
  }
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

  const offsetY =
    verticalAlign === 'middle'
      ? (frameHeight - totalTextHeight) / 2
      : verticalAlign === 'bottom'
        ? frameHeight - totalTextHeight
        : 0

  context.font = buildTextFontString(fontSize, layer)
  context.fillStyle = layer.textStyle?.fill ?? '#111827'
  context.textBaseline = 'top'

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

    drawTextLine(
      context,
      line,
      frameX + Math.max(0, offsetX),
      frameY + Math.max(0, offsetY) + index * lineHeight,
      letterSpacing,
      extraSpacePerGap,
    )
  })
}

function drawShapeLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<Layer, { type: 'shape' }>,
  width: number,
  height: number,
  scale: number,
) {
  context.fillStyle = layer.fill ?? '#F59E0B'
  context.strokeStyle = layer.stroke ?? '#111827'
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
      const points = calculateGradientPoints(frameWidth, frameHeight, layer.angle ?? 180)
      const gradient = context.createLinearGradient(points.startX, points.startY, points.endX, points.endY)
      const colors = layer.colors.length > 1 ? layer.colors : ['#111827', '#F59E0B']
      const stops =
        layer.stops && layer.stops.length === colors.length
          ? layer.stops
          : colors.map((_, index) => index / Math.max(colors.length - 1, 1))

      colors.forEach((color, index) => gradient.addColorStop(stops[index], color))
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
    return canvas.toDataURL(mimeType, quality)
  } catch (_error) {
    return ''
  }
}
