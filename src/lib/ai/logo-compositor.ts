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
 *
 * Calma não basta, e isso custou uma medição em 10/08/2026. O canto mais calmo
 * de uma foto costuma ser uma parede lisa ou uma toalha — que é justamente o
 * mais CLARO. E depois que as logos dos projetos foram alinhadas com as do
 * insta-automatico, metade delas virou branco puro (Quintal, TERO e Bacana com
 * luminância média 255, 255 e 252). Logo branca no canto mais calmo de uma foto
 * clara é logo invisível: a peça sai "sem marca" sem que nada falhe.
 *
 * Por isso o score tem duas partes: calma E contraste entre a luminância média
 * da logo e a do canto. Um canto que engole a logo é descartado antes de
 * competir por calma.
 */

import sharp from 'sharp'

/** Cantos candidatos, na ordem de preferência quando houver empate. */
export type LogoCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

const CORNER_ORDER: LogoCorner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

/** Fração da largura da arte que a logo ocupa. Discreta, como manda a regra. */
// 0.22 → 0.15 em 10/08/2026, a pedido do Ciro olhando a leva real do Espeto:
// "estou achando ela um pouco grande". Vale para os DOIS modos — o valor do
// prompt (instrucaoLogoPeloModelo) acompanha, senão compor e modelo divergem.
const LOGO_WIDTH_RATIO = 0.15
/** Margem a partir da borda, também proporcional. */
const MARGIN_RATIO = 0.055

export interface LogoCompositionResult {
  buffer: Buffer
  corner: LogoCorner
  /** Desvio-padrão de luminância da região escolhida (menor = mais calma). */
  calmness: number
  /**
   * Distância de luminância entre a logo e o canto escolhido (0–255). null
   * quando não deu para medir a logo. Vai para o `fieldValues`: logo sumida na
   * arte se explica por este número.
   */
  contraste: number | null
  /** true quando o canto reservado no prompt estava ocupado e a logo mudou de lugar. */
  moveu: boolean
}

/**
 * Vantagem dada ao canto que o prompt reservou: ele só perde para outro se o
 * outro for claramente mais calmo. Sem isso, ruído de textura da foto faria a
 * logo pular de canto entre peças da mesma leva.
 */
const RESERVED_BONUS = 0.8

/**
 * Contraste mínimo (0–255) entre a luminância média da logo e a do canto para
 * o canto ser considerado legível.
 *
 * 45 é a distância abaixo da qual uma logo branca sobre parede clara deixa de
 * se destacar a olho nu na miniatura do feed. Não é WCAG — logo não é texto de
 * corpo, e exigir contraste de leitura descartaria canto bom.
 */
const CONTRASTE_MINIMO = 45

/**
 * Peso do contraste no score. A calma continua mandando (é ela que faz a logo
 * fugir do bloco de copy); o contraste desempata e afunda canto que engole a
 * marca.
 */
const PESO_CONTRASTE = 0.6

/** Luminância média dos pixels VISÍVEIS — pixel transparente não é a logo. */
async function luminanciaDaLogo(logoPng: Buffer): Promise<number | null> {
  try {
    const { data, info } = await sharp(logoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let soma = 0
    let n = 0
    for (let p = 0; p < data.length; p += info.channels) {
      if (data[p + 3] < 128) continue
      soma += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
      n++
    }
    return n > 0 ? soma / n : null
  } catch {
    // Sem a medida, o comportamento volta a ser o antigo (só calma) — que é
    // pior, mas não quebra nada.
    return null
  }
}

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
  const lumLogo = await luminanciaDaLogo(logoRedim)

  type Candidato = {
    corner: LogoCorner
    calmness: number
    contraste: number
    score: number
    pos: { left: number; top: number }
  }
  const candidatos: Candidato[] = []

  for (const corner of CORNER_ORDER) {
    const pos = cornerBox(corner, { width, height }, box, margem)
    const regiao = {
      left: Math.max(0, pos.left - 8),
      top: Math.max(0, pos.top - 8),
      width: Math.min(box.width + 16, width - Math.max(0, pos.left - 8)),
      height: Math.min(box.height + 16, height - Math.max(0, pos.top - 8)),
    }
    let calmness = Number.POSITIVE_INFINITY
    let contraste = Number.POSITIVE_INFINITY
    try {
      // ⚠️ O `.toBuffer()` no meio NÃO é desperdício: `stats()` do sharp
      // IGNORA o `extract()` do mesmo pipeline e devolve as estatísticas da
      // imagem INTEIRA. Medido em 10/08/2026 numa arte metade escura e metade
      // clara: recortar o topo e recortar a base davam o mesmo `mean 134,
      // stdev 108` (o do quadro todo), enquanto o recorte materializado dava
      // `mean 26, stdev 0`.
      //
      // Enquanto essa linha rodava encadeada, os quatro cantos mediam IGUAL —
      // a escolha por calma era um empate perpétuo decidido só pelo
      // RESERVED_BONUS, ou seja, a logo ia sempre para o canto reservado e o
      // mecanismo de fugir do bloco de copy nunca chegou a existir.
      const recorte = await sharp(arteBuffer).extract(regiao).toBuffer()
      const stats = await sharp(recorte).greyscale().stats()
      calmness = stats.channels[0]?.stdev ?? Number.POSITIVE_INFINITY
      const lumCanto = stats.channels[0]?.mean
      if (lumLogo !== null && typeof lumCanto === 'number') {
        contraste = Math.abs(lumLogo - lumCanto)
      }
    } catch {
      // região inválida (arte menor que o esperado) — canto descartado
    }
    if (!Number.isFinite(calmness)) continue

    // Menor é melhor: calma pesa cheio, e falta de contraste vira penalidade.
    // Contraste alto não dá bônus infinito — passado o mínimo, o que decide
    // volta a ser a calma.
    const deficit = Number.isFinite(contraste) ? Math.max(0, CONTRASTE_MINIMO - contraste) : 0
    let score = calmness + deficit * PESO_CONTRASTE
    if (corner === cornerReservado) score *= RESERVED_BONUS
    candidatos.push({ corner, calmness, contraste, score, pos })
  }

  if (candidatos.length === 0) {
    throw new Error('nenhum canto válido para compor a logo')
  }

  // Cantos que ENGOLEM a logo saem da disputa antes de competir por calma —
  // uma parede branca lisa é o canto mais calmo do quadro e o pior lugar
  // possível para uma logo branca. Se todos engolirem, a penalidade do score
  // ainda escolhe o menos ruim.
  const legiveis = candidatos.filter((c) => !Number.isFinite(c.contraste) || c.contraste >= CONTRASTE_MINIMO)
  const disputa = legiveis.length > 0 ? legiveis : candidatos
  if (legiveis.length === 0 && lumLogo !== null) {
    console.warn(
      `[logo] nenhum canto contrasta com a logo (luminância ${lumLogo.toFixed(0)}) — usando o menos ruim`,
    )
  }

  const melhor = disputa.reduce((a, b) => (b.score < a.score ? b : a))

  const buffer = await sharp(arteBuffer)
    .composite([{ input: logoRedim, left: melhor.pos.left, top: melhor.pos.top }])
    .jpeg({ quality: 92 })
    .toBuffer()

  return {
    buffer,
    corner: melhor.corner,
    calmness: melhor.calmness,
    contraste: Number.isFinite(melhor.contraste) ? melhor.contraste : null,
    moveu: !!cornerReservado && melhor.corner !== cornerReservado,
  }
}

/**
 * Instrução que o prompt precisa carregar quando a logo será composta depois.
 * Em inglês porque fala com o modelo de imagem, e explícita porque o modelo
 * tende a "assinar" a peça por conta própria.
 */
export type LogoMode = 'compor' | 'modelo'

/**
 * Instrução ALTERNATIVA: o modelo DESENHA a logo a partir do arquivo oficial
 * enviado como referência, em vez de o sistema compor depois.
 *
 * É o que o insta-automatico faz em produção (a logo vai como IMAGEM 3, com
 * "reproduza EXATAMENTE forma, proporção e cores"). A vantagem é integração:
 * a marca nasce dentro da composição, com a luz e a perspectiva da peça, em
 * vez de ser um adesivo colado num canto.
 *
 * O risco é o de sempre — modelo de imagem distorce logotipo. Por isso o modo
 * é OPT-IN e a peça é conferida por visão depois.
 */
export function instrucaoLogoPeloModelo(corner?: LogoCorner | null): string {
  const onde = corner
    ? {
        'bottom-right': 'lower-right corner',
        'bottom-left': 'lower-left corner',
        'top-right': 'upper-right corner',
        'top-left': 'upper-left corner',
      }[corner]
    : null

  return [
    '[LOGO — REPRODUZA O ARQUIVO OFICIAL]',
    'Uma das imagens de referência é a LOGO OFICIAL da marca. Desenhe-a na peça reproduzindo EXATAMENTE a forma, as proporções, o desenho das letras e as cores do arquivo.',
    onde
      ? `Coloque-a UMA ÚNICA VEZ, no ${onde}, ocupando NO MÁXIMO 12% da largura do quadro — bem menor do que a tendência: é assinatura de canto, do tamanho de um selo, nunca um elemento da composição.`
      : // Sem canto fixo: quem vê a foto sabe onde ela está vazia. As artes de
        // referência do Espeto movem a marca de peça para peça (topo-esquerda,
        // topo-direita, base-esquerda) conforme o enquadramento, e um canto
        // cravado no prompt produziria a mesma assinatura em todas.
        'Coloque-a UMA ÚNICA VEZ, num CANTO CALMO da foto — o que estiver mais livre nesta imagem —, ocupando NO MÁXIMO 12% da largura do quadro — bem menor do que a tendência: é assinatura de canto, do tamanho de um selo, nunca um elemento da composição. Não a ponha sobre o assunto nem sobre a copy.',
    '⛔ Não redesenhe, não estilize, não simplifique e não "melhore" a marca. Não invente símbolo, monograma, contorno ou selo que não esteja no arquivo. Não escreva o nome da marca com outra fonte.',
    // Soletração e ligadura, explícitas. O caso real que exigiu as duas linhas:
    // a logo do TERO tem o R EMENDADO no E (ligadura), e o modelo a "desdobrou"
    // em letras separadas — a arte saiu "TERRO", com o tagline "BRASAL E
    // VINHO" no lugar de "BRASA E VINHO" (pego pelo Ciro em 14/08/2026; a
    // conferência visual está desligada desde 10/08, então nada avisou).
    'SOLETRAÇÃO: a marca é uma FORMA a copiar, não um texto a recompor. Reproduza EXATAMENTE as letras do arquivo, no nome e no tagline — nunca acrescente, duplique, troque ou omita uma letra sequer. Antes de finalizar, confira letra por letra contra o arquivo.',
    'LIGADURA: quando duas letras do arquivo dividem um traço (letras emendadas), desenhe-as como UMA forma fundida, igual ao arquivo — NUNCA desdobre a ligadura em letras separadas nem em letra repetida.',
    'Se não conseguir reproduzir a marca fielmente, deixe o canto VAZIO — arte sem marca é aproveitável, marca errada não é.',
  ].join('\n')
}

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
