import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import {
  buildTemplateContextFromLayers,
  inferTemplateFormatFromDimensions,
} from '@/lib/gerar-criativo/template-context'
import { buildQuickGenerateImagePrompt } from '@/lib/gerar-criativo/quick-generate-image-prompt'
import { generateAiTextPayload } from '@/lib/ai/generate-ai-text-service'
import { generateStoredAiImage } from '@/lib/ai/generate-image-service'
import type { Layer } from '@/types/template'

export const runtime = 'nodejs'
export const maxDuration = 300

const requestSchema = z.object({
  modelPageId: z.string().min(1),
  prompt: z.string().trim().min(1).max(500),
  useKnowledgeBase: z.boolean().default(true),
  analyzeImageForContext: z.boolean().default(false),
  photoUrl: z.string().url().optional(),
  tone: z.enum(['casual', 'profissional', 'urgente', 'inspirador']).nullable().optional(),
  objective: z.enum(['promocao', 'institucional', 'agenda', 'oferta']).nullable().optional(),
})

export async function POST(request: Request) {
  const { userId: clerkUserId, orgId } = await auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  let body: z.infer<typeof requestSchema>
  try {
    body = requestSchema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: error.errors },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'Erro ao processar requisicao' }, { status: 400 })
  }

  try {
    const user = await getUserFromClerkId(clerkUserId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const modelPage = await db.page.findFirst({
      where: {
        id: body.modelPageId,
        isTemplate: true,
        OR: [
          {
            Template: {
              Project: {
                userId: user.id,
              },
            },
          },
          ...(orgId
            ? [{
                Template: {
                  Project: {
                    organizationProjects: {
                      some: {
                        organization: {
                          clerkOrgId: orgId,
                        },
                      },
                    },
                  },
                },
              }]
            : []),
        ],
      },
      select: {
        id: true,
        name: true,
        templateName: true,
        templateId: true,
        width: true,
        height: true,
        layers: true,
        Template: {
          select: {
            id: true,
            name: true,
            Project: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    })

    if (!modelPage) {
      return NextResponse.json({ error: 'Pagina modelo nao encontrada' }, { status: 404 })
    }

    const layers = (typeof modelPage.layers === 'string'
      ? JSON.parse(modelPage.layers)
      : modelPage.layers) as Layer[]

    const format = inferTemplateFormatFromDimensions(modelPage.width, modelPage.height)
    const templateContext = buildTemplateContextFromLayers({
      templateId: String(modelPage.templateId ?? modelPage.Template.id),
      templateName: modelPage.templateName || modelPage.Template.name,
      format,
      pageId: modelPage.id,
      pageName: modelPage.name,
      layers,
    })

    if (!templateContext) {
      return NextResponse.json(
        { error: 'Nao foi possivel extrair campos de texto dinamicos do template selecionado.' },
        { status: 422 },
      )
    }

    const dynamicImageLayers = layers.filter(
      (layer) => layer.type === 'image' && layer.isDynamic === true && layer.visible !== false,
    )

    const copyResult = await generateAiTextPayload(
      {
        projectId: modelPage.Template.Project.id,
        prompt: body.prompt,
        format,
        variations: 1,
        dryRun: false,
        useKnowledgeBase: body.useKnowledgeBase,
        templateIds: [String(modelPage.templateId ?? modelPage.Template.id)],
        includeLogo: true,
        usePhoto: Boolean(body.photoUrl),
        photoUrl: body.photoUrl,
        compositionEnabled: false,
        analyzeImageForContext: body.analyzeImageForContext,
        analysisImageUrl: body.photoUrl,
        objective: body.objective ?? null,
        tone: body.tone ?? null,
        templateContext,
      },
      { userId: clerkUserId, orgId },
    )

    const warnings = 'warnings' in copyResult ? [...copyResult.warnings] : []

    const firstVariation = 'variacoes' in copyResult ? (copyResult.variacoes[0] ?? null) : null
    const textValues = firstVariation
      ? Object.entries(templateContext.slotToLayerMap).reduce<Record<string, string>>((acc, [slotKey, layerId]) => {
          if (!layerId) return acc
          const value = firstVariation[slotKey as keyof typeof firstVariation]
          if (typeof value === 'string' && value.trim()) {
            acc[layerId] = value.trim()
          }
          return acc
        }, {})
      : {}

    let imageValues: Record<string, { type: 'ai-gallery'; url: string; aiImageId: string; prompt: string; model: 'nano-banana-pro' }> = {}
    let generatedImage: {
      id: string
      fileUrl: string
      prompt: string
      layerId: string
      model: 'nano-banana-pro'
    } | null = null

    if (dynamicImageLayers.length > 1) {
      warnings.push(
        `O template possui ${dynamicImageLayers.length} campos de imagem dinamicos. A Arte Rapida preencheu apenas o primeiro para revisao inicial.`,
      )
    }

    const targetImageLayer = dynamicImageLayers[0]
    if (targetImageLayer) {
      try {
        const imagePrompt = buildQuickGenerateImagePrompt({
          brief: body.prompt,
          format,
          templateContext,
          tone: body.tone ?? null,
          objective: body.objective ?? null,
        })

        const aiImage = await generateStoredAiImage({
          clerkUserId,
          orgId,
          projectId: modelPage.Template.Project.id,
          prompt: imagePrompt,
          aspectRatio: format === 'SQUARE' ? '1:1' : format === 'FEED_PORTRAIT' ? '4:5' : '9:16',
          model: 'nano-banana-pro',
          resolution: '1K',
          referenceImages: body.photoUrl ? [body.photoUrl] : undefined,
        })

        imageValues = {
          [targetImageLayer.id]: {
            type: 'ai-gallery',
            url: aiImage.fileUrl,
            aiImageId: aiImage.id,
            prompt: aiImage.prompt,
            model: 'nano-banana-pro',
          },
        }

        generatedImage = {
          id: aiImage.id,
          fileUrl: aiImage.fileUrl,
          prompt: aiImage.prompt,
          layerId: targetImageLayer.id,
          model: 'nano-banana-pro',
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao gerar imagem rapida'
        warnings.push(`A copy foi preenchida, mas a imagem nao foi gerada automaticamente: ${message}`)
      }
    }

    return NextResponse.json({
      templateContext,
      textValues,
      imageValues,
      generatedImage,
      warnings,
      copyPreview: firstVariation,
      copyResult,
    })
  } catch (error) {
    console.error('[quick-generate] Error:', error)
    const message = error instanceof Error ? error.message : 'Erro ao gerar copy rapida'
    const status = message === 'Projeto nao encontrado'
      ? 404
      : /credito|créditos|insufficient/i.test(message)
        ? 402
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
