import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { validateUserAuthentication } from '@/lib/auth-utils'
import { validateCreditsForFeature, deductCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { getLayoutById } from '@/lib/ai-creative-generator/layout-templates'
import { loadBrandAssets } from '@/lib/ai-creative-generator/brand-assets-loader'
import { buildKonvaLayers } from '@/lib/ai-creative-generator/template-page-builder'
import Replicate from 'replicate'

export const runtime = 'nodejs'
export const maxDuration = 120

// Schema de validação para fontes de imagem
const ImageSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ai-generate'),
    prompt: z.string().min(1),
    references: z.array(z.string()).optional(),
    model: z.enum(['nano-banana', 'nano-banana-pro']),
  }),
  z.object({
    type: z.literal('google-drive'),
    fileId: z.string(),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal('ai-gallery'),
    aiImageId: z.string(),
    url: z.string().url(),
  }),
])

// Schema principal
const GenerateCreativeSchema = z.object({
  projectId: z.number(),
  templateId: z.number(),
  layoutId: z.enum(['story-promo', 'story-default', 'story-minimal']),
  imageSource: ImageSourceSchema,
  texts: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    hours: z.string().optional(),
    cta: z.string().optional(),
    address: z.string().optional(),
  }),
})

export async function POST(request: Request) {
  try {
    // 1. Autenticação
    const userId = await validateUserAuthentication()
    const { orgId } = await auth()

    // 2. Validação do payload
    const body = await request.json()
    const validated = GenerateCreativeSchema.parse(body)

    // 3. Verificar ownership do projeto
    const project = await db.project.findUnique({
      where: { id: validated.projectId },
    })

    if (!project || project.userId !== userId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 4. Verificar ownership do template
    const template = await db.template.findUnique({
      where: { id: validated.templateId },
    })

    if (!template || template.projectId !== validated.projectId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // 5. Resolver fonte da imagem
    let backgroundUrl: string
    let creditsUsed = 0

    if (validated.imageSource.type === 'ai-generate') {
      // Validar créditos
      const creditsNeeded = validated.imageSource.model === 'nano-banana-pro' ? 15 : 10

      try {
        await validateCreditsForFeature(userId, 'ai_image_generation', 1, {
          organizationId: orgId || undefined,
        })
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          return NextResponse.json(
            {
              error: 'insufficient_credits',
              required: error.required,
              available: error.available,
            },
            { status: 402 }
          )
        }
        throw error
      }

      // Gerar imagem com Replicate
      const replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN!,
      })

      const modelVersion =
        validated.imageSource.model === 'nano-banana-pro'
          ? '81a5073adeced23b51ae9f85cd86c88954e7f25d7894eea0c7ebbc0c24d6831a' // Nano Banana Pro
          : 'd05a591283da31be3eea28d5634ef9e26989b351718b6489bd308426ebd0a3e8' // Nano Banana

      const prediction = await replicate.predictions.create({
        version: modelVersion,
        input: {
          prompt: validated.imageSource.prompt,
          aspect_ratio: '9:16',
          output_format: 'png',
          image_input: validated.imageSource.references || [],
        },
      })

      // Aguardar conclusão
      let finalPrediction = prediction
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        finalPrediction = await replicate.predictions.get(prediction.id)
        if (
          finalPrediction.status === 'succeeded' ||
          finalPrediction.status === 'failed'
        ) {
          break
        }
      }

      if (
        finalPrediction.status !== 'succeeded' ||
        !finalPrediction.output
      ) {
        return NextResponse.json(
          { error: 'AI generation failed' },
          { status: 500 }
        )
      }

      backgroundUrl = Array.isArray(finalPrediction.output)
        ? finalPrediction.output[0]
        : finalPrediction.output

      // Deduzir créditos
      await deductCreditsForFeature({
        clerkUserId: userId,
        feature: 'ai_image_generation',
        quantity: 1,
        details: { model: validated.imageSource.model },
        organizationId: orgId || undefined,
      })

      creditsUsed = creditsNeeded
    } else if (validated.imageSource.type === 'google-drive') {
      backgroundUrl = validated.imageSource.url
    } else if (validated.imageSource.type === 'ai-gallery') {
      const aiImage = await db.aIGeneratedImage.findUnique({
        where: { id: validated.imageSource.aiImageId },
      })

      if (!aiImage || aiImage.projectId !== validated.projectId) {
        return NextResponse.json(
          { error: 'AI image not found' },
          { status: 404 }
        )
      }

      backgroundUrl = aiImage.fileUrl
    } else {
      return NextResponse.json(
        { error: 'Invalid image source' },
        { status: 400 }
      )
    }

    // 6. Carregar assets da marca
    const brandAssets = await loadBrandAssets(validated.projectId)

    // 7. Buscar layout
    const layout = getLayoutById(validated.layoutId)

    // 8. Construir layers
    const { layers, bindings } = await buildKonvaLayers({
      layout,
      backgroundImageUrl: backgroundUrl,
      brandAssets,
      texts: validated.texts,
    })

    // 9. Buscar ordem máxima
    const maxOrderPage = await db.page.findFirst({
      where: { templateId: validated.templateId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    // 10. Criar Page
    const newPage = await db.page.create({
      data: {
        templateId: validated.templateId,
        name: `${layout.name} - ${new Date().toLocaleDateString()}`,
        width: layout.dimensions.width,
        height: layout.dimensions.height,
        order: (maxOrderPage?.order || 0) + 1,
        layers: layers as any,
        background: '#000000',
      },
    })

    // 11. Atualizar template
    await db.template.update({
      where: { id: validated.templateId },
      data: { updatedAt: new Date() },
    })

    // 12. Registrar geração
    await db.aICreativeGeneration.create({
      data: {
        projectId: validated.projectId,
        templateId: validated.templateId,
        pageId: newPage.id,
        layoutType: validated.layoutId,
        imageSource: validated.imageSource as any,
        textsData: validated.texts as any,
        creditsUsed,
        createdBy: userId,
      },
    })

    // 13. Retornar
    return NextResponse.json({
      success: true,
      pageId: newPage.id,
      layerBindings: bindings,
      creditsUsed,
    })
  } catch (error) {
    console.error('[AI Creative Generator] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', issues: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
