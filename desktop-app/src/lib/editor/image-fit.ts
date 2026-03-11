import type { KonvaImageLayer } from '@/types/template'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropFocus {
  horizontal: 'left' | 'center' | 'right'
  vertical: 'top' | 'center' | 'bottom'
}

const DEFAULT_FOCUS: CropFocus = {
  horizontal: 'center',
  vertical: 'center',
}

export function resolveCoverCrop(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
  focus: CropFocus = DEFAULT_FOCUS,
): CropRect {
  const imageRatio = imageWidth / imageHeight
  const targetRatio = targetWidth / targetHeight

  if (imageRatio > targetRatio) {
    const cropWidth = imageHeight * targetRatio
    const maxOffset = Math.max(0, imageWidth - cropWidth)
    const offsetX =
      focus.horizontal === 'left'
        ? 0
        : focus.horizontal === 'right'
          ? maxOffset
          : maxOffset / 2

    return {
      x: Math.round(offsetX),
      y: 0,
      width: Math.round(cropWidth),
      height: imageHeight,
    }
  }

  const cropHeight = imageWidth / targetRatio
  const maxOffset = Math.max(0, imageHeight - cropHeight)
  const offsetY =
    focus.vertical === 'top'
      ? 0
      : focus.vertical === 'bottom'
        ? maxOffset
        : maxOffset / 2

  return {
    x: 0,
    y: Math.round(offsetY),
    width: imageWidth,
    height: Math.round(cropHeight),
  }
}

export function resolveImageCrop(
  layer: Pick<KonvaImageLayer, 'fit' | 'crop'>,
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
  focus: CropFocus = DEFAULT_FOCUS,
): CropRect | undefined {
  if (layer.crop) {
    return layer.crop
  }

  if ((layer.fit ?? 'cover') !== 'cover') {
    return undefined
  }

  return resolveCoverCrop(imageWidth, imageHeight, targetWidth, targetHeight, focus)
}

export function resolveContainPlacement(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const scale = Math.min(targetWidth / imageWidth, targetHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale

  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  }
}
