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
  style?: Pick<LayerStyle, 'objectFit' | 'cropPosition'>,
): CropData | undefined {
  if (!natural.width || !natural.height || !box.width || !box.height) return undefined

  // O editor só recorta quando objectFit é EXPLICITAMENTE 'cover' (ImageNode);
  // sem objectFit o KonvaImage estica — o render precisa fazer o mesmo, não
  // assumir cover por padrão como fazia antes.
  if (style?.objectFit !== 'cover') return undefined

  return calculateImageCrop(natural, box, style?.cropPosition ?? 'center-middle')
}
