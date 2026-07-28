/**
 * Story Renderer — Server-side rendering of template-based Stories.
 *
 * Uses dynamic imports for @napi-rs/canvas to work in Vercel serverless.
 * Same pattern as src/lib/generation-utils.ts.
 */

import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { convertPageToDesignData, applySlotValues } from './page-to-design-data'
import { registerProjectFonts } from './register-project-fonts'

export interface RenderStoryResult {
  buffer: Buffer
  url: string
  width: number
  height: number
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

  // Guard: o render server-side é imagem estática. Camada de vídeo sairia como
  // buraco transparente em silêncio (render-engine ignora o type 'video') e o
  // post publicaria arte furada com status RENDERED.
  if (designData.layers.some((layer) => layer?.type === 'video')) {
    throw new Error(
      `Página ${pageId} contém camada de vídeo — o render server-side gera imagem estática. ` +
        'Exporte o vídeo pelo editor e agende o MP4 pela aba Criativos.',
    )
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
