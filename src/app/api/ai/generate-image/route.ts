import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { validateCreditsForFeature, deductCreditsForFeature } from '@/lib/credits/deduct'
import { put } from '@vercel/blob'
import {
  type AIImageModel,
  AI_IMAGE_MODELS,
  calculateCreditsForModel
} from '@/lib/ai/image-models-config'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for AI image generation (needed for 4K images)
export const dynamic = 'force-dynamic' // Garantir que a rota não seja estaticamente otimizada

const generateImageSchema = z.object({
  projectId: z.number().int().positive('projectId deve ser um número positivo'),
  prompt: z.string().min(1, 'Prompt é obrigatório'),
  aspectRatio: z.string().default('1:1'),
  referenceImages: z.array(z.string()).optional(),
  model: z.enum([
    'flux-1.1-pro',
    'flux-schnell',
    'nano-banana-pro',
    'nano-banana',
    'seedream-4',
    'ideogram-v3-turbo',
    'recraft-v3',
    'stable-diffusion-3'
  ]).default('flux-1.1-pro'),
  resolution: z.enum(['1K', '2K', '4K']).optional(),
  // Parâmetros específicos do FLUX
  seed: z.number().int().optional(),
  promptUpsampling: z.boolean().optional(),
  safetyTolerance: z.number().min(1).max(6).optional(),
  outputQuality: z.number().min(0).max(100).optional(),
  // Parâmetros específicos do Ideogram
  styleType: z.enum(['auto', 'general', 'realistic', 'design']).optional(),
  magicPrompt: z.boolean().optional(),
  // Parâmetros específicos do Seedream
  enhancePrompt: z.boolean().optional(),
  // Parâmetros específicos do Stable Diffusion
  cfgScale: z.number().min(0).max(20).optional(),
  steps: z.number().min(1).max(50).optional(),
})

export async function POST(request: Request) {
  console.log('[AI Generate] POST request received to /api/ai/generate-image')

  const { userId, orgId } = await auth()
  console.log('[AI Generate] Auth result:', { userId: userId?.substring(0, 10), orgId })

  if (!userId) {
    console.error('[AI Generate] Unauthorized - no userId')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verificar se a chave da API do Replicate está configurada
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('[AI Generate] REPLICATE_API_TOKEN not configured')
    return NextResponse.json(
      { error: 'Geração de imagens não configurada. Entre em contato com o administrador.' },
      { status: 503 }
    )
  }
  console.log('[AI Generate] REPLICATE_API_TOKEN is configured:', process.env.REPLICATE_API_TOKEN?.substring(0, 10) + '...')

  try {
    // 1. Validar input
    const rawBody = await request.json()
    console.log('[AI Generate] Raw body received:', {
      ...rawBody,
      prompt: rawBody.prompt?.substring(0, 50),
      model: rawBody.model,
      resolution: rawBody.resolution
    })

    const body = generateImageSchema.parse(rawBody)
    console.log('[AI Generate] Body validated successfully')

    // 2. Verificar ownership do projeto
    const project = await db.project.findFirst({
      where: { id: body.projectId, userId },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 3. Validar créditos baseado no modelo e resolução selecionados
    const modelConfig = AI_IMAGE_MODELS[body.model]
    const creditsRequired = calculateCreditsForModel(body.model, body.resolution)

    await validateCreditsForFeature(userId, 'ai_image_generation', creditsRequired, {
      organizationId: orgId ?? undefined,
    })

    // 4. Upload de imagens de referência para Vercel Blob (se houver)
    let publicReferenceUrls: string[] = []
    if (body.referenceImages && body.referenceImages.length > 0) {
      console.log('[AI Generate] Uploading reference images to Vercel Blob...')

      publicReferenceUrls = await Promise.all(
        body.referenceImages.map(async (url, index) => {
          try {
            // Se já é uma URL pública do Vercel Blob, usar diretamente
            if (url.includes('vercel-storage.com') || url.includes('blob.vercel-storage.com')) {
              console.log('[AI Generate] Using existing Vercel Blob URL:', url)
              return url
            }

            // Se é uma URL do Google Drive, fazer fetch com autenticação
            let imageBuffer: ArrayBuffer
            let contentType = 'image/jpeg'

            if (url.includes('/api/google-drive/')) {
              // Construir URL absoluta se necessária
              const absoluteUrl = url.startsWith('http') ? url : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${url}`

              // Obter cookie de autenticação do request original
              const cookie = request.headers.get('cookie')

              console.log('[AI Generate] Fetching Google Drive image:', absoluteUrl)
              const response = await fetch(absoluteUrl, {
                headers: cookie ? { cookie } : {}
              })

              if (!response.ok) {
                console.error(`[AI Generate] Failed to fetch reference image ${index + 1}:`, response.status, response.statusText)
                throw new Error(`Failed to fetch reference image ${index + 1} from Google Drive`)
              }

              imageBuffer = await response.arrayBuffer()
              contentType = response.headers.get('content-type') || 'image/jpeg'
            } else {
              // Para outras URLs, fazer fetch normal
              const response = await fetch(url)
              if (!response.ok) {
                throw new Error(`Failed to fetch reference image ${index + 1}`)
              }
              imageBuffer = await response.arrayBuffer()
              contentType = response.headers.get('content-type') || 'image/jpeg'
            }

            // Validar tamanho da imagem de referência
            const maxMb = 10 // Limite de 10MB para imagens de referência
            if (imageBuffer.byteLength > maxMb * 1024 * 1024) {
              throw new Error(`Reference image ${index + 1} is too large (max ${maxMb}MB)`)
            }

            // Upload para Vercel Blob
            const fileName = `ai-ref-${Date.now()}-${index}.jpg`
            const blob = await put(fileName, imageBuffer, {
              access: 'public',
              contentType,
            })

            console.log('[AI Generate] Reference image uploaded:', blob.url)
            return blob.url
          } catch (error) {
            console.error(`[AI Generate] Error processing reference image ${index + 1}:`, error)
            throw new Error(`Failed to process reference image ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        })
      )
    }

    // 5. Criar prediction no Replicate
    console.log('[AI Generate] Creating prediction with:', {
      model: body.model,
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      referenceImagesCount: publicReferenceUrls.length,
      referenceImages: publicReferenceUrls
    })

    const prediction = await createReplicatePrediction({
      model: body.model,
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      referenceImages: publicReferenceUrls.length > 0 ? publicReferenceUrls : undefined,
      // Parâmetros opcionais do FLUX
      seed: body.seed,
      promptUpsampling: body.promptUpsampling,
      safetyTolerance: body.safetyTolerance,
      outputQuality: body.outputQuality,
      // Parâmetros opcionais do Ideogram
      styleType: body.styleType,
      magicPrompt: body.magicPrompt,
      // Parâmetros opcionais do Seedream
      enhancePrompt: body.enhancePrompt,
      // Parâmetros opcionais do Stable Diffusion
      cfgScale: body.cfgScale,
      steps: body.steps,
    })

    console.log('[AI Generate] Prediction created:', prediction.id)

    // 6. Aguardar conclusão (polling com timeout de até 280 segundos para 4K)
    const result = await waitForPrediction(prediction.id, 280)

    if (result.status === 'failed') {
      throw new Error(result.error || 'Failed to generate image')
    }

    // 7. Upload para Vercel Blob
    const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output
    if (!imageUrl) {
      throw new Error('No image URL in response')
    }

    const fileName = `ai-generated-${Date.now()}.png`
    const blobUrl = await uploadToVercelBlob(imageUrl, fileName)

    // 8. Calcular dimensões baseado no aspect ratio
    const dimensions = calculateDimensions(body.aspectRatio)

    // 9. Salvar no banco de dados
    const aiImage = await db.aIGeneratedImage.create({
      data: {
        projectId: body.projectId,
        name: `${modelConfig.displayName} - ${body.prompt.slice(0, 40)}${body.prompt.length > 40 ? '...' : ''}`,
        prompt: body.prompt,
        mode: 'GENERATE',
        fileUrl: blobUrl,
        thumbnailUrl: blobUrl, // Por enquanto usa a mesma URL
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: body.aspectRatio,
        provider: modelConfig.provider.toLowerCase(),
        model: body.model,
        predictionId: prediction.id,
        createdBy: userId,
      },
    })

    // 10. Deduzir créditos após sucesso (quantidade calculada baseada no modelo)
    await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'ai_image_generation',
      quantity: creditsRequired,
      details: {
        mode: 'generate',
        model: body.model,
        resolution: body.resolution,
        prompt: body.prompt,
        aiImageId: aiImage.id,
        aspectRatio: body.aspectRatio,
      },
      organizationId: orgId ?? undefined,
      projectId: body.projectId,
    })

    return NextResponse.json(aiImage)

  } catch (error) {
    console.error('[AI Generate] Error:', error)

    // Erro de créditos
    if (error.message?.includes('créditos insuficientes') || error.message?.includes('insufficient credits')) {
      return NextResponse.json(
        { error: 'Créditos insuficientes' },
        { status: 402 }
      )
    }

    // Erro de validação
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    // Erro do Replicate (API error) - retornar mensagem real
    if (error.message?.includes('Replicate API error')) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar imagem'
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      )
    }

    // Erro genérico
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate image'
    console.error('[AI Generate] Returning error to client:', errorMessage)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function createReplicatePrediction(params: {
  model: AIImageModel
  prompt: string
  aspectRatio: string
  resolution?: '1K' | '2K' | '4K'
  referenceImages?: string[]
  // FLUX-specific params
  seed?: number
  promptUpsampling?: boolean
  safetyTolerance?: number
  outputQuality?: number
  // Ideogram-specific params
  styleType?: string
  magicPrompt?: boolean
  // Seedream-specific params
  enhancePrompt?: boolean
  // Stable Diffusion-specific params
  cfgScale?: number
  steps?: number
}) {
  const modelConfig = AI_IMAGE_MODELS[params.model]
  const inputData: Record<string, unknown> = {
    prompt: params.prompt,
  }

  // Configuração específica por modelo
  if (params.model === 'flux-1.1-pro' || params.model === 'flux-schnell') {
    // FLUX 1.1 Pro e FLUX Schnell
    inputData.aspect_ratio = params.aspectRatio === 'custom' ? undefined : params.aspectRatio
    inputData.output_format = 'png'
    inputData.output_quality = params.outputQuality ?? 80

    if (params.model === 'flux-1.1-pro') {
      // Parâmetros específicos do Pro
      inputData.safety_tolerance = params.safetyTolerance ?? 2
      inputData.prompt_upsampling = params.promptUpsampling ?? false
    }

    if (params.seed !== undefined) {
      inputData.seed = params.seed
    }

    // FLUX usa image_prompt para referência (apenas 1 imagem)
    if (params.referenceImages && params.referenceImages.length > 0) {
      inputData.image_prompt = params.referenceImages[0]
    }

  } else if (params.model === 'seedream-4') {
    // Seedream 4
    // O parâmetro size aceita: "1K", "2K", "4K", ou "custom"
    inputData.size = params.resolution || '2K'
    inputData.aspect_ratio = params.aspectRatio
    inputData.enhance_prompt = params.enhancePrompt ?? true // Default do Seedream é true

    // Imagens de referência (até 10)
    if (params.referenceImages && params.referenceImages.length > 0) {
      inputData.image_input = params.referenceImages
    }

  } else if (params.model === 'ideogram-v3-turbo') {
    // Ideogram v3 Turbo
    inputData.aspect_ratio = params.aspectRatio

    // Capitalizar corretamente: "Auto", "General", "Realistic", "Design"
    const styleTypeMap: Record<string, string> = {
      'auto': 'Auto',
      'general': 'General',
      'realistic': 'Realistic',
      'design': 'Design'
    }
    inputData.style_type = styleTypeMap[params.styleType ?? 'auto'] || 'Auto'

    // magic_prompt_option: "Auto", "On", "Off"
    inputData.magic_prompt_option = params.magicPrompt ?? true ? 'Auto' : 'Off'

    // Style reference (primeira imagem de referência)
    if (params.referenceImages && params.referenceImages.length > 0) {
      inputData.style_reference_image = params.referenceImages[0]
    }

  } else if (params.model === 'recraft-v3') {
    // Recraft V3
    inputData.aspect_ratio = params.aspectRatio
    inputData.output_format = 'png'
    // Style será 'realistic_image' por padrão
    inputData.style = 'realistic_image'

  } else if (params.model === 'stable-diffusion-3') {
    // Stable Diffusion 3
    inputData.aspect_ratio = params.aspectRatio
    inputData.output_format = 'png'
    inputData.output_quality = params.outputQuality ?? 90
    inputData.cfg = params.cfgScale ?? 3.5
    inputData.steps = params.steps ?? 28

    if (params.seed !== undefined) {
      inputData.seed = params.seed
    }

  } else if (params.model === 'nano-banana-pro' || params.model === 'nano-banana') {
    // Nano Banana e Nano Banana Pro
    inputData.aspect_ratio = params.aspectRatio
    inputData.output_format = 'png'

    // Resolução (apenas Pro)
    if (params.model === 'nano-banana-pro' && params.resolution) {
      inputData.resolution = params.resolution
    }

    // Imagens de referência (suporta múltiplas)
    if (params.referenceImages && params.referenceImages.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      inputData.image_input = params.referenceImages.map(url => {
        if (url.startsWith('http')) return url
        return `${baseUrl}${url}`
      })
    }

    // Safety filter (apenas Pro)
    if (params.model === 'nano-banana-pro') {
      inputData.safety_filter_level = 'block_only_high'
    }
  }

  const payload = {
    version: modelConfig.version,
    input: inputData
  }

  console.log('[AI Generate] Sending to Replicate:', {
    model: params.model,
    version: modelConfig.version,
    inputKeys: Object.keys(inputData),
    input: inputData
  })

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[AI Generate] Replicate API error response:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText
    })

    let errorMessage = 'Falha ao criar prediction no Replicate'
    try {
      const errorData = JSON.parse(errorText)
      errorMessage = errorData.detail || errorData.error || errorMessage
    } catch {
      errorMessage = errorText || errorMessage
    }

    throw new Error(`Replicate API error: ${errorMessage}`)
  }

  const result = await response.json()
  console.log('[AI Generate] Prediction created successfully:', {
    id: result.id,
    status: result.status
  })
  return result
}

async function waitForPrediction(predictionId: string, maxAttempts = 60) {
  console.log(`[AI Generate] Starting to wait for prediction ${predictionId} (max ${maxAttempts}s)`)

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        }
      }
    )

    if (!response.ok) {
      throw new Error('Failed to get prediction status')
    }

    const prediction = await response.json()

    // Log a cada 30 segundos
    if (i > 0 && i % 30 === 0) {
      console.log(`[AI Generate] Still waiting for prediction... ${i}s elapsed, status: ${prediction.status}`)
    }

    if (prediction.status === 'succeeded' || prediction.status === 'failed') {
      console.log(`[AI Generate] Prediction completed after ${i}s with status: ${prediction.status}`)
      return prediction
    }

    // Aguardar 1 segundo antes de tentar novamente
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  const timeoutSeconds = maxAttempts
  throw new Error(`Geração de imagem excedeu o tempo limite (${timeoutSeconds}s). Imagens 4K podem demorar mais - tente novamente ou use resolução menor.`)
}

async function uploadToVercelBlob(imageUrl: string, fileName: string) {
  const imageResponse = await fetch(imageUrl)

  if (!imageResponse.ok) {
    throw new Error('Failed to fetch generated image')
  }

  const imageBuffer = await imageResponse.arrayBuffer()

  const blob = await put(fileName, imageBuffer, {
    access: 'public',
    contentType: 'image/png',
  })

  return blob.url
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
