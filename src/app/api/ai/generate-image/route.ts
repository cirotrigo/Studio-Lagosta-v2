import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { validateCreditsForFeature, deductCreditsForFeature } from '@/lib/credits/deduct'
import { put } from '@vercel/blob'

const generateImageSchema = z.object({
  projectId: z.number(),
  prompt: z.string().min(1, 'Prompt é obrigatório'),
  aspectRatio: z.string().default('1:1'),
  referenceImages: z.array(z.string()).optional(),
})

// Version ID do Nano Banana no Replicate
const NANO_BANANA_VERSION = '1b00a781b969984d0336047c859f06a54097bc7b5e9494ccd307ebde81094c34'

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Validar input
    const rawBody = await request.json()
    console.log('[AI Generate] Raw body received:', rawBody)
    const body = generateImageSchema.parse(rawBody)

    // 2. Verificar ownership do projeto
    const project = await db.project.findFirst({
      where: { id: body.projectId, userId },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 3. Validar créditos
    await validateCreditsForFeature(userId, 'ai_image_generation', 1, {
      organizationId: orgId ?? undefined,
    })

    // 4. Upload de imagens de referência para Vercel Blob (se houver)
    let publicReferenceUrls: string[] = []
    if (body.referenceImages && body.referenceImages.length > 0) {
      console.log('[AI Generate] Uploading reference images to Vercel Blob...')

      // Obter cookie de autenticação do request original
      const cookie = request.headers.get('cookie')

      publicReferenceUrls = await Promise.all(
        body.referenceImages.map(async (url, index) => {
          // Fazer fetch da imagem do Google Drive com autenticação
          const response = await fetch(url, {
            headers: cookie ? { cookie } : {}
          })
          if (!response.ok) {
            console.error(`[AI Generate] Failed to fetch reference image ${index + 1}:`, response.status, response.statusText)
            throw new Error(`Failed to fetch reference image ${index + 1}`)
          }
          const imageBuffer = await response.arrayBuffer()

          // Upload para Vercel Blob
          const fileName = `ref-${Date.now()}-${index}.jpg`
          const blob = await put(fileName, imageBuffer, {
            access: 'public',
            contentType: response.headers.get('content-type') || 'image/jpeg',
          })

          console.log('[AI Generate] Reference image uploaded:', blob.url)
          return blob.url
        })
      )
    }

    // 5. Criar prediction no Replicate
    console.log('[AI Generate] Creating prediction with:', {
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      referenceImagesCount: publicReferenceUrls.length,
      referenceImages: publicReferenceUrls
    })

    const prediction = await createReplicatePrediction({
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      referenceImages: publicReferenceUrls.length > 0 ? publicReferenceUrls : undefined,
    })

    console.log('[AI Generate] Prediction created:', prediction.id)

    // 6. Aguardar conclusão (polling com timeout de 60 segundos)
    const result = await waitForPrediction(prediction.id)

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
        name: `IA - ${body.prompt.slice(0, 40)}${body.prompt.length > 40 ? '...' : ''}`,
        prompt: body.prompt,
        mode: 'GENERATE',
        fileUrl: blobUrl,
        thumbnailUrl: blobUrl, // Por enquanto usa a mesma URL
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: body.aspectRatio,
        provider: 'replicate',
        model: 'nano-banana',
        predictionId: prediction.id,
        createdBy: userId,
      },
    })

    // 10. Deduzir créditos após sucesso
    await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'ai_image_generation',
      details: {
        mode: 'generate',
        prompt: body.prompt,
        aiImageId: aiImage.id,
        aspectRatio: body.aspectRatio,
      },
      organizationId: orgId ?? undefined,
    })

    return NextResponse.json(aiImage)

  } catch (error) {
    console.error('Generate image error:', error)

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

    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    )
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function createReplicatePrediction(params: {
  prompt: string
  aspectRatio: string
  referenceImages?: string[]
}) {
  const inputData: Record<string, any> = {
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio,
    output_format: 'png',
  }

  // Adicionar imagens de referência se fornecidas
  if (params.referenceImages && params.referenceImages.length > 0) {
    // Converter URLs relativas para URLs completas
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    inputData.image_input = params.referenceImages.map(url => {
      if (url.startsWith('http')) return url
      return `${baseUrl}${url}`
    })
  }

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: NANO_BANANA_VERSION,
      input: inputData
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Replicate API error: ${JSON.stringify(error)}`)
  }

  return response.json()
}

async function waitForPrediction(predictionId: string, maxAttempts = 60) {
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

    if (prediction.status === 'succeeded' || prediction.status === 'failed') {
      return prediction
    }

    // Aguardar 1 segundo antes de tentar novamente
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  throw new Error('Prediction timeout após 60 segundos')
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
