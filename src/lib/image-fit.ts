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
