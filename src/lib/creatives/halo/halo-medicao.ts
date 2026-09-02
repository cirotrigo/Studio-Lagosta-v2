/**
 * Medição da FOTO para o halo e para o layout — server, com sharp.
 *
 * A luz é medida na foto COMO ELA APARECE na peça: a camada de fundo é
 * `objectFit: 'cover'` centralizado, então a foto é escalada para cobrir o
 * canvas e o centro é recortado — a MESMA conta de `resolveImageSourceRect`
 * (`src/lib/image-fit.ts`), via `calculateImageCrop`. Medir a foto inteira
 * erraria: o que sobra fora do recorte nunca fica atrás de texto nenhum.
 *
 * 🔴 Nada aqui usa `sharp(x).extract(r).stats()` — o CLAUDE.md registra que
 * `stats()` IGNORA o `extract` e devolve a estatística da imagem inteira.
 * O raster em cinza é materializado UMA vez (`toBuffer`) e cada retângulo é
 * medido por histograma sobre os bytes.
 *
 * O raster fica em escala reduzida (largura ~540px): a luz e a energia de
 * borda são estatísticas de área, e meio pixel de precisão não muda nada em
 * blocos de centenas de pixels. Quem chama passa os retângulos em px da PEÇA
 * e a escala é aplicada aqui.
 */

import sharp from 'sharp'

import { calculateImageCrop, type CropPosition } from '@/lib/image-crop-utils'

import { luzDeLeitura, percentil, type LuzMedida, type Rect } from './halo'

export interface CanvasSize {
  width: number
  height: number
}

/** A foto em cinza, JÁ enquadrada como aparece na peça, em escala reduzida. */
export interface FotoCinza {
  /** 1 byte por pixel (luminância 0..255), `stride` bytes por pixel. */
  data: Buffer
  width: number
  height: number
  /** Canais do buffer (1 sem alpha, 2 com) — só o primeiro é lido. */
  stride: number
  /** px do raster por px da peça. */
  escala: number
  canvas: CanvasSize
}

const LARGURA_DE_MEDICAO = 540

/**
 * Decodifica a foto como o render a desenha (cover centralizado no canvas) e
 * devolve o raster em cinza. Lança quando a imagem não é legível — quem chama
 * decide se cai no véu.
 */
export async function lerFotoComoCover(
  fotoBuffer: Buffer,
  canvas: CanvasSize,
  opts: { cropPosition?: CropPosition } = {},
): Promise<FotoCinza> {
  if (!canvas.width || !canvas.height) throw new Error('canvas sem dimensões')
  const meta = await sharp(fotoBuffer).metadata()
  if (!meta.width || !meta.height) throw new Error('foto sem dimensões legíveis')

  const crop = calculateImageCrop(
    { width: meta.width, height: meta.height },
    canvas,
    opts.cropPosition ?? 'center-middle',
  )
  const left = Math.max(0, Math.floor(crop.cropX))
  const top = Math.max(0, Math.floor(crop.cropY))
  const cropW = Math.max(1, Math.min(meta.width - left, Math.floor(crop.cropWidth)))
  const cropH = Math.max(1, Math.min(meta.height - top, Math.floor(crop.cropHeight)))

  const escala = Math.min(1, LARGURA_DE_MEDICAO / canvas.width)
  const width = Math.max(1, Math.round(canvas.width * escala))
  const height = Math.max(1, Math.round(canvas.height * escala))

  const { data, info } = await sharp(fotoBuffer)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true })

  return { data, width: info.width, height: info.height, stride: info.channels, escala, canvas }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Retângulo da peça → janela inteira do raster (ou null quando degenera). */
function janelaDoRect(foto: FotoCinza, rect: Rect): { x0: number; y0: number; x1: number; y1: number } | null {
  const x0 = clamp(Math.round(rect.x * foto.escala), 0, foto.width)
  const y0 = clamp(Math.round(rect.y * foto.escala), 0, foto.height)
  const x1 = clamp(Math.round((rect.x + rect.width) * foto.escala), 0, foto.width)
  const y1 = clamp(Math.round((rect.y + rect.height) * foto.escala), 0, foto.height)
  if (x1 <= x0 || y1 <= y0) return null
  return { x0, y0, x1, y1 }
}

/** Histograma (256 posições) da luminância dentro do retângulo. */
export function histogramaNoRect(foto: FotoCinza, rect: Rect): number[] | null {
  const j = janelaDoRect(foto, rect)
  if (!j) return null
  const hist = new Array<number>(256).fill(0)
  for (let y = j.y0; y < j.y1; y++) {
    const linha = y * foto.width
    for (let x = j.x0; x < j.x1; x++) {
      hist[foto.data[(linha + x) * foto.stride]]++
    }
  }
  return hist
}

/** Média e p75 da luz num retângulo da peça — o insumo de `calibrarHalo`. */
export function luzNoRect(foto: FotoCinza, rect: Rect): LuzMedida | null {
  const hist = histogramaNoRect(foto, rect)
  if (!hist) return null
  let total = 0
  let soma = 0
  for (let v = 0; v < 256; v++) {
    total += hist[v]
    soma += v * hist[v]
  }
  if (total === 0) return null
  return { media: soma / total, p75: percentil(hist, 0.75) }
}

export interface MedirLuzOptions {
  canvas: CanvasSize
  rects: Rect[]
  cropPosition?: CropPosition
}

/**
 * Para cada retângulo (em px da peça), `{ media, p75 }` da luminância da foto
 * como ela aparece na peça. `null` para retângulo fora do quadro/degenerado.
 * Aceita a foto crua (Buffer) ou já decodificada (`FotoCinza`), para quem
 * mede várias vezes a mesma foto não decodificar duas vezes.
 */
export async function medirLuzDaFoto(
  foto: Buffer | FotoCinza,
  opts: MedirLuzOptions,
): Promise<Array<LuzMedida | null>> {
  const raster = Buffer.isBuffer(foto)
    ? await lerFotoComoCover(foto, opts.canvas, { cropPosition: opts.cropPosition })
    : foto
  return opts.rects.map((rect) => luzNoRect(raster, rect))
}

// ─── Faixas para o layout ────────────────────────────────────────────

export interface FaixaMedida {
  /** Desvio-padrão do laplaciano na faixa: quanto maior, mais "agitada" a foto ali. */
  energia: number
  /** Luz de leitura (meia média, meio p75) da faixa. */
  luz: number
  media: number
  p75: number
}

/**
 * Energia de borda e luz de uma faixa horizontal da foto, dada em FRAÇÕES da
 * altura (0..1). A energia é o desvio-padrão do laplaciano 4-vizinhos nos
 * pixels interiores — textura, contornos e ruído contam; céu, parede e tampo
 * liso não.
 */
export function medirFaixa(foto: FotoCinza, fracaoDe: number, fracaoAte: number): FaixaMedida {
  const y0 = clamp(Math.round(foto.height * fracaoDe), 0, foto.height)
  const y1 = clamp(Math.round(foto.height * fracaoAte), 0, foto.height)
  const rect: Rect = {
    x: 0,
    y: y0 / foto.escala,
    width: foto.canvas.width,
    height: Math.max(0, y1 - y0) / foto.escala,
  }
  const luz = luzNoRect(foto, rect) ?? { media: 255, p75: 255 }

  const w = foto.width
  const px = (x: number, y: number) => foto.data[(y * w + x) * foto.stride]
  let n = 0
  let soma = 0
  let soma2 = 0
  for (let y = Math.max(1, y0); y < Math.min(foto.height - 1, y1); y++) {
    for (let x = 1; x < w - 1; x++) {
      const lap = 4 * px(x, y) - px(x - 1, y) - px(x + 1, y) - px(x, y - 1) - px(x, y + 1)
      n++
      soma += lap
      soma2 += lap * lap
    }
  }
  const energia = n > 0 ? Math.sqrt(Math.max(0, soma2 / n - (soma / n) ** 2)) : 0

  return { energia, luz: luzDeLeitura(luz.media, luz.p75), media: luz.media, p75: luz.p75 }
}

export interface FaixasDaFoto {
  /** 0–40% da altura. */
  topo: FaixaMedida
  /** 60–100% da altura. */
  rodape: FaixaMedida
}

/** As duas faixas que o layout pela foto compara. */
export async function medirFaixasDaFoto(
  foto: Buffer | FotoCinza,
  canvas: CanvasSize,
): Promise<FaixasDaFoto> {
  const raster = Buffer.isBuffer(foto) ? await lerFotoComoCover(foto, canvas) : foto
  return {
    topo: medirFaixa(raster, 0, 0.4),
    rodape: medirFaixa(raster, 0.6, 1),
  }
}
