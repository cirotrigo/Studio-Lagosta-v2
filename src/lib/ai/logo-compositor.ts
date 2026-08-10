/**
 * Composição da logo REAL sobre a arte gerada.
 *
 * Regra canônica das skills que produzem as melhores artes: **a logo nunca é
 * desenhada pela IA** — modelo de imagem distorce logotipo. O prompt reserva
 * uma área limpa e o sistema cola o PNG oficial ali depois.
 *
 * O custo de ignorar isso foi medido em 09/08/2026: sem logo nas referências,
 * o gpt-image INVENTOU a logomarca do By Rock (palheta pequena + "BY ROCK" em
 * sans-serif, quando a real é uma palheta grande com "By Rock" manuscrito
 * dentro). Marca errada é pior que arte feia — o cliente não publica.
 *
 * Onde colar: o DNA da casa diz que "a logomarca varia de canto conforme o
 * espaço livre". Aqui isso vira medida: entre os cantos reservados, escolhe o
 * mais CALMO (menor desvio-padrão de luminância), que é o que o BRIEF do
 * Quintal descreveu como "a posição do logotipo depende de onde a foto é
 * calma".
 */

import sharp from 'sharp'

/** Cantos candidatos, na ordem de preferência quando houver empate. */
export type LogoCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

const CORNER_ORDER: LogoCorner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

/** Fração da largura da arte que a logo ocupa. Discreta, como manda a regra. */
const LOGO_WIDTH_RATIO = 0.22
/** Margem a partir da borda, também proporcional. */
const MARGIN_RATIO = 0.055

export interface LogoCompositionResult {
  buffer: Buffer
  corner: LogoCorner
  /** Desvio-padrão de luminância da região escolhida (menor = mais calma). */
  calmness: number
  /** true quando o canto reservado no prompt estava ocupado e a logo mudou de lugar. */
  moveu: boolean
}

/**
 * Vantagem dada ao canto que o prompt reservou: ele só perde para outro se o
 * outro for claramente mais calmo. Sem isso, ruído de textura da foto faria a
 * logo pular de canto entre peças da mesma leva.
 */
const RESERVED_BONUS = 0.8

function cornerBox(
  corner: LogoCorner,
  canvas: { width: number; height: number },
  box: { width: number; height: number },
  margin: number,
): { left: number; top: number } {
  const left = corner.endsWith('right') ? canvas.width - box.width - margin : margin
  const top = corner.startsWith('bottom') ? canvas.height - box.height - margin : margin
  return { left: Math.max(0, Math.round(left)), top: Math.max(0, Math.round(top)) }
}

/**
 * Compõe a logo na arte. Devolve a arte intacta (corner null via exceção
 * tratada pelo chamador) se algo falhar — arte sem logo é melhor que arte
 * quebrada, e o chamador registra o aviso.
 */
export async function comporLogo(
  arteBuffer: Buffer,
  logoBuffer: Buffer,
  { cornerReservado }: { cornerReservado?: LogoCorner } = {},
): Promise<LogoCompositionResult> {
  const arte = sharp(arteBuffer)
  const meta = await arte.metadata()
  const width = meta.width ?? 1080
  const height = meta.height ?? 1920

  const alvoLargura = Math.round(width * LOGO_WIDTH_RATIO)
  const margem = Math.round(width * MARGIN_RATIO)

  // Redimensiona preservando o alpha (converter PNG sem alpha vira retângulo
  // sólido — erro documentado no padrão de produção da casa).
  const logoRedim = await sharp(logoBuffer)
    .resize({ width: alvoLargura, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  const logoMeta = await sharp(logoRedim).metadata()
  const box = { width: logoMeta.width ?? alvoLargura, height: logoMeta.height ?? alvoLargura }

  /**
   * Mede a CALMA de cada canto — desvio-padrão da luminância na região onde a
   * logo entraria. Texto tem contraste alto e sobe muito o desvio, então a
   * medida faz a logo fugir do bloco de copy sozinha. É o que salva a peça
   * quando o modelo ignora a área reservada (aconteceu no primeiro teste: a
   * logo cobriu o "20h").
   */
  let melhor: {
    corner: LogoCorner
    calmness: number
    score: number
    pos: { left: number; top: number }
  } | null = null

  for (const corner of CORNER_ORDER) {
    const pos = cornerBox(corner, { width, height }, box, margem)
    const regiao = {
      left: Math.max(0, pos.left - 8),
      top: Math.max(0, pos.top - 8),
      width: Math.min(box.width + 16, width - Math.max(0, pos.left - 8)),
      height: Math.min(box.height + 16, height - Math.max(0, pos.top - 8)),
    }
    let calmness = Number.POSITIVE_INFINITY
    try {
      const stats = await sharp(arteBuffer).extract(regiao).greyscale().stats()
      calmness = stats.channels[0]?.stdev ?? Number.POSITIVE_INFINITY
    } catch {
      // região inválida (arte menor que o esperado) — canto descartado
    }
    const score = corner === cornerReservado ? calmness * RESERVED_BONUS : calmness
    if (!melhor || score < melhor.score) melhor = { corner, calmness, score, pos }
  }

  if (!melhor || !Number.isFinite(melhor.calmness)) {
    throw new Error('nenhum canto válido para compor a logo')
  }

  const buffer = await sharp(arteBuffer)
    .composite([{ input: logoRedim, left: melhor.pos.left, top: melhor.pos.top }])
    .jpeg({ quality: 92 })
    .toBuffer()

  return {
    buffer,
    corner: melhor.corner,
    calmness: melhor.calmness,
    moveu: !!cornerReservado && melhor.corner !== cornerReservado,
  }
}

/**
 * Instrução que o prompt precisa carregar quando a logo será composta depois.
 * Em inglês porque fala com o modelo de imagem, e explícita porque o modelo
 * tende a "assinar" a peça por conta própria.
 */
export function instrucaoAreaReservada(corner: LogoCorner = 'bottom-right'): string {
  const onde = {
    'bottom-right': 'lower-right corner',
    'bottom-left': 'lower-left corner',
    'top-right': 'upper-right corner',
    'top-left': 'upper-left corner',
  }[corner]
  return [
    '[LOGO — DO NOT DRAW]',
    `⛔ Do NOT draw, letter or reproduce any logo, wordmark, brand symbol, monogram or signature anywhere in the image. The real logo is composited by the system after generation.`,
    `Reserve the ${onde} for it: a clean, calm area of about 30% of the width and 18% of the height, with no text, no key subject and no busy detail.`,
    `Every line of copy must END before that reserved area — keep the whole text block clear of it, shortening the text lines or moving the block if needed. Text running under the reserved corner ruins the piece.`,
  ].join('\n')
}
