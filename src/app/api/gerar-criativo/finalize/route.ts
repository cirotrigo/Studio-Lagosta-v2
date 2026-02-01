import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

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
      if (layer.type === 'text' && texts[layer.id as string]) {
        newLayer.content = texts[layer.id as string]
      }

      // Apply image overrides (for isDynamic layers)
      if (layer.type === 'image' && layer.isDynamic && images[layer.id as string]) {
        newLayer.fileUrl = images[layer.id as string].url
      }

      return newLayer
    })

    // 3. Count existing pages for order
    const pageCount = await db.page.count({ where: { templateId } })

    // 4. Create new Page (isTemplate: false)
    const newPage = await db.page.create({
      data: {
        name: `Criativo ${new Date().toLocaleDateString('pt-BR')}`,
        width: templatePage.width,
        height: templatePage.height,
        layers: JSON.stringify(processedLayers),
        background: templatePage.background,
        order: pageCount,
        templateId,
        isTemplate: false,
      },
    })

    console.log('[Gerar Criativo Finalize] Created page:', newPage.id)

    // 5. Get preview URL from first image layer or template
    const previewUrl = processedLayers.find((l) => l.type === 'image')?.fileUrl as string
      || templatePage.thumbnail
      || ''

    // 6. Create AICreativeGeneration record
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
      resultUrl: previewUrl,
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
