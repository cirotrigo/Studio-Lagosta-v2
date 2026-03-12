import type { ArtFormat } from '@/types/template'

/**
 * Normalizes a string segment for use in file names.
 * Removes accents, converts to lowercase, replaces non-alphanumeric characters with hyphens.
 */
function slugifySegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Generates a compact timestamp for file naming.
 * Format: YYYYMMDD-HHmmss
 */
function generateTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

/**
 * Maps ArtFormat to a short label for file naming.
 */
function formatToLabel(format: ArtFormat): string {
  switch (format) {
    case 'STORY':
      return 'story'
    case 'FEED_PORTRAIT':
      return 'feed'
    case 'SQUARE':
      return 'square'
    default:
      return 'arte'
  }
}

/**
 * Pads a number with leading zeros.
 */
function padIndex(value: number, digits = 2): string {
  return String(value).padStart(digits, '0')
}

export interface ExportFileNameParams {
  projectSlug?: string
  format: ArtFormat
  timestamp?: string
}

export interface BatchExportFileNameParams {
  projectSlug?: string
  format: ArtFormat
  variationIndex?: number
  pageIndex?: number
  totalPages?: number
  timestamp?: string
}

/**
 * Builds a standardized file name for single export.
 * Pattern: {projectSlug}_{format}_{timestamp}
 * Example: minha-pizzaria_story_20260311-143025
 *
 * Note: Extension is NOT included - it should be added by the caller based on mimeType.
 */
export function buildExportFileName(params: ExportFileNameParams): string {
  const projectSlug = slugifySegment(params.projectSlug || 'arte') || 'arte'
  const formatLabel = formatToLabel(params.format)
  const timestamp = params.timestamp || generateTimestamp()

  return `${projectSlug}_${formatLabel}_${timestamp}`
}

/**
 * Builds a standardized file name for batch/carousel export.
 * Pattern: {projectSlug}_{format}_{timestamp}_v{variationIndex}_p{pageIndex}
 * Example: minha-pizzaria_story_20260311-143025_v01_p01
 *
 * If only pageIndex is provided (single variation carousel):
 * Pattern: {projectSlug}_{format}_{timestamp}_p{pageIndex}
 *
 * If only variationIndex is provided (multiple variations, single page):
 * Pattern: {projectSlug}_{format}_{timestamp}_v{variationIndex}
 *
 * Note: Extension is NOT included - it should be added by the caller based on mimeType.
 */
export function buildBatchExportFileName(params: BatchExportFileNameParams): string {
  const projectSlug = slugifySegment(params.projectSlug || 'arte') || 'arte'
  const formatLabel = formatToLabel(params.format)
  const timestamp = params.timestamp || generateTimestamp()

  const baseName = `${projectSlug}_${formatLabel}_${timestamp}`

  const hasVariation = params.variationIndex !== undefined && params.variationIndex > 0
  const hasPage = params.pageIndex !== undefined && params.pageIndex > 0
  const isCarousel = (params.totalPages ?? 1) > 1

  // Build suffix based on what's provided
  const parts: string[] = [baseName]

  if (hasVariation) {
    parts.push(`v${padIndex(params.variationIndex!)}`)
  }

  // Only add page index if it's a carousel or if explicitly provided
  if (hasPage && (isCarousel || hasVariation)) {
    parts.push(`p${padIndex(params.pageIndex!)}`)
  }

  return parts.join('_')
}

/**
 * Legacy function for backward compatibility.
 * Builds a file name for Konva editor export.
 */
export function buildKonvaExportFileName(
  documentId: string,
  pageId: string,
  pageName: string,
  suffix?: string,
): string {
  const safePageName = slugifySegment(pageName) || 'pagina'
  const safeSuffix = suffix ? `-${slugifySegment(suffix) || 'item'}` : ''
  return `konva-${safePageName}${safeSuffix}-${documentId.slice(0, 8)}-${pageId.slice(0, 6)}.jpg`
}
