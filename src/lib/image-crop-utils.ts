/**
 * Utilitários para cálculo de crop de imagens
 * Baseado no exemplo oficial do Konva.js: https://konvajs.org/docs/sandbox/Scale_Image_To_Fit.html
 *
 * Implementa comportamento similar ao CSS object-fit: cover
 * - Imagem sempre preenche o container
 * - Aspect ratio da imagem original é mantido
 * - Partes da imagem que excedem o container são cropadas
 */

export type CropPosition =
  | 'left-top'
  | 'center-top'
  | 'right-top'
  | 'left-middle'
  | 'center-middle'
  | 'right-middle'
  | 'left-bottom'
  | 'center-bottom'
  | 'right-bottom'

export interface ImageSize {
  width: number
  height: number
}

export interface CropData {
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
}

/**
 * Calcula as coordenadas de crop para exibir uma imagem sem distorção
 * dentro de um container com dimensões diferentes.
 *
 * Comportamento (object-fit: cover):
 * - Se container for mais largo que imagem: crop vertical (topo/centro/baixo)
 * - Se container for mais alto que imagem: crop horizontal (esquerda/centro/direita)
 *
 * @param image - Dimensões originais da imagem
 * @param container - Dimensões do container/área de exibição
 * @param position - Posição do crop (padrão: 'center-middle')
 * @returns Coordenadas de crop na imagem original
 *
 * @example
 * // Imagem 1000x500 em container 400x400
 * // Container é mais quadrado que imagem (precisa crop horizontal)
 * const crop = calculateImageCrop(
 *   { width: 1000, height: 500 },
 *   { width: 400, height: 400 },
 *   'center-middle'
 * )
 * // crop = { cropX: 250, cropY: 0, cropWidth: 500, cropHeight: 500 }
 * // Resultado: pega 500x500 do centro da imagem
 */
export function calculateImageCrop(
  image: ImageSize,
  container: ImageSize,
  position: CropPosition = 'center-middle'
): CropData {
  const containerAspectRatio = container.width / container.height
  const imageAspectRatio = image.width / image.height

  let cropWidth: number
  let cropHeight: number

  // Determinar se precisa crop horizontal ou vertical
  if (containerAspectRatio >= imageAspectRatio) {
    // Container é mais largo que imagem (proporcionalmente)
    // Crop vertical - usar toda largura da imagem
    cropWidth = image.width
    cropHeight = image.width / containerAspectRatio
  } else {
    // Container é mais alto que imagem (proporcionalmente)
    // Crop horizontal - usar toda altura da imagem
    cropWidth = image.height * containerAspectRatio
    cropHeight = image.height
  }

  // Calcular posição do crop baseado em 'position'
  let cropX = 0
  let cropY = 0

  // Posicionamento horizontal (left, center, right)
  const [horizontal, vertical] = position.split('-') as [string, string]

  if (horizontal === 'left') {
    cropX = 0
  } else if (horizontal === 'center') {
    cropX = (image.width - cropWidth) / 2
  } else if (horizontal === 'right') {
    cropX = image.width - cropWidth
  }

  // Posicionamento vertical (top, middle, bottom)
  if (vertical === 'top') {
    cropY = 0
  } else if (vertical === 'middle') {
    cropY = (image.height - cropHeight) / 2
  } else if (vertical === 'bottom') {
    cropY = image.height - cropHeight
  }

  return {
    cropX: Math.max(0, cropX),
    cropY: Math.max(0, cropY),
    cropWidth: Math.min(cropWidth, image.width),
    cropHeight: Math.min(cropHeight, image.height),
  }
}

/**
 * Verifica se uma imagem precisa de crop para caber em um container
 * sem distorção (object-fit: cover).
 *
 * @param image - Dimensões originais da imagem
 * @param container - Dimensões do container
 * @returns true se os aspect ratios forem diferentes
 */
export function needsCrop(image: ImageSize, container: ImageSize): boolean {
  const containerRatio = container.width / container.height
  const imageRatio = image.width / image.height
  const tolerance = 0.01 // 1% de tolerância para evitar problemas de arredondamento
  return Math.abs(containerRatio - imageRatio) > tolerance
}

/**
 * Calcula o scale necessário para fazer fit (contain) de uma imagem
 * dentro de um container.
 *
 * @param image - Dimensões originais da imagem
 * @param container - Dimensões do container
 * @returns Scale factor
 */
export function calculateContainScale(
  image: ImageSize,
  container: ImageSize
): number {
  const scaleX = container.width / image.width
  const scaleY = container.height / image.height
  return Math.min(scaleX, scaleY)
}

/**
 * Calcula o scale necessário para fazer cover de uma imagem
 * dentro de um container.
 *
 * @param image - Dimensões originais da imagem
 * @param container - Dimensões do container
 * @returns Scale factor
 */
export function calculateCoverScale(
  image: ImageSize,
  container: ImageSize
): number {
  const scaleX = container.width / image.width
  const scaleY = container.height / image.height
  return Math.max(scaleX, scaleY)
}
