import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { deductCreditsForFeature, validateCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'
import { improveCreative, getCurrentImageModel } from '@/lib/ai/openai-image-client'
import {
  inferFormatFromTemplate,
  OPENAI_INPUT_SIZE,
  FINAL_OUTPUT_SIZE,
  type ImprovementFormat,
} from '@/lib/ai/creative-improvement-format'
import { googleDriveService } from '@/server/google-drive-service'

export const runtime = 'nodejs'
export const maxDuration = 300

const bodySchema = z.object({
  userRequest: z.string().min(3).max(500),
})

const MAX_OPENAI_INPUT_BYTES = 4 * 1024 * 1024 // 4MB

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
    const { userRequest } = parsed.data

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
        originalResultUrl: original.resultUrl!,
        userId,
        orgId: orgId ?? undefined,
        projectId: original.projectId,
        projectName: project.name,
        projectGoogleDriveFolderId: project.googleDriveFolderId ?? null,
        templateName: original.templateName,
        userRequest,
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

interface BackgroundArgs {
  jobGenerationId: string
  originalGenerationId: string
  originalResultUrl: string
  userId: string
  orgId?: string
  projectId: number
  projectName: string
  projectGoogleDriveFolderId: string | null
  templateName: string | null | undefined
  userRequest: string
  format: ImprovementFormat
}

async function processImprovementInBackground(args: BackgroundArgs): Promise<void> {
  const startedAt = Date.now()
  const openaiSize = OPENAI_INPUT_SIZE[args.format]
  const finalSize = FINAL_OUTPUT_SIZE[args.format]

  try {
    const { buffer: rawBuffer, contentType: originalContentType } = await fetchImageSource(
      args.originalResultUrl,
    )

    const { buffer: inputBuffer, mimeType: inputMimeType } = await ensureUnderLimit(
      rawBuffer,
      originalContentType,
    )

    const improvedBuffer = await improveCreative({
      imageBuffer: inputBuffer,
      mimeType: inputMimeType,
      userRequest: args.userRequest,
      size: openaiSize,
    })

    const finalBuffer = await sharp(improvedBuffer)
      .resize(finalSize.width, finalSize.height, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 92 })
      .toBuffer()

    const fileNameBase = sanitize(args.templateName ?? 'criativo')
    const blob = await put(`${fileNameBase}_ia_melhorado_${Date.now()}.jpg`, finalBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
    })

    let googleDriveFileId: string | null = null
    let googleDriveBackupUrl: string | null = null
    if (args.projectGoogleDriveFolderId && googleDriveService.isEnabled()) {
      try {
        const backup = await googleDriveService.uploadCreativeToArtesLagosta(
          finalBuffer,
          args.projectGoogleDriveFolderId,
          args.projectName,
        )
        googleDriveFileId = backup.fileId
        googleDriveBackupUrl = backup.publicUrl
      } catch (backupError) {
        console.warn('[improve.bg] Google Drive backup failed:', backupError)
      }
    }

    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)

    await db.generation.update({
      where: { id: args.jobGenerationId },
      data: {
        status: 'COMPLETED',
        resultUrl: blob.url,
        fileName: blob.pathname,
        googleDriveFileId,
        googleDriveBackupUrl,
        completedAt: new Date(),
        fieldValues: {
          source: 'ai_improvement',
          originalGenerationId: args.originalGenerationId,
          userRequest: args.userRequest,
          model: getCurrentImageModel(),
          quality: 'high',
          inputSize: openaiSize,
          finalSize: `${finalSize.width}x${finalSize.height}`,
          format: args.format,
          elapsedSeconds,
        },
      },
    })

    await deductCreditsForFeature({
      clerkUserId: args.userId,
      feature: 'ai_creative_improvement',
      details: {
        originalGenerationId: args.originalGenerationId,
        newGenerationId: args.jobGenerationId,
        model: getCurrentImageModel(),
        format: args.format,
        elapsedSeconds,
      },
      organizationId: args.orgId,
      projectId: args.projectId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[improve.bg] failed:', message)

    await db.generation
      .update({
        where: { id: args.jobGenerationId },
        data: {
          status: 'FAILED',
          fieldValues: {
            source: 'ai_improvement',
            originalGenerationId: args.originalGenerationId,
            userRequest: args.userRequest,
            model: getCurrentImageModel(),
            quality: 'high',
            inputSize: openaiSize,
            finalSize: `${finalSize.width}x${finalSize.height}`,
            format: args.format,
            error: message,
            failedAt: new Date().toISOString(),
          },
          completedAt: new Date(),
        },
      })
      .catch((updateError) => {
        console.error('[improve.bg] failed to mark generation as FAILED:', updateError)
      })
  }
}

async function ensureUnderLimit(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (buffer.length <= MAX_OPENAI_INPUT_BYTES) {
    return { buffer, mimeType: contentType || 'image/jpeg' }
  }
  let result = await sharp(buffer).jpeg({ quality: 90 }).toBuffer()
  if (result.length > MAX_OPENAI_INPUT_BYTES) {
    result = await sharp(buffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer()
  }
  return { buffer: result, mimeType: 'image/jpeg' }
}

function sanitize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'criativo'
}
