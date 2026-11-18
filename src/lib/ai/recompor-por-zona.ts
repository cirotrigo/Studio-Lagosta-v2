/**
 * RECOMPOSIÇÃO POR ZONA (17/11/2026): o que o gerador mudou fica, o resto é a
 * arte de origem pixel por pixel.
 *
 * Existe para o gerador que EDITA sem redesenhar a imagem inteira (Nano
 * Banana). Com o gpt-image a foto toda diverge e a recomposição precisa
 * adivinhar o que é texto (`preservar-foto.ts`: chapado, cor de tinta, caixa
 * preenchida), e é esse filtro que devolve à origem, sem aviso, o elemento
 * gráfico novo e fino: no By Rock, "trocar o tracejado por ondas sonoras" saiu
 * idêntico à origem e marcado como pronto. Quando o gerador mantém a foto, a
 * zona alterada sai direto do mapa de diferença, sem filtro de cor nem de
 * forma.
 *
 * Passos: alinhar a peça gerada ao tamanho da origem; mapa de diferença
 * tolerante a deslocamento de um ou dois pixels; zonas por limiar e
 * componentes conexos; folga e borda suave; fora das zonas, a origem. A logo
 * é sempre a da origem.
 *
 * Módulo puro: só `sharp`. Não importa `@/lib/db`.
 *
 * ponytail: limiares calibrados em uma arte do By Rock (17/11/2026) e na
 * medição de `scripts/medir-geradores-da-melhoria.ts`. Mudança LEVE e larga
 * (um halo que some) só entra quando encosta numa zona forte; sozinha, fica
 * a origem.
 */

import sharp from 'sharp'

/** Lado da célula da grade de análise, em pixels. */
const CELULA = 4
/** Diferença média por canal (0..255) acima da qual o pixel mudou. */
const LIMIAR_FORTE = 40
/** Mudança fraca: só conta para a zona crescer a partir de uma mudança forte. */
const LIMIAR_FRACO = 16
/** Raio, em pixels, em que um pixel procura o seu par na outra imagem (alinhamento nunca é exato). */
const TOLERANCIA = 2
/** Fração de pixels fortes, na vizinhança, para a célula semear uma zona. */
const DENSIDADE_FORTE = 0.03
/** Fração de pixels fracos, na vizinhança, para a zona crescer por ali. */
const DENSIDADE_FRACA = 0.25
/** Zona menor que isto (fração do quadro) é respingo. */
const AREA_MINIMA = 0.0004
/** Folga em volta da zona, em fração da altura. */
const FOLGA = 0.012
/** Raio do fechamento, em fração da altura: zonas a menos de duas vezes isto viram uma (uma linha de texto entre duas). */
const FECHAMENTO = 0.025
/**
 * A MUDANÇA É VISÍVEL? Texto que o gerador redesenhou no mesmo lugar difere da
 * origem nas bordas das letras e vira zona (15% do quadro no Bacana), mas quem
 * olha vê a mesma peça. Com a vizinhança de comparação mais larga essas zonas
 * somem e a mudança de verdade fica. Medido em 13 peças (17/11/2026), a 6 px:
 * as duas que voltaram iguais deram 0,0% e 0,4%; a menor mudança real, um
 * filete fino, 3,9%.
 */
const TOLERANCIA_VISIVEL = 6
/** Abaixo disto (fração do quadro visivelmente alterada) a mudança pedida não entrou. */
export const PISO_DE_MUDANCA = 0.005

/** Correlação mínima para dizer "aqui está a logo oficial" (medido em 11/11/2026: logo 0,88 a 0,97; texto até 0,44). */
export const CORRELACAO_DA_LOGO = 0.65
/** Até onde a tinta da logo redesenhada é seguida para fora da caixa, em fração do tamanho dela. */
const ALCANCE_DA_LOGO = 0.4
/** Folga em volta da tinta da logo, em células. */
const FOLGA_DA_LOGO = 3
/** Largura do molde da logo, em pixels: todo casamento é feito nesta escala. */
const LARGURA_DO_MOLDE = 48

export interface RecomposicaoPorZona {
  /** PNG no tamanho da origem: a origem em tudo, a peça gerada só nas zonas alteradas. */
  buffer: Buffer
  /** Fração do quadro que veio (mesmo em parte) da peça gerada. */
  fracaoDasZonas: number
  zonas: number
  /** Diferença média (0..255) entre o resultado e a origem FORA das zonas. Zero por construção. */
  diferencaFora: number
  /** Quanto a peça gerada diferia da origem fora das zonas, antes da recomposição. */
  diferencaForaAntes: number
  /** Null sem arquivo de logo (ou arquivo sem transparência). `protegida`: a logo estava numa zona e voltou à origem. */
  logo: { correlacao: number; protegida: boolean } | null
  /** Como a peça gerada foi levada ao tamanho da origem. */
  alinhamento: 'fill' | 'cover'
}

/** A mudança pedida não entrou: a peça recomposta é, na prática, a origem. */
export function mudancaNaoEntrou(fracaoAlterada: number): boolean {
  return fracaoAlterada < PISO_DE_MUDANCA
}

/** Fração do quadro em que a peça difere VISIVELMENTE da origem. É o que `mudancaNaoEntrou` julga. */
export async function areaVisivelmenteAlterada(origem: Buffer, peca: Buffer, tamanho?: { width: number; height: number }): Promise<number> {
  return (await recomporPorZona(origem, peca, { tamanho, tolerancia: TOLERANCIA_VISIVEL })).fracaoDasZonas
}

const cru = (buffer: Buffer, W: number, H: number, fit: 'fill' | 'cover') =>
  sharp(buffer).rotate().resize(W, H, { fit, position: 'center' }).removeAlpha().toColourspace('srgb').raw().toBuffer()

/** Média numa janela quadrada de raio `r`, por soma acumulada. */
function mediaLocal(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const acc = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let linha = 0
    for (let x = 0; x < w; x++) {
      linha += src[y * w + x]
      acc[(y + 1) * (w + 1) + x + 1] = acc[y * (w + 1) + x + 1] + linha
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      const soma = acc[y1 * (w + 1) + x1] - acc[y0 * (w + 1) + x1] - acc[y1 * (w + 1) + x0] + acc[y0 * (w + 1) + x0]
      out[y * w + x] = soma / ((y1 - y0) * (x1 - x0))
    }
  }
  return out
}

/** Diferença média por canal entre o pixel `i` de uma imagem e o `j` da outra. */
const dist = (a: Buffer, i: number, b: Buffer, j: number) => (Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2])) / 3

/**
 * Quanto o pixel mudou, tolerando deslocamento e borrão: cada lado é comparado
 * com a FAIXA de valores da vizinhança do outro. Borda de foto que andou um
 * pixel, ou letra amaciada pela reamostragem (2K para 1080), cai dentro da
 * faixa e não conta; barra nova (ou apagada) fica fora dela e conta.
 */
function mudanca(a: Buffer, b: Buffer, W: number, H: number, x: number, y: number, tolerancia: number): number {
  const i = (y * W + x) * 3
  const direto = dist(a, i, b, i)
  if (direto <= LIMIAR_FRACO) return direto
  const foraDaFaixa = (de: Buffer, vizinhanca: Buffer) => {
    let soma = 0
    for (let c = 0; c < 3; c++) {
      let min = 255
      let max = 0
      for (let yy = Math.max(0, y - tolerancia); yy <= Math.min(H - 1, y + tolerancia); yy++)
        for (let xx = Math.max(0, x - tolerancia); xx <= Math.min(W - 1, x + tolerancia); xx++) {
          const v = vizinhanca[(yy * W + xx) * 3 + c]
          if (v < min) min = v
          if (v > max) max = v
        }
      const v = de[i + c]
      soma += v < min ? min - v : v > max ? v - max : 0
    }
    return soma / 3
  }
  return Math.max(foraDaFaixa(b, a), foraDaFaixa(a, b))
}

interface Caixa {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface Molde {
  th: number
  /** Os pixels do molde que entram na conta: coluna, linha e valor (sem a média). */
  mi: Uint8Array
  mj: Uint8Array
  mt: Float32Array
  norma: number
  /** Molde do DESENHO interno (só casa com o mesmo sinal); falso = molde da forma. */
  desenho: boolean
}

/**
 * O molde da logo na escala do casamento. Ideia e código de busca aproveitados
 * do branch `claude/redesenhar-foto-e-logo` (11/11/2026), que casa pela FORMA
 * (canal alfa). Aqui há um segundo molde: logo com desenho por dentro (a
 * palheta vermelha do By Rock, com o nome em branco) tem o alfa em forma de
 * mancha lisa, que casou com a espuma do chope (0,71) melhor do que com a
 * própria logo. Nesses casos o molde é o desenho interno, só nos pixels opacos.
 */
async function moldeDaLogo(logo: Buffer): Promise<Molde | null> {
  const rgba = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = rgba.info
  const al = { data: Buffer.alloc(width * height) }
  const cinzaDaLogo = Buffer.alloc(width * height)
  for (let p = 0; p < width * height; p++) {
    al.data[p] = rgba.data[p * 4 + 3]
    cinzaDaLogo[p] = (rgba.data[p * 4] * 2 + rgba.data[p * 4 + 1] * 5 + rgba.data[p * 4 + 2]) >> 3
  }
  let x0 = width
  let x1 = -1
  let y0 = height
  let y1 = -1
  let opacos = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (al.data[y * width + x] > 32) {
        opacos++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  const lw = x1 - x0 + 1
  const lh = y1 - y0 + 1
  // Arquivo sem transparência não tem forma para casar.
  if (x1 < 0 || opacos >= lw * lh * 0.98) return null
  const th = Math.max(4, Math.round((LARGURA_DO_MOLDE * lh) / lw))
  const total = LARGURA_DO_MOLDE * th
  const naEscala = async (canal: Buffer) => {
    const px = await sharp(canal, { raw: { width, height, channels: 1 } })
      .extract({ left: x0, top: y0, width: lw, height: lh })
      .resize(LARGURA_DO_MOLDE, th, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const out = new Float32Array(total)
    for (let i = 0; i < total; i++) out[i] = px.data[i * px.info.channels]
    return out
  }
  const [alfa, cinza] = [await naEscala(al.data), await naEscala(cinzaDaLogo)]
  const montar = (valor: Float32Array, entra: (i: number) => boolean, desenho: boolean): Molde | null => {
    const idx: number[] = []
    for (let i = 0; i < total; i++) if (entra(i)) idx.push(i)
    if (idx.length < total * 0.1) return null
    let media = 0
    for (const i of idx) media += valor[i]
    media /= idx.length
    const mt = new Float32Array(idx.length)
    let norma = 0
    idx.forEach((i, k) => {
      mt[k] = valor[i] - media
      norma += mt[k] * mt[k]
    })
    // Desvio abaixo de 20 (0..255): não há desenho para casar.
    if (norma <= 0 || (desenho && Math.sqrt(norma / idx.length) < 20)) return null
    return { th, mi: Uint8Array.from(idx, (i) => i % LARGURA_DO_MOLDE), mj: Uint8Array.from(idx, (i) => Math.floor(i / LARGURA_DO_MOLDE)), mt, norma, desenho }
  }
  return montar(cinza, (i) => alfa[i] > 200, true) ?? montar(alfa, () => true, false)
}

/**
 * A logo oficial está nesta região da arte? Devolve a melhor caixa e a
 * correlação (em módulo: logo escura sobre fundo claro correlaciona negativo).
 * A região é reamostrada para que a logo, em cada tamanho testado, fique do
 * tamanho do molde. Mesmo código do branch `claude/redesenhar-foto-e-logo`.
 *
 * ponytail: busca exaustiva, de 8% da largura para cima, sem rotação (2 a 7 s
 * nas peças medidas). Se ficar lenta, pirâmide de escalas.
 */
async function casarLogo(arte: Buffer, W: number, regiao: Caixa, molde: Molde): Promise<(Caixa & { correlacao: number }) | null> {
  const rw0 = regiao.x1 - regiao.x0
  const rh0 = regiao.y1 - regiao.y0
  const cinza = Buffer.alloc(rw0 * rh0)
  for (let y = 0; y < rh0; y++)
    for (let x = 0; x < rw0; x++) {
      const i = ((regiao.y0 + y) * W + regiao.x0 + x) * 3
      cinza[y * rw0 + x] = (arte[i] * 2 + arte[i + 1] * 5 + arte[i + 2]) >> 3
    }
  const tw = LARGURA_DO_MOLDE
  const { th, mi, mj, mt, norma } = molde
  const n = tw * th
  const k0 = mt.length
  let melhor: (Caixa & { correlacao: number }) | null = null
  for (let largura = W * 0.08; largura <= rw0; largura *= 1.03) {
    const k = tw / largura
    const rw = Math.round(rw0 * k)
    const rh = Math.round(rh0 * k)
    if (rw < tw || rh < th) continue
    // O sharp pode devolver mais de um canal para entrada de um canal só.
    const saida = await sharp(cinza, { raw: { width: rw0, height: rh0, channels: 1 } }).resize(rw, rh, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
    const g = new Uint8Array(rw * rh)
    for (let i = 0; i < rw * rh; i++) g[i] = saida.data[i * saida.info.channels]
    // Soma acumulada e do quadrado: média e desvio de qualquer janela.
    const S = new Float64Array((rw + 1) * (rh + 1))
    const S2 = new Float64Array((rw + 1) * (rh + 1))
    for (let y = 0; y < rh; y++) {
      let l = 0
      let l2 = 0
      for (let x = 0; x < rw; x++) {
        const v = g[y * rw + x]
        l += v
        l2 += v * v
        S[(y + 1) * (rw + 1) + x + 1] = S[y * (rw + 1) + x + 1] + l
        S2[(y + 1) * (rw + 1) + x + 1] = S2[y * (rw + 1) + x + 1] + l2
      }
    }
    const janela = (acc: Float64Array, x: number, y: number) =>
      acc[(y + th) * (rw + 1) + x + tw] - acc[y * (rw + 1) + x + tw] - acc[(y + th) * (rw + 1) + x] + acc[y * (rw + 1) + x]
    for (let y = 0; y + th <= rh; y++) {
      for (let x = 0; x + tw <= rw; x++) {
        const somaDaJanela = janela(S, x, y)
        if (janela(S2, x, y) - (somaDaJanela * somaDaJanela) / n < n * 100) continue // janela lisa: não há logo ali
        // Correlação só nos pixels do molde (a janela inteira, ou só os opacos).
        const o = y * rw + x
        let soma = 0
        let soma2 = 0
        let cruz = 0
        for (let q = 0; q < k0; q++) {
          const v = g[o + mj[q] * rw + mi[q]]
          soma += v
          soma2 += v * v
          cruz += mt[q] * v
        }
        const vg = soma2 - (soma * soma) / k0
        if (vg <= 0) continue
        // A forma casa nos dois sinais (logo escura em fundo claro); o desenho, só no próprio.
        const c = (molde.desenho ? cruz : Math.abs(cruz)) / Math.sqrt(norma * vg)
        if (!melhor || c > melhor.correlacao)
          melhor = {
            x0: regiao.x0 + Math.round(x / k),
            y0: regiao.y0 + Math.round(y / k),
            x1: regiao.x0 + Math.round((x + tw) / k),
            y1: regiao.y0 + Math.round((y + th) / k),
            correlacao: c,
          }
      }
    }
  }
  return melhor
}

/**
 * Devolve a arte de origem em tudo o que o gerador não mudou.
 *
 * `origem` é a arte cuja foto vale (a raiz da linhagem); `gerada` é o que o
 * gerador devolveu, em qualquer tamanho de mesma proporção (o Nano Banana
 * devolve 1536x2752 para um story de 1080x1920).
 */
export async function recomporPorZona(
  origem: Buffer,
  gerada: Buffer,
  opcoes: {
    tamanho?: { width: number; height: number }
    /** O arquivo oficial da logo: onde ele casar com a origem, a origem vence. */
    logo?: Buffer | null
    /** Raio da vizinhança de comparação, em pixels. Ausente, `TOLERANCIA`. */
    tolerancia?: number
    /**
     * A peça gerada vale INTEIRA, menos a logo: é a reserva da melhoria de foto
     * (17/11/2026), em que a foto muda de propósito e só a logo volta à origem.
     * Sem isto, o que mudou pouco voltaria à origem em retalhos.
     */
    tudoEZona?: boolean
  } = {},
): Promise<RecomposicaoPorZona> {
  const meta = await sharp(origem).rotate().metadata()
  const W = opcoes.tamanho?.width ?? meta.width ?? 0
  const H = opcoes.tamanho?.height ?? meta.height ?? 0
  if (!W || !H) throw new Error('A arte de origem não tem dimensões')

  const a = await cru(origem, W, H, 'cover')
  // Sem casamento de tom: o Nano Banana não escurece o quadro (viés medido de
  // até 2,6 por canal), e o LUT de histograma, com um elemento gráfico novo na
  // conta, mexia na foto mais do que o gerador.
  // A proporção devolvida nunca é exata (0,8% no story): esticar ou cortar?
  // Fica o que casa melhor com a origem, medido numa amostra.
  const [esticada, cortada] = await Promise.all([cru(gerada, W, H, 'fill'), cru(gerada, W, H, 'cover')])
  const erro = (b: Buffer) => {
    let soma = 0
    for (let p = 0; p < W * H; p += 7) soma += dist(a, p * 3, b, p * 3)
    return soma
  }
  const alinhamento = erro(esticada) <= erro(cortada) ? 'fill' : 'cover'
  const b = alinhamento === 'fill' ? esticada : cortada

  // Por célula: fração de pixels que mudaram forte e fração que mudou pelo menos fraco.
  const w = Math.floor(W / CELULA)
  const h = Math.floor(H / CELULA)
  const forte = new Float32Array(w * h)
  const fraca = new Float32Array(w * h)
  const peso = 1 / (CELULA * CELULA)
  for (let y = 0; y < h * CELULA; y++) {
    for (let x = 0; x < w * CELULA; x++) {
      const d = mudanca(a, b, W, H, x, y, opcoes.tolerancia ?? TOLERANCIA)
      if (d <= LIMIAR_FRACO) continue
      const c = Math.floor(y / CELULA) * w + Math.floor(x / CELULA)
      fraca[c] += peso
      if (d > LIMIAR_FORTE) forte[c] += peso
    }
  }

  // Zona = região conexa semeada onde a mudança forte é densa, crescida por
  // onde a mudança fraca é densa (o halo que acompanha o texto). Sem filtro de
  // cor nem de forma: barra fina é zona tanto quanto letra.
  const raio = Math.max(1, Math.round(h * 0.006))
  const densidadeForte = mediaLocal(forte, w, h, raio)
  const densidadeFraca = mediaLocal(fraca, w, h, raio)
  const dentro = (c: number) => densidadeForte[c] > DENSIDADE_FORTE || densidadeFraca[c] > DENSIDADE_FRACA
  const rotulo = new Uint8Array(w * h)
  const mascara = new Float32Array(w * h)
  const fila = new Int32Array(w * h)
  let zonas = 0
  for (let s = 0; s < w * h; s++) {
    if (rotulo[s] || densidadeForte[s] <= DENSIDADE_FORTE) continue
    let ini = 0
    let fim = 0
    fila[fim++] = s
    rotulo[s] = 1
    while (ini < fim) {
      const c = fila[ini++]
      const cx = c % w
      for (const n of [c - w, c + w, cx > 0 ? c - 1 : -1, cx < w - 1 ? c + 1 : -1]) {
        if (n < 0 || n >= w * h || rotulo[n] || !dentro(n)) continue
        rotulo[n] = 1
        fila[fim++] = n
      }
    }
    if (fim < w * h * AREA_MINIMA) continue
    zonas++
    for (let k = 0; k < fim; k++) mascara[fila[k]] = 1
  }
  if (opcoes.tudoEZona) {
    mascara.fill(1)
    zonas = Math.max(zonas, 1)
  }

  /**
   * A LOGO É A DA ORIGEM. Todo gerador estraga as letras pequenas da logo
   * (medido em seis modelos, 17/11/2026). Na arte de origem a logo é o PNG
   * oficial colado por código, então casa por forma com o canal alfa do
   * arquivo. Só importa onde há zona: fora delas já é a origem. Onde casar, a
   * caixa da logo, a tinta que mudou em contato com ela e uma folga saem da
   * zona. Não acha logo que a IA desenhou na origem, e a logo que o gerador
   * levou para outro canto fica duplicada (a da origem volta ao lugar).
   */
  let logoInfo: RecomposicaoPorZona['logo'] = null
  let daLogo: Uint8Array | null = null
  const molde = opcoes.logo ? await moldeDaLogo(opcoes.logo).catch(() => null) : null
  if (molde) {
    logoInfo = { correlacao: 0, protegida: false }
    // Região de busca: cada zona com folga. Regiões que se tocam viram uma.
    const visto = new Uint8Array(w * h)
    const margemX = Math.round(w * 0.12)
    const margemY = Math.round(h * 0.05)
    const regioes: Caixa[] = []
    for (let s0 = 0; s0 < w * h; s0++) {
      if (!mascara[s0] || visto[s0]) continue
      let i0 = 0
      let i1 = 0
      fila[i1++] = s0
      visto[s0] = 1
      const bloco = { x0: w, y0: h, x1: 0, y1: 0 }
      while (i0 < i1) {
        const c = fila[i0++]
        const cx = c % w
        const cy = (c - cx) / w
        bloco.x0 = Math.min(bloco.x0, cx)
        bloco.x1 = Math.max(bloco.x1, cx + 1)
        bloco.y0 = Math.min(bloco.y0, cy)
        bloco.y1 = Math.max(bloco.y1, cy + 1)
        for (const n of [c - w, c + w, cx > 0 ? c - 1 : -1, cx < w - 1 ? c + 1 : -1]) {
          if (n < 0 || n >= w * h || !mascara[n] || visto[n]) continue
          visto[n] = 1
          fila[i1++] = n
        }
      }
      let r: Caixa = { x0: Math.max(0, bloco.x0 - margemX), y0: Math.max(0, bloco.y0 - margemY), x1: Math.min(w, bloco.x1 + margemX), y1: Math.min(h, bloco.y1 + margemY) }
      for (let k = regioes.length - 1; k >= 0; k--) {
        const o = regioes[k]
        if (o.x0 >= r.x1 || o.x1 <= r.x0 || o.y0 >= r.y1 || o.y1 <= r.y0) continue
        r = { x0: Math.min(r.x0, o.x0), y0: Math.min(r.y0, o.y0), x1: Math.max(r.x1, o.x1), y1: Math.max(r.y1, o.y1) }
        regioes.splice(k, 1)
        k = regioes.length // a união pode tocar regiões já vistas
      }
      regioes.push(r)
    }
    let caixaDaLogo: Caixa | null = null
    for (const r of regioes) {
      const achada = await casarLogo(a, W, { x0: r.x0 * CELULA, y0: r.y0 * CELULA, x1: Math.min(W, r.x1 * CELULA), y1: Math.min(H, r.y1 * CELULA) }, molde)
      if (achada && achada.correlacao > logoInfo.correlacao) {
        logoInfo.correlacao = achada.correlacao
        caixaDaLogo = achada
      }
    }
    if (caixaDaLogo && logoInfo.correlacao >= CORRELACAO_DA_LOGO) {
      const cx = caixaDaLogo
      const lw = cx.x1 - cx.x0
      const lh = cx.y1 - cx.y0
      const celulas = (m: number): Caixa => ({
        x0: Math.max(0, Math.floor((cx.x0 - lw * m) / CELULA)),
        y0: Math.max(0, Math.floor((cx.y0 - lh * m) / CELULA)),
        x1: Math.min(w, Math.ceil((cx.x1 + lw * m) / CELULA)),
        y1: Math.min(h, Math.ceil((cx.y1 + lh * m) / CELULA)),
      })
      const caixa = celulas(0)
      const alcance = celulas(ALCANCE_DA_LOGO)
      daLogo = new Uint8Array(w * h)
      let ini = 0
      let fim = 0
      for (let y = caixa.y0; y < caixa.y1; y++)
        for (let x = caixa.x0; x < caixa.x1; x++) {
          daLogo[y * w + x] = 1
          fila[fim++] = y * w + x
        }
      // A logo redesenhada transborda a caixa: segue a tinta que mudou, em
      // contato com a caixa, até o alcance.
      while (ini < fim) {
        const c = fila[ini++]
        const px = c % w
        const py = (c - px) / w
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = px + dx
            const y = py + dy
            if (x < alcance.x0 || x >= alcance.x1 || y < alcance.y0 || y >= alcance.y1) continue
            const n = y * w + x
            if (daLogo[n] || fraca[n] === 0) continue
            daLogo[n] = 1
            fila[fim++] = n
          }
      }
      const f = FOLGA_DA_LOGO
      for (let k = 0; k < fim; k++) {
        const px = fila[k] % w
        const py = (fila[k] - px) / w
        for (let dy = -f; dy <= f; dy++)
          for (let dx = -f; dx <= f; dx++) {
            const x = px + dx
            const y = py + dy
            if (x >= 0 && x < w && y >= 0 && y < h) daLogo[y * w + x] = 1
          }
      }
      for (let c = 0; c < w * h; c++)
        if (daLogo[c] && mascara[c]) {
          mascara[c] = 0
          logoInfo.protegida = true
        }
    }
  }

  // Folga em volta da zona (dilatação = média local > 0) e borda suave.
  const folga = Math.max(1, Math.round(h * FOLGA))
  /**
   * A EMENDA NÃO PASSA POR CIMA DE TEXTO. O gerador redesenha o bloco inteiro,
   * e a linha que ficou quase igual cai dentro da tolerância: entre duas zonas
   * (o título em cima, o convite embaixo) sobrava uma faixa estreita da
   * origem, e na borda suave as duas versões da linha se misturavam ("DAS 16H
   * ÀS 20H" com fantasma no By Rock). Um fechamento (dilata e erode) une as
   * zonas separadas por menos de duas vezes o raio; a foto entre zonas
   * distantes continua sendo a da origem.
   */
  const raioDoFechamento = Math.max(1, Math.round(h * FECHAMENTO))
  const binaria = (src: Float32Array, cheia: boolean) => src.map((v) => ((cheia ? v > 0.999 : v > 0) ? 1 : 0))
  const fechada = binaria(mediaLocal(binaria(mediaLocal(mascara, w, h, raioDoFechamento), false), w, h, raioDoFechamento), true)
  const dilatada = mediaLocal(fechada, w, h, folga)
  // A folga da zona vizinha traria um pedaço da logo redesenhada.
  if (daLogo) for (let c = 0; c < w * h; c++) if (daLogo[c]) dilatada[c] = 0
  const alfaPequeno = Buffer.alloc(w * h)
  for (let p = 0; p < w * h; p++) alfaPequeno[p] = dilatada[p] > 0 ? 255 : 0
  const alfaOut = await sharp(alfaPequeno, { raw: { width: w, height: h, channels: 1 } })
    .resize(W, H, { fit: 'fill', kernel: 'cubic' })
    .blur(Math.max(1, H * 0.003))
    .raw()
    .toBuffer({ resolveWithObject: true })
  const alfa = alfaOut.data
  const passo = alfaOut.info.channels

  const saida = Buffer.alloc(W * H * 3)
  let alterados = 0
  let somaAntes = 0
  let somaDepois = 0
  let fora = 0
  for (let p = 0; p < W * H; p++) {
    const t = alfa[p * passo] / 255
    const i = p * 3
    if (t > 0) alterados++
    else fora++
    for (let c = 0; c < 3; c++) {
      saida[i + c] = t === 0 ? a[i + c] : Math.round(b[i + c] * t + a[i + c] * (1 - t))
      if (t === 0) {
        somaAntes += Math.abs(a[i + c] - b[i + c])
        somaDepois += Math.abs(a[i + c] - saida[i + c])
      }
    }
  }
  return {
    buffer: await sharp(saida, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(),
    fracaoDasZonas: alterados / (W * H),
    zonas,
    diferencaFora: fora ? somaDepois / (fora * 3) : 0,
    diferencaForaAntes: fora ? somaAntes / (fora * 3) : 0,
    logo: logoInfo,
    alinhamento,
  }
}
