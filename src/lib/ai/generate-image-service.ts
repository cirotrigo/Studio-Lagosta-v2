import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { validateCreditsForFeature, deductCreditsForFeature } from '@/lib/credits/deduct'
import {
  type AIImageModel,
  AI_IMAGE_MODELS,
  calculateCreditsForModel,
} from '@/lib/ai/image-models-config'
import { googleDriveService } from '@/server/google-drive-service'
import { generateImageWithGemini } from '@/lib/ai/gemini-image-client'

type ImageResolution = '1K' | '2K' | '4K'

export interface GenerateStoredAiImageParams {
  clerkUserId: string
  orgId?: string | null
  projectId: number
  prompt: string
  aspectRatio: string
  model?: AIImageModel
  resolution?: ImageResolution
  referenceImages?: string[]
}

export interface GeneratedAiImageRecord {
  id: string
  fileUrl: string
  thumbnailUrl: string | null
  prompt: string
  aspectRatio: string
  model: string
  provider: string
}

function calculateDimensions(aspectRatio: string): { width: number; height: number } {
  const ratios: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1024, height: 576 },
    '9:16': { width: 576, height: 1024 },
    '4:5': { width: 1024, height: 1280 },
  }

  return ratios[aspectRatio] || ratios['1:1']
}

function extractGoogleDriveFileId(url: string): string | null {
  const match = url.match(/\/api\/(?:google-drive\/image|drive\/thumbnail)\/([^/?]+)/)
  return match?.[1] ?? null
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function fetchGoogleDriveImage(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (!googleDriveService.isEnabled()) {
    throw new Error('Google Drive nao esta configurado')
  }

  const { stream, mimeType } = await googleDriveService.getFileStream(fileId)
  const buffer = await streamToBuffer(stream)

  return { buffer, contentType: mimeType }
}

async function fetchImageAsBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const driveFileId = extractGoogleDriveFileId(url)
  if (driveFileId) {
    return fetchGoogleDriveImage(driveFileId)
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) {
    throw new Error(`Falha ao carregar imagem de referencia (${response.status})`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'image/jpeg',
  }
}

export async function generateStoredAiImage(
  params: GenerateStoredAiImageParams,
): Promise<GeneratedAiImageRecord> {
  const model = params.model ?? 'nano-banana-pro'
  const resolution = params.resolution ?? '1K'
  const creditsRequired = calculateCreditsForModel(model, resolution)
  const modelConfig = AI_IMAGE_MODELS[model]

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('Servico de geracao de imagens via Gemini temporariamente indisponivel.')
  }

  await validateCreditsForFeature(params.clerkUserId, 'ai_image_generation', creditsRequired, {
    organizationId: params.orgId ?? undefined,
  })

  const referenceSources = (params.referenceImages ?? []).slice(0, 14)
  const referenceResults = await Promise.all(referenceSources.map(fetchImageAsBuffer))
  const referenceBuffers = referenceResults.map((item) => item.buffer)
  const referenceBufferTypes = referenceResults.map((item) => item.contentType)

  const generated = await generateImageWithGemini({
    model,
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    resolution,
    referenceImages: referenceBuffers.length > 0 ? referenceBuffers : undefined,
    referenceImageTypes: referenceBufferTypes.length > 0 ? referenceBufferTypes : undefined,
    mode: 'generate',
  })

  const blob = await put(`ai-generated-${Date.now()}.png`, generated.imageBuffer, {
    access: 'public',
    contentType: generated.mimeType,
  })

  let googleDriveUrl: string | null = null
  try {
    const driveEnabled = googleDriveService?.isEnabled?.() ?? false

    if (driveEnabled) {
      const project = await db.project.findUnique({
        where: { id: params.projectId },
        select: { googleDriveFolderId: true, name: true },
      })

      if (project?.googleDriveFolderId) {
        const driveResult = await googleDriveService.uploadAIGeneratedImage(
          generated.imageBuffer,
          project.googleDriveFolderId,
          project.name,
        )
        googleDriveUrl = driveResult.publicUrl
      }
    }
  } catch (error) {
    console.error('[generateStoredAiImage] Drive upload failed:', error)
  }

  const dimensions = calculateDimensions(params.aspectRatio)
  const aiImage = await db.aIGeneratedImage.create({
    data: {
      projectId: params.projectId,
      name: `${modelConfig.displayName} - ${params.prompt.slice(0, 40)}${params.prompt.length > 40 ? '...' : ''}`,
      prompt: params.prompt,
      mode: 'GENERATE',
      fileUrl: googleDriveUrl || blob.url,
      thumbnailUrl: blob.url,
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: params.aspectRatio,
      provider: 'gemini-direct',
      model,
      createdBy: params.clerkUserId,
    },
  })

  await deductCreditsForFeature({
    clerkUserId: params.clerkUserId,
    feature: 'ai_image_generation',
    quantity: creditsRequired,
    details: {
      mode: 'generate',
      model,
      apiProvider: 'gemini-direct',
      resolution,
      prompt: params.prompt,
      aiImageId: aiImage.id,
      aspectRatio: params.aspectRatio,
      referenceImageCount: referenceSources.length,
    },
    organizationId: params.orgId ?? undefined,
    projectId: params.projectId,
  })

  return {
    id: aiImage.id,
    fileUrl: aiImage.fileUrl,
    thumbnailUrl: aiImage.thumbnailUrl,
    prompt: aiImage.prompt,
    aspectRatio: aiImage.aspectRatio,
    model: aiImage.model,
    provider: aiImage.provider,
  }
}
