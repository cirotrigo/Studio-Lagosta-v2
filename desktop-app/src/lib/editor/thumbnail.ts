import { renderPageToDataUrl } from './render-page'
import type { KonvaPage } from '@/types/template'

// Thumbnail sizes for different use cases
const THUMBNAIL_SIZES = {
  small: 180,   // For pages bar, small lists
  medium: 360,  // For carousel, gallery cards (2x for retina)
  large: 540,   // For larger previews
} as const

export type ThumbnailSize = keyof typeof THUMBNAIL_SIZES

export async function renderPageThumbnail(
  page: KonvaPage,
  size: ThumbnailSize = 'medium',
): Promise<string> {
  const maxWidth = THUMBNAIL_SIZES[size]
  // Use JPEG for medium/large thumbnails (smaller file size, good for base64)
  const mimeType = size === 'small' ? 'image/png' : 'image/jpeg'
  const quality = size === 'small' ? 0.92 : 0.85

  try {
    // Use blob download in Electron to avoid CORS issues with external images
    const result = await renderPageToDataUrl(page, { maxWidth, mimeType, quality, preferBlobDownload: true })
    if (!result) {
      console.warn(`[Thumbnail] Empty result for page ${page.id} (${page.name})`)
    }
    return result
  } catch (error) {
    console.error(`[Thumbnail] Failed to render page ${page.id}:`, error)
    return ''
  }
}
