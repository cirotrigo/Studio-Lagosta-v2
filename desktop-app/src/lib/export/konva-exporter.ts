import { renderPageToDataUrl } from '@/lib/editor/render-page'
import {
  buildExportFileName,
  buildBatchExportFileName,
  type ExportFileNameParams,
  type BatchExportFileNameParams,
} from '@/lib/editor/export-file-name'
import type { KonvaPage, KonvaTemplateDocument, ArtFormat } from '@/types/template'

export type ExportMimeType = 'image/png' | 'image/jpeg'

export interface ExportSingleOptions {
  page: KonvaPage
  format: ArtFormat
  projectSlug?: string
  mimeType?: ExportMimeType
  quality?: number
  outputDir?: string
}

export interface ExportSingleResult {
  ok: true
  filePath: string
  fileName: string
  sizeBytes: number
}

export interface ExportBatchOptions {
  document: KonvaTemplateDocument
  projectSlug?: string
  mimeType?: ExportMimeType
  quality?: number
  outputDir?: string
  pages?: KonvaPage[] // optional subset of pages
}

export interface ExportBatchResult {
  ok: true
  files: Array<{
    filePath: string
    fileName: string
    sizeBytes: number
    variationIndex?: number
    pageIndex?: number
  }>
  outputDir: string
  totalBytes: number
}

export interface ExportVariationsOptions {
  variations: Array<{
    document: KonvaTemplateDocument
    variationIndex: number
  }>
  projectSlug?: string
  mimeType?: ExportMimeType
  quality?: number
  outputDir?: string
}

export interface ExportVariationsResult {
  ok: true
  files: Array<{
    filePath: string
    fileName: string
    sizeBytes: number
    variationIndex: number
    pageIndex: number
  }>
  outputDir: string
  totalBytes: number
}

async function renderPageToFullResolution(page: KonvaPage): Promise<string> {
  // Render at full resolution (page.width) without scaling down
  return renderPageToDataUrl(page, {
    maxWidth: page.width,
    mimeType: 'image/png', // Always render as PNG, let the export handler convert
    quality: 1.0,
    preferBlobDownload: true,
  })
}

export async function exportSingle(options: ExportSingleOptions): Promise<ExportSingleResult> {
  const {
    page,
    format,
    projectSlug = 'arte',
    mimeType = 'image/jpeg',
    quality = 92,
    outputDir,
  } = options

  if (!window.electronAPI) {
    throw new Error('Export requer ambiente Electron')
  }

  // Render page to data URL at full resolution
  const imageData = await renderPageToFullResolution(page)
  if (!imageData) {
    throw new Error('Falha ao renderizar a pagina para export')
  }

  // Build file name
  const fileNameParams: ExportFileNameParams = {
    projectSlug,
    format,
  }
  const fileName = buildExportFileName(fileNameParams)

  // Send to main process for saving
  const result = await (window.electronAPI as any).exportSingle({
    imageData,
    fileName,
    format,
    mimeType,
    quality,
    outputDir,
  })

  return result
}

export async function exportBatch(options: ExportBatchOptions): Promise<ExportBatchResult> {
  const {
    document,
    projectSlug = 'arte',
    mimeType = 'image/jpeg',
    quality = 92,
    outputDir,
    pages: pagesSubset,
  } = options

  if (!window.electronAPI) {
    throw new Error('Export requer ambiente Electron')
  }

  const pagesToExport = pagesSubset || document.design.pages
  const sortedPages = [...pagesToExport].sort((a, b) => a.order - b.order)

  const items: Array<{
    imageData: string
    fileName: string
    format: ArtFormat
    variationIndex?: number
    pageIndex?: number
  }> = []

  for (let pageIndex = 0; pageIndex < sortedPages.length; pageIndex++) {
    const page = sortedPages[pageIndex]

    const imageData = await renderPageToFullResolution(page)
    if (!imageData) {
      console.warn(`[Export Batch] Falha ao renderizar pagina ${pageIndex + 1}`)
      continue
    }

    const fileNameParams: BatchExportFileNameParams = {
      projectSlug,
      format: document.format,
      pageIndex: pageIndex + 1,
      totalPages: sortedPages.length,
    }
    const fileName = buildBatchExportFileName(fileNameParams)

    items.push({
      imageData,
      fileName,
      format: document.format,
      pageIndex: pageIndex + 1,
    })
  }

  if (items.length === 0) {
    throw new Error('Nenhuma pagina renderizada para export')
  }

  const result = await (window.electronAPI as any).exportBatch({
    items,
    mimeType,
    quality,
    outputDir,
  })

  return result
}

export async function exportVariations(
  options: ExportVariationsOptions,
): Promise<ExportVariationsResult> {
  const {
    variations,
    projectSlug = 'arte',
    mimeType = 'image/jpeg',
    quality = 92,
    outputDir,
  } = options

  if (!window.electronAPI) {
    throw new Error('Export requer ambiente Electron')
  }

  const items: Array<{
    imageData: string
    fileName: string
    format: ArtFormat
    variationIndex?: number
    pageIndex?: number
  }> = []

  for (const { document, variationIndex } of variations) {
    const sortedPages = [...document.design.pages].sort((a, b) => a.order - b.order)

    for (let pageIndex = 0; pageIndex < sortedPages.length; pageIndex++) {
      const page = sortedPages[pageIndex]

      const imageData = await renderPageToFullResolution(page)
      if (!imageData) {
        console.warn(
          `[Export Variations] Falha ao renderizar v${variationIndex} p${pageIndex + 1}`,
        )
        continue
      }

      const fileNameParams: BatchExportFileNameParams = {
        projectSlug,
        format: document.format,
        variationIndex: variationIndex + 1,
        pageIndex: pageIndex + 1,
        totalPages: sortedPages.length,
      }
      const fileName = buildBatchExportFileName(fileNameParams)

      items.push({
        imageData,
        fileName,
        format: document.format,
        variationIndex: variationIndex + 1,
        pageIndex: pageIndex + 1,
      })
    }
  }

  if (items.length === 0) {
    throw new Error('Nenhuma variacao renderizada para export')
  }

  const result = await (window.electronAPI as any).exportBatch({
    items,
    mimeType,
    quality,
    outputDir,
  })

  return result
}

export async function pickExportDirectory(): Promise<string | null> {
  if (!window.electronAPI) {
    return null
  }

  return (window.electronAPI as any).pickExportDirectory()
}
