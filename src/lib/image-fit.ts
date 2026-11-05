/**
 * Resolução ÚNICA do enquadramento de imagem (editor Konva e render server-side).
 *
 * O editor (ImageNode) e o RenderEngine precisam recortar a MESMA área da
 * imagem, senão a arte agendada sai enquadrada diferente do que o usuário viu.
 * Este módulo é isomórfico (sem API de browser) de propósito — é importado
 * pelos dois lados.
 *
 * Semântica (espelha o comportamento real do editor):
 * - `cover`   → recorte da imagem original que preenche a caixa sem distorção,
 *               posicionado por `style.cropPosition` (default center-middle).
 * - `contain`/`fill` → SEM recorte: o KonvaImage estica a imagem para a caixa.
 *               (`contain` não faz letterbox no editor — o render deve espelhar.)
 */

import { calculateImageCrop, type CropData, type ImageSize, type CropPosition } from './image-crop-utils'
import type { LayerStyle } from '@/types/template'

export type { CropData, ImageSize, CropPosition }

/**
 * Retorna o retângulo-fonte (em px da imagem original) a desenhar na caixa da
 * camada, ou `undefined` quando a imagem inteira deve ser esticada na caixa.
 */
export function resolveImageSourceRect(
  natural: ImageSize,
  box: ImageSize,
  style?: Pick<LayerStyle, 'objectFit' | 'cropPosition' | 'crop'>,
): CropData | undefined {
  if (!natural.width || !natural.height || !box.width || !box.height) return undefined

  // Crop manual (frações 0..1 da imagem original) tem precedência sobre tudo:
  // é o que o crop in-canvas grava. Clampado para sobreviver a trocas de
  // arquivo e valores fora de faixa.
  const manual = style?.crop
  if (manual && manual.width > 0 && manual.height > 0) {
    const x = Math.min(Math.max(manual.x, 0), 1)
    const y = Math.min(Math.max(manual.y, 0), 1)
    const w = Math.min(Math.max(manual.width, 0.01), 1 - x)
    const h = Math.min(Math.max(manual.height, 0.01), 1 - y)
    return {
      cropX: x * natural.width,
      cropY: y * natural.height,
      cropWidth: w * natural.width,
      cropHeight: h * natural.height,
    }
  }

  // O editor só recorta quando objectFit é EXPLICITAMENTE 'cover' (ImageNode);
  // sem objectFit o KonvaImage estica — o render precisa fazer o mesmo, não
  // assumir cover por padrão como fazia antes.
  if (style?.objectFit !== 'cover') return undefined

  return calculateImageCrop(natural, box, style?.cropPosition ?? 'center-middle')
}

/** Área da imagem que a caixa mostra hoje, sempre em px da imagem original */
export function currentSourceRect(
  natural: ImageSize,
  box: ImageSize,
  style?: Pick<LayerStyle, 'objectFit' | 'cropPosition' | 'crop'>,
): CropData {
  return (
    resolveImageSourceRect(natural, box, style) ?? {
      cropX: 0,
      cropY: 0,
      cropWidth: natural.width,
      cropHeight: natural.height,
    }
  )
}

/**
 * Recorte da imagem quando a CAIXA muda de forma (alças laterais).
 *
 * A caixa é uma janela: mudar a largura tem que mostrar MAIS ou MENOS imagem,
 * nunca esticar a que está lá. Mantemos a escala (px de tela por px de imagem)
 * e o centro do enquadramento; a janela revela ou esconde o entorno.
 *
 * Devolve frações 0..1 da imagem original — o mesmo `style.crop` que o recorte
 * in-canvas grava e que o render server-side lê com precedência sobre tudo.
 *
 * A escala escolhida é a MENOR dos dois eixos: numa imagem que estava esticada
 * (sem objectFit, caixa com outra proporção), é ela que preserva tudo que já
 * aparecia — e a imagem sai da deformação em vez de continuar nela.
 */
export function cropForResizedBox(
  natural: ImageSize,
  previousBox: ImageSize,
  nextBox: ImageSize,
  style?: Pick<LayerStyle, 'objectFit' | 'cropPosition' | 'crop'>,
  /** Alça arrastada: a borda OPOSTA fica parada, como em qualquer editor */
  anchor?: string,
): { x: number; y: number; width: number; height: number } | undefined {
  if (!natural.width || !natural.height) return undefined
  if (!previousBox.width || !previousBox.height) return undefined
  if (!nextBox.width || !nextBox.height) return undefined

  const src = currentSourceRect(natural, previousBox, style)
  if (!src.cropWidth || !src.cropHeight) return undefined

  const escala = Math.min(previousBox.width / src.cropWidth, previousBox.height / src.cropHeight)
  if (!Number.isFinite(escala) || escala <= 0) return undefined

  let width = nextBox.width / escala
  let height = nextBox.height / escala

  // Não dá para revelar mais do que a imagem tem: aproxima o mínimo necessário
  const excesso = Math.max(width / natural.width, height / natural.height, 1)
  width /= excesso
  height /= excesso

  // Arrastando a borda direita, a esquerda fica parada (e vice-versa): sem
  // isso a foto escorrega para o lado enquanto a caixa cresce
  const brutoX =
    anchor === 'middle-right'
      ? src.cropX
      : anchor === 'middle-left'
        ? src.cropX + src.cropWidth - width
        : src.cropX + src.cropWidth / 2 - width / 2
  const brutoY =
    anchor === 'bottom-center'
      ? src.cropY
      : anchor === 'top-center'
        ? src.cropY + src.cropHeight - height
        : src.cropY + src.cropHeight / 2 - height / 2

  const x = Math.min(Math.max(brutoX, 0), natural.width - width)
  const y = Math.min(Math.max(brutoY, 0), natural.height - height)

  return {
    x: x / natural.width,
    y: y / natural.height,
    width: width / natural.width,
    height: height / natural.height,
  }
}

/**
 * Máscara "Quadrado 1:1" da foto (26/10/2026). Fora de `MASCARAS_DE_IMAGEM` de propósito: aquelas congelam um path
 * esticado na caixa, e um quadrado esticado vira retângulo. Aqui a CAIXA vira o quadrado do menor lado, com o mesmo
 * centro (girado junto, o pivô dos dois renderers é o canto superior esquerdo), e o recorte é refeito por
 * `cropForResizedBox` (mesma escala, mesmo centro do enquadramento, sem deformar). O path cobre a caixa inteira, então
 * editor e render server-side desenham o mesmo quadrado; a trava de proporção mantém a caixa 1:1 depois. O raio da
 * borda vai a 0 (cantos retos).
 */
export const MASCARA_QUADRADA = { shapeId: 'quadrado-1-1', path: 'M0 0 L100 0 L100 100 L0 100 Z' } as const

/**
 * Dimensões naturais da foto carregada SÓ se ela for a da camada. O `use-image` instalado tem corrida: trocando de
 * foto com o `decode()` de A pendente, o `finally` de A grava a imagem depois que a seleção já é B. Sem conferir a
 * URL, o Quadrado de B sairia recortado com as dimensões de A. `img.src` vem absoluto do navegador; `base` resolve a
 * `fileUrl` (relativa ou não) da mesma forma.
 */
export function dimensoesDaFotoCarregada(
  img: { src: string; width: number; height: number } | undefined,
  fileUrl: string | undefined,
  base: string | undefined,
): ImageSize | undefined {
  if (!img || !fileUrl || !(img.width > 0) || !(img.height > 0)) return undefined
  let esperada: string
  try {
    esperada = new URL(fileUrl, base).href
  } catch {
    return undefined
  }
  return img.src === esperada ? { width: img.width, height: img.height } : undefined
}

export function aplicarMascaraQuadrada(
  layer: { position?: { x: number; y: number }; size?: { width: number; height: number }; rotation?: number; style?: LayerStyle },
  natural: ImageSize,
): { position: { x: number; y: number }; size: { width: number; height: number }; style: LayerStyle } | undefined {
  const w = layer.size?.width ?? 0
  const h = layer.size?.height ?? 0
  if (!(w > 0) || !(h > 0)) return undefined
  const lado = Math.min(w, h)
  const caixa = { width: lado, height: lado }
  const crop = cropForResizedBox(natural, { width: w, height: h }, caixa, layer.style)
  if (!crop) return undefined

  const rad = ((layer.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const girar = (dx: number, dy: number) => ({ x: dx * cos - dy * sin, y: dx * sin + dy * cos })
  const x0 = layer.position?.x ?? 0
  const y0 = layer.position?.y ?? 0
  const centro = girar(w / 2, h / 2)
  const meio = girar(lado / 2, lado / 2)

  return {
    position: { x: x0 + centro.x - meio.x, y: y0 + centro.y - meio.y },
    size: caixa,
    // Cantos retos: o raio da borda também recorta a foto nos dois renderers, então zera aqui
    style: {
      ...layer.style,
      crop,
      mask: { ...MASCARA_QUADRADA },
      ...(layer.style?.border ? { border: { ...layer.style.border, radius: 0 } } : {}),
    },
  }
}
