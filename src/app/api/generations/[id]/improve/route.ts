import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { validateCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { getCurrentImageModel } from '@/lib/ai/openai-image-client'
import {
  inferFormatFromTemplate,
  OPENAI_INPUT_SIZE,
  FINAL_OUTPUT_SIZE,
} from '@/lib/ai/creative-improvement-format'
import { processImprovementInBackground } from '@/lib/ai/creative-improvement-runner'
import {
  MAX_SELECTED_LOGOS,
  MAX_SELECTED_ELEMENTS,
} from '@/lib/ai/improvement-assets-constants'

export const runtime = 'nodejs'
export const maxDuration = 300

// userRequest é opcional — quando vazio, aplica apenas as diretrizes do
// Diretor de Arte sem mudanças de conteúdo. O cliente do OpenAI lida com isso
// substituindo a seção [PEDIDO DO CLIENTE] por uma instrução padrão.
const bodySchema = z.object({
  userRequest: z.string().max(500).default(''),
  backgroundImageUrl: z.string().url().optional().nullable(),
  selectedLogoIds: z
    .array(z.number().int().positive())
    .max(MAX_SELECTED_LOGOS)
    .optional()
    .default([]),
  selectedElementIds: z
    .array(z.number().int().positive())
    .max(MAX_SELECTED_ELEMENTS)
    .optional()
    .default([]),
  /**
   * Post da agenda que deve receber a arte melhorada ao final. Regra de
   * negócio: só post APROVADO (status SCHEDULED) pode ser melhorado — rascunho
   * se edita, não se melhora.
   */
  applyToPostId: z.string().min(1).optional().nullable(),
  /**
   * Fonte da imagem a melhorar, quando diferente do resultUrl da Generation —
   * um post pode ter sido re-renderizado pelo cron depois que a Generation foi
   * criada, e o que se melhora é a arte que está NO POST.
   */
  sourceImageUrl: z.string().url().optional().nullable(),
})

const VERCEL_BLOB_HOST_REGEX = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const {
      userRequest,
      backgroundImageUrl,
      selectedLogoIds,
      selectedElementIds,
      applyToPostId,
      sourceImageUrl,
    } = parsed.data

    if (backgroundImageUrl && !VERCEL_BLOB_HOST_REGEX.test(backgroundImageUrl)) {
      return NextResponse.json({ error: 'URL de fundo não permitida' }, { status: 400 })
    }
    if (sourceImageUrl && !VERCEL_BLOB_HOST_REGEX.test(sourceImageUrl)) {
      return NextResponse.json({ error: 'URL de origem não permitida' }, { status: 400 })
    }

    const original = await db.generation.findFirst({
      where: { id },
      select: {
        id: true,
        projectId: true,
        templateId: true,
        resultUrl: true,
        googleDriveFileId: true,
        fileName: true,
        templateName: true,
        Template: { select: { type: true, dimensions: true } },
      },
    })

    if (!original) {
      return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })
    }
    if (!original.resultUrl) {
      return NextResponse.json({ error: 'Criativo sem imagem disponível' }, { status: 400 })
    }

    const project = await fetchProjectWithShares(original.projectId)
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    if (applyToPostId) {
      const post = await db.socialPost.findFirst({
        where: { id: applyToPostId, projectId: original.projectId },
        select: { id: true, status: true },
      })
      if (!post) {
        return NextResponse.json({ error: 'Post não encontrado neste projeto' }, { status: 404 })
      }
      // Regra de negócio: melhorar com IA só arte APROVADA. Rascunho se edita
      // no editor; a melhoria entra depois da aprovação.
      if (post.status !== 'SCHEDULED') {
        return NextResponse.json(
          {
            error:
              post.status === 'DRAFT'
                ? 'Este post ainda é rascunho. Aprove-o primeiro — só arte aprovada pode ser melhorada com IA.'
                : `Este post não pode ser melhorado (status ${post.status}).`,
          },
          { status: 400 },
        )
      }
    }

    try {
      await validateCreditsForFeature(userId, 'ai_creative_improvement', 1, {
        organizationId: orgId ?? undefined,
      })
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: 'Créditos insuficientes',
            required: error.required,
            available: error.available,
          },
          { status: 402 },
        )
      }
      throw error
    }

    const format = inferFormatFromTemplate(original.Template)
    const openaiSize = OPENAI_INPUT_SIZE[format]
    const finalSize = FINAL_OUTPUT_SIZE[format]

    // Cria a Generation logo no PROCESSING — o client vai pollar pelo id dela.
    const job = await db.generation.create({
      data: {
        templateId: original.templateId,
        projectId: original.projectId,
        status: 'PROCESSING',
        resultUrl: null,
        fileName: null,
        fieldValues: {
          source: 'ai_improvement',
          originalGenerationId: original.id,
          userRequest,
          backgroundImageUrl: backgroundImageUrl ?? null,
          selectedLogoIds,
          selectedElementIds,
          applyToPostId: applyToPostId ?? null,
          model: getCurrentImageModel(),
          quality: 'high',
          inputSize: openaiSize,
          finalSize: `${finalSize.width}x${finalSize.height}`,
          format,
          processingStartedAt: new Date().toISOString(),
        },
        templateName: `${original.templateName ?? 'Criativo'} (melhorado)`,
        projectName: project.name,
        createdBy: userId,
      },
    })

    // Dispara o trabalho pesado em background — response sai imediatamente,
    // o Vercel mantém a function viva até o maxDuration ou o término da task.
    after(() =>
      processImprovementInBackground({
        jobGenerationId: job.id,
        originalGenerationId: original.id,
        originalResultUrl: sourceImageUrl ?? original.resultUrl!,
        applyToPostId: applyToPostId ?? null,
        userId,
        orgId: orgId ?? undefined,
        projectId: original.projectId,
        projectName: project.name,
        projectGoogleDriveFolderId: project.googleDriveFolderId ?? null,
        templateName: original.templateName,
        userRequest,
        backgroundImageUrl: backgroundImageUrl ?? null,
        selectedLogoIds,
        selectedElementIds,
        format,
      }),
    )

    return NextResponse.json(
      {
        success: true,
        generation: {
          id: job.id,
          status: 'PROCESSING' as const,
        },
      },
      { status: 202 },
    )
  } catch (error) {
    console.error('[improve] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Erro ao iniciar melhoria',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
