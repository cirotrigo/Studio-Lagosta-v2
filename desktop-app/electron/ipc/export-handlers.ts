import { ipcMain, app, dialog } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

const KONVA_EXPORT_CHANNELS = {
  EXPORT_SINGLE: 'konva:export:single',
  EXPORT_BATCH: 'konva:export:batch',
  EXPORT_PICK_DIRECTORY: 'konva:export:pick-directory',
} as const

export type ArtFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'

export interface ExportSinglePayload {
  imageData: string // base64 data URL or raw base64
  fileName: string
  format: ArtFormat
  mimeType: 'image/png' | 'image/jpeg'
  quality?: number
  outputDir?: string
}

export interface ExportSingleResult {
  ok: true
  filePath: string
  fileName: string
  sizeBytes: number
}

export interface ExportBatchPayload {
  items: Array<{
    imageData: string
    fileName: string
    format: ArtFormat
    variationIndex?: number
    pageIndex?: number
  }>
  mimeType: 'image/png' | 'image/jpeg'
  quality?: number
  outputDir?: string
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

const FORMAT_DIMENSIONS: Record<ArtFormat, { width: number; height: number }> = {
  STORY: { width: 1080, height: 1920 },
  FEED_PORTRAIT: { width: 1080, height: 1350 },
  SQUARE: { width: 1080, height: 1080 },
}

function getDefaultExportDir(): string {
  const pictures = app.getPath('pictures')
  return path.join(pictures, 'LagostaTools')
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true })
  } catch (error) {
    // ignore if already exists
  }
}

function extractBase64Data(dataUrlOrBase64: string): { data: string; mimeType: string } {
  if (dataUrlOrBase64.startsWith('data:')) {
    const matches = dataUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/)
    if (matches && matches[1] && matches[2]) {
      return { data: matches[2], mimeType: matches[1] }
    }
    throw new Error('Invalid data URL format')
  }
  // Assume raw base64, default to PNG
  return { data: dataUrlOrBase64, mimeType: 'image/png' }
}

async function processAndSaveImage(
  imageData: string,
  outputPath: string,
  format: ArtFormat,
  mimeType: 'image/png' | 'image/jpeg',
  quality: number,
): Promise<{ sizeBytes: number }> {
  const { data } = extractBase64Data(imageData)
  const buffer = Buffer.from(data, 'base64')

  try {
    const sharp = (await import('sharp')).default
    const dimensions = FORMAT_DIMENSIONS[format]

    // Get input metadata
    const inputMeta = await sharp(buffer).metadata()
    const inputWidth = inputMeta.width || dimensions.width
    const inputHeight = inputMeta.height || dimensions.height

    // Check if resize is needed
    const needsResize = inputWidth !== dimensions.width || inputHeight !== dimensions.height

    let pipeline = sharp(buffer)

    if (needsResize) {
      // Resize to exact dimensions, using 'fill' to ensure exact size without letterbox
      pipeline = pipeline.resize(dimensions.width, dimensions.height, {
        fit: 'fill',
        withoutEnlargement: false,
      })
      console.log(
        `[Export] Resizing from ${inputWidth}x${inputHeight} to ${dimensions.width}x${dimensions.height}`,
      )
    }

    let outputBuffer: Buffer
    if (mimeType === 'image/png') {
      outputBuffer = await pipeline.png({ compressionLevel: 6 }).toBuffer()
    } else {
      outputBuffer = await pipeline
        .jpeg({ quality, chromaSubsampling: '4:4:4' })
        .toBuffer()
    }

    await fs.writeFile(outputPath, outputBuffer)
    return { sizeBytes: outputBuffer.length }
  } catch (error) {
    console.warn('[Export] Sharp processing failed, using raw buffer:', error)
    await fs.writeFile(outputPath, buffer)
    return { sizeBytes: buffer.length }
  }
}

export function registerExportHandlers(): void {
  // Export single image
  ipcMain.handle(
    KONVA_EXPORT_CHANNELS.EXPORT_SINGLE,
    async (_event, payload: ExportSinglePayload): Promise<ExportSingleResult> => {
      const outputDir = payload.outputDir || getDefaultExportDir()
      await ensureDir(outputDir)

      const extension = payload.mimeType === 'image/png' ? '.png' : '.jpg'
      const fileName = payload.fileName.endsWith(extension)
        ? payload.fileName
        : `${payload.fileName}${extension}`
      const outputPath = path.join(outputDir, fileName)

      console.log('[Export Single] Processing:', fileName, 'Format:', payload.format)

      const { sizeBytes } = await processAndSaveImage(
        payload.imageData,
        outputPath,
        payload.format,
        payload.mimeType,
        payload.quality ?? 92,
      )

      console.log('[Export Single] Saved:', outputPath, 'Size:', sizeBytes)

      return {
        ok: true,
        filePath: outputPath,
        fileName,
        sizeBytes,
      }
    },
  )

  // Export batch of images
  ipcMain.handle(
    KONVA_EXPORT_CHANNELS.EXPORT_BATCH,
    async (_event, payload: ExportBatchPayload): Promise<ExportBatchResult> => {
      const outputDir = payload.outputDir || getDefaultExportDir()
      await ensureDir(outputDir)

      console.log('[Export Batch] Processing', payload.items.length, 'items')

      const extension = payload.mimeType === 'image/png' ? '.png' : '.jpg'
      const files: ExportBatchResult['files'] = []
      let totalBytes = 0

      for (const item of payload.items) {
        const fileName = item.fileName.endsWith(extension)
          ? item.fileName
          : `${item.fileName}${extension}`
        const outputPath = path.join(outputDir, fileName)

        try {
          const { sizeBytes } = await processAndSaveImage(
            item.imageData,
            outputPath,
            item.format,
            payload.mimeType,
            payload.quality ?? 92,
          )

          files.push({
            filePath: outputPath,
            fileName,
            sizeBytes,
            variationIndex: item.variationIndex,
            pageIndex: item.pageIndex,
          })

          totalBytes += sizeBytes
          console.log(
            `[Export Batch] Saved: ${fileName} (v${item.variationIndex ?? 0} p${item.pageIndex ?? 0})`,
          )
        } catch (error) {
          console.error(`[Export Batch] Failed to export ${fileName}:`, error)
          throw new Error(`Falha ao exportar ${fileName}: ${String(error)}`)
        }
      }

      console.log('[Export Batch] Completed:', files.length, 'files,', totalBytes, 'bytes total')

      return {
        ok: true,
        files,
        outputDir,
        totalBytes,
      }
    },
  )

  // Pick output directory
  ipcMain.handle(
    KONVA_EXPORT_CHANNELS.EXPORT_PICK_DIRECTORY,
    async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title: 'Selecionar pasta de destino',
        defaultPath: getDefaultExportDir(),
        properties: ['openDirectory', 'createDirectory'],
      })

      if (result.canceled || !result.filePaths[0]) {
        return null
      }

      return result.filePaths[0]
    },
  )

  console.log('[Export Handlers] Registered')
}

export { KONVA_EXPORT_CHANNELS }
