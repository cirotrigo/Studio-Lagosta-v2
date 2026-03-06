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
    type?: 'solid' | 'gradient'
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

  // Draw overlay if enabled
  if (input.textLayout.overlay.enabled) {
    const opacity = Math.min(0.85, Math.max(0, input.textLayout.overlay.opacity))
    const pos = input.textLayout.overlay.position
    const type = input.textLayout.overlay.type ?? 'gradient'

    let rectY = 0
    let rectHeight = height

    if (pos === 'bottom') {
      // Cover bottom 50% for better text coverage
      rectHeight = Math.round(height * 0.50)
      rectY = height - rectHeight
    } else if (pos === 'top') {
      rectHeight = Math.round(height * 0.50)
      rectY = 0
    }

    if (type === 'gradient') {
      // Multi-stop gradient: smooth transition with stronger coverage in text area
      if (pos === 'bottom') {
        const gradient = ctx.createLinearGradient(0, rectY, 0, rectY + rectHeight)
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
        gradient.addColorStop(0.3, `rgba(0, 0, 0, ${opacity * 0.2})`)
        gradient.addColorStop(0.6, `rgba(0, 0, 0, ${opacity * 0.6})`)
        gradient.addColorStop(0.85, `rgba(0, 0, 0, ${opacity * 0.85})`)
        gradient.addColorStop(1, `rgba(0, 0, 0, ${opacity})`)
        ctx.fillStyle = gradient
      } else if (pos === 'top') {
        const gradient = ctx.createLinearGradient(0, rectY, 0, rectY + rectHeight)
        gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity})`)
        gradient.addColorStop(0.15, `rgba(0, 0, 0, ${opacity * 0.85})`)
        gradient.addColorStop(0.4, `rgba(0, 0, 0, ${opacity * 0.6})`)
        gradient.addColorStop(0.7, `rgba(0, 0, 0, ${opacity * 0.2})`)
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = gradient
      } else {
        // Full: uniform opacity
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`
      }
    } else {
      // Solid overlay (original behavior)
      ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`
    }

    ctx.fillRect(0, rectY, width, rectHeight)
    console.log('[text-renderer] Added overlay:', type, pos, 'opacity:', opacity, 'height:', rectHeight)
  }

  // Draw text elements
  for (const el of input.textLayout.elements) {
    const xPx = Math.round((el.x / 100) * width)
    const yPx = Math.round((el.y / 100) * height)
    const maxWidthPx = Math.round((el.maxWidth / 100) * width)
    const fontFamily = el.font === 'title' ? input.fonts.title.family : input.fonts.body.family
    const weightStr = weightToString(el.weight)

    console.log(`[text-renderer] Drawing: "${el.text.substring(0, 40)}..." font="${fontFamily}" size=${el.sizePx} color=${el.color} pos=(${xPx},${yPx}) maxW=${maxWidthPx}`)

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

    // Handle multi-line text with word wrapping
    const lineHeight = Math.round(el.sizePx * 1.3)
    const rawLines = el.text.split('\n')
    const wrappedLines: string[] = []

    for (const rawLine of rawLines) {
      // Word-wrap each line that exceeds maxWidth
      if (maxWidthPx > 0 && ctx.measureText(rawLine).width > maxWidthPx) {
        const words = rawLine.split(' ')
        let currentLine = ''
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word
          if (ctx.measureText(testLine).width > maxWidthPx && currentLine) {
            wrappedLines.push(currentLine)
            currentLine = word
          } else {
            currentLine = testLine
          }
        }
        if (currentLine) wrappedLines.push(currentLine)
      } else {
        wrappedLines.push(rawLine)
      }
    }

    for (let i = 0; i < wrappedLines.length; i++) {
      const lineY = yPx + (i * lineHeight)
      // Don't draw lines that would be off-screen
      if (lineY >= 0 && lineY < height) {
        ctx.fillText(wrappedLines[i], xPx, lineY)
      }
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

// ============================================================
// 2-Pass Template Layout — New functions (Pass 2 + Pass 4)
// Legacy renderText above remains untouched.
// ============================================================

interface DraftLayoutElement {
  slotName: string
  text: string
  font: string
  fontFallbacks: string[]
  sizePx: number
  weight: number
  color: string
  x: number
  y_draft: number
  align: 'left' | 'center' | 'right'
  maxWidth: number
  uppercase: boolean
  lineBreakStrategy: 'balanced' | 'natural' | 'fixed'
  maxCharactersPerLine: number
  maxLines: number
  allowAutoScale: boolean
  slotMaxHeight: number
  anchorType: string
  anchorRef?: string
  anchorOffset?: number
  marginTop: number
  marginBottom: number
  estimatedHeight: number
  _group: string
}

interface DraftLayout {
  elements: DraftLayoutElement[]
  overlay: {
    enabled: boolean
    type?: 'solid' | 'gradient'
    direction?: string
    position: 'top' | 'bottom' | 'full'
    opacity: number
    startColor?: string
    endOpacity?: number
    endColor?: string
  }
  fontSources: {
    title: { family: string; url: string | null }
    body: { family: string; url: string | null }
  }
  logo?: {
    placement: string
    anchorOffset: number
    minMargin: number
    maxSizeRatio: number
    logoUrl?: string
  }
  canvas: {
    width: number
    height: number
    usableTop: number
    usableBottom: number
  }
  shadow: boolean
  safeMargin?: number
  strictMode: boolean
}

interface MeasuredSlot {
  slotName: string
  measuredHeight: number
  adjustedFontSize: number
  lines: string[]
  overflow: boolean
  fontFallbackUsed: boolean
}

interface MeasuredLayout {
  slots: MeasuredSlot[]
}

interface FinalLayoutElement {
  slotName: string
  text: string
  font: string
  fontFallbacks: string[]
  sizePx: number
  weight: number
  color: string
  x: number
  y_final: number
  align: 'left' | 'center' | 'right'
  maxWidth: number
  uppercase: boolean
  lines: string[]
  measuredHeight: number
  overflow: boolean
  fontFallbackUsed: boolean
}

interface FinalLayout {
  elements: FinalLayoutElement[]
  overlay: DraftLayout['overlay']
  logo?: DraftLayout['logo']
  canvas: DraftLayout['canvas']
  shadow: boolean
  safeMargin?: number
}

// --- Font Normalization (C20) ---

// CSS generic family names that must NOT be quoted
const CSS_GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
])

function quoteFamilyIfNeeded(name: string): string {
  const trimmed = name.trim()
  if (CSS_GENERIC_FAMILIES.has(trimmed.toLowerCase())) return trimmed
  // Already quoted
  if (/^['"].*['"]$/.test(trimmed)) return trimmed
  // Quote any family name (even single-word) for safety with @napi-rs/canvas
  return `"${trimmed}"`
}

function normalizeFontFamily(primaryFont: string, fallbacks: string[]): string {
  const cleaned = primaryFont.trim().replace(/^['"]|['"]$/g, '')
  const parts = [cleaned, ...fallbacks].map(quoteFamilyIfNeeded)
  return parts.join(', ')
}

// --- Line Breaking (C1) ---

function balanceTextLines(
  text: string,
  strategy: 'balanced' | 'natural' | 'fixed',
  maxCharsPerLine: number,
  maxWidthPx: number,
  ctx: any,
): string[] {
  // Apply max_characters_per_line FIRST (hard limit)
  let processedText = text
  if (maxCharsPerLine > 0 && maxCharsPerLine < 999) {
    const hardLimitLines: string[] = []
    for (const segment of processedText.split('\n')) {
      if (segment.length <= maxCharsPerLine) {
        hardLimitLines.push(segment)
      } else {
        // Break long segments respecting word boundaries
        const words = segment.split(' ')
        let current = ''
        for (const word of words) {
          if (current && (current + ' ' + word).length > maxCharsPerLine) {
            hardLimitLines.push(current)
            current = word
          } else {
            current = current ? current + ' ' + word : word
          }
        }
        if (current) hardLimitLines.push(current)
      }
    }
    processedText = hardLimitLines.join('\n')
  }

  if (strategy === 'fixed') {
    return processedText.split('\n')
  }

  if (strategy === 'balanced') {
    // Balance: try to split into N lines of roughly equal length
    const words = processedText.replace(/\n/g, ' ').split(' ').filter(w => w)
    const totalLength = words.join(' ').length
    const rawLines = processedText.split('\n')

    // Only balance if it's a single logical line
    if (rawLines.length <= 1 && words.length > 2) {
      // Binary search for best line count
      for (let numLines = 2; numLines <= Math.min(4, words.length); numLines++) {
        const targetLen = Math.ceil(totalLength / numLines)
        const lines: string[] = []
        let current = ''

        for (const word of words) {
          const test = current ? `${current} ${word}` : word
          if (current && test.length > targetLen + 3) {
            lines.push(current)
            current = word
          } else {
            current = test
          }
        }
        if (current) lines.push(current)

        // Check if all lines fit within maxWidth
        const allFit = lines.every(line => ctx.measureText(line).width <= maxWidthPx)
        if (allFit) return lines
      }
    }

    // Fallback to natural wrapping
    return naturalWordWrap(processedText, maxWidthPx, ctx)
  }

  // Natural
  return naturalWordWrap(processedText, maxWidthPx, ctx)
}

function naturalWordWrap(text: string, maxWidthPx: number, ctx: any): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    if (maxWidthPx > 0 && ctx.measureText(rawLine).width > maxWidthPx) {
      const words = rawLine.split(' ')
      let current = ''
      for (const word of words) {
        const test = current ? `${current} ${word}` : word
        if (current && ctx.measureText(test).width > maxWidthPx) {
          lines.push(current)
          current = word
        } else {
          current = test
        }
      }
      if (current) lines.push(current)
    } else {
      lines.push(rawLine)
    }
  }
  return lines
}

// --- Auto-Scale (C7) ---

function fitTextToSlot(
  text: string,
  fontSize: number,
  maxWidthPx: number,
  maxLines: number,
  slotMaxHeight: number,
  strategy: 'balanced' | 'natural' | 'fixed',
  maxCharsPerLine: number,
  ctx: any,
): { adjustedFontSize: number; lines: string[]; overflow: boolean } {
  const minFontSize = fontSize * 0.6
  let currentSize = fontSize
  let lines: string[] = []
  let overflow = false

  while (currentSize >= minFontSize) {
    ctx.font = ctx.font.replace(/\d+(\.\d+)?px/, `${Math.round(currentSize)}px`)
    lines = balanceTextLines(text, strategy, maxCharsPerLine, maxWidthPx, ctx)
    const textHeight = lines.length * currentSize * 1.2

    if (lines.length <= maxLines && textHeight <= slotMaxHeight) {
      return { adjustedFontSize: Math.round(currentSize), lines, overflow: false }
    }

    currentSize *= 0.95
  }

  // Even at minimum size, text doesn't fit
  ctx.font = ctx.font.replace(/\d+(\.\d+)?px/, `${Math.round(currentSize)}px`)
  lines = balanceTextLines(text, strategy, maxCharsPerLine, maxWidthPx, ctx)
  const textHeight = lines.length * currentSize * 1.2
  overflow = lines.length > maxLines || textHeight > slotMaxHeight

  return { adjustedFontSize: Math.round(currentSize), lines, overflow }
}

// --- Pass 2: Measure Text Layout ---

export function measureTextLayout(
  draft: DraftLayout,
  ctx: any,
): MeasuredLayout {
  const results: MeasuredSlot[] = []

  for (const el of draft.elements) {
    // Apply uppercase (C10)
    let text = el.text
    if (el.uppercase) text = text.toUpperCase()

    // Build font family with fallbacks (C20)
    const fontFamily = normalizeFontFamily(el.font, el.fontFallbacks)
    const weightStr = weightToString(el.weight)
    ctx.font = `${weightStr} ${el.sizePx}px ${fontFamily}`

    // Check font availability
    const fontAvailable = GlobalFonts.families.some(f => f.family === el.font)
    const fontFallbackUsed = !fontAvailable

    let adjustedFontSize: number
    let lines: string[]
    let overflow: boolean

    if (draft.strictMode) {
      // strictMode: NO auto-scale, NO truncation — preserve all lines
      lines = balanceTextLines(text, el.lineBreakStrategy, el.maxCharactersPerLine, el.maxWidth, ctx)
      adjustedFontSize = el.sizePx
      overflow = lines.length > el.maxLines ||
        (lines.length * el.sizePx * 1.2) > el.slotMaxHeight
    } else if (el.allowAutoScale) {
      // Auto-scale enabled
      const result = fitTextToSlot(
        text, el.sizePx, el.maxWidth, el.maxLines, el.slotMaxHeight,
        el.lineBreakStrategy, el.maxCharactersPerLine, ctx,
      )
      adjustedFontSize = result.adjustedFontSize
      lines = result.lines
      overflow = result.overflow
    } else {
      // No auto-scale, may truncate
      lines = balanceTextLines(text, el.lineBreakStrategy, el.maxCharactersPerLine, el.maxWidth, ctx)
      adjustedFontSize = el.sizePx

      if (lines.length > el.maxLines) {
        lines = lines.slice(0, el.maxLines)
        lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*$/, '...')
      }

      overflow = false // truncation handled it
    }

    const measuredHeight = Math.round(lines.length * adjustedFontSize * 1.2)

    results.push({
      slotName: el.slotName,
      measuredHeight,
      adjustedFontSize,
      lines,
      overflow,
      fontFallbackUsed,
    })
  }

  return { slots: results }
}

// --- Pass 4: Render Final Layout ---

export async function renderFinalLayout(
  finalLayout: FinalLayout,
  imageBuffer: Buffer,
  ctx_unused?: any,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const { width, height } = finalLayout.canvas

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Draw overlay
  const overlay = finalLayout.overlay
  if (overlay.enabled) {
    const opacity = Math.min(0.85, Math.max(0, overlay.opacity))
    const startColor = overlay.startColor ?? '#000000'

    if (overlay.direction) {
      // NEW: directional gradient (template path)
      const gradientZoneX = 0
      const gradientZoneW = width
      // Note: gradient_zone is applied via the engine x/width calculations
      // Here we just draw the directional gradient across the canvas

      ctx.save()

      let grad: CanvasGradient
      switch (overlay.direction) {
        case 'left_to_right':
          grad = ctx.createLinearGradient(0, 0, width, 0)
          break
        case 'right_to_left':
          grad = ctx.createLinearGradient(width, 0, 0, 0)
          break
        case 'top_to_bottom':
          grad = ctx.createLinearGradient(0, 0, 0, height)
          break
        case 'bottom_to_top':
          grad = ctx.createLinearGradient(0, height, 0, 0)
          break
        default:
          grad = ctx.createLinearGradient(0, 0, width, 0)
      }

      // Parse color
      const hexMatch = startColor.match(/^#?([0-9a-fA-F]{6})$/)
      const r = hexMatch ? parseInt(hexMatch[1].substring(0, 2), 16) : 0
      const g = hexMatch ? parseInt(hexMatch[1].substring(2, 4), 16) : 0
      const b = hexMatch ? parseInt(hexMatch[1].substring(4, 6), 16) : 0

      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`)
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${overlay.endOpacity ?? 0})`)

      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
      ctx.restore()
    } else {
      // LEGACY: vertical gradient (old flow — positionTextWithVision)
      const pos = overlay.position
      let rectY = 0
      let rectHeight = height

      if (pos === 'bottom') {
        rectHeight = Math.round(height * 0.50)
        rectY = height - rectHeight
      } else if (pos === 'top') {
        rectHeight = Math.round(height * 0.50)
        rectY = 0
      }

      if (overlay.type === 'gradient') {
        if (pos === 'bottom') {
          const gradient = ctx.createLinearGradient(0, rectY, 0, rectY + rectHeight)
          gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
          gradient.addColorStop(0.3, `rgba(0, 0, 0, ${opacity * 0.2})`)
          gradient.addColorStop(0.6, `rgba(0, 0, 0, ${opacity * 0.6})`)
          gradient.addColorStop(0.85, `rgba(0, 0, 0, ${opacity * 0.85})`)
          gradient.addColorStop(1, `rgba(0, 0, 0, ${opacity})`)
          ctx.fillStyle = gradient
        } else if (pos === 'top') {
          const gradient = ctx.createLinearGradient(0, rectY, 0, rectY + rectHeight)
          gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity})`)
          gradient.addColorStop(0.15, `rgba(0, 0, 0, ${opacity * 0.85})`)
          gradient.addColorStop(0.4, `rgba(0, 0, 0, ${opacity * 0.6})`)
          gradient.addColorStop(0.7, `rgba(0, 0, 0, ${opacity * 0.2})`)
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = gradient
        } else {
          ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`
        }
      } else {
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`
      }

      ctx.fillRect(0, rectY, width, rectHeight)
    }
  }

  // Draw text elements (pre-computed lines and positions)
  for (const el of finalLayout.elements) {
    const fontFamily = normalizeFontFamily(el.font, el.fontFallbacks)
    const weightStr = weightToString(el.weight)
    ctx.font = `${weightStr} ${el.sizePx}px ${fontFamily}`
    ctx.fillStyle = el.color
    ctx.textAlign = alignToCanvasAlign(el.align)
    ctx.textBaseline = 'top'

    if (finalLayout.shadow) {
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

    const lineHeight = Math.round(el.sizePx * 1.2)
    for (let i = 0; i < el.lines.length; i++) {
      const lineY = el.y_final + (i * lineHeight)
      if (lineY >= 0 && lineY < height) {
        ctx.fillText(el.lines[i], el.x, lineY)
      }
    }
  }

  // Convert canvas to PNG buffer for compositing
  const textLayerBuffer = canvas.toBuffer('image/png')

  // Composite onto image
  const layers: Array<{ input: Buffer; top: number; left: number }> = [
    { input: textLayerBuffer, top: 0, left: 0 },
  ]

  // Logo in template path (simplified — full logo logic is in main.ts)
  // Logo is handled at the main.ts level when calling renderFinalLayout

  const result = await sharp(imageBuffer)
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer()

  return result
}

// Export registeredFonts and registerFontFromPath for use by main.ts IPC handler
export { registeredFonts, registerFontFromPath }
