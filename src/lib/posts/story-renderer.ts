/**
 * Story Renderer — Server-side rendering of template-based Stories.
 *
 * Flow:
 * 1. Fetch Page from database (with Template for projectId)
 * 2. Register project fonts with @napi-rs/canvas
 * 3. Convert Page → DesignData
 * 4. Apply slotValues (dynamic text/image overrides)
 * 5. Render via RenderEngine → PNG buffer (1080×1920)
 * 6. Upload to Vercel Blob
 * 7. Return URL
 *
 * Based on scripts/generate-creatives.ts pipeline (tested end-to-end).
 */

import { GlobalFonts } from '@napi-rs/canvas'
import { put } from '@vercel/blob'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'

import { db } from '@/lib/db'
import { renderDesignToPNG } from '@/lib/rendering/canvas-renderer'
import { convertPageToDesignData, applySlotValues } from './page-to-design-data'

// ─── Types ───────────────────────────────────────────────────────────

export interface RenderStoryResult {
  buffer: Buffer
  url: string
  width: number
  height: number
}

// ─── Font Management ─────────────────────────────────────────────────

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

async function registerProjectFonts(projectId: number): Promise<void> {
  const fonts = await db.customFont.findMany({ where: { projectId } })
  const fontDir = `/tmp/studio-lagosta-fonts/${projectId}`

  if (fonts.length === 0) return

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

  console.log(`[story-renderer] ${fonts.length} fonts registered for project ${projectId}`)
}

// ─── Main Render Function ────────────────────────────────────────────

/**
 * Render a Story image from a Page template.
 *
 * @param pageId - The Page record ID
 * @param postId - The SocialPost ID (used for blob path naming)
 * @param slotValues - Optional dynamic values to override layer content
 * @returns Buffer and uploaded URL
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

  const projectId = page.Template.projectId

  // 2. Register project fonts
  await registerProjectFonts(projectId)

  // 3. Convert Page → DesignData
  let designData = convertPageToDesignData({
    id: page.id,
    name: page.name,
    width: page.width,
    height: page.height,
    layers: page.layers,
    background: page.background,
  })

  // 4. Apply slot values if provided
  if (slotValues && Object.keys(slotValues).length > 0) {
    designData = applySlotValues(designData, slotValues)
  }

  // 5. Render to PNG
  console.log(`[story-renderer] Rendering page ${pageId} (${page.width}×${page.height})...`)
  const result = await renderDesignToPNG(designData)
  console.log(`[story-renderer] Rendered: ${(result.buffer.length / 1024).toFixed(0)} KB`)

  // 6. Upload to Vercel Blob
  const timestamp = Date.now()
  const blobPath = `posts/rendered/${postId}-${timestamp}.png`

  const blob = await put(blobPath, result.buffer, {
    access: 'public',
    contentType: 'image/png',
  })

  console.log(`[story-renderer] Uploaded: ${blob.url}`)

  return {
    buffer: result.buffer,
    url: blob.url,
    width: result.width,
    height: result.height,
  }
}
