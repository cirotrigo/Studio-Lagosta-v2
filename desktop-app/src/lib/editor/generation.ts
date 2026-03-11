import { cloneKonvaDocument } from './document'
import { resolveCoverCrop, type CropFocus } from './image-fit'
import type { KonvaImageLayer, KonvaPage } from '@/types/template'

const VARIATION_FOCUSES: CropFocus[] = [
  { horizontal: 'center', vertical: 'center' },
  { horizontal: 'center', vertical: 'top' },
  { horizontal: 'center', vertical: 'bottom' },
  { horizontal: 'right', vertical: 'center' },
]

function findBackgroundLayer(page: KonvaPage): KonvaImageLayer | null {
  const explicitBackground =
    page.layers.find((layer) => layer.type === 'image' && layer.role === 'background') ?? null

  if (explicitBackground?.type === 'image') {
    return explicitBackground
  }

  const fullCanvasImage =
    page.layers.find(
      (layer) =>
        layer.type === 'image'
        && Math.abs((layer.width ?? 0) - page.width) <= 4
        && Math.abs((layer.height ?? 0) - page.height) <= 4,
    ) ?? null

  return fullCanvasImage?.type === 'image' ? fullCanvasImage : null
}

export async function readImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  if (!src) {
    return null
  }

  const resolveDimensions = async (imageSrc: string, useCrossOrigin = true) =>
    await new Promise<{ width: number; height: number } | null>((resolve) => {
      const image = new Image()
      if (useCrossOrigin) {
        image.crossOrigin = 'anonymous'
      }
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => resolve(null)
      image.src = imageSrc
    })

  const directDimensions = await resolveDimensions(src)
  if (directDimensions) {
    return directDimensions
  }

  if (
    !window.electronAPI?.downloadBlob ||
    src.startsWith('blob:') ||
    src.startsWith('data:') ||
    src.startsWith('/')
  ) {
    return null
  }

  try {
    const downloaded = await window.electronAPI.downloadBlob(src)
    if (!downloaded.ok || !downloaded.buffer) {
      return null
    }

    const blob = new Blob([downloaded.buffer], { type: downloaded.contentType || 'image/png' })
    const objectUrl = URL.createObjectURL(blob)

    try {
      return await resolveDimensions(objectUrl, false)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch (_error) {
    return null
  }
}

export async function createGeneratedPageVariant(
  page: KonvaPage,
  photoUrl: string,
  variationIndex: number,
): Promise<KonvaPage> {
  const nextPage = cloneKonvaDocument(page)
  const focus = VARIATION_FOCUSES[variationIndex % VARIATION_FOCUSES.length]
  const dimensions = await readImageDimensions(photoUrl)
  const crop =
    dimensions
      ? resolveCoverCrop(dimensions.width, dimensions.height, nextPage.width, nextPage.height, focus)
      : undefined

  const existingBackground = findBackgroundLayer(nextPage)

  if (existingBackground) {
    const updatedBackground: KonvaImageLayer = {
      ...existingBackground,
      src: photoUrl,
      x: 0,
      y: 0,
      width: nextPage.width,
      height: nextPage.height,
      fit: 'cover',
      crop,
      role: 'background',
      name: existingBackground.name || 'Fundo',
    }

    nextPage.layers = [
      updatedBackground,
      ...nextPage.layers.filter((layer) => layer.id !== existingBackground.id),
    ]
    return nextPage
  }

  const backgroundLayer: KonvaImageLayer = {
    id: crypto.randomUUID(),
    type: 'image',
    name: 'Fundo',
    role: 'background',
    x: 0,
    y: 0,
    width: nextPage.width,
    height: nextPage.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    draggable: true,
    src: photoUrl,
    fit: 'cover',
    crop,
  }

  nextPage.layers = [backgroundLayer, ...nextPage.layers]
  return nextPage
}
