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
