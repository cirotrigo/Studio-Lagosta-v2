import type {
  DesignData,
  FieldValues,
  Layer,
  LayerStyle,
  RichTextStyle,
  TextBreakMode,
  TextboxConfig,
} from '@/types/template'
import { resolveImageSourceRect } from './image-fit'
import { ICON_PATHS } from './assets/icon-library'
import {
  applyImageFilterChain,
  applyStackBlur,
  hasImageFilters,
} from './konva/filters/apply'
import { flattenRichTextStyles } from './rich-text-styles'
import type { Rect } from './creatives/halo/halo'
import {
  escalaDoBlur,
  folgaDoBlur,
  PADDING_DE_DESENHO,
  raioDosCantos,
  resolverFundo,
  retanguloDasLinhas,
  retanguloDoFundo,
  type FundoResolvido,
} from './creatives/halo/fundo-de-texto'

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
  /**
   * Fábrica de Path2D a partir de um SVG path (d). No browser o global serve;
   * no Node o canvas-renderer injeta o Path2D do @napi-rs/canvas (o
   * render-engine não pode importá-lo — quebraria o bundle client).
   */
  createPath2D?: (d: string) => Path2D
  /**
   * Fábrica de canvas offscreen para os filtros de imagem e o blur de texto
   * (o "cache" que o Konva usa no editor). No Node o canvas-renderer injeta o
   * createCanvas do @napi-rs/canvas — mesmo motivo do createPath2D; no browser
   * cai em document.createElement('canvas'). Sem nenhum dos dois, os filtros
   * são silenciosamente ignorados (comportamento antigo).
   */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement
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

    // O fundo/halo do texto (effects.background) é desenhado em renderText,
    // DENTRO do transform e sem a sombra do texto — ver renderTextBackground.
    // (rich-text fica de fora: como na sombra, o konva-multi-styled-text lê
    // efeitos por segmento e ignora layer.effects)

    const { width, height } = this.applyTransforms(ctx, finalLayer, scaleFactor)
    this.applyShadow(ctx, finalLayer, scaleFactor)
    this.applyOpacity(ctx, finalLayer.style)

    switch (finalLayer.type) {
      case 'text':
        await this.renderText(ctx, finalLayer, width, height, options)
        break
      case 'rich-text':
        await this.renderRichText(ctx, finalLayer, options)
        break
      case 'image':
        await this.renderImage(ctx, finalLayer, width, height, options)
        break
      case 'gradient':
      case 'gradient2':
        this.renderGradient(ctx, finalLayer, width, height)
        break
      case 'shape':
        this.renderShape(ctx, finalLayer, width, height, options)
        break
      case 'icon':
        this.renderIcon(ctx, finalLayer, options)
        break
      case 'logo':
      case 'element':
        await this.renderImage(ctx, finalLayer, width, height, options)
        break
      default:
        // Nunca engolir camada em silêncio: o resultado é um buraco invisível
        // na arte publicada. 'video' é o caso conhecido (corte assumido — o
        // story-renderer barra antes de chegar aqui).
        console.warn(
          `[RenderEngine] Camada não suportada ignorada: type="${finalLayer.type}" id="${finalLayer.id}"`,
        )
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

    // Konva rotaciona o node em torno da própria origem (x,y) — nenhum node do
    // editor usa offset. Rotacionar em torno do centro da caixa (comportamento
    // antigo daqui) deslocava toda camada rotacionada em relação ao editor.
    if (layer.rotation) {
      ctx.rotate((layer.rotation * Math.PI) / 180)
    }

    return { width, height }
  }

  private static applyOpacity(ctx: CanvasRenderingContext2D, style?: LayerStyle): void {
    if (style?.opacity !== undefined) {
      ctx.globalAlpha = Math.max(0, Math.min(1, style.opacity))
    }
  }

  private static normalizeOpacityValue(value: unknown): number | undefined {
    const numeric = typeof value === 'string'
      ? (value.trim().endsWith('%') ? Number.parseFloat(value) / 100 : Number(value))
      : value
    if (typeof numeric !== 'number' || Number.isNaN(numeric)) return undefined
    if (numeric > 1 && numeric <= 100) return Math.max(0, Math.min(1, numeric / 100))
    return Math.max(0, Math.min(1, numeric))
  }

  private static getShapeChannelOpacity(layer: Layer, channel: 'fill' | 'stroke'): number {
    const style = (layer.style ?? {}) as Record<string, unknown>
    const border = ((layer.style?.border ?? {}) as Record<string, unknown>)
    const keys = channel === 'fill'
      ? ['fillOpacity', 'fillAlpha']
      : ['strokeOpacity', 'strokeAlpha', 'borderOpacity', 'borderAlpha']

    for (const key of keys) {
      const fromStyle = this.normalizeOpacityValue(style[key])
      if (fromStyle !== undefined) return fromStyle
      const fromBorder = this.normalizeOpacityValue(border[key])
      if (fromBorder !== undefined) return fromBorder
    }

    return 1
  }

  private static applyOpacityToColor(rawColor: string, opacity = 1): string {
    const normalizedOpacity = Math.max(0, Math.min(1, opacity))
    // Espaço nas pontas ("  #977807") fazia o hex cair fora do startsWith('#')
    // e a opacidade ser ignorada — stop transparente saía opaco na arte.
    const color = rawColor.trim()

    if (color.startsWith('#')) {
      const hex = color.slice(1)

      if (hex.length === 8) {
        const r = parseInt(hex.slice(0, 2), 16)
        const g = parseInt(hex.slice(2, 4), 16)
        const b = parseInt(hex.slice(4, 6), 16)
        const a = parseInt(hex.slice(6, 8), 16) / 255
        return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a * normalizedOpacity))})`
      }

      if (hex.length === 4) {
        const r = parseInt(`${hex[0]}${hex[0]}`, 16)
        const g = parseInt(`${hex[1]}${hex[1]}`, 16)
        const b = parseInt(`${hex[2]}${hex[2]}`, 16)
        const a = parseInt(`${hex[3]}${hex[3]}`, 16) / 255
        return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a * normalizedOpacity))})`
      }

      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16)
        const g = parseInt(hex.slice(2, 4), 16)
        const b = parseInt(hex.slice(4, 6), 16)
        return `rgba(${r},${g},${b},${normalizedOpacity})`
      }

      if (hex.length === 3) {
        const r = parseInt(`${hex[0]}${hex[0]}`, 16)
        const g = parseInt(`${hex[1]}${hex[1]}`, 16)
        const b = parseInt(`${hex[2]}${hex[2]}`, 16)
        return `rgba(${r},${g},${b},${normalizedOpacity})`
      }
    }

    const parseAlphaValue = (value: string): number => {
      const normalized = value.trim()
      if (normalized.endsWith('%')) {
        return Number.parseFloat(normalized) / 100
      }
      return Number(normalized)
    }

    const withAdjustedFunctionalColor = (
      family: 'rgb' | 'hsl',
      content: string,
    ): string => {
      const normalized = content.trim()

      if (normalized.includes('/')) {
        const [base, alphaValue = '1'] = normalized.split('/').map((part) => part.trim())
        const alpha = Math.max(0, Math.min(1, parseAlphaValue(alphaValue) * normalizedOpacity))
        return `${family}(${base} / ${alpha})`
      }

      const commaParts = normalized.split(',').map((part) => part.trim())
      if (commaParts.length >= 4) {
        const base = commaParts.slice(0, 3).join(',')
        const alpha = Math.max(0, Math.min(1, parseAlphaValue(commaParts[3]) * normalizedOpacity))
        return `${family}a(${base},${alpha})`
      }

      if (commaParts.length === 3) {
        return `${family}a(${commaParts.join(',')},${normalizedOpacity})`
      }

      return `${family}(${normalized} / ${normalizedOpacity})`
    }

    const rgbMatch = color.match(/rgba?\(([^)]+)\)/i)
    if (rgbMatch) {
      return withAdjustedFunctionalColor('rgb', rgbMatch[1])
    }

    const hslMatch = color.match(/hsla?\(([^)]+)\)/i)
    if (hslMatch) {
      return withAdjustedFunctionalColor('hsl', hslMatch[1])
    }

    return color
  }

  /**
   * Sombra da camada.
   *
   * A fonte da verdade é `layer.effects.shadow` — é onde o editor grava e o que
   * o painel de efeitos edita. Até aqui esta função só olhava `style.shadow`,
   * um formato que nada escreve, então **nenhuma das 743 camadas com sombra
   * aparecia na arte publicada**: o editor mostrava a sombra e o render saía
   * sem ela, em silêncio.
   *
   * O caminho por `style.shadow` continua atendido por compatibilidade.
   */
  private static applyShadow(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    scaleFactor = 1,
  ): void {
    // `rich-text` fica de fora: o editor dele (konva-multi-styled-text) lê a
    // sombra por segmento, em `segment.style.shadow`, e ignora
    // `layer.effects.shadow`. Desenhar aqui criaria a divergência ao contrário
    // — uma sombra na arte publicada que o usuário nunca viu e não sabe
    // desligar.
    const efeito = layer.type === 'rich-text' ? undefined : layer.effects?.shadow
    if (efeito?.enabled) {
      // Deslocamento e difusão são medidas em pixels do canvas: sem escalar,
      // a miniatura sai com a sombra proporcionalmente gigante
      ctx.shadowOffsetX = (efeito.shadowOffsetX ?? 0) * scaleFactor
      ctx.shadowOffsetY = (efeito.shadowOffsetY ?? 0) * scaleFactor
      ctx.shadowBlur = (efeito.shadowBlur ?? 0) * scaleFactor
      // O canvas não tem opacidade de sombra separada — ela vai no alfa da cor
      ctx.shadowColor = this.applyOpacityToColor(efeito.shadowColor ?? '#000000', efeito.shadowOpacity ?? 1)
      return
    }

    const style = layer.style
    if (!style?.shadow) return
    const { offsetX, offsetY, blur, color } = style.shadow
    ctx.shadowOffsetX = offsetX
    ctx.shadowOffsetY = offsetY
    ctx.shadowBlur = blur
    ctx.shadowColor = color
  }

  /** Curvo de verdade só com curvatura ≠ 0 — igual ao isCurvedText do editor */
  private static isCurvedTextLayer(layer: Layer): boolean {
    return Boolean(
      layer.type === 'text' &&
        layer.effects?.curved?.enabled &&
        (layer.effects.curved.curvature ?? 0) !== 0,
    )
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
      } catch {
        // ignore font checker failures
      }
    }

    // O fallback de fonte precisa valer também nos sub-renderers, que remontam
    // ctx.font a partir do style — sem isso o fallback só existia na primeira
    // atribuição e o measureText dos caminhos com config media outra fonte
    const resolvedStyle = { ...style, fontFamily }

    // Texto curvo: caminho próprio, caractere a caractere no arco — a mesma
    // geometria do editor. Não passa por padding, quebra nem alinhamento.
    if (this.isCurvedTextLayer(layer)) {
      this.renderCurvedText(ctx, layer, resolvedStyle, options)
      return
    }

    // Fundo/halo atrás do texto — antes do conteúdo e FORA do offscreen do
    // blur de texto (no editor é um Rect irmão, não entra no cache do Text).
    // Texto curvo não tem fundo no editor; curvature 0 cai aqui, com fundo.
    this.renderTextBackground(ctx, layer, resolvedStyle, width, height, options)

    // Blur de texto: desenhar o conteúdo num offscreen (o cache do editor),
    // borrar os pixels com o stack blur do Konva e blitar o resultado
    const blurFx = layer.type === 'text' ? layer.effects?.blur : undefined
    const blurRadius = blurFx?.enabled ? Math.round(blurFx.blurRadius ?? 0) : 0
    if (blurRadius > 0) {
      const done = await this.renderTextBlurred(
        ctx, layer, resolvedStyle, width, height, blurRadius, options,
      )
      if (done) return
    }

    await this.drawTextContent(ctx, layer, resolvedStyle, width, height, options)
  }

  /**
   * Corpo do desenho de texto (fonte, cor, padding, quebra, contorno) — usado
   * tanto no ctx principal quanto no offscreen do blur.
   */
  private static async drawTextContent(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    resolvedStyle: LayerStyle,
    width: number,
    height: number,
    options: RenderOptions,
  ): Promise<void> {
    const style = layer.style ?? {}
    const fontSize = Math.max(1, style.fontSize ?? 16)
    ctx.font = this.buildFontString(fontSize, resolvedStyle)
    ctx.fillStyle = style.color ?? '#000000'
    ctx.textAlign = (style.textAlign ?? 'left') as CanvasTextAlign
    ctx.textBaseline = 'top'
    this.applyLetterSpacing(ctx, resolvedStyle, options.scaleFactor ?? 1)

    const content = this.applyTextTransform(layer.content ?? '', style)

    // O Konva.Text do editor tem padding={6} fixo (konva-editable-text): o
    // conteúdo quebra em width-12 e começa 6px para dentro. Sem replicar, todo
    // texto da arte publicada saía ~6px deslocado e quebrava mais largo.
    // rich-text não passa por esse node (segmentos em Group, sem padding).
    const pad = layer.type === 'text' ? 6 * (options.scaleFactor ?? 1) : 0
    if (pad) ctx.translate(pad, pad)
    const boxWidth = Math.max(0, width - pad * 2)
    const boxHeight = Math.max(0, height - pad * 2)

    // Contorno de texto: o editor stroka os glifos do Konva.Text quando
    // effects.stroke está ligado (com fallback para style.border) — até aqui a
    // arte publicada saía sem contorno nenhum.
    const strokeFx = layer.type === 'text' ? layer.effects?.stroke : undefined
    const scaleFactor = options.scaleFactor ?? 1
    let textStroke: { color: string; width: number } | undefined
    if (strokeFx?.enabled && (strokeFx.strokeWidth ?? 0) > 0) {
      textStroke = { color: strokeFx.strokeColor ?? '#000000', width: strokeFx.strokeWidth * scaleFactor }
    } else if (layer.type === 'text' && style.border?.width && style.border.width > 0) {
      textStroke = { color: style.border.color ?? '#000000', width: style.border.width * scaleFactor }
    }

    // Camada sem textboxConfig passa pelo mesmo caminho com quebra de linha:
    // o fallback antigo (fillText com maxWidth) espremia os glifos
    // horizontalmente em vez de quebrar, enquanto o editor Konva sempre quebra
    // (wrap="word") — 448 camadas publicavam texto deformado
    const config: TextboxConfig = layer.textboxConfig ?? { textMode: 'auto-wrap-fixed' }
    await this.renderTextWithConfig(ctx, resolvedStyle, config, content, boxWidth, boxHeight, textStroke)
  }

  /**
   * effects.blur em texto — réplica do cache do editor: o Konva cacheia o
   * node com pixelRatio 2 (client rect expandido por sombra/contorno), aplica
   * o stack blur nos pixels do buffer e desenha o bitmap de volta em 1x. O
   * raio NÃO é dividido pelo pixelRatio (o Konva também não divide), então o
   * borrão visual é raio/2 — replicado aqui com o mesmo buffer 2x.
   */
  private static async renderTextBlurred(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    resolvedStyle: LayerStyle,
    width: number,
    height: number,
    blurRadius: number,
    options: RenderOptions,
  ): Promise<boolean> {
    const scaleFactor = options.scaleFactor ?? 1

    // Client rect local como o Konva calcula para o cache: caixa expandida
    // pela sombra (offset + blur) e pelo contorno — o blur é cortado aí.
    const shadowFx = layer.effects?.shadow?.enabled ? layer.effects.shadow : undefined
    const sOffX = (shadowFx?.shadowOffsetX ?? 0) * scaleFactor
    const sOffY = (shadowFx?.shadowOffsetY ?? 0) * scaleFactor
    const sBlur = (shadowFx?.shadowBlur ?? 0) * scaleFactor
    const strokeFx = layer.effects?.stroke
    const strokeW = strokeFx?.enabled && (strokeFx.strokeWidth ?? 0) > 0
      ? strokeFx.strokeWidth * scaleFactor
      : (layer.style?.border?.width ?? 0) * scaleFactor

    const rectX = -(strokeW / 2 + sBlur) + Math.min(sOffX, 0)
    const rectY = -(strokeW / 2 + sBlur) + Math.min(sOffY, 0)
    const bx = Math.floor(rectX)
    const by = Math.floor(rectY)
    const extraX = Math.abs(Math.round(rectX) - bx) > 0.5 ? 1 : 0
    const extraY = Math.abs(Math.round(rectY) - by) > 0.5 ? 1 : 0
    const bw = Math.ceil(width + strokeW + Math.abs(sOffX) + sBlur * 2) + extraX
    const bh = Math.ceil(height + strokeW + Math.abs(sOffY) + sBlur * 2) + extraY
    if (bw <= 0 || bh <= 0) return false

    // pixelRatio 2 = o max(2, devicePixelRatio) do cache de texto do editor
    const pixelRatio = 2
    const off = this.getOffscreen(bw * pixelRatio, bh * pixelRatio, options)
    if (!off) return false

    const octx = off.ctx
    octx.scale(pixelRatio, pixelRatio)
    octx.translate(-bx, -by)
    // A sombra é desenhada DENTRO do cache (e borrada junto), como no editor
    this.applyShadow(octx, layer, scaleFactor)
    await this.drawTextContent(octx, layer, resolvedStyle, width, height, options)

    const imageData = octx.getImageData(0, 0, off.width, off.height)
    applyStackBlur(imageData.data, off.width, off.height, Math.round(blurRadius * scaleFactor))
    octx.putImageData(imageData, 0, 0)

    // A sombra já está no bitmap: blitar com a sombra do ctx ligada dobraria
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.drawImage(off.canvas as unknown as CanvasImageSource, bx, by, bw, bh)
    ctx.restore()
    return true
  }

  /**
   * effects.curved — réplica exata do editor (konva-editable-text.tsx):
   * cada caractere é um Konva.Text posicionado no arco com espaçamento
   * UNIFORME por índice (largura de glifo não entra na conta) e rotação
   * tangente. O blur é ignorado de propósito: no editor os caracteres não são
   * cacheados individualmente, então o filtro nunca chega a rodar; a sombra
   * por caractere equivale à sombra que o renderLayer já deixou no ctx.
   */
  private static renderCurvedText(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    resolvedStyle: LayerStyle,
    options: RenderOptions,
  ): void {
    const style = layer.style ?? {}
    const scaleFactor = options.scaleFactor ?? 1
    const content = this.applyTextTransform(layer.content ?? '', style)
    if (!content) return

    const curvature = layer.effects?.curved?.curvature || 0
    const chars = content.split('')
    const fontSize = Math.max(1, style.fontSize ?? 16)
    const width = layer.size?.width ?? 240

    const curvatureRadians = (curvature * Math.PI) / 180
    const radius = curvatureRadians !== 0
      ? width / (2 * Math.sin(Math.abs(curvatureRadians) / 2))
      : 1000
    const centerX = width / 2
    const centerY = curvature > 0 ? -radius : radius

    ctx.font = this.buildFontString(fontSize, resolvedStyle)
    ctx.fillStyle = style.color ?? '#000000'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    const strokeFx = layer.effects?.stroke
    const hasStroke = Boolean(strokeFx?.enabled && (strokeFx.strokeWidth ?? 0) > 0)
    if (hasStroke) {
      ctx.strokeStyle = strokeFx?.strokeColor ?? '#000000'
      ctx.lineWidth = (strokeFx?.strokeWidth ?? 0) * scaleFactor
      ctx.lineJoin = 'round'
    }

    for (let i = 0; i < chars.length; i++) {
      const charAngle = (curvatureRadians * (i - chars.length / 2)) / chars.length
      const x = centerX + radius * Math.sin(charAngle)
      const y = centerY + radius * (1 - Math.cos(charAngle))

      ctx.save()
      ctx.translate(x * scaleFactor, y * scaleFactor)
      ctx.rotate(charAngle)
      // Konva.Text de um caractere: baseline middle no meio do line-box
      // (lineHeight default 1 — o editor não passa lineHeight aos chars)
      ctx.fillText(chars[i], 0, fontSize / 2)
      if (hasStroke) ctx.strokeText(chars[i], 0, fontSize / 2)
      ctx.restore()
    }
  }

  /**
   * Camada rich-text — réplica do konva-multi-styled-text.tsx: a quebra de
   * linha usa o estilo BASE (o editor mede num Konva.Text temporário com
   * padding 6 e wrap word), cada segmento é medido com a própria fonte SEM
   * letterSpacing no ctx (o editor mede num canvas cru e soma
   * letterSpacing × length) e desenhado com estilo, sombra, contorno,
   * faux-bold e textDecoration POR SEGMENTO. Sem truncamento por altura: o
   * Group do editor não recorta os filhos, o texto transborda igual.
   */
  private static async renderRichText(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    options: RenderOptions,
  ): Promise<void> {
    const style = layer.style ?? {}
    const scaleFactor = options.scaleFactor ?? 1
    const content = this.applyTextTransform(layer.content ?? '', style)
    if (!content) return

    // fontChecker por família (base + cada segmento pode ter a sua)
    const familyCache = new Map<string, string>()
    const resolveFamily = async (family: string): Promise<string> => {
      const requested = family || 'Inter'
      const cached = familyCache.get(requested)
      if (cached) return cached
      let resolved = requested
      if (options.fontChecker) {
        try {
          const result = await options.fontChecker(requested)
          if (!result.isValid && result.fallbackFont) resolved = result.fallbackFont
        } catch {
          // ignore font checker failures
        }
      }
      familyCache.set(requested, resolved)
      return resolved
    }

    // 1. Segmentos — mesma normalização e preenchimento de lacunas do editor
    const baseSeg: RichTextStyle = {
      start: 0,
      end: 0,
      fontFamily: style.fontFamily ?? 'Inter',
      fontSize: style.fontSize ?? 16,
      fill: style.color ?? '#000000',
      fontStyle: (style.fontStyle ?? 'normal') as RichTextStyle['fontStyle'],
      textDecoration: 'none',
      letterSpacing: style.letterSpacing ?? 0,
    }
    const flat = flattenRichTextStyles(content.length, (layer.richTextStyles ?? []) as RichTextStyle[])
    const segments: RichTextStyle[] = []
    if (flat.length === 0) {
      segments.push({ ...baseSeg, start: 0, end: content.length })
    } else {
      let cursor = 0
      for (const rich of flat) {
        const start = Math.max(0, rich.start)
        const end = Math.min(content.length, rich.end)
        if (start > cursor) segments.push({ ...baseSeg, start: cursor, end: start })
        if (end > start) {
          segments.push({
            start,
            end,
            fontFamily: rich.fontFamily ?? baseSeg.fontFamily,
            fontSize: rich.fontSize ?? baseSeg.fontSize,
            fill: rich.fill ?? baseSeg.fill,
            fontStyle: rich.fontStyle ?? baseSeg.fontStyle,
            textDecoration: rich.textDecoration ?? baseSeg.textDecoration,
            letterSpacing: rich.letterSpacing ?? baseSeg.letterSpacing,
            stroke: rich.stroke,
            shadow: rich.shadow,
          })
        }
        cursor = Math.max(cursor, end)
      }
      if (cursor < content.length) segments.push({ ...baseSeg, start: cursor, end: content.length })
    }

    const families = new Set<string>([baseSeg.fontFamily ?? 'Inter'])
    for (const seg of segments) families.add(seg.fontFamily ?? 'Inter')
    for (const family of families) await resolveFamily(family)
    const familyOf = (seg: RichTextStyle) => familyCache.get(seg.fontFamily ?? 'Inter') ?? 'Inter'

    // 2. Quebra de linha com o estilo base (tempText do editor: SEM peso,
    // padding 6, wrap word, medindo com letterSpacing como o Konva)
    const padding = 6
    const layerWidth = layer.size?.width ?? 240
    const wrapWidth = Math.max(0, layerWidth - padding * 2)
    const baseFontSize = Math.max(1, style.fontSize ?? 16)
    const spacingCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    ctx.font = `${style.fontStyle ?? 'normal'} ${baseFontSize}px ${familyOf(baseSeg)}`
    spacingCtx.letterSpacing = `${style.letterSpacing ?? 0}px`
    const lines = this.breakTextIntoLines(ctx, content, wrapWidth, 'word', false)
    // Segmentos são medidos SEM letterSpacing no ctx — o editor mede num
    // canvas cru e soma letterSpacing × length por fora
    spacingCtx.letterSpacing = '0px'

    // 3. Layout: linhas → segmentos posicionados (índices no texto original)
    const lineHeightMultiplier = style.lineHeight ?? 1.2
    const align = style.textAlign ?? 'left'
    type PlacedSegment = { text: string; x: number; y: number; width: number; seg: RichTextStyle }
    const placed: PlacedSegment[] = []
    let searchCursor = 0
    let yOffset = padding

    for (const lineText of lines) {
      let lineStart = lineText.length > 0 ? content.indexOf(lineText, searchCursor) : searchCursor
      if (lineStart === -1) lineStart = searchCursor
      const lineEnd = lineStart + lineText.length

      const lineSegs: Array<{ text: string; width: number; seg: RichTextStyle }> = []
      for (const seg of segments) {
        if (seg.end <= lineStart || seg.start >= lineEnd) continue
        const intersectStart = Math.max(seg.start, lineStart)
        const intersectEnd = Math.min(seg.end, lineEnd)
        const text = content.substring(intersectStart, intersectEnd)
        if (!text.length) continue
        ctx.font = `${seg.fontStyle ?? 'normal'} ${seg.fontSize ?? 16}px ${familyOf(seg)}`
        const segWidth = ctx.measureText(text).width + (seg.letterSpacing ?? 0) * text.length
        lineSegs.push({ text, width: segWidth, seg })
      }

      const lineHeight = lineSegs.length > 0
        ? Math.max(...lineSegs.map((s) => s.seg.fontSize ?? 16))
        : lineHeightMultiplier * 16
      const lineWidth = lineSegs.reduce((sum, s) => sum + s.width, 0)

      let xOffset = padding
      if (align === 'center') xOffset += (wrapWidth - lineWidth) / 2
      else if (align === 'right') xOffset += wrapWidth - lineWidth

      for (const s of lineSegs) {
        placed.push({ text: s.text, x: xOffset, y: yOffset, width: s.width, seg: s.seg })
        xOffset += s.width
      }

      yOffset += lineHeight * lineHeightMultiplier
      searchCursor = lineEnd
    }

    // 4. Desenho por segmento
    for (const p of placed) {
      const seg = p.seg
      const fontSize = seg.fontSize ?? 16
      const fs = fontSize * scaleFactor
      const fill = seg.fill ?? '#000000'
      const x = p.x * scaleFactor
      // Konva.Text de linha única: baseline middle no meio do line-box
      // (lineHeight 1 — o editor não passa lineHeight aos segmentos)
      const yMid = p.y * scaleFactor + fs / 2

      ctx.save()
      ctx.font = `${seg.fontStyle ?? 'normal'} ${fs}px ${familyOf(seg)}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      spacingCtx.letterSpacing = `${(seg.letterSpacing ?? 0) * scaleFactor}px`

      // textDecoration ANTES do texto e SEM sombra, como o _sceneFunc do Konva
      // (underline a +round(fs/2) do meio, line-through no meio, traço fs/15)
      if (seg.textDecoration === 'underline' || seg.textDecoration === 'line-through') {
        const yLine = seg.textDecoration === 'underline'
          ? yMid + Math.round(fontSize / 2) * scaleFactor
          : yMid
        ctx.beginPath()
        ctx.moveTo(x, yLine)
        ctx.lineTo(x + Math.round(p.width) * scaleFactor, yLine)
        ctx.lineWidth = (fontSize / 15) * scaleFactor
        ctx.strokeStyle = fill
        ctx.stroke()
      }

      // Sombra POR SEGMENTO (o Group não tem sombra; applyShadow pula rich-text)
      if (seg.shadow) {
        ctx.shadowColor = seg.shadow.color ?? '#000000'
        ctx.shadowBlur = (seg.shadow.blur ?? 0) * scaleFactor
        ctx.shadowOffsetX = (seg.shadow.offset?.x ?? 0) * scaleFactor
        ctx.shadowOffsetY = (seg.shadow.offset?.y ?? 0) * scaleFactor
      }

      // Faux-bold do editor: bold sem contorno explícito ganha stroke da
      // própria cor (o canvas não sintetiza negrito de fonte de peso único);
      // fillAfterStrokeEnabled = stroke primeiro, fill por cima
      const isBold = seg.fontStyle?.includes('bold') ?? false
      const hasCustomStroke = Boolean(seg.stroke?.color && (seg.stroke?.width ?? 0) > 0)
      const strokeColor = hasCustomStroke ? seg.stroke?.color : isBold ? fill : undefined
      const strokeWidth = hasCustomStroke
        ? (seg.stroke?.width ?? 0) * scaleFactor
        : isBold
          ? Math.max(0.6, fontSize * 0.03) * scaleFactor
          : 0

      if (strokeColor && strokeWidth > 0) {
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = strokeWidth
        ctx.lineJoin = 'round'
        ctx.strokeText(p.text, x, yMid)
      }
      ctx.fillStyle = fill
      ctx.fillText(p.text, x, yMid)
      ctx.restore()
    }
  }

  /**
   * Espaçamento entre letras, presente em 752 camadas e até aqui ignorado
   * pelo render — o editor Konva aplica sempre.
   *
   * O `ctx.letterSpacing` do canvas conta um espaçamento após CADA caractere,
   * inclusive o último — a mesma contagem do Konva, que mede
   * `measureText + letterSpacing × length` e alinha center/right incluindo o
   * espaçamento final. Por isso setar o atributo cobre medição de quebra,
   * alinhamento e desenho de uma vez. Resta só o kerning: o Konva desenha
   * letra a letra e o descarta; o canvas desenha a linha inteira e o mantém —
   * diferença de ~1px por par kernado, invisível na arte.
   */
  private static applyLetterSpacing(
    ctx: CanvasRenderingContext2D,
    style: LayerStyle,
    scaleFactor: number,
  ): void {
    const spacing = (style.letterSpacing ?? 0) * scaleFactor
    if (!spacing) return
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`
  }

  /**
   * Altura natural de uma camada de texto com o texto quebrado — o mesmo
   * cálculo do desenho (`drawTextContent` → `renderAutoWrapFixed`): transform,
   * fonte, letterSpacing no ctx, padding 6 e quebra por palavra. É o medidor
   * do reflow das combinações empilhadas (combo-stack-reflow): a fonte do
   * projeto PRECISA estar registrada antes, senão a medida sai do fallback.
   *
   * Devolve null quando a camada não é medível: sem conteúdo, texto curvo,
   * rich-text (caixa própria) ou textMode de auto-resize (a fonte se adapta à
   * caixa — a caixa não deve se adaptar ao texto).
   */
  static measureTextLayerHeight(ctx: CanvasRenderingContext2D, layer: Layer): number | null {
    return this.measureTextLayerBox(ctx, layer)?.height ?? null
  }

  /**
   * Caixa natural completa de uma camada de texto: altura (o mesmo número de
   * measureTextLayerHeight), largura da linha mais larga e contagem de linhas.
   * É a base da validação geométrica pré-render (text-geometry): a largura
   * pega palavra indivisível que transborda — o desenho NÃO espreme com
   * maxWidth, transborda como no editor.
   *
   * inkTopSlack/inkBottomSlack: distância entre a borda da caixa-fórmula
   * (fontSize × lineHeight) e a TINTA real dos glifos da primeira/última
   * linha, medida por actualBoundingBox. Headline empilhado com caixas
   * propositalmente sobrepostas (padrão de design) só funciona porque essa
   * folga existe — a colisão precisa descontá-la, senão todo título de duas
   * linhas apertadas vira falso positivo (aconteceu com o modelo Domingo do
   * By Rock: "Seu almoço"/"de domingo" foram encolhidos sem precisar).
   */
  static measureTextLayerBox(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
  ): {
    height: number
    maxLineWidth: number
    lineCount: number
    inkTopSlack: number
    inkBottomSlack: number
  } | null {
    if (layer.type !== 'text') return null
    if (layer.effects?.curved?.enabled) return null

    const config: TextboxConfig = layer.textboxConfig ?? { textMode: 'auto-wrap-fixed' }
    const mode = config.textMode ?? 'auto-wrap-fixed'
    if (mode !== 'auto-wrap-fixed') return null

    const style = layer.style ?? {}
    const content = this.applyTextTransform(layer.content ?? '', style)
    if (!content.trim()) return null

    const fontSize = Math.max(1, style.fontSize ?? 16)
    const spacingCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string }

    ctx.save()
    spacingCtx.letterSpacing = '0px'
    ctx.font = this.buildFontString(fontSize, style)
    this.applyLetterSpacing(ctx, style, 1)

    const pad = 6
    const boxWidth = Math.max(0, (layer.size?.width ?? 240) - pad * 2)
    const lines = this.breakTextIntoLines(
      ctx,
      content,
      boxWidth,
      config.autoWrap?.breakMode ?? 'word',
      config.wordBreak ?? false,
    )
    // Largura medida com a MESMA fonte/letterSpacing da quebra — precisa
    // acontecer antes do restore.
    let maxLineWidth = 0
    for (const line of lines) {
      if (!line) continue
      const w = ctx.measureText(line).width
      if (w > maxLineWidth) maxLineWidth = w
    }

    // A entrelinha mora em dois campos; o desenho prefere autoWrap.lineHeight
    const lineHeightMult = config.autoWrap?.lineHeight ?? style.lineHeight ?? 1.2
    const lineBox = fontSize * lineHeightMult

    // Folga tinta ↔ caixa-fórmula nas bordas, com a MESMA matemática do
    // desenho: renderLines usa textBaseline 'middle' no CENTRO do line-box,
    // então a tinta da primeira linha começa em lineBox/2 − ascent(middle) e
    // a da última termina em lineBox/2 + descent(middle). Pode dar negativo
    // (lineHeight < 1): a tinta vaza da caixa-fórmula — informação real.
    // Sem métricas (canvas antigo, linha vazia), folga zero = conservador.
    const previousBaseline = ctx.textBaseline
    ctx.textBaseline = 'middle'
    const firstLine = lines.find((l) => l.length > 0)
    const lastLine = [...lines].reverse().find((l) => l.length > 0)
    let inkTopSlack = 0
    let inkBottomSlack = 0
    if (firstLine) {
      const m = ctx.measureText(firstLine)
      if (typeof m.actualBoundingBoxAscent === 'number') {
        inkTopSlack = lineBox / 2 - m.actualBoundingBoxAscent
      }
    }
    if (lastLine) {
      const m = ctx.measureText(lastLine)
      if (typeof m.actualBoundingBoxDescent === 'number') {
        inkBottomSlack = lineBox / 2 - m.actualBoundingBoxDescent
      }
    }
    ctx.textBaseline = previousBaseline

    ctx.restore()
    spacingCtx.letterSpacing = '0px'

    return {
      height: Math.round(Math.max(1, lines.length) * lineBox + pad * 2),
      maxLineWidth: Math.ceil(maxLineWidth),
      lineCount: Math.max(1, lines.length),
      inkTopSlack: Math.round(inkTopSlack * 10) / 10,
      inkBottomSlack: Math.round(inkBottomSlack * 10) / 10,
    }
  }

  private static async renderTextWithConfig(
    ctx: CanvasRenderingContext2D,
    style: LayerStyle,
    config: TextboxConfig,
    content: string,
    width: number,
    height: number,
    textStroke?: { color: string; width: number },
  ): Promise<void> {
    const layout = this.layoutTextLines(ctx, style, config, content, width, height)

    if (layout.mode === 'auto-resize-single') {
      // Linha única com a fonte que coube: desenhada no topo, sem contorno —
      // como sempre foi
      const x = this.getTextX(width, ctx.textAlign)
      ctx.fillText(content, x, 0)
      return
    }

    this.renderLines(
      ctx,
      layout.lines,
      width,
      layout.fontSize,
      layout.lineHeight,
      config.anchor,
      height,
      config.autoWrap?.autoExpand === true,
      textStroke,
    )
  }

  /**
   * Resolve fonte e linhas de um texto pelo `textMode` — a parte da conta que
   * o desenho e o fundo justo ao texto (`fit: 'texto'`) precisam COMPARTILHAR,
   * senão a mancha mede uma quebra e o texto sai com outra. Deixa `ctx.font`
   * na fonte final, como os renderers sempre deixaram.
   *
   * - auto-wrap-fixed: fonte do style, quebra na largura;
   * - auto-resize-multi: busca binária da maior fonte cujas linhas cabem na
   *   altura;
   * - auto-resize-single: busca binária da maior fonte em que a linha inteira
   *   cabe na largura (sem quebra; `lineHeight` 1 porque é desenhada no topo).
   */
  private static layoutTextLines(
    ctx: CanvasRenderingContext2D,
    style: LayerStyle,
    config: TextboxConfig,
    content: string,
    width: number,
    height: number,
  ): { mode: 'auto-wrap-fixed' | 'auto-resize-multi' | 'auto-resize-single'; fontSize: number; lines: string[]; lineHeight: number } {
    const mode = config.textMode ?? 'auto-wrap-fixed'
    const lineHeight = config.autoWrap?.lineHeight ?? style.lineHeight ?? 1.2
    const breakMode = config.autoWrap?.breakMode ?? 'word'
    const wordBreak = config.wordBreak ?? false

    if (mode === 'auto-resize-single') {
      const minFontSize = Math.max(1, style.fontSize ?? 12)
      const maxFontSize = Math.max(minFontSize, style.fontSize ?? 48)
      let low = minFontSize
      let high = maxFontSize
      let best = minFontSize
      while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        ctx.font = this.buildFontString(mid, style)
        if (ctx.measureText(content).width <= width) {
          best = mid
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      ctx.font = this.buildFontString(best, style)
      return { mode, fontSize: best, lines: [content], lineHeight: 1 }
    }

    if (mode === 'auto-resize-multi') {
      const minFontSize = Math.max(1, config.autoResize?.minFontSize ?? 12)
      const maxFontSize = Math.max(minFontSize, config.autoResize?.maxFontSize ?? style.fontSize ?? 48)
      let low = minFontSize
      let high = maxFontSize
      let bestFont = minFontSize
      let bestLines: string[] = []
      while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        ctx.font = this.buildFontString(mid, style)
        const lines = this.breakTextIntoLines(ctx, content, width, breakMode, wordBreak)
        const totalHeight = lines.length * mid * lineHeight
        if (totalHeight <= height) {
          bestFont = mid
          bestLines = lines
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      ctx.font = this.buildFontString(bestFont, style)
      return { mode, fontSize: bestFont, lines: bestLines, lineHeight }
    }

    const fontSize = Math.max(1, style.fontSize ?? 16)
    ctx.font = this.buildFontString(fontSize, style)
    const lines = this.breakTextIntoLines(ctx, content, width, breakMode, wordBreak)
    return { mode: 'auto-wrap-fixed', fontSize, lines, lineHeight }
  }

  /**
   * As linhas que o desenho de fato mostra. Paridade com o Konva.Text em
   * altura fixa: ele TRUNCA por linhas inteiras (para de acumular quando a
   * próxima não cabe); com autoExpand o editor cresce a caixa, então nada é
   * cortado. Compartilhada por renderLines e pelo fundo justo ao texto — o
   * halo tem de cobrir as linhas VISÍVEIS, não as que foram cortadas.
   */
  private static linhasDesenhadas(
    lines: string[],
    lineHeightPx: number,
    maxHeight: number | undefined,
    autoExpand: boolean,
  ): string[] {
    if (autoExpand || maxHeight === undefined || lineHeightPx <= 0) return lines
    const maxLines = Math.max(1, Math.floor((maxHeight + 0.001) / lineHeightPx))
    return lines.length > maxLines ? lines.slice(0, maxLines) : lines
  }

  /**
   * effects.background — o fundo (ou HALO) atrás do texto. Desenhado DENTRO do
   * transform da camada (acompanha rotação) e ANTES do texto; a sombra do
   * texto fica desligada aqui (senão contornaria a mancha) e a opacidade da
   * camada, já no ctx, é multiplicada pela do fundo — no editor o Rect irmão
   * faz a mesma conta.
   *
   * `fit: 'texto'` mede as linhas com a MESMA quebra do desenho
   * (layoutTextLines + linhasDesenhadas) e passa por `retanguloDasLinhas`, a
   * conta que o editor faz com o `textArr` do Konva. `blur` > 0 borra a
   * mancha nos próprios pixels (blurRoundedRect), nunca a foto atrás.
   */
  private static renderTextBackground(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    resolvedStyle: LayerStyle,
    width: number,
    height: number,
    options: RenderOptions,
  ): void {
    if (layer.type !== 'text') return
    const fundo = resolverFundo(layer.effects?.background)
    if (!fundo) return

    const scaleFactor = options.scaleFactor ?? 1
    const pad = PADDING_DE_DESENHO * scaleFactor

    let tinta: Rect | null = null
    if (fundo.fit === 'texto') {
      const style = layer.style ?? {}
      const content = this.applyTextTransform(layer.content ?? '', style)
      if (!content.trim()) return
      const config: TextboxConfig = layer.textboxConfig ?? { textMode: 'auto-wrap-fixed' }
      const spacingCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string }

      ctx.save()
      this.applyLetterSpacing(ctx, resolvedStyle, scaleFactor)
      const boxWidth = Math.max(0, width - pad * 2)
      const boxHeight = Math.max(0, height - pad * 2)
      const layout = this.layoutTextLines(ctx, resolvedStyle, config, content, boxWidth, boxHeight)
      const desenhadas =
        layout.mode === 'auto-resize-single'
          ? layout.lines
          : this.linhasDesenhadas(
              layout.lines,
              layout.fontSize * layout.lineHeight,
              boxHeight,
              config.autoWrap?.autoExpand === true,
            )
      // Largura medida com a MESMA fonte/letterSpacing da quebra — antes do
      // restore (o letterSpacing não é estado salvo em todo canvas)
      const linhas = desenhadas.map((line) => ({
        largura: line ? ctx.measureText(line).width : 0,
        ultimaDoParagrafo: true,
      }))
      ctx.restore()
      spacingCtx.letterSpacing = '0px'

      // ('justify' não existe no tipo nem no canvas: renderLines desenha à
      // esquerda, e retanguloDasLinhas trata qualquer outro valor como left)
      tinta = retanguloDasLinhas({
        linhas,
        caixa: { width, height },
        align: style.textAlign ?? 'left',
        anchor: config.anchor ?? 'top',
        fontSize: layout.fontSize,
        lineHeight: layout.lineHeight,
        padding: pad,
      })
    }

    const escalado: FundoResolvido = {
      ...fundo,
      paddingX: fundo.paddingX * scaleFactor,
      paddingY: fundo.paddingY * scaleFactor,
      borderRadius: fundo.borderRadius * scaleFactor,
      blur: fundo.blur * scaleFactor,
      offsetX: fundo.offsetX * scaleFactor,
      offsetY: fundo.offsetY * scaleFactor,
    }
    const rect = retanguloDoFundo(escalado, { width, height }, tinta)
    if (!rect || rect.width <= 0 || rect.height <= 0) return
    const cantos = raioDosCantos(escalado, rect)

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.globalAlpha = ctx.globalAlpha * fundo.opacity

    const blur = Math.round(escalado.blur)
    if (blur > 0 && this.blurRoundedRect(ctx, rect, fundo.color, cantos, blur, options)) {
      ctx.restore()
      return
    }
    ctx.fillStyle = fundo.color
    this.tracarRetanguloArredondado(ctx, rect.x, rect.y, rect.width, rect.height, cantos)
    ctx.fill()
    ctx.restore()
  }

  /**
   * Mancha borrada nos PRÓPRIOS pixels (`filter: blur()` no retângulo, nunca
   * `backdrop-filter`): o retângulo arredondado é desenhado num offscreen com
   * folga de 3× o raio, os pixels DELE são borrados e o bitmap volta ao ctx
   * com o globalAlpha corrente (a opacidade do fundo).
   *
   * Acima de 200 px o buffer é reduzido por `k` (escalaDoBlur): o stack blur
   * satura em 254, e a mancha é lisa por natureza, então a redução não custa
   * nada visual — e o custo fica limitado. O editor cacheia o Rect com
   * `pixelRatio: 1/k` pela mesma conta.
   */
  private static blurRoundedRect(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    color: string,
    cantos: number,
    blur: number,
    options?: RenderOptions,
  ): boolean {
    const { k, raioNoBuffer } = escalaDoBlur(blur)
    const pad = folgaDoBlur(blur)
    const bx = rect.x - pad
    const by = rect.y - pad
    const bw = rect.width + pad * 2
    const bh = rect.height + pad * 2
    if (bw <= 0 || bh <= 0) return false

    const off = this.getOffscreen(bw / k, bh / k, options)
    if (!off) return false

    const octx = off.ctx
    octx.scale(1 / k, 1 / k)
    octx.translate(-bx, -by)
    octx.fillStyle = color
    this.tracarRetanguloArredondado(octx, rect.x, rect.y, rect.width, rect.height, cantos)
    octx.fill()

    try {
      const imageData = octx.getImageData(0, 0, off.width, off.height)
      applyStackBlur(imageData.data, off.width, off.height, raioNoBuffer)
      octx.putImageData(imageData, 0, 0)
    } catch (error) {
      console.warn('[RenderEngine] Falha ao borrar o fundo do texto:', error)
      return false
    }

    // O offscreen foi arredondado para cima em pixels do buffer: blitar no
    // tamanho dele × k mantém o mapeamento 1:k exato
    ctx.drawImage(off.canvas as unknown as CanvasImageSource, bx, by, off.width * k, off.height * k)
    return true
  }

  /** Path de retângulo com cantos arredondados (o napi-rs não garante `roundRect`). */
  private static tracarRetanguloArredondado(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath()
    if (r <= 0) {
      ctx.rect(x, y, w, h)
      ctx.closePath()
      return
    }
    const raio = Math.min(r, w / 2, h / 2)
    ctx.moveTo(x + raio, y)
    ctx.lineTo(x + w - raio, y)
    ctx.arcTo(x + w, y, x + w, y + raio, raio)
    ctx.lineTo(x + w, y + h - raio)
    ctx.arcTo(x + w, y + h, x + w - raio, y + h, raio)
    ctx.lineTo(x + raio, y + h)
    ctx.arcTo(x, y + h, x, y + h - raio, raio)
    ctx.lineTo(x, y + raio)
    ctx.arcTo(x, y, x + raio, y, raio)
    ctx.closePath()
  }

  private static renderLines(
    ctx: CanvasRenderingContext2D,
    lines: string[],
    width: number,
    fontSize: number,
    lineHeightMultiplier: number,
    anchor: TextboxConfig['anchor'] = 'top',
    maxHeight?: number,
    autoExpand = false,
    textStroke?: { color: string; width: number },
  ): void {
    if (!lines.length) return

    const lineHeight = fontSize * lineHeightMultiplier

    // Paridade com o Konva.Text em altura fixa: ele TRUNCA por linhas inteiras
    // ANTES de alinhar (para de acumular quando a próxima linha não cabe) e o
    // alinhamento vertical usa só as linhas desenhadas.
    // Com autoExpand, o editor cresce a caixa na direção da âncora — aqui isso
    // vira desenhar além da altura gravada (startY pode ficar negativo: base
    // sobe, meio abre para os dois lados, topo desce).
    const drawLines = this.linhasDesenhadas(lines, lineHeight, maxHeight, autoExpand)

    const totalHeight = drawLines.length * lineHeight

    let startY = 0
    if (anchor === 'middle' && maxHeight !== undefined) {
      startY = (maxHeight - totalHeight) / 2
    } else if (anchor === 'bottom' && maxHeight !== undefined) {
      startY = maxHeight - totalHeight
    }

    const x = this.getTextX(width, ctx.textAlign)

    // O Konva desenha cada linha com baseline 'middle' no CENTRO do line-box
    // (meia-entrelinha acima da primeira linha). Com baseline 'top' no topo do
    // line-box, todo texto com lineHeight ≠ 1 subia (lineHeight-1)·fontSize/2.
    const previousBaseline = ctx.textBaseline
    ctx.textBaseline = 'middle'
    let currentY = startY + lineHeight / 2

    if (textStroke) {
      ctx.strokeStyle = textStroke.color
      ctx.lineWidth = textStroke.width
      // O Konva stroka glifo com junções arredondadas (evita espículas em
      // serifas/quinas com contorno grosso)
      ctx.lineJoin = 'round'
    }

    for (const line of drawLines) {
      // Sem o 4º argumento (maxWidth): ele COMPRIME os glifos quando a linha
      // passa da caixa. Palavra maior que a caixa transborda, como no editor
      ctx.fillText(line, x, currentY)
      // Konva: fill primeiro, stroke por cima
      if (textStroke) ctx.strokeText(line, x, currentY)
      currentY += lineHeight
    }

    ctx.textBaseline = previousBaseline
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
      this.drawImage(ctx, cache.get(source) as CanvasImageSource, width, height, layer.style, options)
      return
    }

    if (!options.imageLoader) return
    const image = await options.imageLoader(source)
    if (cache) cache.set(source, image)
    this.drawImage(ctx, image, width, height, layer.style, options)
  }

  private static getPath2D(d: string, options?: RenderOptions): Path2D | null {
    try {
      if (options?.createPath2D) return options.createPath2D(d)
      if (typeof Path2D !== 'undefined') return new Path2D(d)
    } catch (error) {
      console.warn('[RenderEngine] Path SVG inválido — ignorando:', error)
    }
    return null
  }

  /**
   * Canvas offscreen para filtros (imagem e blur de texto). Vem de
   * options.createCanvas (injetado pelo canvas-renderer no Node) ou de
   * document.createElement no browser; sem nenhum dos dois, devolve null e o
   * chamador segue sem filtro (comportamento antigo).
   */
  private static getOffscreen(
    width: number,
    height: number,
    options?: RenderOptions,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number } | null {
    const w = Math.max(1, Math.ceil(width))
    const h = Math.max(1, Math.ceil(height))
    try {
      let canvas: HTMLCanvasElement | null = null
      if (options?.createCanvas) {
        canvas = options.createCanvas(w, h)
      } else if (typeof document !== 'undefined') {
        canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
      }
      if (!canvas) return null
      const octx = canvas.getContext('2d') as CanvasRenderingContext2D | null
      if (!octx) return null
      return { canvas, ctx: octx, width: w, height: h }
    } catch (error) {
      console.warn('[RenderEngine] Canvas offscreen indisponível — filtro ignorado:', error)
      return null
    }
  }

  private static drawImage(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    width: number,
    height: number,
    style?: LayerStyle,
    options?: RenderOptions,
  ): void {
    const opacityBefore = ctx.globalAlpha

    if (style?.opacity !== undefined) {
      ctx.globalAlpha = Math.max(0, Math.min(1, style.opacity))
    }

    if (style?.filter && 'filter' in ctx) {
      ;(ctx as unknown as { filter: string }).filter = style.filter
    }

    // Ajustes/filtros de imagem: o conteúdo (crop/flip/radius/borda) é
    // desenhado num offscreen do tamanho da caixa — o cache do Konva no
    // editor —, a MESMA cadeia de pixels roda ali e o bitmap é blitado.
    const filtered = hasImageFilters(style)
      ? this.drawImageFiltered(ctx, image, width, height, style, options)
      : false

    if (!filtered) {
      ctx.save()
      this.applyImageMaskClip(ctx, style, width, height, options)
      this.drawImageContent(ctx, image, width, height, style, options)
      ctx.restore()

      if (style?.border?.width) {
        this.strokeImageBorder(ctx, width, height, style)
      }
    }

    ctx.globalAlpha = opacityBefore
    if ('filter' in ctx) {
      ;(ctx as unknown as { filter: string }).filter = 'none'
    }
  }

  /**
   * Caminho com filtros: offscreen → cadeia de pixels → blit. A borda entra
   * no bitmap ANTES dos filtros (no editor o stroke do node é cacheado e
   * filtrado junto); a máscara fica no ctx principal, aplicada DEPOIS — no
   * editor ela é clipFunc do Group externo, fora do cache do node.
   */
  private static drawImageFiltered(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    width: number,
    height: number,
    style: LayerStyle | undefined,
    options?: RenderOptions,
  ): boolean {
    const off = this.getOffscreen(width, height, options)
    if (!off) return false

    const octx = off.ctx
    octx.save()
    this.drawImageContent(octx, image, width, height, style, options)
    octx.restore()
    if (style?.border?.width) {
      this.strokeImageBorder(octx, width, height, style)
    }

    try {
      const imageData = octx.getImageData(0, 0, off.width, off.height)
      applyImageFilterChain(imageData.data, off.width, off.height, style ?? {}, options?.scaleFactor ?? 1)
      octx.putImageData(imageData, 0, 0)
    } catch (error) {
      // getImageData falha em canvas contaminado por imagem cross-origin (só
      // no browser); no server nunca acontece. Sem pixels, sem filtro.
      console.warn('[RenderEngine] Falha ao aplicar filtros de imagem:', error)
      return false
    }

    ctx.save()
    this.applyImageMaskClip(ctx, style, width, height, options)
    ctx.drawImage(off.canvas as unknown as CanvasImageSource, 0, 0)
    ctx.restore()
    return true
  }

  /**
   * Máscara de forma (mesma semântica do clipFunc do Group no editor):
   * path congelado em viewBox 0 0 100 100, escalado para a caixa da camada.
   * O clip acontece ANTES do flip — no editor a máscara vive no Group
   * externo e o espelhamento no KonvaImage interno.
   */
  private static applyImageMaskClip(
    ctx: CanvasRenderingContext2D,
    style: LayerStyle | undefined,
    width: number,
    height: number,
    options?: RenderOptions,
  ): void {
    if (!style?.mask?.path) return
    const maskPath = this.getPath2D(style.mask.path, options)
    if (!maskPath) return
    ctx.scale(width / 100, height / 100)
    ctx.clip(maskPath)
    ctx.scale(100 / width, 100 / height)
  }

  /** Conteúdo da imagem: radius clip + flip + crop — igual nos dois caminhos */
  private static drawImageContent(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    width: number,
    height: number,
    style?: LayerStyle,
    _options?: RenderOptions,
  ): void {
    // cornerRadius no editor RECORTA a imagem (KonvaImage.cornerRadius), com ou
    // sem borda — recortar aqui também, não só desenhar o traço arredondado.
    const radius = style?.border?.radius ?? 0
    if (radius > 0) {
      ctx.beginPath()
      this.traceRoundedRectPath(ctx, width, height, radius)
      ctx.clip()
    }

    // Flip espelha o conteúdo DENTRO da caixa (nunca via scale do node — o
    // transformEnd do editor reseta o scale e apagaria o espelhamento)
    if (style?.flipH || style?.flipV) {
      ctx.translate(style.flipH ? width : 0, style.flipV ? height : 0)
      ctx.scale(style.flipH ? -1 : 1, style.flipV ? -1 : 1)
    }

    const natural = {
      width: (image as { width?: number }).width ?? width,
      height: (image as { height?: number }).height ?? height,
    }
    // Mesma resolução de recorte do ImageNode do editor: crop manual > cover
    // (recorta a fonte, nada de transbordar a caixa) > esticar a imagem inteira.
    const src = resolveImageSourceRect(natural, { width, height }, style)
    if (src) {
      ctx.drawImage(image, src.cropX, src.cropY, src.cropWidth, src.cropHeight, 0, 0, width, height)
    } else {
      ctx.drawImage(image, 0, 0, width, height)
    }
  }

  private static strokeImageBorder(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    style: LayerStyle,
  ): void {
    ctx.lineWidth = style.border?.width ?? 1
    ctx.strokeStyle = style.border?.color ?? '#000000'
    if (style.border?.radius) {
      this.strokeRoundedRect(ctx, width, height, style.border.radius)
    } else {
      ctx.strokeRect(0, 0, width, height)
    }
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
      // Centro relativo (0..1) e escala do raio — mesmos defaults do editor Konva
      const centerX = width * (style.gradientCenterX ?? 0.5)
      const centerY = height * (style.gradientCenterY ?? 0.5)
      const radius = (Math.max(width, height) / 2) * (style.gradientRadiusScale ?? 1)
      gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
    } else if (
      typeof style.gradientStartX === 'number' &&
      typeof style.gradientStartY === 'number' &&
      typeof style.gradientEndX === 'number' &&
      typeof style.gradientEndY === 'number'
    ) {
      // Segmento customizado (área de aplicação), relativo à layer (0..1)
      // Must match Konva editor's resolveLinearGradientPoints
      gradient = ctx.createLinearGradient(
        width * style.gradientStartX,
        height * style.gradientStartY,
        width * style.gradientEndX,
        height * style.gradientEndY,
      )
    } else {
      // CSS-style gradient angle: 0° = bottom-to-top, 180° = top-to-bottom
      // Must match Konva editor's calculateGradientPoints formula
      const angleDeg = style.gradientAngle ?? 0
      const radians = ((180 - angleDeg) / 180) * Math.PI
      const length = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
      const halfX = (Math.sin(radians) * length) / 2
      const halfY = (Math.cos(radians) * length) / 2
      const x0 = width / 2 - halfX
      const y0 = height / 2 - halfY
      const x1 = width / 2 + halfX
      const y1 = height / 2 + halfY
      gradient = ctx.createLinearGradient(x0, y0, x1, y1)
    }

    for (const stop of stops) {
      const position = Math.max(0, Math.min(1, stop.position))
      // Apply opacity to color if present
      let color = stop.color
      if (stop.opacity !== undefined && stop.opacity < 1) {
        color = this.applyOpacityToColor(stop.color, stop.opacity)
      }
      gradient.addColorStop(position, color)
    }

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }

  private static renderShape(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    width: number,
    height: number,
    options?: RenderOptions,
  ): void {
    const style = layer.style ?? {}
    const shapeType = style.shapeType ?? 'rectangle'
    const fill = this.applyOpacityToColor(
      style.fill ?? '#2563eb',
      this.getShapeChannelOpacity(layer, 'fill'),
    )
    const stroke = style.strokeColor
      ? this.applyOpacityToColor(style.strokeColor, this.getShapeChannelOpacity(layer, 'stroke'))
      : style.border?.color
        ? this.applyOpacityToColor(style.border.color, this.getShapeChannelOpacity(layer, 'stroke'))
        : undefined
    const strokeWidth = style.strokeWidth ?? style.border?.width ?? 0
    const cornerRadius = style.border?.radius ?? 0

    // Blur da PRÓPRIA forma (o halo do canvas de design, `_halo.py`): a forma
    // é desenhada num offscreen com folga, os pixels DELA são borrados e o
    // bitmap volta ao ctx. É `filter: blur()` no retângulo — nunca
    // `backdrop-filter`: a foto por baixo fica intacta e nítida.
    const blurFx = layer.effects?.blur
    const blurRadius = blurFx?.enabled ? Math.round(blurFx.blurRadius ?? 0) : 0
    if (blurRadius > 0 && this.renderShapeBlurred(ctx, layer, width, height, blurRadius, options)) {
      return
    }

    // Forma vetorial genérica: path normalizado escalado para a caixa da
    // camada — espelha o <Path> dentro de Group do editor. Stroke compensado
    // pela escala média (editor usa strokeScaleEnabled=false).
    if (shapeType === 'svg-path') {
      if (!style.pathData) return
      const path = this.getPath2D(style.pathData, options)
      if (!path) return
      const [vx, vy, vw, vh] = style.pathViewBox ?? [0, 0, 100, 100]
      const scaleX = width / (vw || 1)
      const scaleY = height / (vh || 1)
      ctx.save()
      ctx.scale(scaleX, scaleY)
      ctx.translate(-vx, -vy)
      ctx.fillStyle = fill
      ctx.fill(path, style.pathFillRule ?? 'nonzero')
      if (stroke && strokeWidth > 0) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = strokeWidth / ((scaleX + scaleY) / 2 || 1)
        ctx.lineJoin = 'round'
        ctx.stroke(path)
      }
      ctx.restore()
      return
    }

    // Linha com estilo (sólida/tracejada/pontilhada) e pontas de seta —
    // mesma geometria do ShapeNode do editor (Konva.Arrow encurta o segmento
    // em pointerLength para o dash não vazar por baixo da ponta)
    if (shapeType === 'line') {
      const lineWidth = Math.max(1, style.strokeWidth ?? 4)
      const y = height / 2
      const pointer = Math.max(10, lineWidth * 3)
      const startArrow = style.lineStartCap === 'arrow'
      const endArrow = style.lineEndCap === 'arrow'

      ctx.strokeStyle = fill
      ctx.fillStyle = fill
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (style.lineStyle === 'dashed') {
        ctx.setLineDash([lineWidth * 2.5, lineWidth * 2])
      } else if (style.lineStyle === 'dotted') {
        ctx.setLineDash([0.1, lineWidth * 2])
      }

      ctx.beginPath()
      ctx.moveTo(startArrow ? pointer : 0, y)
      ctx.lineTo(endArrow ? width - pointer : width, y)
      ctx.stroke()
      ctx.setLineDash([])

      if (endArrow) {
        ctx.beginPath()
        ctx.moveTo(width, y)
        ctx.lineTo(width - pointer, y - pointer / 2)
        ctx.lineTo(width - pointer, y + pointer / 2)
        ctx.closePath()
        ctx.fill()
      }
      if (startArrow) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(pointer, y - pointer / 2)
        ctx.lineTo(pointer, y + pointer / 2)
        ctx.closePath()
        ctx.fill()
      }
      return
    }

    ctx.beginPath()

    // Circle/RegularPolygon/Star do Konva são desenhados CENTRADOS na posição
    // do node (layer.position é o centro, não o canto). O transform já levou a
    // origem até a posição — desenhar centrado em (0,0), como o editor.
    switch (shapeType) {
      case 'circle': {
        const radius = Math.min(width, height) / 2
        ctx.arc(0, 0, radius, 0, Math.PI * 2)
        break
      }
      case 'triangle': {
        // Konva.RegularPolygon(sides=3): vértices em (r·sin(2πn/3), -r·cos(2πn/3))
        const radius = Math.min(width, height) / 2
        for (let n = 0; n < 3; n++) {
          const px = radius * Math.sin((n * 2 * Math.PI) / 3)
          const py = -radius * Math.cos((n * 2 * Math.PI) / 3)
          if (n === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        break
      }
      case 'star': {
        // Konva.Star(numPoints=5): 10 vértices alternando outer/inner a partir do topo
        const outer = Math.min(width, height) / 2
        const inner = Math.min(width, height) / 4
        for (let n = 0; n < 10; n++) {
          const radius = n % 2 === 0 ? outer : inner
          const px = radius * Math.sin((n * Math.PI) / 5)
          const py = -radius * Math.cos((n * Math.PI) / 5)
          if (n === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        break
      }
      case 'arrow': {
        // Mesmo polígono fechado do editor (Line em espaço top-left)
        ctx.moveTo(0, height / 2)
        ctx.lineTo(width * 0.7, height / 2)
        ctx.lineTo(width * 0.7, height * 0.2)
        ctx.lineTo(width, height / 2)
        ctx.lineTo(width * 0.7, height * 0.8)
        ctx.lineTo(width * 0.7, height / 2)
        ctx.closePath()
        break
      }
      case 'rounded-rectangle': {
        this.traceRoundedRectPath(ctx, width, height, Math.min(cornerRadius || 24, Math.min(width, height) / 2))
        break
      }
      case 'rectangle':
      default: {
        if (cornerRadius > 0) {
          this.traceRoundedRectPath(ctx, width, height, cornerRadius)
        } else {
          ctx.rect(0, 0, width, height)
        }
        break
      }
    }

    ctx.fillStyle = fill
    ctx.fill()

    if (stroke && strokeWidth > 0) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = strokeWidth
      ctx.stroke()
    }
  }

  /**
   * effects.blur em shape — réplica do cache do editor (ShapeNode): o Konva
   * cacheia o node com `offset` de 3× o raio (senão o desfoque é cortado na
   * borda da caixa) e aplica o stack blur nos pixels do buffer. O shape é
   * cacheado em pixelRatio 1 (diferente do texto, que usa 2), então o raio
   * vale 1:1 — multiplicado só pelo `scaleFactor` do render.
   *
   * A folga de 3× o raio é o que deixa a mancha DESMANCHAR para fora do
   * retângulo — é a geometria do halo. Sombra desenhada dentro do offscreen
   * (e borrada junto), como no editor; no blit ela é desligada para não dobrar.
   */
  private static renderShapeBlurred(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    width: number,
    height: number,
    blurRadius: number,
    options?: RenderOptions,
  ): boolean {
    const scaleFactor = options?.scaleFactor ?? 1
    const raio = Math.max(1, Math.round(blurRadius * scaleFactor))
    const pad = raio * 3
    const shapeType = layer.style?.shapeType ?? 'rectangle'
    // Circle/RegularPolygon/Star são desenhados CENTRADOS em (0,0)
    const centrada = shapeType === 'circle' || shapeType === 'triangle' || shapeType === 'star'
    const bx = (centrada ? -width / 2 : 0) - pad
    const by = (centrada ? -height / 2 : 0) - pad
    const bw = Math.ceil(width + pad * 2)
    const bh = Math.ceil(height + pad * 2)
    if (bw <= 0 || bh <= 0) return false

    const off = this.getOffscreen(bw, bh, options)
    if (!off) return false

    const octx = off.ctx
    octx.translate(-bx, -by)
    this.applyShadow(octx, layer, scaleFactor)
    const semBlur: Layer = {
      ...layer,
      effects: { ...(layer.effects ?? {}), blur: { enabled: false, blurRadius: 0 } },
    }
    this.renderShape(octx, semBlur, width, height, options)

    try {
      const imageData = octx.getImageData(0, 0, off.width, off.height)
      applyStackBlur(imageData.data, off.width, off.height, raio)
      octx.putImageData(imageData, 0, 0)
    } catch (error) {
      console.warn('[RenderEngine] Falha ao borrar shape:', error)
      return false
    }

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.drawImage(off.canvas as unknown as CanvasImageSource, bx, by, bw, bh)
    ctx.restore()
    return true
  }

  /**
   * Camada `icon` (legado): o editor desenha o Konva.Path com as coordenadas
   * CRUAS do path (Konva.Path não escala por width/height) — espelhar isso.
   * Até aqui o case nem existia e o ícone simplesmente sumia da arte.
   */
  private static renderIcon(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    options?: RenderOptions,
  ): void {
    const style = layer.style ?? {}
    const data = style.iconId ? ICON_PATHS[style.iconId] : undefined
    if (!data) return
    const path = this.getPath2D(data, options)
    if (!path) return

    ctx.fillStyle = style.fill ?? '#111111'
    ctx.fill(path)
    if (style.strokeColor && (style.strokeWidth ?? 0) > 0) {
      ctx.strokeStyle = style.strokeColor
      ctx.lineWidth = style.strokeWidth ?? 0
      ctx.lineJoin = 'round'
      ctx.stroke(path)
    }
  }

  private static traceRoundedRectPath(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    radius: number,
  ): void {
    const r = Math.min(radius, width / 2, height / 2)
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
    const weight = this.cssFontWeight(style.fontWeight)
    const family = style.fontFamily ?? 'sans-serif'
    return `${fontStyle} ${weight} ${Math.max(1, Math.floor(size))}px ${family}`
  }

  /**
   * Peso numérico seguro para o parser de font do canvas.
   *
   * O napi-rs aceita múltiplos de 100 (e palavras-chave); um numérico fora
   * disso QUEBRA o parse da string INTEIRA — descoberto com o 250 que a
   * normalização de pesos (afe3d7e) gravou a partir do usWeightClass real do
   * Metrisch ExtraLight. Sintoma por plataforma: no macOS o texto sai
   * GIGANTE (~4x), no Linux da Vercel sai INVISÍVEL (a lambda não tem fonte
   * de sistema para o fallback). Arredondar ao múltiplo de 100 não muda nada
   * visualmente: a família é registrada com UMA face e o limiar do faux-bold
   * é ≥600 — 250→300 continua aquém dele.
   */
  private static cssFontWeight(weight: LayerStyle['fontWeight']): string | number {
    if (weight === undefined || weight === null) return 'normal'
    const n = typeof weight === 'string' ? Number(weight) : weight
    if (typeof n === 'number' && Number.isFinite(n)) {
      return Math.min(900, Math.max(100, Math.round(n / 100) * 100))
    }
    return typeof weight === 'string' ? weight : 'normal'
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
    } catch {
      return false
    }
  }
}

/**
 * Gera um thumbnail de um design
 * @param design - Design data para renderizar
 * @param fieldValues - Valores dos campos dinâmicos
 * @param options - Opções de thumbnail (width, height)
 * @returns Buffer PNG do thumbnail
 */
export async function generateThumbnail(
  design: DesignData,
  fieldValues: FieldValues = {},
  options: { width?: number; height?: number } = {},
): Promise<Buffer> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')

  const thumbnailWidth = options.width ?? 400
  const thumbnailHeight = options.height ?? 300

  // Calcular scale factor para manter aspect ratio
  const scaleX = thumbnailWidth / design.canvas.width
  const scaleY = thumbnailHeight / design.canvas.height
  const scaleFactor = Math.min(scaleX, scaleY)

  const finalWidth = Math.round(design.canvas.width * scaleFactor)
  const finalHeight = Math.round(design.canvas.height * scaleFactor)

  const canvas = createCanvas(finalWidth, finalHeight)
  const ctx = canvas.getContext('2d')

  // Image loader para thumbnails
  const imageLoader: ImageLoader = async (url: string) => {
    try {
      const img = await loadImage(url)
      return img as unknown as CanvasImageSource
    } catch (error) {
      console.error('Failed to load image for thumbnail:', url, error)
      // Retornar imagem placeholder vazia
      const placeholderCanvas = createCanvas(100, 100)
      const placeholderCtx = placeholderCanvas.getContext('2d')
      placeholderCtx.fillStyle = '#f5f5f5'
      placeholderCtx.fillRect(0, 0, 100, 100)
      return placeholderCanvas as unknown as CanvasImageSource
    }
  }

  await RenderEngine.renderDesign(ctx as unknown as CanvasRenderingContext2D, design, fieldValues, {
    scaleFactor,
    imageLoader,
    imageCache: new Map(),
    createCanvas: (w: number, h: number) => createCanvas(w, h) as unknown as HTMLCanvasElement,
  })

  return canvas.toBuffer('image/png')
}
