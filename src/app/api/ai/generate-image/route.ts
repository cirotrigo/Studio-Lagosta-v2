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
import { fetchProjectWithAccess } from '@/lib/projects/access'
import { googleDriveService } from '@/server/google-drive-service'
import { generateImageWithGemini, isGeminiRetryableError } from '@/lib/ai/gemini-image-client'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for AI image generation (needed for 4K images)
export const dynamic = 'force-dynamic' // Garantir que a rota não seja estaticamente otimizada

const generateImageSchema = z.object({
  projectId: z.number({
    required_error: 'ID do projeto é obrigatório',
    invalid_type_error: 'ID do projeto deve ser um número',
  }).int('ID do projeto deve ser um número inteiro').positive('ID do projeto deve ser um número positivo'),
  prompt: z.string({
    required_error: 'O prompt é obrigatório',
    invalid_type_error: 'O prompt deve ser texto',
  }).min(1, 'O prompt não pode estar vazio'),
  aspectRatio: z.string().default('1:1'),
  referenceImages: z.array(z.string().url('URL de imagem de referência inválida')).optional(),
  model: z.enum([
    'nano-banana-2',
    'nano-banana-pro',
  ], {
    errorMap: () => ({ message: 'Modelo de IA inválido. Escolha nano-banana-2 ou nano-banana-pro.' })
  }).default('nano-banana-2'),
  resolution: z.enum(['1K', '2K', '4K'], {
    errorMap: () => ({ message: 'Resolução inválida. Use 1K, 2K ou 4K.' })
  }).optional(),
  // Modo de operação (geração ou edição)
  mode: z.enum(['generate', 'edit', 'inpaint'], {
    errorMap: () => ({ message: 'Modo inválido. Use generate, edit ou inpaint.' })
  }).default('generate'),
  // Imagem base para edição (obrigatória quando mode = edit ou inpaint)
  baseImage: z.string().url('URL da imagem base inválida').optional(),
  // Máscara para inpainting (opcional, só para mode = inpaint)
  maskImage: z.string().url('URL da máscara inválida').optional(),
}).refine((data) => {
  // Se mode = edit ou inpaint, baseImage é obrigatória
  if ((data.mode === 'edit' || data.mode === 'inpaint') && !data.baseImage) {
    return false
  }
  return true
}, {
  message: 'Imagem base é obrigatória para modo de edição ou inpainting',
  path: ['baseImage'],
})

export async function POST(request: Request) {
  console.log('[AI Generate] POST request received to /api/ai/generate-image')

  const { userId, orgId } = await auth()
  console.log('[AI Generate] Auth result:', { userId: userId?.substring(0, 10), orgId })

  if (!userId) {
    console.error('[AI Generate] Unauthorized - no userId')
    return NextResponse.json({ error: 'Não autorizado. Por favor, faça login novamente.' }, { status: 401 })
  }

  // Verificar chaves de API (verificação completa feita após parse do body para saber qual provider será usado)

  try {
    // 1. Validar input
    const rawBody = await request.json()
    console.log('[AI Generate] Raw body received:', {
      projectId: rawBody.projectId,
      projectIdType: typeof rawBody.projectId,
      prompt: rawBody.prompt?.substring(0, 50),
      model: rawBody.model,
      mode: rawBody.mode,
      resolution: rawBody.resolution,
      hasBaseImage: !!rawBody.baseImage
    })

    const body = generateImageSchema.parse(rawBody)
    console.log('[AI Generate] Body validated successfully')

    // 2. Verificar acesso ao projeto (inclui verificação de organização)
    const project = await fetchProjectWithAccess(body.projectId, { userId, orgId })
    if (!project) {
      console.error('[AI Generate] Project not found or access denied:', { projectId: body.projectId, userId, orgId })
      return NextResponse.json({ error: 'Projeto não encontrado ou você não tem permissão para acessá-lo.' }, { status: 404 })
    }
    console.log('[AI Generate] Project access validated for:', project.name)

    // 3. Validar créditos baseado no modelo e resolução selecionados
    const modelConfig = AI_IMAGE_MODELS[body.model]
    const creditsRequired = calculateCreditsForModel(body.model, body.resolution)

    try {
      await validateCreditsForFeature(userId, 'ai_image_generation', creditsRequired, {
        organizationId: orgId ?? undefined,
      })
    } catch (error) {
      // Traduzir erro de créditos insuficientes
      if (error.message?.includes('Insufficient credits') || error.message?.includes('créditos insuficientes')) {
        const match = error.message.match(/required (\d+), available (\d+)/)
        if (match) {
          const [, required, available] = match
          throw new Error(
            `Créditos insuficientes.\n\n` +
            `Necessário: ${required} créditos\n` +
            `Disponível: ${available} créditos\n` +
            `Faltam: ${parseInt(required) - parseInt(available)} créditos\n\n` +
            `💡 Dica: Use modelos mais econômicos:\n` +
            `• FLUX Schnell: 1 crédito\n` +
            `• Nano Banana Pro: 3 créditos\n` +
            `• FLUX 1.1 Pro: 4 créditos`
          )
        }
      }
      throw error
    }

    // 4. Preparar imagens de referência uma única vez para evitar re-fetch imediato do Blob
    let preparedReferenceAssets: Array<{ publicUrl: string; buffer: Buffer; contentType: string }> = []
    if (body.referenceImages && body.referenceImages.length > 0) {
      console.log('[AI Generate] Preparing reference images...', {
        count: body.referenceImages.length,
        urls: body.referenceImages
      })

      preparedReferenceAssets = await Promise.all(
        body.referenceImages.map(async (url, index) => {
          try {
            const { buffer: imageBuffer, contentType } = await fetchImageFromSource(url)

            // Validar tamanho da imagem de referência
            const sizeInMb = (imageBuffer.length / (1024 * 1024)).toFixed(2)
            const maxMb = 10 // Limite de 10MB para imagens de referência

            console.log(`[AI Generate] Reference image ${index + 1} size: ${sizeInMb}MB`)

            if (imageBuffer.length > maxMb * 1024 * 1024) {
              throw new Error(`Imagem de referência ${index + 1} muito grande (${sizeInMb}MB). Tamanho máximo: ${maxMb}MB.\n\nCompacte a imagem antes de enviar.`)
            }

            const publicUrl = isVercelBlobUrl(url)
              ? url
              : await storeBufferInVercelBlob(
                  imageBuffer,
                  `ai-ref-${Date.now()}-${index}${getFileExtensionFromMimeType(contentType)}`,
                  contentType
                )

            console.log('[AI Generate] Reference image ready:', publicUrl)

            return {
              publicUrl,
              buffer: imageBuffer,
              contentType,
            }
          } catch (error) {
            console.error(`[AI Generate] Error processing reference image ${index + 1}:`, error)
            throw new Error(`Erro ao processar imagem de referência ${index + 1}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
          }
        })
      )

      const publicReferenceUrls = preparedReferenceAssets.map(asset => asset.publicUrl)
      console.log('[AI Generate] All reference images validated and ready:', {
        count: publicReferenceUrls.length,
        urls: publicReferenceUrls
      })
    }

    const publicReferenceUrls = preparedReferenceAssets.map(asset => asset.publicUrl)

    // 4.5. Preparar imagem base para modo edit sem reler a URL do Blob logo depois
    let publicBaseImageUrl: string | undefined = body.baseImage
    let baseImageBuffer: Buffer | undefined
    let baseImageBufferType: string | undefined
    if (body.baseImage && (body.mode === 'edit' || body.mode === 'inpaint')) {
      console.log('[AI Generate] Processing base image for edit mode:', body.baseImage)

      try {
        const preparedBaseImage = await fetchImageFromSource(body.baseImage)
        baseImageBuffer = preparedBaseImage.buffer
        baseImageBufferType = preparedBaseImage.contentType

        const sizeInMb = (baseImageBuffer.length / (1024 * 1024)).toFixed(2)
        console.log(`[AI Generate] Base image size: ${sizeInMb}MB, content-type: ${baseImageBufferType}`)

        if (baseImageBuffer.length > 12 * 1024 * 1024) {
          throw new Error(`Imagem base muito grande (${sizeInMb}MB). Tamanho máximo: 12MB.`)
        }

        if (baseImageBuffer.length === 0) {
          throw new Error('Imagem base está vazia. Selecione outra imagem.')
        }

        publicBaseImageUrl = isVercelBlobUrl(body.baseImage)
          ? body.baseImage
          : await storeBufferInVercelBlob(
              baseImageBuffer,
              `ai-base-${Date.now()}${getFileExtensionFromMimeType(baseImageBufferType)}`,
              baseImageBufferType
            )
      } catch (error) {
        console.error('[AI Generate] Error processing base image:', error)
        throw new Error(`Erro ao processar imagem base: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
      }
    }

    // 5. Todos os modelos usam Gemini (Imagen 3)
    const isGeminiModel = true // All models use Gemini Imagen 3 API directly

    console.log('[AI Generate] Creating prediction with:', {
      model: body.model,
      provider: isGeminiModel ? 'gemini-direct' : 'replicate',
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      referenceImagesCount: publicReferenceUrls.length,
      referenceImages: publicReferenceUrls
    })

    // Variáveis compartilhadas entre os dois fluxos
    let blobUrl: string
    let actualModel = body.model as string
    let usedFallbackModel = false
    let predictionId: string | undefined
    let currentModelConfig = modelConfig

    if (isGeminiModel) {
      // ============================================================================
      // FLUXO GEMINI DIRETO
      // ============================================================================
      console.log('[AI Generate] Using Gemini Direct API for model:', body.model)

      // Verificar chave da API Gemini
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.error('[AI Generate] GOOGLE_GENERATIVE_AI_API_KEY not configured')
        return NextResponse.json(
          { error: 'Serviço de geração de imagens via Gemini temporariamente indisponível. Entre em contato com o suporte.' },
          { status: 503 }
        )
      }

      const referenceBuffers = preparedReferenceAssets.length > 0
        ? preparedReferenceAssets.map(asset => asset.buffer)
        : undefined
      const referenceBufferTypes = preparedReferenceAssets.length > 0
        ? preparedReferenceAssets.map(asset => asset.contentType)
        : undefined

      // Executar geração com retry (1 retry com Gemini, depois fallback para Nano Banana Pro via Replicate)
      const MAX_GEMINI_RETRIES = 2
      const RETRY_DELAY_MS = 5000
      const startTime = Date.now()
      const VERCEL_TIME_BUDGET_MS = 280000
      const MIN_TIME_FOR_RETRY_MS = 60000
      const getElapsedTime = () => Math.round((Date.now() - startTime) / 1000)
      const getRemainingTime = () => VERCEL_TIME_BUDGET_MS - (Date.now() - startTime)

      let geminiSuccess = false

      for (let attempt = 1; attempt <= MAX_GEMINI_RETRIES; attempt++) {
        // Na 2ª tentativa, fallback para Nano Banana Pro via Replicate
        if (attempt === 2) {
          const remainingTime = getRemainingTime()
          if (remainingTime < MIN_TIME_FOR_RETRY_MS) {
            console.log(`[AI Generate] Not enough time for fallback (${Math.round(remainingTime / 1000)}s remaining). Stopping.`)
            break
          }

          console.log(`[AI Generate] Gemini failed, falling back to Nano Banana Pro via Replicate`)
          const FALLBACK_MODEL: AIImageModel = 'nano-banana-pro'
          actualModel = FALLBACK_MODEL
          currentModelConfig = AI_IMAGE_MODELS[FALLBACK_MODEL]
          usedFallbackModel = true

          // Verificar chave Replicate para fallback
          if (!process.env.REPLICATE_API_TOKEN) {
            console.error('[AI Generate] REPLICATE_API_TOKEN not configured for fallback')
            break
          }

          try {
            const fallbackParams = {
              model: FALLBACK_MODEL,
              prompt: body.prompt,
              aspectRatio: body.aspectRatio,
              resolution: body.resolution,
              referenceImages: publicReferenceUrls.length > 0 ? publicReferenceUrls : undefined,
              mode: body.mode,
              baseImage: publicBaseImageUrl,
              maskImage: body.maskImage,
            }

            const pollingTimeout = Math.min(Math.floor(getRemainingTime() / 1000) - 10, 120)
            console.log(`[AI Generate] Fallback attempt with Nano Banana Pro (${pollingTimeout}s timeout, ${getElapsedTime()}s elapsed)`)

            const prediction = await createReplicatePrediction(fallbackParams)
            const result = await waitForPrediction(prediction.id, pollingTimeout)

            if (result.status === 'succeeded') {
              const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output
              if (!imageUrl) throw new Error('Nenhuma imagem retornada pelo fallback')

              const fileName = `ai-generated-${Date.now()}.png`
              blobUrl = await uploadToVercelBlob(imageUrl, fileName)
              predictionId = result.id
              geminiSuccess = true
              console.log(`[AI Generate] Fallback to Nano Banana Pro succeeded after ${getElapsedTime()}s`)
            } else {
              throw new Error(result.error || 'Fallback para Nano Banana Pro também falhou')
            }
          } catch (fallbackError) {
            console.error('[AI Generate] Fallback to Nano Banana Pro failed:', fallbackError)
            throw fallbackError
          }
          break
        }

        try {
          console.log(`[AI Generate] Gemini attempt ${attempt}/${MAX_GEMINI_RETRIES} (${getElapsedTime()}s elapsed)`)

          const geminiResult = await generateImageWithGemini({
            model: body.model as 'nano-banana-2' | 'nano-banana-pro',
            prompt: body.prompt,
            aspectRatio: body.aspectRatio,
            resolution: body.resolution,
            referenceImages: referenceBuffers,
            referenceImageTypes: referenceBufferTypes,
            mode: body.mode === 'inpaint' ? 'edit' : body.mode as 'generate' | 'edit',
            baseImage: baseImageBuffer,
            baseImageType: baseImageBufferType,
          })

          // Upload buffer direto para Vercel Blob (mais rápido que Replicate que requer fetch de URL)
          const fileName = `ai-generated-${Date.now()}.png`
          const blob = await put(fileName, geminiResult.imageBuffer, {
            access: 'public',
            contentType: geminiResult.mimeType,
          })

          blobUrl = blob.url
          geminiSuccess = true
          console.log(`[AI Generate] Gemini Direct succeeded on attempt ${attempt} after ${getElapsedTime()}s`)
          break
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          const isRetryable = isGeminiRetryableError(errorMessage)

          console.error(`[AI Generate] Gemini error on attempt ${attempt}:`, {
            error: errorMessage,
            isRetryable,
            elapsedTime: `${getElapsedTime()}s`,
          })

          if (!isRetryable) {
            throw error
          }

          // Se retryable, vai para a próxima iteração (fallback)
          console.log(`[AI Generate] Waiting ${RETRY_DELAY_MS / 1000}s before fallback...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
        }
      }

      if (!geminiSuccess) {
        throw new Error(
          `🔄 Falha ao gerar imagem com ${modelConfig.displayName}\n\n` +
          `O modelo está temporariamente indisponível.\n\n` +
          `💡 Soluções:\n` +
          `• Tente outro modelo (FLUX 1.1 Pro ou Nano Banana Pro)\n` +
          `• Aguarde alguns minutos e tente novamente`
        )
      }

    } else {
      // ============================================================================
      // FLUXO REPLICATE (modelos não-Gemini)
      // ============================================================================

      // Verificar chave Replicate
      if (!process.env.REPLICATE_API_TOKEN) {
        console.error('[AI Generate] REPLICATE_API_TOKEN not configured')
        return NextResponse.json(
          { error: 'Serviço de geração de imagens temporariamente indisponível. Entre em contato com o suporte.' },
          { status: 503 }
        )
      }

      const predictionParams = {
        model: body.model,
        prompt: body.prompt,
        aspectRatio: body.aspectRatio,
        resolution: body.resolution,
        referenceImages: publicReferenceUrls.length > 0 ? publicReferenceUrls : undefined,
        // Parâmetros de edição
        mode: body.mode,
        baseImage: publicBaseImageUrl,
        maskImage: body.maskImage,
      }

      // Executar geração com retry automático (máximo 2 tentativas devido ao limite de 300s do Vercel)
      const MAX_RETRIES = 2
      const RETRY_DELAY_MS = 10000
      const VERCEL_TIME_BUDGET_MS = 280000
      const MIN_TIME_FOR_RETRY_MS = 60000
      const startTime = Date.now()

      let result: { status: string; output?: string | string[]; error?: string; id: string; logs?: string }
      let lastError: Error | null = null
      let currentParams = { ...predictionParams }

      // Modelos que suportam fallback
      const FALLBACK_ELIGIBLE_MODELS: AIImageModel[] = ['nano-banana-2', 'nano-banana-pro']
      const FALLBACK_MODEL: AIImageModel = 'nano-banana-pro'

      const getRemainingTime = () => VERCEL_TIME_BUDGET_MS - (Date.now() - startTime)
      const getElapsedTime = () => Math.round((Date.now() - startTime) / 1000)

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const remainingTime = getRemainingTime()
        const pollingTimeout = Math.min(Math.floor(remainingTime / 1000) - 10, 120)

        if (remainingTime < MIN_TIME_FOR_RETRY_MS && attempt > 1) {
          console.log(`[AI Generate] Not enough time for retry (${Math.round(remainingTime / 1000)}s remaining). Stopping.`)
          break
        }

        try {
          if (attempt === 2 && FALLBACK_ELIGIBLE_MODELS.includes(currentParams.model as AIImageModel)) {
            console.log(`[AI Generate] Switching to fallback model: ${FALLBACK_MODEL}`)
            currentParams = {
              ...currentParams,
              model: FALLBACK_MODEL,
            }
            currentModelConfig = AI_IMAGE_MODELS[FALLBACK_MODEL]
            usedFallbackModel = true
          }

          console.log(`[AI Generate] Attempt ${attempt}/${MAX_RETRIES} with model: ${currentParams.model} (${pollingTimeout}s timeout, ${getElapsedTime()}s elapsed)`)
          actualModel = currentParams.model as string

          const prediction = await createReplicatePrediction(currentParams)
          console.log('[AI Generate] Prediction created:', prediction.id)

          result = await waitForPrediction(prediction.id, pollingTimeout)

          if (result.status === 'succeeded') {
            console.log(`[AI Generate] Success on attempt ${attempt}${usedFallbackModel ? ` (using fallback model ${FALLBACK_MODEL})` : ''} after ${getElapsedTime()}s`)
            break
          }

          if (result.status === 'failed') {
            const errorMessage = result.error || ''
            const isRetryable = isRetryableError(errorMessage)

            console.log(`[AI Generate] Prediction failed on attempt ${attempt}:`, {
              model: currentParams.model,
              error: errorMessage,
              isRetryable,
              attemptsRemaining: MAX_RETRIES - attempt,
              elapsedTime: `${getElapsedTime()}s`
            })

            if (isRetryable && attempt < MAX_RETRIES && getRemainingTime() > MIN_TIME_FOR_RETRY_MS) {
              console.log(`[AI Generate] Waiting ${RETRY_DELAY_MS / 1000}s before retry...`)
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
              continue
            }

            break
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          const errorMessage = lastError.message || ''
          const isRetryable = isRetryableError(errorMessage)

          console.error(`[AI Generate] Error on attempt ${attempt}:`, {
            model: currentParams.model,
            error: errorMessage,
            isRetryable,
            attemptsRemaining: MAX_RETRIES - attempt,
            elapsedTime: `${getElapsedTime()}s`
          })

          if (isRetryable && attempt < MAX_RETRIES && getRemainingTime() > MIN_TIME_FOR_RETRY_MS) {
            console.log(`[AI Generate] Waiting ${RETRY_DELAY_MS / 1000}s before retry...`)
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
            continue
          }

          throw lastError
        }
      }

      // Verificar se temos um resultado válido
      if (!result!) {
        throw lastError || new Error('Falha ao gerar imagem após múltiplas tentativas')
      }

      if (result.status === 'failed') {
        console.error('[AI Generate] Prediction failed:', {
          id: result.id,
          error: result.error,
          logs: result.logs,
          status: result.status
        })

        let errorMessage = result.error || 'Falha ao gerar imagem'

        if (errorMessage.toLowerCase().includes('failed to generate image after multiple retries')) {
          const modelName = currentModelConfig.displayName
          const originalModelName = modelConfig.displayName
          const triedFallback = usedFallbackModel ? ` e ${AI_IMAGE_MODELS[FALLBACK_MODEL].displayName}` : ''
          errorMessage = `🔄 Falha após ${MAX_RETRIES} tentativas automáticas\n\n` +
            `Tentamos com ${originalModelName}${triedFallback}, mas ambos estão com problemas no Replicate.\n\n` +
            `💡 Soluções:\n` +
            `• Tente outro modelo (FLUX Schnell ou FLUX 1.1 Pro)\n` +
            `• Aguarde alguns minutos e tente novamente\n` +
            `• Reduza o número de imagens de referência`
        } else if (errorMessage.includes('E6716')) {
          const modelName = currentModelConfig.displayName
          const refCount = publicReferenceUrls.length
          errorMessage = `⏱️ Timeout ao iniciar geração com ${modelName}\n\n` +
            `O modelo não conseguiu processar ${refCount} imagem${refCount > 1 ? 'ns' : ''} de referência a tempo.\n\n` +
            `💡 Soluções:\n` +
            `• Reduza para no máximo 3 imagens de referência\n` +
            `• Use FLUX 1.1 Pro (1 imagem) ou Nano Banana Pro (10 imagens)\n` +
            `• Aguarde alguns minutos e tente novamente`
        } else if (errorMessage.includes('NSFW') || errorMessage.includes('safety')) {
          errorMessage = '🚫 Conteúdo bloqueado pelo filtro de segurança.\n\nPor favor, ajuste o prompt e tente novamente com conteúdo apropriado.'
        } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          errorMessage = '⏱️ Tempo limite excedido ao processar a imagem.\n\n💡 Soluções:\n• Reduza a resolução (use 2K ao invés de 4K)\n• Diminua o número de imagens de referência\n• Tente novamente em alguns minutos'
        } else if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
          errorMessage = '⚠️ Limite de uso atingido no serviço de IA.\n\nO Replicate está com alta demanda. Aguarde alguns minutos e tente novamente.'
        } else if (errorMessage.includes('invalid') && errorMessage.includes('image')) {
          errorMessage = '❌ Formato de imagem inválido.\n\nVerifique se as imagens de referência estão em formato válido (JPG, PNG, WebP).'
        } else {
          errorMessage = `❌ Falha ao gerar imagem: ${errorMessage}\n\nSe o problema persistir, tente:\n• Usar outro modelo\n• Simplificar o prompt\n• Reduzir número de imagens de referência`
        }

        throw new Error(errorMessage)
      }

      // Upload para Vercel Blob
      const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output
      if (!imageUrl) {
        throw new Error('Nenhuma imagem foi retornada pelo modelo de IA. Tente novamente.')
      }

      const fileName = `ai-generated-${Date.now()}.png`
      blobUrl = await uploadToVercelBlob(imageUrl, fileName)
      predictionId = result.id
    }

    // 6. Calcular dimensões baseado no aspect ratio
    const dimensions = calculateDimensions(body.aspectRatio)

    // 6.5. Salvar no Google Drive (pasta IA)
    let googleDriveUrl: string | null = null
    try {
      const driveEnabled = googleDriveService?.isEnabled?.() ?? false

      if (driveEnabled && blobUrl) {
        const projectWithFolder = await db.project.findUnique({
          where: { id: body.projectId },
          select: { googleDriveFolderId: true, name: true },
        })

        if (projectWithFolder?.googleDriveFolderId) {
          console.log('[AI Generate] Uploading to Google Drive IA folder...')

          const imageResponse = await fetch(blobUrl)
          if (imageResponse.ok) {
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())

            const driveResult = await googleDriveService.uploadAIGeneratedImage(
              imageBuffer,
              projectWithFolder.googleDriveFolderId,
              projectWithFolder.name
            )

            googleDriveUrl = driveResult.publicUrl
            console.log('[AI Generate] Uploaded to Google Drive:', googleDriveUrl)
          }
        }
      }
    } catch (driveError) {
      console.error('[AI Generate] Drive upload failed (non-blocking):', driveError instanceof Error ? driveError.message : driveError)
    }

    // 7. Salvar no banco de dados (usando o modelo que realmente foi usado, pode ser fallback)
    const aiImage = await db.aIGeneratedImage.create({
      data: {
        projectId: body.projectId,
        name: `${currentModelConfig.displayName} - ${body.prompt.slice(0, 40)}${body.prompt.length > 40 ? '...' : ''}`,
        prompt: body.prompt,
        mode: 'GENERATE',
        fileUrl: googleDriveUrl || blobUrl,
        thumbnailUrl: blobUrl,
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: body.aspectRatio,
        provider: isGeminiModel && !usedFallbackModel ? 'gemini-direct' : currentModelConfig.provider.toLowerCase(),
        model: actualModel,
        predictionId: predictionId,
        createdBy: userId,
      },
    })

    // 8. Deduzir créditos após sucesso (quantidade calculada baseada no modelo usado)
    const actualCreditsRequired = usedFallbackModel
      ? calculateCreditsForModel(actualModel as AIImageModel, body.resolution)
      : creditsRequired

    await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'ai_image_generation',
      quantity: actualCreditsRequired,
      details: {
        mode: body.mode,
        model: actualModel,
        originalModel: usedFallbackModel ? body.model : undefined,
        usedFallbackModel,
        apiProvider: isGeminiModel ? 'gemini-direct' : 'replicate',
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

    // Erro de créditos insuficientes
    if (error.message?.includes('Créditos insuficientes') || error.message?.includes('Insufficient credits') || error.message?.includes('créditos insuficientes')) {
      const errorMessage = error instanceof Error ? error.message : 'Créditos insuficientes para gerar esta imagem.'
      return NextResponse.json(
        { error: errorMessage },
        { status: 402 }
      )
    }

    // Erro de validação (Zod)
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0]
      let friendlyMessage = firstError.message

      // Traduzir mensagens comuns de validação
      if (firstError.path.includes('projectId')) {
        friendlyMessage = 'ID do projeto inválido ou ausente.'
      } else if (firstError.path.includes('prompt')) {
        friendlyMessage = 'O prompt é obrigatório e não pode estar vazio.'
      } else if (firstError.path.includes('baseImage')) {
        friendlyMessage = 'Imagem base é obrigatória para modo de edição.'
      }

      return NextResponse.json(
        { error: `Dados inválidos: ${friendlyMessage}` },
        { status: 400 }
      )
    }

    // Erro do Replicate (API error) - retornar mensagem real
    if (error.message?.includes('Replicate API error')) {
      const errorMessage = error instanceof Error ? error.message.replace('Replicate API error:', '').trim() : 'Erro ao comunicar com o serviço de IA'
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      )
    }

    // Erro de processamento de imagem base
    if (error.message?.includes('Erro ao processar imagem base') || error.message?.includes('imagem base')) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao processar imagem base'
      console.error('[AI Generate] Base image processing error:', errorMessage)
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    // Erro genérico
    const errorMessage = error instanceof Error ? error.message : 'Falha ao gerar imagem. Tente novamente.'
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
  // Edit mode params
  mode?: 'generate' | 'edit' | 'inpaint'
  baseImage?: string
  maskImage?: string
}) {
  const modelConfig = AI_IMAGE_MODELS[params.model]
  const inputData: Record<string, unknown> = {
    prompt: params.prompt,
  }

  // Configuração para Nano Banana 2 e Nano Banana Pro
  inputData.aspect_ratio = params.aspectRatio
  inputData.output_format = 'png'

  // Resolução (apenas Pro)
  if (params.model === 'nano-banana-pro' && params.resolution) {
    inputData.resolution = params.resolution
  }

  // Modo de edição: usar baseImage como imagem principal
  if (params.mode === 'edit' && params.baseImage) {
    console.log(`[AI Generate] ${params.model} edit mode: using baseImage as primary input`)
    inputData.image_input = [params.baseImage]
  }
  // Modo geração: usar referenceImages (até 14 imagens)
  else if (params.referenceImages && params.referenceImages.length > 0) {
    inputData.image_input = params.referenceImages.slice(0, 14)
  }

  // Safety filter (apenas Pro)
  if (params.model === 'nano-banana-pro') {
    inputData.safety_filter_level = 'block_only_high'
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

    let errorMessage = 'Falha ao iniciar geração de imagem no Replicate'
    try {
      const errorData = JSON.parse(errorText)
      errorMessage = errorData.detail || errorData.error || errorMessage

      // Traduzir erros comuns da API do Replicate
      if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
        errorMessage = 'Erro de autenticação com o serviço de IA. Contate o suporte.'
      } else if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
        errorMessage = 'Limite de uso do serviço atingido. Aguarde alguns minutos e tente novamente.'
      } else if (errorMessage.includes('invalid model') || errorMessage.includes('model not found')) {
        errorMessage = 'Modelo de IA indisponível. Tente usar outro modelo.'
      } else if (errorMessage.includes('invalid input')) {
        errorMessage = 'Parâmetros inválidos enviados ao modelo de IA. Verifique as configurações.'
      }
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
      const errorText = await response.text()
      console.error('[AI Generate] Failed to check prediction status:', response.status, errorText)
      throw new Error('Falha ao verificar status da geração. Tente novamente.')
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

  const timeoutMinutes = Math.floor(maxAttempts / 60)
  throw new Error(
    `⏱️ Tempo limite excedido (${timeoutMinutes} minutos)\n\n` +
    `A geração está demorando mais que o esperado.\n\n` +
    `💡 Sugestões:\n` +
    `• Imagens 4K demoram mais - tente 2K\n` +
    `• Reduza o número de imagens de referência\n` +
    `• Tente novamente em alguns minutos\n` +
    `• Use um modelo mais rápido (FLUX Schnell)`
  )
}

async function uploadToVercelBlob(imageUrl: string, fileName: string) {
  const imageResponse = await fetch(imageUrl)

  if (!imageResponse.ok) {
    console.error('[AI Generate] Failed to fetch generated image:', imageResponse.status)
    throw new Error('Falha ao baixar imagem gerada do Replicate. Tente novamente.')
  }

  const imageBuffer = await imageResponse.arrayBuffer()

  try {
    const blob = await put(fileName, imageBuffer, {
      access: 'public',
      contentType: 'image/png',
    })

    return blob.url
  } catch (error) {
    console.error('[AI Generate] Failed to upload to Vercel Blob:', error)
    throw new Error('Falha ao salvar imagem gerada. Tente novamente.')
  }
}

async function storeBufferInVercelBlob(
  buffer: Buffer,
  fileName: string,
  contentType: string,
): Promise<string> {
  try {
    const blob = await put(fileName, buffer, {
      access: 'public',
      contentType,
    })

    return blob.url
  } catch (error) {
    console.error('[AI Generate] Failed to upload source image to Vercel Blob:', error)
    throw new Error('Falha ao preparar imagem para geração. Tente novamente.')
  }
}

function isVercelBlobUrl(url: string): boolean {
  return url.includes('vercel-storage.com') || url.includes('blob.vercel-storage.com')
}

function getFileExtensionFromMimeType(contentType: string): string {
  if (contentType.includes('png')) return '.png'
  if (contentType.includes('webp')) return '.webp'
  if (contentType.includes('gif')) return '.gif'
  return '.jpg'
}

async function fetchExternalImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) {
    throw new Error('Verifique se a URL está acessível.')
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'image/jpeg',
  }
}

async function fetchImageFromSource(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const googleDriveFileId = extractGoogleDriveFileId(url)
  if (googleDriveFileId) {
    return fetchGoogleDriveImage(googleDriveFileId)
  }

  return fetchExternalImage(url)
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

/**
 * Determine if an error should trigger an automatic retry
 * Returns true for transient/infrastructure errors that may succeed on retry
 */
function isRetryableError(errorMessage: string): boolean {
  const lowerError = errorMessage.toLowerCase()

  // Erros retryáveis - geralmente problemas temporários ou de infraestrutura
  const retryablePatterns = [
    'failed to generate image after multiple retries', // Erro específico do Replicate
    'deployment deadline exceeded', // Timeout do Replicate durante execução
    'timed out',
    'timeout',
    'tempo limite', // Versão em português
    'tempo excedido', // Versão em português
    'deadline exceeded', // gRPC/infra timeout genérico
    'queue',
    'queued',
    'e6716', // Código de erro específico do Replicate para timeout
    'rate limit',
    'too many requests',
    '429',
    '503',
    '502',
    '500',
    'service unavailable',
    'internal server error',
    'temporarily unavailable',
    'connection',
    'network',
    'cold boot', // Quando o modelo precisa ser carregado
    'starting',
    'warming up',
  ]

  // Verificar se algum padrão retryável está presente
  const isRetryable = retryablePatterns.some(pattern => lowerError.includes(pattern))

  // Erros NÃO retryáveis - problemas com o input ou filtros de segurança
  const nonRetryablePatterns = [
    'nsfw',
    'safety',
    'content policy',
    'invalid input',
    'invalid image',
    'authentication',
    'unauthorized',
    'forbidden',
    'not found',
    'model not found',
    'invalid model',
    'quota exceeded', // Limite permanente, não adianta retry
    'billing',
    'payment',
  ]

  const isNonRetryable = nonRetryablePatterns.some(pattern => lowerError.includes(pattern))

  // Se é explicitamente não retryável, não fazer retry
  if (isNonRetryable) {
    return false
  }

  return isRetryable
}

/**
 * Extract file ID from Google Drive internal API URL
 * Supports:
 * - /api/google-drive/image/{fileId}
 * - /api/drive/thumbnail/{fileId}
 */
function extractGoogleDriveFileId(url: string): string | null {
  // Match /api/google-drive/image/{fileId} or /api/drive/thumbnail/{fileId}
  const match = url.match(/\/api\/(?:google-drive\/image|drive\/thumbnail)\/([^/?]+)/)
  return match?.[1] ?? null
}

/**
 * Convert a readable stream to a Buffer
 */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * Fetch image from Google Drive using the service directly (server-side)
 * This avoids internal HTTP requests which don't work reliably in serverless
 */
async function fetchGoogleDriveImage(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
  console.log('[AI Generate] Fetching image directly from Google Drive:', fileId)

  if (!googleDriveService.isEnabled()) {
    throw new Error('Google Drive não está configurado')
  }

  const { stream, mimeType } = await googleDriveService.getFileStream(fileId)
  const buffer = await streamToBuffer(stream)

  console.log('[AI Generate] Google Drive image fetched:', {
    fileId,
    mimeType,
    sizeBytes: buffer.length,
    sizeMB: (buffer.length / (1024 * 1024)).toFixed(2)
  })

  return { buffer, contentType: mimeType }
}
