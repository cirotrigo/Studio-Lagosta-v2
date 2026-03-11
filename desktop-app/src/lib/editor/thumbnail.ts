import type { KonvaPage } from '@/types/template'

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

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = word
      return
    }

    current = next
  })

  if (current) {
    lines.push(current)
  }

  lines.slice(0, 4).forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight)
  })
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null)
      return
    }

    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

export async function renderPageThumbnail(page: KonvaPage): Promise<string> {
  const maxWidth = 180
  const scale = maxWidth / page.width
  const width = Math.max(120, Math.round(page.width * scale))
  const height = Math.max(120, Math.round(page.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    return ''
  }

  context.fillStyle = page.background ?? '#F8F5EF'
  context.fillRect(0, 0, width, height)

  for (const layer of page.layers) {
    if (layer.visible === false) {
      continue
    }

    const x = layer.x * scale
    const y = layer.y * scale
    const layerWidth = (layer.width ?? 240) * scale
    const layerHeight = (layer.height ?? 120) * scale

    context.save()
    context.globalAlpha = layer.opacity ?? 1
    context.translate(x, y)

    if (layer.rotation) {
      context.translate(layerWidth / 2, layerHeight / 2)
      context.rotate((layer.rotation * Math.PI) / 180)
      context.translate(-layerWidth / 2, -layerHeight / 2)
    }

    if (layer.type === 'text' || layer.type === 'rich-text') {
      context.fillStyle = layer.textStyle?.fill ?? '#111827'
      context.font = `${layer.textStyle?.fontWeight ?? 700} ${Math.max(12, (layer.textStyle?.fontSize ?? 42) * scale)}px ${layer.textStyle?.fontFamily ?? 'Inter'}`
      context.textBaseline = 'top'
      wrapText(
        context,
        layer.text,
        0,
        0,
        layerWidth || width * 0.7,
        Math.max(14, (layer.textStyle?.fontSize ?? 42) * scale * (layer.textStyle?.lineHeight ?? 1.15)),
      )
      context.restore()
      continue
    }

    if (layer.type === 'gradient' || layer.type === 'gradient2') {
      const points = calculateGradientPoints(layerWidth, layerHeight, layer.angle ?? 180)
      const gradient = context.createLinearGradient(points.startX, points.startY, points.endX, points.endY)
      const colors = layer.colors.length > 1 ? layer.colors : ['#111827', '#F59E0B']
      const stops =
        layer.stops && layer.stops.length === colors.length
          ? layer.stops
          : colors.map((_, index) => index / Math.max(colors.length - 1, 1))

      colors.forEach((color, index) => gradient.addColorStop(stops[index], color))
      context.fillStyle = gradient
      context.fillRect(0, 0, layerWidth, layerHeight)
      context.restore()
      continue
    }

    if (layer.type === 'shape') {
      context.fillStyle = layer.fill ?? '#F59E0B'
      context.strokeStyle = layer.stroke ?? '#111827'
      context.lineWidth = (layer.strokeWidth ?? 0) * scale

      if (layer.shape === 'circle') {
        context.beginPath()
        context.ellipse(layerWidth / 2, layerHeight / 2, layerWidth / 2, layerHeight / 2, 0, 0, Math.PI * 2)
        context.fill()
        if (layer.strokeWidth) {
          context.stroke()
        }
      } else {
        const radius = Math.min(layer.cornerRadius ?? 0, layerWidth / 2, layerHeight / 2)
        context.beginPath()
        context.moveTo(radius, 0)
        context.lineTo(layerWidth - radius, 0)
        context.quadraticCurveTo(layerWidth, 0, layerWidth, radius)
        context.lineTo(layerWidth, layerHeight - radius)
        context.quadraticCurveTo(layerWidth, layerHeight, layerWidth - radius, layerHeight)
        context.lineTo(radius, layerHeight)
        context.quadraticCurveTo(0, layerHeight, 0, layerHeight - radius)
        context.lineTo(0, radius)
        context.quadraticCurveTo(0, 0, radius, 0)
        context.closePath()
        context.fill()
        if (layer.strokeWidth) {
          context.stroke()
        }
      }

      context.restore()
      continue
    }

    if (layer.type === 'image' || layer.type === 'logo' || layer.type === 'icon') {
      const image = await loadImage(layer.src ?? '')
      if (image) {
        context.drawImage(image, 0, 0, layerWidth, layerHeight)
      } else {
        context.fillStyle = '#E2E8F0'
        context.strokeStyle = '#94A3B8'
        context.lineWidth = 2
        context.fillRect(0, 0, layerWidth, layerHeight)
        context.strokeRect(0, 0, layerWidth, layerHeight)
      }

      context.restore()
      continue
    }

    context.fillStyle = '#E2E8F0'
    context.strokeStyle = '#94A3B8'
    context.fillRect(0, 0, layerWidth, layerHeight)
    context.strokeRect(0, 0, layerWidth, layerHeight)
    context.restore()
  }

  try {
    return canvas.toDataURL('image/png', 0.92)
  } catch (_error) {
    return ''
  }
}
