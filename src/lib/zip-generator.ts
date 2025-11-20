'use client'

import JSZip from 'jszip'
import { saveAs } from 'file-saver'

export interface FileToDownload {
  id: string
  name: string
  url: string
  size?: number
}

interface DownloadOptions {
  onProgress?: (current: number, total: number) => void
  signal?: AbortSignal
}

export async function downloadFolderAsZip(files: FileToDownload[], folderName: string, options: DownloadOptions = {}) {
  const total = files.length
  if (!total) return

  const zip = new JSZip()
  const queue = [...files]
  let completed = 0
  const concurrency = Math.min(5, total)

  async function worker() {
    while (queue.length > 0) {
      if (options.signal?.aborted) {
        throw new DOMException('Download cancelado', 'AbortError')
      }

      const file = queue.shift()
      if (!file) return
      const response = await fetch(file.url)
      if (!response.ok) {
        throw new Error(`Falha ao baixar ${file.name}`)
      }
      const blob = await response.blob()
      zip.file(file.name, blob)
      completed += 1
      options.onProgress?.(completed, total)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  saveAs(zipBlob, `${folderName || 'drive-download'}.zip`)
}
