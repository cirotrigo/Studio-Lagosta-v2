import { GlobalFonts, createCanvas, Canvas } from '@napi-rs/canvas'
import path from 'path'

interface TextLayoutElement {
  type: string
  text: string
  font: 'title' | 'body'
  sizePx: number
  weight: number
  color: string
  x: number       // % of width (0-100)
  y: number       // % of height (0-100)
  align: 'left' | 'center' | 'right'
  maxWidth: number // % of width
}

interface TextLayout {
  elements: TextLayoutElement[]
  shadow: boolean
  overlay: {
    enabled: boolean
    position: 'top' | 'bottom' | 'full'
    opacity: number
  }
}

export interface RenderTextInput {
  imageBuffer: Buffer
  textLayout: TextLayout
  fonts: {
    title: { family: string; base64: string; path?: string }
    body: { family: string; base64: string; path?: string }
  }
  logo?: {
    buffer: Buffer
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    sizePct: number
  }
}

// Track registered fonts to avoid re-registering
const registeredFonts = new Set<string>()

function registerFontFromPath(fontPath: string, familyName: string): boolean {
  const key = `${familyName}-${fontPath}`
  if (registeredFonts.has(key)) {
    console.log('[text-renderer] Font already registered:', familyName)
    return true
  }
  
  try {
    GlobalFonts.registerFromPath(fontPath, familyName)
    registeredFonts.add(key)
    console.log('[text-renderer] Registered font from path:', familyName, fontPath)
    return true
  } catch (error) {
    console.error('[text-renderer] Failed to register font:', familyName, error)
    return false
  }
}

function alignToCanvasAlign(align: 'left' | 'center' | 'right'): CanvasTextAlign {
  switch (align) {
    case 'left': return 'left'
    case 'center': return 'center'
    case 'right': return 'right'
  }
}

function weightToString(weight: number): string {
  if (weight >= 700) return 'bold'
  if (weight >= 500) return '500'
  return 'normal'
}

/**
 * Render text overlay + logo onto an image using Canvas for text rendering.
 * This approach properly supports custom TTF fonts.
 */
export async function renderText(input: RenderTextInput): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  console.log('[text-renderer] Starting render with', input.textLayout.elements.length, 'text elements')
  console.log('[text-renderer] Title font:', input.fonts.title.family, 'path:', input.fonts.title.path)
  console.log('[text-renderer] Body font:', input.fonts.body.family, 'path:', input.fonts.body.path)

  // Get image dimensions
  const metadata = await sharp(input.imageBuffer).metadata()
  const width = metadata.width || 1080
  const height = metadata.height || 1350

  console.log('[text-renderer] Image dimensions:', width, 'x', height)

  // Register fonts from paths
  if (input.fonts.title.path) {
    registerFontFromPath(input.fonts.title.path, input.fonts.title.family)
  }
  if (input.fonts.body.path) {
    registerFontFromPath(input.fonts.body.path, input.fonts.body.family)
  }

  // List registered fonts for debugging
  const families = GlobalFonts.families
  console.log('[text-renderer] Available font families:', families.map(f => f.family).join(', '))

  // Create canvas for text rendering
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Draw overlay rectangle if enabled
  if (input.textLayout.overlay.enabled) {
    const opacity = Math.min(0.7, Math.max(0, input.textLayout.overlay.opacity))
    const pos = input.textLayout.overlay.position

    let rectY = 0
    let rectHeight = height

    if (pos === 'bottom') {
      rectHeight = Math.round(height * 0.35)
      rectY = height - rectHeight
    } else if (pos === 'top') {
      rectHeight = Math.round(height * 0.35)
      rectY = 0
    }

    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`
    ctx.fillRect(0, rectY, width, rectHeight)
    console.log('[text-renderer] Added overlay:', pos, 'opacity:', opacity)
  }

  // Draw text elements
  for (const el of input.textLayout.elements) {
    const xPx = Math.round((el.x / 100) * width)
    const yPx = Math.round((el.y / 100) * height)
    const fontFamily = el.font === 'title' ? input.fonts.title.family : input.fonts.body.family
    const weightStr = weightToString(el.weight)

    console.log(`[text-renderer] Drawing: "${el.text.substring(0, 30)}..." font="${fontFamily}" size=${el.sizePx} pos=(${xPx},${yPx})`)

    // Set font
    ctx.font = `${weightStr} ${el.sizePx}px "${fontFamily}"`
    ctx.fillStyle = el.color
    ctx.textAlign = alignToCanvasAlign(el.align)
    ctx.textBaseline = 'top'

    // Add shadow if enabled
    if (input.textLayout.shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetX = 1
      ctx.shadowOffsetY = 2
    } else {
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    }

    // Handle multi-line text
    const lines = el.text.split('\n')
    const lineHeight = Math.round(el.sizePx * 1.3)

    for (let i = 0; i < lines.length; i++) {
      const lineY = yPx + (i * lineHeight)
      ctx.fillText(lines[i], xPx, lineY)
    }
  }

  // Convert canvas to PNG buffer
  const textLayerBuffer = canvas.toBuffer('image/png')
  console.log('[text-renderer] Text layer generated, size:', textLayerBuffer.length, 'bytes')

  // Build composite layers
  const layers: Array<{ input: Buffer; top?: number; left?: number }> = [
    { input: textLayerBuffer, top: 0, left: 0 },
  ]

  // Logo overlay
  if (input.logo) {
    const logoWidth = Math.round(width * (input.logo.sizePct / 100))
    const resizedLogo = await sharp(input.logo.buffer)
      .resize({ width: logoWidth, fit: 'inside' })
      .toBuffer()

    const logoMeta = await sharp(resizedLogo).metadata()
    const lw = logoMeta.width || logoWidth
    const lh = logoMeta.height || logoWidth
    const margin = 24

    let left = 0
    let top = 0

    switch (input.logo.position) {
      case 'bottom-right':
        left = width - lw - margin
        top = height - lh - margin
        break
      case 'bottom-left':
        left = margin
        top = height - lh - margin
        break
      case 'top-right':
        left = width - lw - margin
        top = margin
        break
      case 'top-left':
        left = margin
        top = margin
        break
    }

    layers.push({ input: resizedLogo, left, top })
    console.log('[text-renderer] Added logo at position:', input.logo.position, 'coords:', left, top)
  }

  // Composite all layers onto the image
  console.log('[text-renderer] Compositing', layers.length, 'layers onto base image...')
  const result = await sharp(input.imageBuffer)
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer()

  console.log('[text-renderer] Done! Output size:', result.length, 'bytes')
  return result
}
