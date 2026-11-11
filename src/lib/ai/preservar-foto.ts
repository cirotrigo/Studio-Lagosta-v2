/**
 * A FOTO DA MELHORIA É A DA ORIGEM (11/11/2026).
 *
 * O `images.edit` redesenha a imagem INTEIRA, mesmo quando o pedido é só mexer
 * no texto. Medido em produção em três rascunhos do Bacana: em `rediagramar` e
 * `refinar` a carne do espeto saiu "plástica" e os croutons mudaram de desenho
 * (diferença média de 19 a 22 na região da comida), e refinar em cima da
 * melhoria anterior degradou de novo. A máscara da API não resolve: é
 * orientação, não garantia (medido em 08/09/2026, ver `mascara-da-geracao.ts`).
 *
 * O que resolve é código: achar onde o TEXTO mudou e devolver a arte de origem
 * em todo o resto. Fora da máscara o resultado é a origem pixel por pixel, por
 * construção.
 *
 * Como se acha o texto, sem OCR: letra é tinta CHAPADA. Um pixel entra quando
 * diverge forte entre a origem e a peça gerada E é chapado (vizinhos iguais)
 * em pelo menos uma das duas. Textura de carne redesenhada diverge forte mas
 * não é chapada, e fica de fora. O que sobra vira bloco quando é denso.
 *
 * Dois rigores:
 *  - ESTRITO (o padrão): além de chapado, o pixel tem a COR de uma tinta
 *    (branco e as cores da marca), e bloco em forma de arco (borda de prato
 *    que a IA deslocou) sai. Sem isto o queijo ralado da salada, que é uma
 *    tira clara e chapada, passava por letra.
 *  - FOLGADO: só o chapado. A máscara cresce e pode levar pedaço de comida;
 *    é a rede para quando o estrito come letra (tinta fora da paleta).
 *
 * ponytail: heurística calibrada em três peças do Bacana (texto claro sobre
 * foto escura). Quem pega letra comida é a conferência de texto, que roda
 * DEPOIS, na peça recomposta: reprovou no estrito, o runner refaz no folgado.
 * Se uma marca de texto fino falhar nos dois, o caminho é OCR com caixas.
 */

import sharp from 'sharp'
import { casarTomGlobal } from './mascara-da-geracao'

/** Lado da célula da grade de análise, em pixels. */
const CELULA = 4
/** Diferença média por canal (0..255) acima da qual o pixel "mudou". */
const LIMIAR_DE_MUDANCA = 45
/** Mudança fraca: a borda de uma letra que andou um ou dois pixels. */
const LIMIAR_DE_MUDANCA_FRACA = 18
/** Fração de tinta fraca, na vizinhança, para o bloco aceito crescer por ali. */
const DENSIDADE_DE_TINTA_FRACA = 0.02
/** Diferença máxima para os vizinhos de um pixel chapado. */
const LIMIAR_DE_CHAPADO = 14
/** Fração de tinta, na vizinhança, para a célula ser parte de um bloco de texto. */
const DENSIDADE_DE_BLOCO = 0.08
/** Bloco menor que isto (fração do quadro) é respingo, não texto. */
const AREA_MINIMA_DE_BLOCO = 0.0006
/** Distância (euclidiana, RGB) até uma tinta para o pixel contar como dela. */
const TOLERANCIA_DE_TINTA = 60
/** No estrito: fração do que mudou no bloco que precisa ter cor de tinta. */
const FRACAO_DE_TINTA = 0.5
/** Bloco que preenche menos que isto da própria caixa é arco, não linha de texto. */
const PREENCHIMENTO_MINIMO = 0.25
/** Folga em volta do bloco, em fração da altura. */
const FOLGA = 0.012
/**
 * Acima disto a IA mexeu em área demais para ser só texto: a peça é
 * descartada como "a foto mudou". Nas três peças medidas o texto ocupa de 15%
 * a 25% do quadro.
 */
export const TETO_DA_MASCARA = 0.45
/**
 * Fração dos pedaços texturizados que precisa ter saído do lugar. Medido em
 * 11/11/2026: o redesenho que deslocou a carne deu 22%; as três peças com a
 * foto no lugar deram de 1% a 6%.
 */
const FRACAO_DESLOCADA = 0.1
/** Até onde a busca procura um pedaço da foto, em fração de cada eixo. */
const ALCANCE_DA_BUSCA = 0.12
/** Deslocamento (fração do quadro) a partir do qual um pedaço da foto saiu do lugar. */
export const TETO_DE_DESLOCAMENTO = 0.02

export interface FotoPreservada {
  /** PNG no tamanho da peça gerada: a origem em tudo, a peça gerada só nos blocos de texto. */
  buffer: Buffer
  /** Fração do quadro que veio da peça gerada. */
  fracaoDaMascara: number
  blocos: number
  /** Diferença média (0..255) entre o resultado e a origem FORA da máscara. Zero por construção. */
  diferencaFora: number
  /** Fração do quadro em blocos que mudaram e NÃO eram texto: voltaram à origem. */
  fracaoRecusada: number
  /** Quanto a foto diferia da origem antes da recomposição, fora da máscara. */
  diferencaForaAntes: number
}

async function rgb(buffer: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(buffer).rotate().resize(width, height, { fit: 'cover', position: 'center' }).removeAlpha().toColourspace('srgb').raw().toBuffer()
}

/** 1 onde o pixel é chapado: os quatro vizinhos têm (quase) a mesma cor. */
function chapado(img: Buffer, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 3
      let ok = 1
      for (const j of [i - 3, i + 3, i - W * 3, i + W * 3]) {
        if (
          Math.abs(img[i] - img[j]) > LIMIAR_DE_CHAPADO ||
          Math.abs(img[i + 1] - img[j + 1]) > LIMIAR_DE_CHAPADO ||
          Math.abs(img[i + 2] - img[j + 2]) > LIMIAR_DE_CHAPADO
        ) {
          ok = 0
          break
        }
      }
      out[y * W + x] = ok
    }
  }
  return out
}

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

/**
 * Devolve a arte de origem em tudo o que não é texto novo ou texto removido.
 *
 * `origem` é a arte cuja foto vale (a raiz da linhagem, não a última
 * melhoria); `gerada` é o que o gpt-image devolveu.
 */
export type RigorDaFoto = 'estrito' | 'folgado'

export async function preservarFotoDaOrigem(
  origem: Buffer,
  gerada: Buffer,
  opcoes: { coresDaMarca?: string[]; folgado?: boolean; tamanho?: { width: number; height: number } } = {},
): Promise<FotoPreservada> {
  const meta = await sharp(gerada).metadata()
  // No tamanho FINAL da peça, a origem que já está nele entra sem reamostrar.
  const W = opcoes.tamanho?.width ?? meta.width ?? 0
  const H = opcoes.tamanho?.height ?? meta.height ?? 0
  if (!W || !H) throw new Error('A peça gerada não tem dimensões')

  // O `images.edit` escurece o quadro inteiro; casar o tom antes evita que o
  // escurecimento global conte como mudança e que o remendo saia mais escuro.
  const geradaNoTom = await casarTomGlobal(origem, gerada)
  const [a, b] = await Promise.all([rgb(origem, W, H), rgb(geradaNoTom, W, H)])
  const [chapA, chapB] = [chapado(a, W, H), chapado(b, W, H)]

  // As tintas possíveis: branco e as cores da marca. Cor escura só conta em
  // arte clara — em foto escura ela casaria com o fundo inteiro.
  let luz = 0
  for (let i = 0; i < a.length; i += 3) luz += (a[i] + a[i + 1] + a[i + 2]) / 3
  const arteClara = luz / (W * H) > 140
  const tintas = [[255, 255, 255], ...(arteClara ? [[0, 0, 0]] : [])]
  for (const hex of opcoes.coresDaMarca ?? []) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) continue
    const n = parseInt(m[1], 16)
    const cor = [n >> 16, (n >> 8) & 255, n & 255]
    if (arteClara || (cor[0] + cor[1] + cor[2]) / 3 >= 80) tintas.push(cor)
  }
  const ehTinta = (img: Buffer, i: number) =>
    tintas.some((t) => (img[i] - t[0]) ** 2 + (img[i + 1] - t[1]) ** 2 + (img[i + 2] - t[2]) ** 2 < TOLERANCIA_DE_TINTA ** 2)

  // Por célula: quantos pixels mudaram forte e são chapados num dos lados
  // (`mudou`), e quantos desses têm cor de tinta (`tinta`).
  const w = Math.floor(W / CELULA)
  const h = Math.floor(H / CELULA)
  const mudou = new Float32Array(w * h)
  const tinta = new Float32Array(w * h)
  /** Mudança FRACA de tinta: é por ela que o bloco aceito cresce até a letra inteira. */
  const fraca = new Float32Array(w * h)
  for (let y = 0; y < h * CELULA; y++) {
    for (let x = 0; x < w * CELULA; x++) {
      const p = y * W + x
      const i = p * 3
      const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3
      if (d <= LIMIAR_DE_MUDANCA_FRACA) continue
      const c = Math.floor(y / CELULA) * w + Math.floor(x / CELULA)
      if (opcoes.folgado || ehTinta(a, i) || ehTinta(b, i)) fraca[c] += 1 / (CELULA * CELULA)
      if (d <= LIMIAR_DE_MUDANCA || (!chapA[p] && !chapB[p])) continue
      mudou[c] += 1 / (CELULA * CELULA)
      if (ehTinta(a, i) || ehTinta(b, i)) tinta[c] += 1 / (CELULA * CELULA)
    }
  }

  // Bloco = região conexa onde a mudança é densa. Respingo isolado sai. No
  // estrito, o bloco só fica se a maior parte do que mudou nele tem cor de
  // tinta (a razão não depende da espessura da letra) e se não é um arco.
  const raio = Math.max(1, Math.round(h * 0.006))
  const densidade = mediaLocal(mudou, w, h, raio)
  const rotulo = new Uint8Array(w * h)
  const mascara = new Float32Array(w * h)
  const fila = new Int32Array(w * h)
  let blocos = 0
  let recusadas = 0
  for (let s = 0; s < w * h; s++) {
    if (rotulo[s] || densidade[s] <= DENSIDADE_DE_BLOCO) continue
    let ini = 0
    let fim = 0
    fila[fim++] = s
    rotulo[s] = 1
    while (ini < fim) {
      const c = fila[ini++]
      const cx = c % w
      for (const n of [c - w, c + w, cx > 0 ? c - 1 : -1, cx < w - 1 ? c + 1 : -1]) {
        if (n < 0 || n >= w * h || rotulo[n] || densidade[n] <= DENSIDADE_DE_BLOCO) continue
        rotulo[n] = 1
        fila[fim++] = n
      }
    }
    if (fim < w * h * AREA_MINIMA_DE_BLOCO) continue
    if (!opcoes.folgado) {
      let somaMudou = 0
      let somaTinta = 0
      let x0 = w
      let x1 = 0
      let y0 = h
      let y1 = 0
      for (let k = 0; k < fim; k++) {
        const cx = fila[k] % w
        const cy = (fila[k] - cx) / w
        somaMudou += mudou[fila[k]]
        somaTinta += tinta[fila[k]]
        x0 = Math.min(x0, cx)
        x1 = Math.max(x1, cx)
        y0 = Math.min(y0, cy)
        y1 = Math.max(y1, cy)
      }
      if (somaTinta < somaMudou * FRACAO_DE_TINTA || fim / ((x1 - x0 + 1) * (y1 - y0 + 1)) < PREENCHIMENTO_MINIMO) {
        recusadas += fim
        continue
      }
    }
    blocos++
    for (let k = 0; k < fim; k++) mascara[fila[k]] = 1
  }

  /**
   * A EMENDA NÃO PODE CORTAR LETRA (11/11/2026). Texto que a IA deslocou só
   * alguns pixels muda pouco onde as duas versões se sobrepõem: o bloco denso
   * pegava parte da linha, e na borda ficavam as duas versões misturadas ("CHU"
   * duplicado sob a logo do Bacana, "Praia da Costa" borrado). O bloco aceito
   * cresce por onde houver tinta que mudou, mesmo pouco, até acabar a linha.
   * Só cresce a partir de bloco já aceito: tinta fraca sozinha não vira bloco.
   */
  const vizinhanca = mediaLocal(fraca, w, h, raio)
  let ini = 0
  let fim = 0
  for (let c = 0; c < w * h; c++) if (mascara[c]) fila[fim++] = c
  while (ini < fim) {
    const c = fila[ini++]
    const cx = c % w
    for (const n of [c - w, c + w, cx > 0 ? c - 1 : -1, cx < w - 1 ? c + 1 : -1]) {
      if (n < 0 || n >= w * h || mascara[n] || vizinhanca[n] <= DENSIDADE_DE_TINTA_FRACA) continue
      mascara[n] = 1
      fila[fim++] = n
    }
  }

  // Folga em volta do bloco (dilatação = média local > 0) e borda suave.
  const folga = Math.max(1, Math.round(h * FOLGA))
  const dilatada = mediaLocal(mascara, w, h, folga)
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
  let dentro = 0
  let somaAntes = 0
  let somaDepois = 0
  let fora = 0
  for (let p = 0; p < W * H; p++) {
    const t = alfa[p * passo] / 255
    const i = p * 3
    if (t > 0) dentro++
    for (let c = 0; c < 3; c++) {
      saida[i + c] = t === 0 ? a[i + c] : Math.round(b[i + c] * t + a[i + c] * (1 - t))
      if (t === 0) {
        somaAntes += Math.abs(a[i + c] - b[i + c])
        somaDepois += Math.abs(a[i + c] - saida[i + c])
      }
    }
    if (t === 0) fora++
  }
  return {
    buffer: await sharp(saida, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(),
    fracaoDaMascara: dentro / (W * H),
    blocos,
    fracaoRecusada: recusadas / (w * h),
    diferencaFora: fora ? somaDepois / (fora * 3) : 0,
    diferencaForaAntes: fora ? somaAntes / (fora * 3) : 0,
  }
}

/**
 * O assunto da foto saiu do lugar? (`redesenhar` prometia a foto exatamente
 * como está e entregou a carne 8% mais abaixo, com o fundo parado.)
 *
 * O deslocamento não é global, então a busca é por LADRILHO: para cada pedaço
 * texturizado da origem, onde ele foi parar na peça gerada. Ladrilho sem bom
 * casamento em lugar nenhum (texto que mudou, área redesenhada) não vota.
 */
export async function deslocamentoDaFoto(
  origem: Buffer,
  gerada: Buffer,
): Promise<{ deslocada: boolean; ladrilhos: number; deslocados: number; maior: number }> {
  const w = 135
  const meta = await sharp(gerada).metadata()
  const h = Math.max(1, Math.round((w * (meta.height ?? 1)) / (meta.width ?? 1)))
  const cinza = (buf: Buffer) => sharp(buf).rotate().resize(w, h, { fit: 'fill' }).grayscale().raw().toBuffer()
  const [a, b] = await Promise.all([cinza(origem), cinza(gerada)])
  const lado = 15
  // O alcance é por eixo: 8% da altura de um story são mais pixels que 10% da largura.
  const alcanceX = Math.round(w * ALCANCE_DA_BUSCA)
  const alcanceY = Math.round(h * ALCANCE_DA_BUSCA)
  let ladrilhos = 0
  let deslocados = 0
  let maior = 0
  for (let ty = alcanceY; ty + lado <= h - alcanceY; ty += lado) {
    for (let tx = alcanceX; tx + lado <= w - alcanceX; tx += lado) {
      let mediaA = 0
      for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) mediaA += a[(ty + y) * w + tx + x]
      mediaA /= lado * lado
      let variancia = 0
      for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) variancia += (a[(ty + y) * w + tx + x] - mediaA) ** 2
      if (Math.sqrt(variancia / (lado * lado)) < 14) continue // liso: casa em qualquer lugar
      // Custo sem a média de cada ladrilho: escurecimento global não conta.
      const custoEm = (dx: number, dy: number) => {
        let mediaB = 0
        for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) mediaB += b[(ty + dy + y) * w + tx + dx + x]
        mediaB /= lado * lado
        let soma = 0
        for (let y = 0; y < lado; y++)
          for (let x = 0; x < lado; x++) soma += Math.abs(a[(ty + y) * w + tx + x] - mediaA - (b[(ty + dy + y) * w + tx + dx + x] - mediaB))
        return soma / (lado * lado)
      }
      const zero = custoEm(0, 0)
      let melhor = { dx: 0, dy: 0, custo: zero }
      for (let dy = -alcanceY; dy <= alcanceY; dy++)
        for (let dx = -alcanceX; dx <= alcanceX; dx++) {
          const custo = custoEm(dx, dy)
          if (custo < melhor.custo) melhor = { dx, dy, custo }
        }
      if (melhor.custo > 12) continue // não achou o pedaço em lugar nenhum
      ladrilhos++
      const distancia = Math.max(Math.abs(melhor.dx) / w, Math.abs(melhor.dy) / h)
      if (distancia >= TETO_DE_DESLOCAMENTO && melhor.custo < zero * 0.6) {
        deslocados++
        maior = Math.max(maior, distancia)
      }
    }
  }
  return { deslocada: deslocados >= Math.max(3, ladrilhos * FRACAO_DESLOCADA), ladrilhos, deslocados, maior }
}
