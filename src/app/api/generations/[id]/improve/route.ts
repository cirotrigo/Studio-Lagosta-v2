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
import {
  improveCreative,
  getCurrentImageModel,
  type ReferenceImage,
} from '@/lib/ai/openai-image-client'
import {
  inferFormatFromTemplate,
  OPENAI_INPUT_SIZE,
  FINAL_OUTPUT_SIZE,
  type ImprovementFormat,
} from '@/lib/ai/creative-improvement-format'
import { loadImprovementAssets } from '@/lib/ai/improvement-assets-loader'
import {
  MAX_SELECTED_LOGOS,
  MAX_SELECTED_ELEMENTS,
} from '@/lib/ai/improvement-assets-constants'
import { googleDriveService } from '@/server/google-drive-service'

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
})

const MAX_OPENAI_INPUT_BYTES = 4 * 1024 * 1024 // 4MB

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
    const { userRequest, backgroundImageUrl, selectedLogoIds, selectedElementIds } = parsed.data

    if (backgroundImageUrl && !VERCEL_BLOB_HOST_REGEX.test(backgroundImageUrl)) {
      return NextResponse.json({ error: 'URL de fundo não permitida' }, { status: 400 })
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
  backgroundImageUrl: string | null
  selectedLogoIds: number[]
  selectedElementIds: number[]
  format: ImprovementFormat
}

interface DownloadResult {
  buffer: Buffer
  mimeType: string
  role: 'primary' | 'background' | 'logo' | 'element'
  label?: string
}

async function processImprovementInBackground(args: BackgroundArgs): Promise<void> {
  const startedAt = Date.now()
  const openaiSize = OPENAI_INPUT_SIZE[args.format]
  const finalSize = FINAL_OUTPUT_SIZE[args.format]

  try {
    const assets = await loadImprovementAssets(args.projectId, {
      selectedLogoIds: args.selectedLogoIds,
      selectedElementIds: args.selectedElementIds,
    })

    const downloadTasks: Array<Promise<DownloadResult | null>> = []

    downloadTasks.push(
      fetchImageSource(args.originalResultUrl).then((r) => ({
        buffer: r.buffer,
        mimeType: r.contentType,
        role: 'primary' as const,
      })),
    )

    if (args.backgroundImageUrl) {
      const bgUrl = args.backgroundImageUrl
      downloadTasks.push(
        fetchImageSource(bgUrl)
          .then((r) => ({
            buffer: r.buffer,
            mimeType: r.contentType,
            role: 'background' as const,
          }))
          .catch((err) => {
            throw new Error(
              `Falha ao baixar fundo: ${err instanceof Error ? err.message : String(err)}`,
            )
          }),
      )
    }

    for (const logo of assets.logos) {
      downloadTasks.push(
        fetchImageSource(logo.fileUrl)
          .then((r) => ({
            buffer: r.buffer,
            mimeType: r.contentType,
            role: 'logo' as const,
            label: logo.name,
          }))
          .catch((err) => {
            console.warn(`[improve.bg] Falha ao baixar logo "${logo.name}":`, err)
            return null
          }),
      )
    }

    for (const element of assets.elements) {
      downloadTasks.push(
        fetchImageSource(element.fileUrl)
          .then((r) => ({
            buffer: r.buffer,
            mimeType: r.contentType,
            role: 'element' as const,
            label: element.name,
          }))
          .catch((err) => {
            console.warn(`[improve.bg] Falha ao baixar element "${element.name}":`, err)
            return null
          }),
      )
    }

    const downloads = (await Promise.all(downloadTasks)).filter(
      (d): d is DownloadResult => d !== null,
    )

    const primary = downloads.find((d) => d.role === 'primary')
    if (!primary) {
      throw new Error('Falha ao baixar a arte original')
    }

    const { buffer: primaryBuffer, mimeType: primaryMime } = await ensureUnderLimit(
      primary.buffer,
      primary.mimeType,
    )

    const references: ReferenceImage[] = []

    const bg = downloads.find((d) => d.role === 'background')
    if (bg) {
      const constrained = await ensureUnderLimit(bg.buffer, bg.mimeType)
      const [w, h] = openaiSize.split('x').map(Number)
      const resized = await sharp(constrained.buffer)
        .resize(w, h, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 90 })
        .toBuffer()
      references.push({
        buffer: resized,
        mimeType: 'image/jpeg',
        role: 'background',
        label: 'fundo',
      })
    }

    for (const logo of downloads.filter((d) => d.role === 'logo')) {
      const constrained = await ensureUnderLimit(logo.buffer, logo.mimeType)
      references.push({
        buffer: constrained.buffer,
        mimeType: constrained.mimeType,
        role: 'logo',
        label: logo.label,
      })
    }

    for (const element of downloads.filter((d) => d.role === 'element')) {
      const constrained = await ensureUnderLimit(element.buffer, element.mimeType)
      references.push({
        buffer: constrained.buffer,
        mimeType: constrained.mimeType,
        role: 'element',
        label: element.label,
      })
    }

    const improvedBuffer = await improveCreative({
      imageBuffer: primaryBuffer,
      mimeType: primaryMime,
      userRequest: args.userRequest,
      size: openaiSize,
      references: references.length > 0 ? references : undefined,
      brandColors: assets.colors,
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
          backgroundImageUrl: args.backgroundImageUrl ?? null,
          selectedLogoIds: args.selectedLogoIds,
          selectedElementIds: args.selectedElementIds,
          model: getCurrentImageModel(),
          quality: 'high',
          inputSize: openaiSize,
          finalSize: `${finalSize.width}x${finalSize.height}`,
          format: args.format,
          elapsedSeconds,
          referenceCounts: {
            background: references.filter((r) => r.role === 'background').length,
            logos: references.filter((r) => r.role === 'logo').length,
            elements: references.filter((r) => r.role === 'element').length,
          },
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
            backgroundImageUrl: args.backgroundImageUrl ?? null,
            selectedLogoIds: args.selectedLogoIds,
            selectedElementIds: args.selectedElementIds,
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
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'criativo'
  )
}
