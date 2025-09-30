import type {
  DesignData,
  FieldValues,
  Layer,
  LayerStyle,
  TextBreakMode,
  TextboxConfig,
} from '@/types/template'

export type ImageLoader = (url: string) => Promise<CanvasImageSource>
export type FontChecker = (fontName: string) => Promise<FontValidationResult>

export interface FontValidationResult {
  isValid: boolean
  fallbackUsed: boolean
  fallbackFont?: string
  confidence: number
}

export interface RenderOptions {
  scaleFactor?: number
  imageLoader?: ImageLoader
  imageCache?: Map<string, CanvasImageSource>
  fontChecker?: FontChecker
  backgroundColor?: string
}

export class RenderEngine {
  static async renderDesign(
    ctx: CanvasRenderingContext2D,
    design: DesignData,
    fieldValues: FieldValues = {},
    options: RenderOptions = {},
  ): Promise<void> {
    const scaleFactor = options.scaleFactor ?? 1
    const width = Math.round(design.canvas.width * scaleFactor)
    const height = Math.round(design.canvas.height * scaleFactor)

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.imageSmoothingEnabled = true

    const backgroundColor =
      options.backgroundColor ?? design.canvas.backgroundColor ?? '#ffffff'
    if (backgroundColor && backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, width || ctx.canvas.width, height || ctx.canvas.height)
    }

    const sortedLayers = [...design.layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (const layer of sortedLayers) {
      await this.renderLayer(ctx, layer, fieldValues, options)
    }

    ctx.restore()
  }

  static async renderLayer(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    fieldValues: FieldValues,
    options: RenderOptions = {},
  ): Promise<void> {
    const scaleFactor = options.scaleFactor ?? 1
    const finalLayer = this.applyFieldValues(layer, fieldValues)
    if (finalLayer.visible === false) return

    ctx.save()
    const { width, height } = this.applyTransforms(ctx, finalLayer, scaleFactor)
    this.applyShadow(ctx, finalLayer.style)
    this.applyOpacity(ctx, finalLayer.style)

    switch (finalLayer.type) {
      case 'text':
        await this.renderText(ctx, finalLayer, width, height, options)
        break
      case 'image':
        await this.renderImage(ctx, finalLayer, width, height, options)
        break
      case 'gradient':
      case 'gradient2':
        this.renderGradient(ctx, finalLayer, width, height)
        break
      case 'logo':
      case 'element':
        await this.renderImage(ctx, finalLayer, width, height, options)
        break
      default:
        break
    }

    ctx.restore()
  }

  private static applyFieldValues(layer: Layer, fieldValues: FieldValues): Layer {
    const dynamicValue = fieldValues[layer.id]
    const overrides: Partial<LayerStyle> = {}

    for (const [key, value] of Object.entries(fieldValues)) {
      if (!key.startsWith(`${layer.id}_`)) continue
      const styleKey = key.slice(layer.id.length + 1) as keyof LayerStyle
      overrides[styleKey] = value as never
    }

    const transformedContent =
      typeof dynamicValue === 'string' ? dynamicValue : layer.content
    const transformedFileUrl =
      typeof dynamicValue === 'string' && this.looksLikeUrl(dynamicValue)
        ? dynamicValue
        : layer.fileUrl

    return {
      ...layer,
      content: transformedContent,
      fileUrl: transformedFileUrl,
      style: { ...layer.style, ...overrides },
    }
  }

  private static applyTransforms(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    scaleFactor: number,
  ): { width: number; height: number } {
    const width = Math.max(0, layer.size.width * scaleFactor)
    const height = Math.max(0, layer.size.height * scaleFactor)
    const x = layer.position.x * scaleFactor
    const y = layer.position.y * scaleFactor

    ctx.translate(x, y)

    if (layer.rotation) {
      const centerX = width / 2
      const centerY = height / 2
      ctx.translate(centerX, centerY)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.translate(-centerX, -centerY)
    }

    return { width, height }
  }

  private static applyOpacity(ctx: CanvasRenderingContext2D, style?: LayerStyle): void {
    if (style?.opacity !== undefined) {
      ctx.globalAlpha = Math.max(0, Math.min(1, style.opacity))
    }
  }

  private static applyShadow(ctx: CanvasRenderingContext2D, style?: LayerStyle): void {
    if (!style?.shadow) return
    const { offsetX, offsetY, blur, color } = style.shadow
    ctx.shadowOffsetX = offsetX
    ctx.shadowOffsetY = offsetY
    ctx.shadowBlur = blur
    ctx.shadowColor = color
  }

  private static async renderText(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    width: number,
    height: number,
    options: RenderOptions,
  ): Promise<void> {
    const style = layer.style ?? {}
    let fontFamily = style.fontFamily ?? 'sans-serif'

    if (options.fontChecker) {
      try {
        const result = await options.fontChecker(fontFamily)
        if (!result.isValid && result.fallbackFont) {
          fontFamily = result.fallbackFont
        }
      } catch (_) {
        // ignore font checker failures
      }
    }

    const fontSize = Math.max(1, style.fontSize ?? 16)
    ctx.font = this.buildFontString(fontSize, { ...style, fontFamily })
    ctx.fillStyle = style.color ?? '#000000'
    ctx.textAlign = (style.textAlign ?? 'left') as CanvasTextAlign
    ctx.textBaseline = 'top'

    const content = this.applyTextTransform(layer.content ?? '', style)

    if (layer.textboxConfig) {
      await this.renderTextWithConfig(ctx, layer, content, width, height)
      return
    }

    const x = this.getTextX(width, ctx.textAlign)
    const lineHeight = (style.lineHeight ?? 1.2) * fontSize
    const lines = content.split(/\r?\n/)

    let currentY = 0
    for (const line of lines) {
      ctx.fillText(line, x, currentY, width)
      currentY += lineHeight
      if (currentY > height) break
    }
  }

  private static async renderTextWithConfig(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    content: string,
    width: number,
    height: number,
  ): Promise<void> {
    const style = layer.style ?? {}
    const config = layer.textboxConfig as TextboxConfig
    const mode = config.textMode ?? 'auto-wrap-fixed'

    switch (mode) {
      case 'auto-resize-single':
        this.renderAutoResizeSingle(ctx, content, width, style)
        break
      case 'auto-resize-multi':
        this.renderAutoResizeMulti(ctx, content, width, height, style, config)
        break
      case 'auto-wrap-fixed':
      default:
        this.renderAutoWrapFixed(ctx, content, width, height, style, config)
        break
    }
  }

  private static renderAutoResizeSingle(
    ctx: CanvasRenderingContext2D,
    content: string,
    width: number,
    style: LayerStyle,
  ): void {
    const minFontSize = Math.max(1, style.fontSize ?? 12)
    const maxFontSize = Math.max(minFontSize, style.fontSize ?? 48)
    let low = minFontSize
    let high = maxFontSize
    let best = minFontSize

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      ctx.font = this.buildFontString(mid, style)
      const metrics = ctx.measureText(content)
      if (metrics.width <= width) {
        best = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    ctx.font = this.buildFontString(best, style)
    const x = this.getTextX(width, ctx.textAlign)
    ctx.fillText(content, x, 0, width)
  }

  private static renderAutoResizeMulti(
    ctx: CanvasRenderingContext2D,
    content: string,
    width: number,
    height: number,
    style: LayerStyle,
    config: TextboxConfig,
  ): void {
    const minFontSize = Math.max(1, config.autoResize?.minFontSize ?? 12)
    const maxFontSize = Math.max(minFontSize, config.autoResize?.maxFontSize ?? style.fontSize ?? 48)
    let low = minFontSize
    let high = maxFontSize
    let bestFont = minFontSize
    let bestLines: string[] = []

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      ctx.font = this.buildFontString(mid, style)
      const lines = this.breakTextIntoLines(
        ctx,
        content,
        width,
        config.autoWrap?.breakMode ?? 'word',
        config.wordBreak ?? false,
      )
      const totalHeight = lines.length * mid * (config.autoWrap?.lineHeight ?? style.lineHeight ?? 1.2)

      if (totalHeight <= height) {
        bestFont = mid
        bestLines = lines
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    ctx.font = this.buildFontString(bestFont, style)
    this.renderLines(
      ctx,
      bestLines,
      width,
      bestFont,
      config.autoWrap?.lineHeight ?? style.lineHeight ?? 1.2,
      config.anchor,
      height,
    )
  }

  private static renderAutoWrapFixed(
    ctx: CanvasRenderingContext2D,
    content: string,
    width: number,
    height: number,
    style: LayerStyle,
    config: TextboxConfig,
  ): void {
    const fontSize = Math.max(1, style.fontSize ?? 16)
    ctx.font = this.buildFontString(fontSize, style)
    const lines = this.breakTextIntoLines(
      ctx,
      content,
      width,
      config.autoWrap?.breakMode ?? 'word',
      config.wordBreak ?? false,
    )

    this.renderLines(
      ctx,
      lines,
      width,
      fontSize,
      config.autoWrap?.lineHeight ?? style.lineHeight ?? 1.2,
      config.anchor,
      height,
    )
  }

  private static renderLines(
    ctx: CanvasRenderingContext2D,
    lines: string[],
    width: number,
    fontSize: number,
    lineHeightMultiplier: number,
    anchor: TextboxConfig['anchor'] = 'top',
    maxHeight?: number,
  ): void {
    if (!lines.length) return

    const lineHeight = fontSize * lineHeightMultiplier
    const totalHeight = lines.length * lineHeight

    let startY = 0
    if (anchor === 'middle' && maxHeight !== undefined) {
      startY = Math.max(0, (maxHeight - totalHeight) / 2)
    } else if (anchor === 'bottom' && maxHeight !== undefined) {
      startY = Math.max(0, maxHeight - totalHeight)
    }

    const x = this.getTextX(width, ctx.textAlign)
    let currentY = startY

    for (const line of lines) {
      ctx.fillText(line, x, currentY, width)
      currentY += lineHeight
      if (maxHeight !== undefined && currentY > maxHeight) break
    }
  }

  private static breakTextIntoLines(
    ctx: CanvasRenderingContext2D,
    content: string,
    maxWidth: number,
    mode: TextBreakMode,
    wordBreak: boolean,
  ): string[] {
    const lines: string[] = []
    const paragraphs = content.split(/\r?\n/)

    for (const paragraph of paragraphs) {
      if (paragraph.trim().length === 0) {
        lines.push('')
        continue
      }

      if (mode === 'char' || wordBreak) {
        this.breakByCharacters(ctx, paragraph, maxWidth, lines)
        continue
      }

      const words = paragraph.split(/\s+/)
      let current = ''

      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        if (ctx.measureText(candidate).width <= maxWidth) {
          current = candidate
          continue
        }

        if (!current) {
          if (mode === 'hybrid') {
            this.breakByCharacters(ctx, word, maxWidth, lines)
            continue
          }

          if (!wordBreak) {
            lines.push(word)
            continue
          }
        }

        if (current) lines.push(current)

        if (ctx.measureText(word).width <= maxWidth) {
          current = word
        } else {
          this.breakByCharacters(ctx, word, maxWidth, lines)
          current = lines.pop() ?? ''
        }
      }

      if (current) lines.push(current)
    }

    return lines
  }

  private static breakByCharacters(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    lines: string[],
  ): void {
    let buffer = ''
    for (const char of text) {
      const next = buffer + char
      if (ctx.measureText(next).width <= maxWidth) {
        buffer = next
      } else {
        if (buffer) lines.push(buffer)
        buffer = char
      }
    }
    if (buffer) lines.push(buffer)
  }

  private static async renderImage(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    width: number,
    height: number,
    options: RenderOptions,
  ): Promise<void> {
    const source = layer.fileUrl
    if (!source) return

    const cache = options.imageCache
    if (cache?.has(source)) {
      this.drawImage(ctx, cache.get(source) as CanvasImageSource, width, height, layer.style)
      return
    }

    if (!options.imageLoader) return
    const image = await options.imageLoader(source)
    if (cache) cache.set(source, image)
    this.drawImage(ctx, image, width, height, layer.style)
  }

  private static drawImage(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    width: number,
    height: number,
    style?: LayerStyle,
  ): void {
    const fit = style?.objectFit ?? 'cover'
    const opacityBefore = ctx.globalAlpha

    if (style?.opacity !== undefined) {
      ctx.globalAlpha = Math.max(0, Math.min(1, style.opacity))
    }

    if (style?.filter && 'filter' in ctx) {
      ;(ctx as unknown as { filter: string }).filter = style.filter
    }

    if (fit === 'fill') {
      ctx.drawImage(image, 0, 0, width, height)
    } else {
      const { sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight } = this.computeObjectFit(
        image,
        width,
        height,
        fit,
      )
      ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
    }

    if (style?.border?.width) {
      ctx.lineWidth = style.border.width
      ctx.strokeStyle = style.border.color ?? '#000000'
      if (style.border.radius) {
        this.strokeRoundedRect(ctx, width, height, style.border.radius)
      } else {
        ctx.strokeRect(0, 0, width, height)
      }
    }

    ctx.globalAlpha = opacityBefore
    if ('filter' in ctx) {
      ;(ctx as unknown as { filter: string }).filter = 'none'
    }
  }

  private static computeObjectFit(
    image: CanvasImageSource,
    targetWidth: number,
    targetHeight: number,
    fit: 'contain' | 'cover',
  ) {
    const imgWidth = (image as { width?: number }).width ?? targetWidth
    const imgHeight = (image as { height?: number }).height ?? targetHeight

    if (!imgWidth || !imgHeight) {
      return { sx: 0, sy: 0, sWidth: targetWidth, sHeight: targetHeight, dx: 0, dy: 0, dWidth: targetWidth, dHeight: targetHeight }
    }

    const scale =
      fit === 'contain'
        ? Math.min(targetWidth / imgWidth, targetHeight / imgHeight)
        : Math.max(targetWidth / imgWidth, targetHeight / imgHeight)

    const dWidth = imgWidth * scale
    const dHeight = imgHeight * scale
    const dx = (targetWidth - dWidth) / 2
    const dy = (targetHeight - dHeight) / 2

    return { sx: 0, sy: 0, sWidth: imgWidth, sHeight: imgHeight, dx, dy, dWidth, dHeight }
  }

  private static strokeRoundedRect(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    radius: number,
  ) {
    const r = Math.min(radius, width / 2, height / 2)
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(width - r, 0)
    ctx.quadraticCurveTo(width, 0, width, r)
    ctx.lineTo(width, height - r)
    ctx.quadraticCurveTo(width, height, width - r, height)
    ctx.lineTo(r, height)
    ctx.quadraticCurveTo(0, height, 0, height - r)
    ctx.lineTo(0, r)
    ctx.quadraticCurveTo(0, 0, r, 0)
    ctx.closePath()
    ctx.stroke()
  }

  private static renderGradient(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    width: number,
    height: number,
  ): void {
    const style = layer.style ?? {}
    const gradientType = style.gradientType ?? 'linear'
    const stops = style.gradientStops ?? []
    if (!stops.length) return

    let gradient: CanvasGradient

    if (gradientType === 'radial') {
      const radius = Math.max(width, height) / 2
      gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, radius)
    } else {
      const angle = (style.gradientAngle ?? 0) * (Math.PI / 180)
      const x = Math.cos(angle)
      const y = Math.sin(angle)
      const x0 = width / 2 - (x * width) / 2
      const y0 = height / 2 - (y * height) / 2
      const x1 = width / 2 + (x * width) / 2
      const y1 = height / 2 + (y * height) / 2
      gradient = ctx.createLinearGradient(x0, y0, x1, y1)
    }

    for (const stop of stops) {
      const position = Math.max(0, Math.min(1, stop.position))
      gradient.addColorStop(position, stop.color)
    }

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }

  private static applyTextTransform(text: string, style: LayerStyle): string {
    const transform = style.textTransform ?? 'none'
    switch (transform) {
      case 'uppercase':
        return text.toUpperCase()
      case 'lowercase':
        return text.toLowerCase()
      case 'capitalize':
        return text.replace(/(^|\s)\S/g, (c) => c.toUpperCase())
      default:
        return text
    }
  }

  private static buildFontString(size: number, style: LayerStyle): string {
    const fontStyle = style.fontStyle ?? 'normal'
    const weight = style.fontWeight ?? 'normal'
    const family = style.fontFamily ?? 'sans-serif'
    return `${fontStyle} ${weight} ${Math.max(1, Math.floor(size))}px ${family}`
  }

  private static getTextX(width: number, align: CanvasTextAlign): number {
    switch (align) {
      case 'center':
        return width / 2
      case 'right':
      case 'end':
        return width
      default:
        return 0
    }
  }

  private static looksLikeUrl(value?: string): boolean {
    if (!value) return false
    try {
      const url = new URL(value)
      return !!url.protocol && !!url.host
    } catch (_) {
      return false
    }
  }
}
