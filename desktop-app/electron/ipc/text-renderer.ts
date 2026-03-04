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
    title: { family: string; base64: string }
    body: { family: string; base64: string }
  }
  logo?: {
    buffer: Buffer
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    sizePct: number
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function alignToAnchor(align: 'left' | 'center' | 'right'): string {
  switch (align) {
    case 'left': return 'start'
    case 'center': return 'middle'
    case 'right': return 'end'
  }
}

/**
 * Render text overlay + logo onto an image using Sharp SVG composite.
 */
export async function renderText(input: RenderTextInput): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  const metadata = await sharp(input.imageBuffer).metadata()
  const width = metadata.width || 1080
  const height = metadata.height || 1350

  // Build SVG with embedded fonts
  const svgParts: string[] = []

  svgParts.push(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`)
  svgParts.push('<defs><style>')
  svgParts.push(`@font-face { font-family: '${escapeXml(input.fonts.title.family)}'; src: url(data:font/truetype;base64,${input.fonts.title.base64}); }`)
  svgParts.push(`@font-face { font-family: '${escapeXml(input.fonts.body.family)}'; src: url(data:font/truetype;base64,${input.fonts.body.base64}); }`)
  svgParts.push('</style>')

  // Shadow filter
  if (input.textLayout.shadow) {
    svgParts.push(`<filter id="shadow"><feDropShadow dx="1" dy="2" stdDeviation="3" flood-opacity="0.6" flood-color="#000000"/></filter>`)
  }

  svgParts.push('</defs>')

  // Overlay rectangle
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
    // 'full' uses default (y=0, height=full)

    svgParts.push(`<rect x="0" y="${rectY}" width="${width}" height="${rectHeight}" fill="rgba(0,0,0,${opacity})" />`)
  }

  // Text elements
  for (const el of input.textLayout.elements) {
    const xPx = Math.round((el.x / 100) * width)
    const yPx = Math.round((el.y / 100) * height)
    const fontFamily = el.font === 'title' ? input.fonts.title.family : input.fonts.body.family
    const anchor = alignToAnchor(el.align)
    const filterAttr = input.textLayout.shadow ? ' filter="url(#shadow)"' : ''

    svgParts.push(
      `<text x="${xPx}" y="${yPx}" font-family="'${escapeXml(fontFamily)}'" font-size="${el.sizePx}" font-weight="${el.weight}" fill="${escapeXml(el.color)}" text-anchor="${anchor}" dominant-baseline="auto"${filterAttr}>${escapeXml(el.text)}</text>`
    )
  }

  svgParts.push('</svg>')

  const svgBuffer = Buffer.from(svgParts.join('\n'))

  // Build composite layers
  const layers: Array<{ input: Buffer; top?: number; left?: number }> = [
    { input: svgBuffer },
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
  }

  // Composite all layers onto the image
  const result = await sharp(input.imageBuffer)
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer()

  return result
}
