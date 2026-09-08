/**
 * Experimentos legados de máscara e casamento de tom (08/09/2026).
 * A máscara da API é orientação: NÃO garante preservação de pixels.
 * A geração normal não usa máscara. `casarTomGlobal` continua no runner.
 * `restaurarFotoForaDasZonas` recupera transbordo e pode alterar o exterior;
 * a cirurgia usa agora `recomposicao-estrita.ts`, sem essa recuperação.
 */

import sharp from 'sharp'
import type { LogoCorner } from './logo-compositor'

/** Uma zona declarada pelo diretor, em frações 0..1 da largura/altura. */
export interface ZonaDoBriefing {
  nome: string
  x0: number
  x1: number
  y0: number
  y1: number
}

/** Retângulo em frações 0..1, já com folga e recortado ao quadro. */
export interface ZonaEditavel extends ZonaDoBriefing {
  origem: 'briefing' | 'logo'
}

/** Folga em volta de cada zona: o texto precisa de espaço para respirar dentro da área editável. */
export const MARGEM_X = 0.06
export const MARGEM_Y = 0.04
/** O canto da marca desenhada pelo modelo: a mesma área que o bloco da logo reserva (30% × 18%). */
export const LOGO_LARGURA = 0.3
export const LOGO_ALTURA = 0.18
/** Acima disto a máscara não protege quase nada — melhor não usar. */
export const TETO_DE_AREA_EDITAVEL = 0.6

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/**
 * As zonas do diretor viram a área editável. Zona inválida (sem área, fora do
 * quadro, valores não numéricos) é DESCARTADA em silêncio — o pior desfecho
 * seria derrubar uma geração paga por causa de uma caixa mal declarada.
 */
export function zonasEditaveis(
  zonas: Array<Partial<ZonaDoBriefing>> | null | undefined,
  opts: { cantoDaLogo?: LogoCorner | null; margemX?: number; margemY?: number } = {},
): ZonaEditavel[] {
  const mx = opts.margemX ?? MARGEM_X
  const my = opts.margemY ?? MARGEM_Y
  const saida: ZonaEditavel[] = []
  for (const z of zonas ?? []) {
    if (!z || [z.x0, z.x1, z.y0, z.y1].some((v) => typeof v !== 'number' || !Number.isFinite(v))) continue
    // Caixa degenerada é declaração errada, não zona: a folga não a salva.
    if (Math.abs(z.x1 - z.x0) < 0.01 || Math.abs(z.y1 - z.y0) < 0.01) continue
    const x0 = clamp01(Math.min(z.x0, z.x1) - mx)
    const x1 = clamp01(Math.max(z.x0, z.x1) + mx)
    const y0 = clamp01(Math.min(z.y0, z.y1) - my)
    const y1 = clamp01(Math.max(z.y0, z.y1) + my)
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) continue
    saida.push({ nome: String(z.nome ?? 'zona'), x0, x1, y0, y1, origem: 'briefing' })
  }
  if (opts.cantoDaLogo) {
    const direita = opts.cantoDaLogo.endsWith('right')
    const baixo = opts.cantoDaLogo.startsWith('bottom')
    saida.push({
      nome: 'logo',
      x0: direita ? 1 - LOGO_LARGURA : 0,
      x1: direita ? 1 : LOGO_LARGURA,
      y0: baixo ? 1 - LOGO_ALTURA : 0,
      y1: baixo ? 1 : LOGO_ALTURA,
      origem: 'logo',
    })
  }
  return saida
}

/** Fração do quadro que a união das zonas cobre (aproximação por grade 100×100). */
export function fracaoEditavel(zonas: ZonaEditavel[]): number {
  if (zonas.length === 0) return 0
  let dentro = 0
  for (let i = 0; i < 100; i++) {
    for (let j = 0; j < 100; j++) {
      const x = (i + 0.5) / 100
      const y = (j + 0.5) / 100
      if (zonas.some((z) => x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1)) dentro++
    }
  }
  return dentro / 10_000
}

/** PNG RGBA do tamanho do quadro: alpha 255 (protegido) em tudo, 0 (editável) dentro das zonas. */
export async function construirMascara(zonas: ZonaEditavel[], width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4, 0)
  for (let i = 0; i < width * height; i++) raw[i * 4 + 3] = 255
  for (const z of zonas) {
    const x0 = Math.round(z.x0 * width)
    const x1 = Math.round(z.x1 * width)
    const y0 = Math.round(z.y0 * height)
    const y1 = Math.round(z.y1 * height)
    for (let y = y0; y < y1; y++) {
      const linha = y * width
      for (let x = x0; x < x1; x++) raw[(linha + x) * 4 + 3] = 0
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

/** A foto cortada no tamanho exato da geração (cover, centro), em PNG — imagem e máscara têm de coincidir pixel a pixel. */
export async function cortarFotoParaOQuadro(foto: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(foto).rotate().resize(width, height, { fit: 'cover', position: 'center' }).png().toBuffer()
}

/**
 * A prova: diferença média de luminância (0..255) entre a foto cortada e a
 * peça gerada, só nos pixels FORA das zonas. Perto de zero = a foto saiu
 * intocada. Mede em escala reduzida (largura 272) — é uma estatística.
 */
export async function diferencaForaDaMascara(
  fotoCortada: Buffer,
  gerada: Buffer,
  zonas: ZonaEditavel[],
  largura = 272,
): Promise<{ mediaFora: number; mediaDentro: number; pixelsFora: number }> {
  const meta = await sharp(fotoCortada).metadata()
  const altura = Math.round((largura * (meta.height ?? 1)) / (meta.width ?? 1))
  const cinza = async (b: Buffer) => sharp(b).resize(largura, altura, { fit: 'fill' }).grayscale().raw().toBuffer()
  const [a, b] = await Promise.all([cinza(fotoCortada), cinza(gerada)])
  let somaFora = 0
  let nFora = 0
  let somaDentro = 0
  let nDentro = 0
  for (let y = 0; y < altura; y++) {
    const fy = (y + 0.5) / altura
    for (let x = 0; x < largura; x++) {
      const fx = (x + 0.5) / largura
      const i = y * largura + x
      const d = Math.abs(a[i] - b[i])
      if (zonas.some((z) => fx >= z.x0 && fx < z.x1 && fy >= z.y0 && fy < z.y1)) {
        somaDentro += d
        nDentro++
      } else {
        somaFora += d
        nFora++
      }
    }
  }
  return { mediaFora: nFora ? somaFora / nFora : 0, mediaDentro: nDentro ? somaDentro / nDentro : 0, pixelsFora: nFora }
}

/**
 * 🔴 A máscara do gpt-image-2 é ORIENTAÇÃO, não garantia. Medido em 08/09/2026
 * (Wine Vix): controle da foto reencodada = 0,6 de diferença; a peça gerada
 * COM máscara = 29,8 fora das zonas, com sinal negativo nas nove regiões — o
 * modelo escureceu o quadro inteiro, protegido inclusive. A máscara reduziu o
 * estrago pela metade (63 → 30) e não zerou. O humanizar de 07/09 já tinha
 * visto o mesmo ("objeto protegido movido").
 *
 * O que zera é CÓDIGO, em dois passos:
 *  1. CASAR O TOM: um LUT por canal (casamento de histograma) calculado só nos
 *     pixels FORA das zonas, mapeando a peça gerada para a foto original, e
 *     aplicado à peça INTEIRA — assim o interior das zonas também volta ao tom
 *     da foto, e o texto (creme, dourado) só clareia um pouco;
 *  2. RECOMPOR: a foto original fora das zonas, a peça dentro, com borda
 *     suave (feather) que fica DENTRO da zona — a costura acontece onde o
 *     modelo pintou, nunca sobre a foto.
 * Depois disto a diferença fora das zonas é zero por construção, e o que o
 * modelo escureceu atrás do texto fica contido na zona: halo local.
 */
export async function restaurarFotoForaDasZonas(
  fotoCortada: Buffer,
  gerada: Buffer,
  zonas: ZonaEditavel[],
  opts: { feather?: number } = {},
): Promise<{ buffer: Buffer; lutAplicado: boolean; pixelsMantidosForaDaZona: number }> {
  const meta = await sharp(fotoCortada).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (!W || !H) return { buffer: gerada, lutAplicado: false, pixelsMantidosForaDaZona: 0 }
  const [foto, peca] = await Promise.all([
    sharp(fotoCortada).removeAlpha().raw().toBuffer(),
    sharp(gerada).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
  ])
  const dentro = (x: number, y: number) => {
    const fx = (x + 0.5) / W
    const fy = (y + 0.5) / H
    return zonas.some((z) => fx >= z.x0 && fx < z.x1 && fy >= z.y0 && fy < z.y1)
  }

  // 1. Casamento de histograma por canal, só com os pixels fora das zonas.
  const passo = 4
  const histF = [new Array<number>(256).fill(0), new Array<number>(256).fill(0), new Array<number>(256).fill(0)]
  const histP = [new Array<number>(256).fill(0), new Array<number>(256).fill(0), new Array<number>(256).fill(0)]
  let amostras = 0
  for (let y = 0; y < H; y += passo) {
    for (let x = 0; x < W; x += passo) {
      if (dentro(x, y)) continue
      const i = (y * W + x) * 3
      for (let c = 0; c < 3; c++) {
        histF[c][foto[i + c]]++
        histP[c][peca[i + c]]++
      }
      amostras++
    }
  }
  let lutAplicado = false
  const luts: Uint8Array[] = []
  if (amostras > 5000) {
    for (let c = 0; c < 3; c++) {
      const cdf = (h: number[]) => {
        const out = new Array<number>(256)
        let acc = 0
        for (let v = 0; v < 256; v++) {
          acc += h[v]
          out[v] = acc / amostras
        }
        return out
      }
      const cf = cdf(histF[c])
      const cp = cdf(histP[c])
      const lut = new Uint8Array(256)
      let j = 0
      for (let v = 0; v < 256; v++) {
        while (j < 255 && cf[j] < cp[v]) j++
        lut[v] = j
      }
      luts.push(lut)
    }
    lutAplicado = true
  }

  // 2. Alpha suave: 1 dentro das zonas (encolhidas pelo feather), 0 fora, borrado.
  const feather = Math.max(8, Math.round(opts.feather ?? H * 0.025))
  const alfaRaw = Buffer.alloc(W * H, 0)
  for (const z of zonas) {
    const x0 = Math.max(0, Math.round(z.x0 * W) + feather)
    const x1 = Math.min(W, Math.round(z.x1 * W) - feather)
    const y0 = Math.max(0, Math.round(z.y0 * H) + feather)
    const y1 = Math.min(H, Math.round(z.y1 * H) - feather)
    for (let y = y0; y < y1; y++) alfaRaw.fill(255, y * W + x0, y * W + x1)
  }
  /**
   * 🔴 O TEXTO TRANSBORDA A ZONA. Medido em 08/09/2026 (Wine Vix): a manchete
   * "Feriado com sabores" saiu com o "s" final cortado — o modelo letrou além
   * da caixa declarada e a recomposição devolveu a foto por cima. A máscara
   * da API não segura o modelo dentro da zona; o que segura é MANTER o que
   * ele pintou perto dela: numa faixa em volta de cada zona (`BANDA`), o
   * pixel que diverge forte da foto (depois do LUT) é letra ou ornamento e
   * fica; o resto volta a ser foto. Longe das zonas nada é mantido.
   */
  const BANDA_X = Math.round(W * 0.12)
  const BANDA_Y = Math.round(H * 0.06)
  const LIMIAR = 60
  const pintado = Buffer.alloc(W * H, 0)
  let pintados = 0
  for (const z of zonas) {
    const zx0 = Math.round(z.x0 * W)
    const zx1 = Math.round(z.x1 * W)
    const zy0 = Math.round(z.y0 * H)
    const zy1 = Math.round(z.y1 * H)
    const bx0 = Math.max(0, zx0 - BANDA_X)
    const bx1 = Math.min(W, zx1 + BANDA_X)
    const by0 = Math.max(0, zy0 - BANDA_Y)
    const by1 = Math.min(H, zy1 + BANDA_Y)
    for (let y = by0; y < by1; y++) {
      for (let x = bx0; x < bx1; x++) {
        if (x >= zx0 && x < zx1 && y >= zy0 && y < zy1) continue
        const i = (y * W + x) * 3
        let d = 0
        for (let c = 0; c < 3; c++) {
          const v = lutAplicado ? luts[c][peca[i + c]] : peca[i + c]
          d += Math.abs(v - foto[i + c])
        }
        if (d / 3 > LIMIAR) {
          pintado[y * W + x] = 255
          pintados++
        }
      }
    }
  }
  if (pintados > 0) {
    // Dilata um pouco (o contorno da letra é mais suave que o miolo) e junta ao alpha.
    const dil = await sharp(pintado, { raw: { width: W, height: H, channels: 1 } })
      .blur(3)
      .threshold(40)
      .raw()
      .toBuffer({ resolveWithObject: true })
    for (let p = 0; p < W * H; p++) if (dil.data[p * dil.info.channels] > 127) alfaRaw[p] = 255
  }
  // Sigma = feather/3: o borrão (3σ) termina na borda da zona, nunca sobre a foto.
  // 🔴 O sharp devolve o raw borrado em 3 canais (converte o cinza para sRGB):
  // ler como 1 canal espalhava alpha por onde não havia zona. O stride vem
  // do `info`.
  const alfaOut = await sharp(alfaRaw, { raw: { width: W, height: H, channels: 1 } })
    .blur(feather / 3)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const alfa = alfaOut.data
  const strideAlfa = alfaOut.info.channels

  const saida = Buffer.alloc(W * H * 3)
  for (let p = 0; p < W * H; p++) {
    const a = alfa[p * strideAlfa] / 255
    const i = p * 3
    for (let c = 0; c < 3; c++) {
      const v = lutAplicado ? luts[c][peca[i + c]] : peca[i + c]
      saida[i + c] = Math.round(v * a + foto[i + c] * (1 - a))
    }
  }
  const buffer = await sharp(saida, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
  return { buffer, lutAplicado, pixelsMantidosForaDaZona: pintados }
}

/**
 * CASAMENTO DE TOM GLOBAL, sem máscara: a peça inteira recebe o LUT por canal
 * que leva o histograma dela ao da foto original. Serve para o caminho SEM
 * máscara (o modelo enquadra a foto como quer): não devolve pixel por pixel,
 * mas desfaz o escurecimento GLOBAL que o `images.edit` impõe (medido: -20% a
 * -40% de luz média). A camada gráfica (texto, ornamentos) é <5% dos pixels e
 * pesa pouco no histograma; o texto claro só clareia um pouco.
 *
 * Não corrige mudança LOCAL (fundo chapado atrás do título, objeto movido) —
 * para isso só a máscara com recomposição, com os defeitos dela.
 */
export async function casarTomGlobal(fotoOriginal: Buffer, gerada: Buffer): Promise<Buffer> {
  const meta = await sharp(gerada).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (!W || !H) return gerada
  const w = 272
  const h = Math.round((w * H) / W)
  const [ref, alvo] = await Promise.all([
    sharp(fotoOriginal).rotate().resize(w, h, { fit: 'cover' }).removeAlpha().raw().toBuffer(),
    sharp(gerada).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
  ])
  const n = w * h
  const luts: Uint8Array[] = []
  for (let c = 0; c < 3; c++) {
    const hr = new Array<number>(256).fill(0)
    const ha = new Array<number>(256).fill(0)
    for (let p = 0; p < n; p++) {
      hr[ref[p * 3 + c]]++
      ha[alvo[p * 3 + c]]++
    }
    const cdf = (hh: number[]) => {
      const out = new Array<number>(256)
      let acc = 0
      for (let v = 0; v < 256; v++) {
        acc += hh[v]
        out[v] = acc / n
      }
      return out
    }
    const cr = cdf(hr)
    const ca = cdf(ha)
    const lut = new Uint8Array(256)
    let j = 0
    for (let v = 0; v < 256; v++) {
      while (j < 255 && cr[j] < ca[v]) j++
      lut[v] = j
    }
    luts.push(lut)
  }
  const cheia = await sharp(gerada).removeAlpha().raw().toBuffer()
  for (let i = 0; i < cheia.length; i += 3) {
    cheia[i] = luts[0][cheia[i]]
    cheia[i + 1] = luts[1][cheia[i + 1]]
    cheia[i + 2] = luts[2][cheia[i + 2]]
  }
  return sharp(cheia, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
}
