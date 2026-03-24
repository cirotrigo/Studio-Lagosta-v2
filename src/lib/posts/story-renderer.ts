/**
 * Story Renderer — Server-side rendering of template-based Stories.
 *
 * Uses dynamic imports for @napi-rs/canvas to work in Vercel serverless.
 * Same pattern as src/lib/generation-utils.ts.
 */

import { put } from '@vercel/blob'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import { db } from '@/lib/db'
import { convertPageToDesignData, applySlotValues } from './page-to-design-data'

export interface RenderStoryResult {
  buffer: Buffer
  url: string
  width: number
  height: number
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject)
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

/**
 * Render a Story image from a Page template.
 * Uses dynamic import of CanvasRenderer to avoid bundling @napi-rs/canvas statically.
 */
export async function renderStoryImage(
  pageId: string,
  postId: string,
  slotValues?: Record<string, unknown>,
): Promise<RenderStoryResult> {
  // 1. Fetch page with template (for projectId)
  const page = await db.page.findUnique({
    where: { id: pageId },
    include: {
      Template: {
        select: { projectId: true },
      },
    },
  })

  if (!page) {
    throw new Error(`Page not found: ${pageId}`)
  }

  // 2. Convert Page → DesignData
  let designData = convertPageToDesignData({
    id: page.id,
    name: page.name,
    width: page.width,
    height: page.height,
    layers: page.layers,
    background: page.background,
  })

  // 3. Apply slot values if provided
  if (slotValues && Object.keys(slotValues).length > 0) {
    designData = applySlotValues(designData, slotValues)
  }

  // 4. Register project fonts (dynamic import to avoid static bundling)
  const projectId = page.Template.projectId
  await registerProjectFonts(projectId)

  // 5. Render to PNG using dynamic import (same pattern as generation-utils.ts)
  console.log(`[story-renderer] Rendering page ${pageId} (${page.width}×${page.height})...`)
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const renderer = new CanvasRenderer(designData.canvas.width, designData.canvas.height)
  const buffer = await renderer.renderDesign(designData, {})
  console.log(`[story-renderer] Rendered: ${(buffer.length / 1024).toFixed(0)} KB`)

  // 6. Upload to Vercel Blob
  const timestamp = Date.now()
  const blobPath = `posts/rendered/${postId}-${timestamp}.png`

  const blob = await put(blobPath, buffer, {
    access: 'public',
    contentType: 'image/png',
  })

  console.log(`[story-renderer] Uploaded: ${blob.url}`)

  return {
    buffer,
    url: blob.url,
    width: designData.canvas.width,
    height: designData.canvas.height,
  }
}

/**
 * Register project custom fonts via dynamic import of GlobalFonts.
 */
async function registerProjectFonts(projectId: number): Promise<void> {
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
        console.warn(`[story-renderer] Failed to download font ${font.fontFamily}:`, error)
        continue
      }
    }

    try {
      GlobalFonts.registerFromPath(filePath, font.fontFamily)
    } catch {
      // Font may already be registered
    }
  }

  console.log(`[story-renderer] ${fonts.length} fonts processed for project ${projectId}`)
}
