/**
 * Registers a project's custom fonts with @napi-rs/canvas so server-side
 * renders (stories, arte rápida) use the brand typefaces instead of falling
 * back to a system font.
 *
 * Fonts are cached on disk under /tmp so repeated renders in the same
 * serverless instance skip the download.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import { db } from '@/lib/db'

export function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchBuffer(res.headers.location).then(resolve).catch(reject)
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

export async function registerProjectFonts(projectId: number): Promise<void> {
  const fonts = await db.customFont.findMany({ where: { projectId } })
  if (fonts.length === 0) return

  // Dynamic import to avoid static bundling of @napi-rs/canvas
  const { GlobalFonts } = await import('@napi-rs/canvas')
  const fontDir = `/tmp/studio-lagosta-fonts/${projectId}`

  if (!fs.existsSync(fontDir)) {
    fs.mkdirSync(fontDir, { recursive: true })
  }

  for (const font of fonts) {
    const ext = path.extname(font.fileUrl) || '.otf'
    const filePath = path.join(fontDir, `${font.fontFamily}${ext}`)

    if (!fs.existsSync(filePath)) {
      try {
        const buf = await fetchBuffer(font.fileUrl)
        fs.writeFileSync(filePath, buf)
      } catch (error) {
        console.warn(`[fonts] Failed to download font ${font.fontFamily}:`, error)
        continue
      }
    }

    try {
      GlobalFonts.registerFromPath(filePath, font.fontFamily)
    } catch {
      // Font may already be registered
    }
  }

  console.log(`[fonts] ${fonts.length} fonts processed for project ${projectId}`)
}
