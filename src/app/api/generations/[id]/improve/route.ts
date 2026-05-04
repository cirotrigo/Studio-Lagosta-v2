import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { deductCreditsForFeature, validateCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'
import { improveCreative } from '@/lib/ai/openai-image-client'
import {
  inferFormatFromTemplate,
  OPENAI_INPUT_SIZE,
  FINAL_OUTPUT_SIZE,
} from '@/lib/ai/creative-improvement-format'
import { googleDriveService } from '@/server/google-drive-service'

export const runtime = 'nodejs'
export const maxDuration = 120

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

    // Baixa o original
    const { buffer: rawBuffer, contentType: originalContentType } = await fetchImageSource(original.resultUrl)

    // Pre-comprime se exceder o limite da OpenAI (4MB)
    const { buffer: inputBuffer, mimeType: inputMimeType } = await ensureUnderLimit(rawBuffer, originalContentType)

    // Determina formato e tamanhos
    const format = inferFormatFromTemplate(original.Template)
    const openaiSize = OPENAI_INPUT_SIZE[format]
    const finalSize = FINAL_OUTPUT_SIZE[format]

    // Chama OpenAI gpt-image-2
    let improvedBuffer: Buffer
    try {
      improvedBuffer = await improveCreative({
        imageBuffer: inputBuffer,
        mimeType: inputMimeType,
        userRequest,
        size: openaiSize,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      if (message.toLowerCase().includes('abort') || message.toLowerCase().includes('timeout')) {
        return NextResponse.json(
          { error: 'Tempo limite excedido na geração. Tente novamente.' },
          { status: 504 },
        )
      }
      console.error('[improve] OpenAI error:', error)
      return NextResponse.json(
        { error: 'Falha ao melhorar criativo', details: message },
        { status: 502 },
      )
    }

    // Resize final (downscale pro tamanho de publicação)
    const finalBuffer = await sharp(improvedBuffer)
      .resize(finalSize.width, finalSize.height, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 92 })
      .toBuffer()

    // Upload Vercel Blob
    const fileNameBase = sanitize(original.templateName ?? 'criativo')
    const blob = await put(`${fileNameBase}_ia_melhorado_${Date.now()}.jpg`, finalBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
    })

    // Backup Drive opcional
    let googleDriveFileId: string | null = null
    let googleDriveBackupUrl: string | null = null
    if (project.googleDriveFolderId && googleDriveService.isEnabled()) {
      try {
        const backup = await googleDriveService.uploadCreativeToArtesLagosta(
          finalBuffer,
          project.googleDriveFolderId,
          project.name,
        )
        googleDriveFileId = backup.fileId
        googleDriveBackupUrl = backup.publicUrl
      } catch (backupError) {
        console.warn('[improve] Google Drive backup failed:', backupError)
      }
    }

    // Cria nova Generation
    const newGen = await db.generation.create({
      data: {
        templateId: original.templateId,
        projectId: original.projectId,
        status: 'COMPLETED',
        resultUrl: blob.url,
        fileName: blob.pathname,
        googleDriveFileId,
        googleDriveBackupUrl,
        fieldValues: {
          source: 'ai_improvement',
          originalGenerationId: original.id,
          userRequest,
          model: 'gpt-image-2',
          quality: 'high',
          inputSize: openaiSize,
          finalSize: `${finalSize.width}x${finalSize.height}`,
          format,
        },
        templateName: `${original.templateName ?? 'Criativo'} (melhorado)`,
        projectName: project.name,
        createdBy: userId,
        completedAt: new Date(),
      },
    })

    // Deduz créditos
    const creditResult = await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'ai_creative_improvement',
      details: {
        originalGenerationId: original.id,
        newGenerationId: newGen.id,
        model: 'gpt-image-2',
        format,
      },
      organizationId: orgId ?? undefined,
      projectId: original.projectId,
    })

    return NextResponse.json({
      success: true,
      creditsRemaining: creditResult.creditsRemaining,
      generation: {
        id: newGen.id,
        resultUrl: newGen.resultUrl,
        fileName: newGen.fileName,
      },
    })
  } catch (error) {
    console.error('[improve] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Erro ao melhorar criativo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

async function ensureUnderLimit(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (buffer.length <= MAX_OPENAI_INPUT_BYTES) {
    return { buffer, mimeType: contentType || 'image/jpeg' }
  }
  // Recomprime pra JPEG q=90; se ainda for grande, redimensiona pra max 2048px
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
