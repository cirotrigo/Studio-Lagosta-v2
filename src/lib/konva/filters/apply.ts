/**
 * Pixel loops dos filtros de imagem, compartilhados entre o editor e o render
 * server-side — a arte agendada passa pelos MESMOS loops que a tela.
 *
 * Isomórfico de propósito: este arquivo NÃO pode importar `konva` (quebra no
 * server) nem `@napi-rs/canvas` (quebra o bundle client). Os wrappers Konva
 * (HighlightsShadowsFilter/WhitesBlacksFilter/VignetteFilter) chamam estas
 * funções no editor; o `drawImage` do RenderEngine chama a mesma cadeia num
 * canvas offscreen no server.
 *
 * Brighten, Contrast, HSL, Blur (stack blur), Grayscale, Sepia e Invert são
 * cópias 1:1 da matemática do Konva core (MIT) — reimplementar "parecido"
 * divergiria do editor, que é exatamente o problema que isto fecha.
 */

/** Konva.Filters.Brighten — brightness em -1..1, soma direta nos canais */
export function applyBrighten(data: Uint8ClampedArray, brightness: number): void {
  const amount = brightness * 255
  const len = data.length
  for (let i = 0; i < len; i += 4) {
    data[i] += amount
    data[i + 1] += amount
    data[i + 2] += amount
  }
}

/** Konva.Filters.Contrast — contrast em -100..100, curva quadrática */
export function applyContrast(data: Uint8ClampedArray, contrast: number): void {
  const adjust = Math.pow((contrast + 100) / 100, 2)
  const nPixels = data.length
  let red = 150
  let green = 150
  let blue = 150
  for (let i = 0; i < nPixels; i += 4) {
    red = data[i]
    green = data[i + 1]
    blue = data[i + 2]
    red /= 255
    red -= 0.5
    red *= adjust
    red += 0.5
    red *= 255
    green /= 255
    green -= 0.5
    green *= adjust
    green += 0.5
    green *= 255
    blue /= 255
    blue -= 0.5
    blue *= adjust
    blue += 0.5
    blue *= 255
    red = red < 0 ? 0 : red > 255 ? 255 : red
    green = green < 0 ? 0 : green > 255 ? 255 : green
    blue = blue < 0 ? 0 : blue > 255 ? 255 : blue
    data[i] = red
    data[i + 1] = green
    data[i + 2] = blue
  }
}

/**
 * Konva.Filters.HSL com hue=0 e luminance=0 — o editor só expõe saturação
 * (ImageNode passa `saturation`, -2..2, escala 2^s)
 */
export function applyHSLSaturation(data: Uint8ClampedArray, saturation: number): void {
  const nPixels = data.length
  const v = 1
  const s = Math.pow(2, saturation)
  const h = 0
  const l = 0 * 127
  const vsu = v * s * Math.cos((h * Math.PI) / 180)
  const vsw = v * s * Math.sin((h * Math.PI) / 180)
  const rr = 0.299 * v + 0.701 * vsu + 0.167 * vsw
  const rg = 0.587 * v - 0.587 * vsu + 0.33 * vsw
  const rb = 0.114 * v - 0.114 * vsu - 0.497 * vsw
  const gr = 0.299 * v - 0.299 * vsu - 0.328 * vsw
  const gg = 0.587 * v + 0.413 * vsu + 0.035 * vsw
  const gb = 0.114 * v - 0.114 * vsu + 0.293 * vsw
  const br = 0.299 * v - 0.3 * vsu + 1.25 * vsw
  const bg = 0.587 * v - 0.586 * vsu - 1.05 * vsw
  const bb = 0.114 * v + 0.886 * vsu - 0.2 * vsw
  let r: number, g: number, b: number, a: number
  for (let i = 0; i < nPixels; i += 4) {
    r = data[i + 0]
    g = data[i + 1]
    b = data[i + 2]
    a = data[i + 3]
    data[i + 0] = rr * r + rg * g + rb * b + l
    data[i + 1] = gr * r + gg * g + gb * b + l
    data[i + 2] = br * r + bg * g + bb * b + l
    data[i + 3] = a
  }
}

/** Konva.Filters.Grayscale — pesos 0.34/0.5/0.16 (os do Konva, não os de luma) */
export function applyGrayscale(data: Uint8ClampedArray): void {
  const len = data.length
  for (let i = 0; i < len; i += 4) {
    const brightness = 0.34 * data[i] + 0.5 * data[i + 1] + 0.16 * data[i + 2]
    data[i] = brightness
    data[i + 1] = brightness
    data[i + 2] = brightness
  }
}

/** Konva.Filters.Sepia */
export function applySepia(data: Uint8ClampedArray): void {
  const nPixels = data.length
  for (let i = 0; i < nPixels; i += 4) {
    const r = data[i + 0]
    const g = data[i + 1]
    const b = data[i + 2]
    data[i + 0] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189)
    data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168)
    data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131)
  }
}

/** Konva.Filters.Invert */
export function applyInvert(data: Uint8ClampedArray): void {
  const len = data.length
  for (let i = 0; i < len; i += 4) {
    data[i] = 255 - data[i]
    data[i + 1] = 255 - data[i + 1]
    data[i + 2] = 255 - data[i + 2]
  }
}

/**
 * Highlights/Shadows: ajusta tons claros e escuros separadamente pela
 * luminância (corpo movido do wrapper Konva — mesma matemática de sempre)
 */
export function applyHighlightsShadows(
  data: Uint8ClampedArray,
  highlights: number,
  shadows: number,
): void {
  const highlightsAmount = highlights / 100
  const shadowsAmount = shadows / 100

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    const normalizedLuminance = luminance / 255

    if (normalizedLuminance > 0.5 && highlights !== 0) {
      const weight = (normalizedLuminance - 0.5) * 2
      const adjustment = highlightsAmount * weight * 50

      data[i] = Math.max(0, Math.min(255, r + adjustment))
      data[i + 1] = Math.max(0, Math.min(255, g + adjustment))
      data[i + 2] = Math.max(0, Math.min(255, b + adjustment))
    }

    if (normalizedLuminance < 0.5 && shadows !== 0) {
      const weight = (0.5 - normalizedLuminance) * 2
      const adjustment = shadowsAmount * weight * 50

      data[i] = Math.max(0, Math.min(255, r + adjustment))
      data[i + 1] = Math.max(0, Math.min(255, g + adjustment))
      data[i + 2] = Math.max(0, Math.min(255, b + adjustment))
    }
  }
}

/**
 * Whites/Blacks: pontos de branco e preto com peso exponencial nos extremos
 * (corpo movido do wrapper Konva)
 */
export function applyWhitesBlacks(
  data: Uint8ClampedArray,
  whites: number,
  blacks: number,
): void {
  const whitesAmount = whites / 100
  const blacksAmount = blacks / 100

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    const normalizedLuminance = luminance / 255

    if (normalizedLuminance > 0.7 && whites !== 0) {
      const weight = Math.pow((normalizedLuminance - 0.7) / 0.3, 2)
      const adjustment = whitesAmount * weight * 60

      data[i] = Math.max(0, Math.min(255, r + adjustment))
      data[i + 1] = Math.max(0, Math.min(255, g + adjustment))
      data[i + 2] = Math.max(0, Math.min(255, b + adjustment))
    }

    if (normalizedLuminance < 0.3 && blacks !== 0) {
      const weight = Math.pow((0.3 - normalizedLuminance) / 0.3, 2)
      const adjustment = blacksAmount * weight * 60

      data[i] = Math.max(0, Math.min(255, r + adjustment))
      data[i + 1] = Math.max(0, Math.min(255, g + adjustment))
      data[i + 2] = Math.max(0, Math.min(255, b + adjustment))
    }
  }
}

/**
 * Vinheta: escurece as bordas a partir de 50% do raio, curva t^1.5
 * (corpo movido do wrapper Konva)
 */
export function applyVignette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  vignette: number,
): void {
  if (vignette === 0) return

  const centerX = width / 2
  const centerY = height / 2
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY)
  const vignetteIntensity = vignette * 1.2
  const vignetteSize = 0.5

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4

      const dx = x - centerX
      const dy = y - centerY
      const distance = Math.sqrt(dx * dx + dy * dy)
      const normalizedDistance = distance / maxDistance

      let vignetteFactor = 1
      if (normalizedDistance > vignetteSize) {
        const t = (normalizedDistance - vignetteSize) / (1 - vignetteSize)
        vignetteFactor = 1 - vignetteIntensity * Math.pow(t, 1.5)
      }

      data[index] = Math.max(0, Math.round(data[index] * vignetteFactor))
      data[index + 1] = Math.max(0, Math.round(data[index + 1] * vignetteFactor))
      data[index + 2] = Math.max(0, Math.round(data[index + 2] * vignetteFactor))
    }
  }
}

// ---------------------------------------------------------------------------
// Stack blur (Konva.Filters.Blur / filterGaussBlurRGBA, de Mario Klingemann)
// ---------------------------------------------------------------------------

class BlurStack {
  r = 0
  g = 0
  b = 0
  a = 0
  next: BlurStack | null = null
}

const mul_table = [
  512, 512, 456, 512, 328, 456, 335, 512, 405, 328, 271, 456, 388, 335, 292,
  512, 454, 405, 364, 328, 298, 271, 496, 456, 420, 388, 360, 335, 312, 292,
  273, 512, 482, 454, 428, 405, 383, 364, 345, 328, 312, 298, 284, 271, 259,
  496, 475, 456, 437, 420, 404, 388, 374, 360, 347, 335, 323, 312, 302, 292,
  282, 273, 265, 512, 497, 482, 468, 454, 441, 428, 417, 405, 394, 383, 373,
  364, 354, 345, 337, 328, 320, 312, 305, 298, 291, 284, 278, 271, 265, 259,
  507, 496, 485, 475, 465, 456, 446, 437, 428, 420, 412, 404, 396, 388, 381,
  374, 367, 360, 354, 347, 341, 335, 329, 323, 318, 312, 307, 302, 297, 292,
  287, 282, 278, 273, 269, 265, 261, 512, 505, 497, 489, 482, 475, 468, 461,
  454, 447, 441, 435, 428, 422, 417, 411, 405, 399, 394, 389, 383, 378, 373,
  368, 364, 359, 354, 350, 345, 341, 337, 332, 328, 324, 320, 316, 312, 309,
  305, 301, 298, 294, 291, 287, 284, 281, 278, 274, 271, 268, 265, 262, 259,
  257, 507, 501, 496, 491, 485, 480, 475, 470, 465, 460, 456, 451, 446, 442,
  437, 433, 428, 424, 420, 416, 412, 408, 404, 400, 396, 392, 388, 385, 381,
  377, 374, 370, 367, 363, 360, 357, 354, 350, 347, 344, 341, 338, 335, 332,
  329, 326, 323, 320, 318, 315, 312, 310, 307, 304, 302, 299, 297, 294, 292,
  289, 287, 285, 282, 280, 278, 275, 273, 271, 269, 267, 265, 263, 261, 259,
]

const shg_table = [
  9, 11, 12, 13, 13, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16, 17, 17, 17, 17, 17,
  17, 17, 18, 18, 18, 18, 18, 18, 18, 18, 18, 19, 19, 19, 19, 19, 19, 19, 19,
  19, 19, 19, 19, 19, 19, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20,
  20, 20, 20, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21,
  21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 22, 22, 22, 22, 22, 22,
  22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22,
  22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24,
]

/**
 * Stack blur RGBA do Konva core. `radius` em pixels INTEIROS do buffer (o
 * Konva faz `Math.round(blurRadius)` antes de chamar); 0 é no-op.
 */
export function applyStackBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  radius = Math.round(radius)
  if (radius <= 0) return
  // mul/shg têm 255 entradas — acima disso o Konva quebraria com NaN; aqui
  // saturamos no máximo representável
  if (radius > 254) radius = 254

  const pixels = data
  let p: number,
    yi: number,
    yw: number,
    r_sum: number,
    g_sum: number,
    b_sum: number,
    a_sum: number,
    r_out_sum: number,
    g_out_sum: number,
    b_out_sum: number,
    a_out_sum: number,
    r_in_sum: number,
    g_in_sum: number,
    b_in_sum: number,
    a_in_sum: number,
    pr: number,
    pg: number,
    pb: number,
    pa: number,
    rbs: number
  const div = radius + radius + 1,
    widthMinus1 = width - 1,
    heightMinus1 = height - 1,
    radiusPlus1 = radius + 1,
    sumFactor = (radiusPlus1 * (radiusPlus1 + 1)) / 2,
    stackStart = new BlurStack(),
    mul_sum = mul_table[radius],
    shg_sum = shg_table[radius]
  let stackEnd: BlurStack | null = null,
    stack = stackStart,
    stackIn: BlurStack | null = null,
    stackOut: BlurStack | null = null
  for (let i = 1; i < div; i++) {
    stack = stack.next = new BlurStack()
    if (i === radiusPlus1) {
      stackEnd = stack
    }
  }
  stack.next = stackStart
  yw = yi = 0
  for (let y = 0; y < height; y++) {
    r_in_sum = g_in_sum = b_in_sum = a_in_sum = r_sum = g_sum = b_sum = a_sum = 0
    r_out_sum = radiusPlus1 * (pr = pixels[yi])
    g_out_sum = radiusPlus1 * (pg = pixels[yi + 1])
    b_out_sum = radiusPlus1 * (pb = pixels[yi + 2])
    a_out_sum = radiusPlus1 * (pa = pixels[yi + 3])
    r_sum += sumFactor * pr
    g_sum += sumFactor * pg
    b_sum += sumFactor * pb
    a_sum += sumFactor * pa
    stack = stackStart
    for (let i = 0; i < radiusPlus1; i++) {
      stack.r = pr
      stack.g = pg
      stack.b = pb
      stack.a = pa
      stack = stack.next!
    }
    for (let i = 1; i < radiusPlus1; i++) {
      p = yi + ((widthMinus1 < i ? widthMinus1 : i) << 2)
      r_sum += (stack.r = pr = pixels[p]) * (rbs = radiusPlus1 - i)
      g_sum += (stack.g = pg = pixels[p + 1]) * rbs
      b_sum += (stack.b = pb = pixels[p + 2]) * rbs
      a_sum += (stack.a = pa = pixels[p + 3]) * rbs
      r_in_sum += pr
      g_in_sum += pg
      b_in_sum += pb
      a_in_sum += pa
      stack = stack.next!
    }
    stackIn = stackStart
    stackOut = stackEnd
    for (let x = 0; x < width; x++) {
      pixels[yi + 3] = pa = (a_sum * mul_sum) >> shg_sum
      if (pa !== 0) {
        pa = 255 / pa
        pixels[yi] = ((r_sum * mul_sum) >> shg_sum) * pa
        pixels[yi + 1] = ((g_sum * mul_sum) >> shg_sum) * pa
        pixels[yi + 2] = ((b_sum * mul_sum) >> shg_sum) * pa
      } else {
        pixels[yi] = pixels[yi + 1] = pixels[yi + 2] = 0
      }
      r_sum -= r_out_sum
      g_sum -= g_out_sum
      b_sum -= b_out_sum
      a_sum -= a_out_sum
      r_out_sum -= stackIn!.r
      g_out_sum -= stackIn!.g
      b_out_sum -= stackIn!.b
      a_out_sum -= stackIn!.a
      p = (yw + ((p = x + radius + 1) < widthMinus1 ? p : widthMinus1)) << 2
      r_in_sum += stackIn!.r = pixels[p]
      g_in_sum += stackIn!.g = pixels[p + 1]
      b_in_sum += stackIn!.b = pixels[p + 2]
      a_in_sum += stackIn!.a = pixels[p + 3]
      r_sum += r_in_sum
      g_sum += g_in_sum
      b_sum += b_in_sum
      a_sum += a_in_sum
      stackIn = stackIn!.next
      r_out_sum += pr = stackOut!.r
      g_out_sum += pg = stackOut!.g
      b_out_sum += pb = stackOut!.b
      a_out_sum += pa = stackOut!.a
      r_in_sum -= pr
      g_in_sum -= pg
      b_in_sum -= pb
      a_in_sum -= pa
      stackOut = stackOut!.next
      yi += 4
    }
    yw += width
  }
  for (let x = 0; x < width; x++) {
    g_in_sum = b_in_sum = a_in_sum = r_in_sum = g_sum = b_sum = a_sum = r_sum = 0
    yi = x << 2
    r_out_sum = radiusPlus1 * (pr = pixels[yi])
    g_out_sum = radiusPlus1 * (pg = pixels[yi + 1])
    b_out_sum = radiusPlus1 * (pb = pixels[yi + 2])
    a_out_sum = radiusPlus1 * (pa = pixels[yi + 3])
    r_sum += sumFactor * pr
    g_sum += sumFactor * pg
    b_sum += sumFactor * pb
    a_sum += sumFactor * pa
    stack = stackStart
    for (let i = 0; i < radiusPlus1; i++) {
      stack.r = pr
      stack.g = pg
      stack.b = pb
      stack.a = pa
      stack = stack.next!
    }
    let yp = width
    for (let i = 1; i <= radius; i++) {
      yi = (yp + x) << 2
      r_sum += (stack.r = pr = pixels[yi]) * (rbs = radiusPlus1 - i)
      g_sum += (stack.g = pg = pixels[yi + 1]) * rbs
      b_sum += (stack.b = pb = pixels[yi + 2]) * rbs
      a_sum += (stack.a = pa = pixels[yi + 3]) * rbs
      r_in_sum += pr
      g_in_sum += pg
      b_in_sum += pb
      a_in_sum += pa
      stack = stack.next!
      if (i < heightMinus1) {
        yp += width
      }
    }
    yi = x
    stackIn = stackStart
    stackOut = stackEnd
    for (let y = 0; y < height; y++) {
      p = yi << 2
      pixels[p + 3] = pa = (a_sum * mul_sum) >> shg_sum
      if (pa > 0) {
        pa = 255 / pa
        pixels[p] = ((r_sum * mul_sum) >> shg_sum) * pa
        pixels[p + 1] = ((g_sum * mul_sum) >> shg_sum) * pa
        pixels[p + 2] = ((b_sum * mul_sum) >> shg_sum) * pa
      } else {
        pixels[p] = pixels[p + 1] = pixels[p + 2] = 0
      }
      r_sum -= r_out_sum
      g_sum -= g_out_sum
      b_sum -= b_out_sum
      a_sum -= a_out_sum
      r_out_sum -= stackIn!.r
      g_out_sum -= stackIn!.g
      b_out_sum -= stackIn!.b
      a_out_sum -= stackIn!.a
      p = (x + ((p = y + radiusPlus1) < heightMinus1 ? p : heightMinus1) * width) << 2
      r_sum += r_in_sum += stackIn!.r = pixels[p]
      g_sum += g_in_sum += stackIn!.g = pixels[p + 1]
      b_sum += b_in_sum += stackIn!.b = pixels[p + 2]
      a_sum += a_in_sum += stackIn!.a = pixels[p + 3]
      stackIn = stackIn!.next
      r_out_sum += pr = stackOut!.r
      g_out_sum += pg = stackOut!.g
      b_out_sum += pb = stackOut!.b
      a_out_sum += pa = stackOut!.a
      r_in_sum -= pr
      g_in_sum -= pg
      b_in_sum -= pb
      a_in_sum -= pa
      stackOut = stackOut!.next
      yi += width
    }
  }
}

// ---------------------------------------------------------------------------
// Cadeia completa — a MESMA ordem e as MESMAS condições do useMemo do
// ImageNode (konva-layer-factory.tsx). Mudou lá, muda aqui.
// ---------------------------------------------------------------------------

/** Subconjunto do LayerStyle que participa dos filtros de imagem */
export interface ImageFilterStyle {
  exposure?: number
  brightness?: number
  contrast?: number
  highlights?: number
  shadows?: number
  whites?: number
  blacks?: number
  saturation?: number
  blur?: number
  vignette?: number
  grayscale?: boolean
  sepia?: boolean
  invert?: boolean
}

/** True quando algum filtro mudaria pixels (Brighten/Contrast em 0 são no-op) */
export function hasImageFilters(style?: ImageFilterStyle | null): boolean {
  if (!style) return false
  return (
    (style.exposure ?? style.brightness ?? 0) !== 0 ||
    (style.contrast ?? 0) !== 0 ||
    (style.highlights ?? 0) !== 0 ||
    (style.shadows ?? 0) !== 0 ||
    (style.whites ?? 0) !== 0 ||
    (style.blacks ?? 0) !== 0 ||
    (style.saturation ?? 0) !== 0 ||
    Math.round(style.blur ?? 0) > 0 ||
    (style.vignette ?? 0) > 0 ||
    Boolean(style.grayscale) ||
    Boolean(style.sepia) ||
    Boolean(style.invert)
  )
}

/**
 * Aplica a cadeia inteira sobre o buffer RGBA.
 *
 * `blurScale` escala só o raio do blur (thumbnail com scaleFactor < 1); os
 * demais filtros são por pixel ou relativos ao tamanho e não dependem de
 * escala. No render 1:1 dos stories fica 1.
 */
export function applyImageFilterChain(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  style: ImageFilterStyle,
  blurScale = 1,
): void {
  // 1. Exposure/Brightness
  if (style.exposure !== undefined || style.brightness !== undefined) {
    applyBrighten(data, style.exposure ?? style.brightness ?? 0)
  }

  // 2. Contrast
  if (style.contrast !== undefined) {
    applyContrast(data, style.contrast ?? 0)
  }

  // 3. Highlights e Shadows
  if (
    (style.highlights !== undefined && style.highlights !== 0) ||
    (style.shadows !== undefined && style.shadows !== 0)
  ) {
    applyHighlightsShadows(data, style.highlights ?? 0, style.shadows ?? 0)
  }

  // 4. Whites e Blacks
  if (
    (style.whites !== undefined && style.whites !== 0) ||
    (style.blacks !== undefined && style.blacks !== 0)
  ) {
    applyWhitesBlacks(data, style.whites ?? 0, style.blacks ?? 0)
  }

  // 5. Saturação
  if (style.saturation !== undefined && style.saturation !== 0) {
    applyHSLSaturation(data, style.saturation)
  }

  // 6. Blur
  if (style.blur) {
    applyStackBlur(data, width, height, Math.round(style.blur * blurScale))
  }

  // 7. Vinheta (por último, como no editor)
  if (style.vignette !== undefined && style.vignette > 0) {
    applyVignette(data, width, height, style.vignette)
  }

  // Legados
  if (style.grayscale) applyGrayscale(data)
  if (style.sepia) applySepia(data)
  if (style.invert) applyInvert(data)
}
