import { renderPageToDataUrl } from './render-page'
import type { KonvaPage } from '@/types/template'

export async function renderPageThumbnail(page: KonvaPage): Promise<string> {
  return await renderPageToDataUrl(page, { maxWidth: 180, mimeType: 'image/png', quality: 0.92 })
}
