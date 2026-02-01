import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import { RenderEngine, type ImageLoader } from '@/lib/render-engine'
import type { DesignData, Layer } from '@/types/template'

export const runtime = 'nodejs'
export const maxDuration = 120

const imageSourceSchema = z.object({
  type: z.string(),
  url: z.string(),
  aiImageId: z.string().optional(),
  pathname: z.string().optional(),
  prompt: z.string().optional(),
  driveFileId: z.string().optional(),
})

const layerSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
}).passthrough()

const finalizeSchema = z.object({
  templateId: z.number(),
  templatePageId: z.string(),
  images: z.record(imageSourceSchema),
  texts: z.record(z.string()),
  layers: z.array(layerSchema),
  hiddenLayerIds: z.array(z.string()).default([]),
})

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { templateId, templatePageId, images, texts, layers, hiddenLayerIds } = finalizeSchema.parse(body)

    console.log('[Gerar Criativo Finalize] Processing for user:', userId)

    // 1. Fetch model page and template
    const templatePage = await db.page.findFirst({
      where: { id: templatePageId, isTemplate: true },
      include: { Template: true },
    })

    if (!templatePage) {
      return NextResponse.json({ error: 'Template page not found' }, { status: 404 })
    }

    // 2. Process layers: apply images, texts, remove hidden
    const visibleLayers = layers.filter((l) => !hiddenLayerIds.includes(l.id))
    const processedLayers = visibleLayers.map((layer: Record<string, unknown>) => {
      const newLayer = { ...layer }

      // Apply text overrides
      if ((layer.type === 'text' || layer.type === 'rich-text') && texts[layer.id as string]) {
        newLayer.content = texts[layer.id as string]
      }

      // Apply image overrides (for isDynamic layers)
      if (layer.type === 'image' && layer.isDynamic && images[layer.id as string]) {
        newLayer.fileUrl = images[layer.id as string].url
      }

      return newLayer
    }) as Layer[]

    // 3. Render the final creative image
    console.log('[Gerar Criativo Finalize] Rendering creative...')

    const designData: DesignData = {
      canvas: {
        width: templatePage.width,
        height: templatePage.height,
        backgroundColor: templatePage.background || '#ffffff',
      },
      layers: processedLayers,
    }

    // Import canvas library for server-side rendering
    const { createCanvas, loadImage } = await import('@napi-rs/canvas')

    const canvas = createCanvas(templatePage.width, templatePage.height)
    const ctx = canvas.getContext('2d')

    // Image loader for server-side rendering
    const imageLoader: ImageLoader = async (url: string) => {
      try {
        const img = await loadImage(url)
        return img as unknown as CanvasImageSource
      } catch (error) {
        console.error('[Gerar Criativo Finalize] Failed to load image:', url, error)
        // Return placeholder
        const placeholderCanvas = createCanvas(100, 100)
        const placeholderCtx = placeholderCanvas.getContext('2d')
        placeholderCtx.fillStyle = '#f5f5f5'
        placeholderCtx.fillRect(0, 0, 100, 100)
        return placeholderCanvas as unknown as CanvasImageSource
      }
    }

    await RenderEngine.renderDesign(
      ctx as unknown as CanvasRenderingContext2D,
      designData,
      {},
      {
        scaleFactor: 1,
        imageLoader,
        imageCache: new Map(),
      }
    )

    // Convert canvas to PNG buffer
    const imageBuffer = canvas.toBuffer('image/png')
    console.log('[Gerar Criativo Finalize] Rendered image size:', imageBuffer.length, 'bytes')

    // 4. Upload to Vercel Blob
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    if (!blobToken || blobToken.trim() === '') {
      console.error('[Gerar Criativo Finalize] BLOB_READ_WRITE_TOKEN not configured')
      return NextResponse.json(
        { error: 'Upload service not configured' },
        { status: 503 }
      )
    }

    const timestamp = Date.now()
    const blob = await put(
      `creatives/${userId}/${timestamp}-creative.png`,
      imageBuffer,
      {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/png',
      }
    )

    console.log('[Gerar Criativo Finalize] Uploaded to Blob:', blob.url)

    // 5. Count existing pages for order
    const pageCount = await db.page.count({ where: { templateId } })

    // 6. Create new Page (isTemplate: false) with thumbnail
    const newPage = await db.page.create({
      data: {
        name: `Criativo ${new Date().toLocaleDateString('pt-BR')}`,
        width: templatePage.width,
        height: templatePage.height,
        layers: JSON.stringify(processedLayers),
        background: templatePage.background,
        thumbnail: blob.url, // Save the rendered image as thumbnail
        order: pageCount,
        templateId,
        isTemplate: false,
      },
    })

    console.log('[Gerar Criativo Finalize] Created page:', newPage.id)

    // 7. Create AICreativeGeneration record
    const creative = await db.aICreativeGeneration.create({
      data: {
        projectId: templatePage.Template.projectId,
        templateId,
        pageId: newPage.id,
        layoutType: `template:${templatePageId}`,
        imageSource: JSON.stringify(images),
        textsData: JSON.stringify(texts),
        creditsUsed: 0,
        createdBy: userId,
      },
    })

    console.log('[Gerar Criativo Finalize] Created AICreativeGeneration:', creative.id)

    return NextResponse.json({
      success: true,
      id: creative.id,
      pageId: newPage.id,
      resultUrl: blob.url, // Return the actual rendered image URL
    })
  } catch (error) {
    console.error('[Gerar Criativo Finalize] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Falha ao gerar criativo' }, { status: 500 })
  }
}
