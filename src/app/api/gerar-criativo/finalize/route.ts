import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import type { Layer } from '@/types/template'

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
  dataUrl: z.string(), // Base64 encoded image from frontend Konva rendering
  images: z.record(imageSourceSchema),
  texts: z.record(z.string()),
  layers: z.array(layerSchema),
  hiddenLayerIds: z.array(z.string()).default([]),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { templateId, templatePageId, dataUrl, images, texts, layers, hiddenLayerIds } = finalizeSchema.parse(body)

    console.log('[Gerar Criativo Finalize] Processing for user:', userId)
    console.log('[Gerar Criativo Finalize] Has dataUrl:', !!dataUrl)
    console.log('[Gerar Criativo Finalize] Input layers count:', layers.length)

    // 1. Fetch model page and template with project
    const templatePage = await db.page.findFirst({
      where: { id: templatePageId, isTemplate: true },
      include: {
        Template: {
          include: {
            Project: true,
          },
        },
      },
    })

    if (!templatePage) {
      return NextResponse.json({ error: 'Template page not found' }, { status: 404 })
    }

    // 2. Process layers for storage (apply overrides)
    const visibleLayers = layers.filter((l) => !hiddenLayerIds.includes(l.id))
    const processedLayers = visibleLayers.map((layer: Record<string, unknown>) => {
      const newLayer = { ...layer }

      // Ensure layer has required position and size
      if (!newLayer.position || typeof newLayer.position !== 'object') {
        newLayer.position = { x: 0, y: 0 }
      }
      if (!newLayer.size || typeof newLayer.size !== 'object') {
        newLayer.size = { width: 100, height: 100 }
      }

      // Apply text overrides
      if ((layer.type === 'text' || layer.type === 'rich-text') && texts[layer.id as string]) {
        newLayer.content = texts[layer.id as string]
      }

      // Apply image overrides
      if ((layer.type === 'image' || layer.type === 'logo' || layer.type === 'element') && images[layer.id as string]) {
        newLayer.fileUrl = images[layer.id as string].url
      }

      return newLayer
    }) as Layer[]

    // 3. Convert dataURL to buffer and upload to Vercel Blob
    console.log('[Gerar Criativo Finalize] Uploading to Blob...')

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    if (!blobToken || blobToken.trim() === '') {
      console.error('[Gerar Criativo Finalize] BLOB_READ_WRITE_TOKEN not configured')
      return NextResponse.json(
        { error: 'Upload service not configured' },
        { status: 503 }
      )
    }

    // Extract base64 data from dataURL
    const base64Data = dataUrl.split(',')[1]
    if (!base64Data) {
      return NextResponse.json({ error: 'Invalid dataUrl format' }, { status: 400 })
    }

    const imageBuffer = Buffer.from(base64Data, 'base64')
    console.log('[Gerar Criativo Finalize] Image buffer size:', imageBuffer.length, 'bytes')

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

    // 4. Count existing pages for order
    const pageCount = await db.page.count({ where: { templateId } })

    // 5. Create new Page (isTemplate: false) with thumbnail
    const newPage = await db.page.create({
      data: {
        name: `Criativo ${new Date().toLocaleDateString('pt-BR')}`,
        width: templatePage.width,
        height: templatePage.height,
        layers: JSON.stringify(processedLayers),
        background: templatePage.background,
        thumbnail: blob.url,
        order: pageCount,
        templateId,
        isTemplate: false,
      },
    })

    console.log('[Gerar Criativo Finalize] Created page:', newPage.id)

    // 6. Create Generation record (this is what shows in project creatives)
    const generation = await db.generation.create({
      data: {
        templateId,
        projectId: templatePage.Template.projectId,
        status: 'COMPLETED',
        resultUrl: blob.url,
        fileName: blob.pathname,
        fieldValues: {
          images,
          texts,
          sourcePageId: templatePageId,
        },
        templateName: templatePage.Template.name,
        projectName: templatePage.Template.Project?.name,
        createdBy: userId,
        completedAt: new Date(),
      },
    })

    console.log('[Gerar Criativo Finalize] Created Generation:', generation.id)

    // 7. Create AICreativeGeneration record (for tracking template usage)
    const aiCreative = await db.aICreativeGeneration.create({
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

    console.log('[Gerar Criativo Finalize] Created AICreativeGeneration:', aiCreative.id)

    return NextResponse.json({
      success: true,
      id: generation.id,
      pageId: newPage.id,
      resultUrl: blob.url,
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
