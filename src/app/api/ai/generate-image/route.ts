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
    'flux-1.1-pro',
    'flux-schnell',
    'nano-banana-pro',
    'nano-banana',
    'seedream-4',
    'ideogram-v3-turbo',
    'recraft-v3',
    'stable-diffusion-3'
  ], {
    errorMap: () => ({ message: 'Modelo de IA inválido. Escolha um dos modelos disponíveis.' })
  }).default('flux-1.1-pro'),
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
  // Parâmetros específicos do FLUX
  seed: z.number().int('Seed deve ser um número inteiro').optional(),
  promptUpsampling: z.boolean().optional(),
  safetyTolerance: z.number().min(1, 'Safety tolerance deve ser entre 1 e 6').max(6, 'Safety tolerance deve ser entre 1 e 6').optional(),
  outputQuality: z.number().min(0, 'Qualidade deve ser entre 0 e 100').max(100, 'Qualidade deve ser entre 0 e 100').optional(),
  // Parâmetros específicos do Ideogram
  styleType: z.enum(['auto', 'general', 'realistic', 'design'], {
    errorMap: () => ({ message: 'Tipo de estilo inválido' })
  }).optional(),
  magicPrompt: z.boolean().optional(),
  // Parâmetros específicos do Seedream
  enhancePrompt: z.boolean().optional(),
  // Parâmetros específicos do Stable Diffusion
  cfgScale: z.number().min(0, 'CFG Scale deve ser entre 0 e 20').max(20, 'CFG Scale deve ser entre 0 e 20').optional(),
  steps: z.number().min(1, 'Steps deve ser entre 1 e 50').max(50, 'Steps deve ser entre 1 e 50').optional(),
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

  // Verificar se a chave da API do Replicate está configurada
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('[AI Generate] REPLICATE_API_TOKEN not configured')
    return NextResponse.json(
      { error: 'Serviço de geração de imagens temporariamente indisponível. Entre em contato com o suporte.' },
      { status: 503 }
    )
  }
  console.log('[AI Generate] REPLICATE_API_TOKEN is configured:', process.env.REPLICATE_API_TOKEN?.substring(0, 10) + '...')

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
            `• Seedream 4: 3 créditos\n` +
            `• FLUX 1.1 Pro: 4 créditos`
          )
        }
      }
      throw error
    }

    // 4. Upload de imagens de referência para Vercel Blob (se houver)
    let publicReferenceUrls: string[] = []
    if (body.referenceImages && body.referenceImages.length > 0) {
      console.log('[AI Generate] Uploading reference images to Vercel Blob...', {
        count: body.referenceImages.length,
        urls: body.referenceImages
      })

      publicReferenceUrls = await Promise.all(
        body.referenceImages.map(async (url, index) => {
          try {
            // Se já é uma URL pública do Vercel Blob, usar diretamente
            if (url.includes('vercel-storage.com') || url.includes('blob.vercel-storage.com')) {
              console.log('[AI Generate] Using existing Vercel Blob URL:', url)
              return url
            }

            // Se é uma URL do Google Drive, usar o serviço diretamente
            let imageBuffer: Buffer | ArrayBuffer
            let contentType = 'image/jpeg'

            const googleDriveFileId = extractGoogleDriveFileId(url)
            if (googleDriveFileId) {
              console.log('[AI Generate] Using Google Drive service for reference image:', googleDriveFileId)

              try {
                const { buffer, contentType: driveContentType } = await fetchGoogleDriveImage(googleDriveFileId)
                imageBuffer = buffer
                contentType = driveContentType
              } catch (error) {
                console.error(`[AI Generate] Failed to fetch reference image ${index + 1} from Google Drive:`, error)
                throw new Error(`Falha ao carregar imagem de referência ${index + 1} do Google Drive. Verifique se o arquivo existe e você tem permissão.`)
              }
            } else {
              // Para outras URLs, fazer fetch normal
              const response = await fetch(url)
              if (!response.ok) {
                throw new Error(`Falha ao carregar imagem de referência ${index + 1}. Verifique se a URL está acessível.`)
              }
              imageBuffer = await response.arrayBuffer()
              contentType = response.headers.get('content-type') || 'image/jpeg'
            }

            // Validar tamanho da imagem de referência
            const sizeInMb = (imageBuffer.byteLength / (1024 * 1024)).toFixed(2)
            const maxMb = 10 // Limite de 10MB para imagens de referência

            console.log(`[AI Generate] Reference image ${index + 1} size: ${sizeInMb}MB`)

            if (imageBuffer.byteLength > maxMb * 1024 * 1024) {
              throw new Error(`Imagem de referência ${index + 1} muito grande (${sizeInMb}MB). Tamanho máximo: ${maxMb}MB.\n\nCompacte a imagem antes de enviar.`)
            }

            // Upload para Vercel Blob
            const fileName = `ai-ref-${Date.now()}-${index}.jpg`
            const blob = await put(fileName, imageBuffer, {
              access: 'public',
              contentType,
            })

            console.log('[AI Generate] Reference image uploaded:', blob.url)

            // Verificar se a imagem está acessível
            const testResponse = await fetch(blob.url, { method: 'HEAD' })
            if (!testResponse.ok) {
              throw new Error(`Falha ao verificar imagem enviada (HTTP ${testResponse.status}). Tente novamente.`)
            }

            return blob.url
          } catch (error) {
            console.error(`[AI Generate] Error processing reference image ${index + 1}:`, error)
            throw new Error(`Erro ao processar imagem de referência ${index + 1}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
          }
        })
      )

      console.log('[AI Generate] All reference images validated and ready:', {
        count: publicReferenceUrls.length,
        urls: publicReferenceUrls
      })
    }

    // 4.5. Upload de imagem base para Vercel Blob (se necessário para modo edit)
    let publicBaseImageUrl: string | undefined = body.baseImage
    if (body.baseImage && (body.mode === 'edit' || body.mode === 'inpaint')) {
      console.log('[AI Generate] Processing base image for edit mode:', body.baseImage)

      try {
        // Se já é uma URL pública do Vercel Blob, usar diretamente
        if (body.baseImage.includes('vercel-storage.com') || body.baseImage.includes('blob.vercel-storage.com')) {
          console.log('[AI Generate] Base image is already a Vercel Blob URL')
          publicBaseImageUrl = body.baseImage
        }
        // Se é uma URL do Google Drive (internal API), usar o serviço diretamente
        else {
          const googleDriveFileId = extractGoogleDriveFileId(body.baseImage)

          if (googleDriveFileId) {
            console.log('[AI Generate] Using Google Drive service for base image:', googleDriveFileId)

            try {
              const { buffer: imageBuffer, contentType } = await fetchGoogleDriveImage(googleDriveFileId)

              // Validar tamanho
              const sizeInMb = (imageBuffer.length / (1024 * 1024)).toFixed(2)
              console.log(`[AI Generate] Base image size: ${sizeInMb}MB, content-type: ${contentType}`)

              if (imageBuffer.length > 10 * 1024 * 1024) {
                throw new Error(`Imagem base muito grande (${sizeInMb}MB). Tamanho máximo: 10MB.`)
              }

              if (imageBuffer.length === 0) {
                throw new Error('Imagem base está vazia. Selecione outra imagem.')
              }

              // Upload para Vercel Blob
              const fileName = `ai-base-${Date.now()}.jpg`
              const blob = await put(fileName, imageBuffer, {
                access: 'public',
                contentType,
              })

              console.log('[AI Generate] Base image uploaded to Vercel Blob:', blob.url)
              publicBaseImageUrl = blob.url
            } catch (fetchError) {
              console.error('[AI Generate] Error fetching base image from Google Drive:', fetchError)
              throw new Error(`Falha ao carregar imagem base do Google Drive: ${fetchError instanceof Error ? fetchError.message : 'Erro desconhecido'}`)
            }
          }
          // Para outras URLs externas, usar diretamente
          else {
            console.log('[AI Generate] Using external base image URL directly:', body.baseImage)
            publicBaseImageUrl = body.baseImage
          }
        }
      } catch (error) {
        console.error('[AI Generate] Error processing base image:', error)
        throw new Error(`Erro ao processar imagem base: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
      }
    }

    // 5. Criar prediction no Replicate com retry automático
    console.log('[AI Generate] Creating prediction with:', {
      model: body.model,
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      referenceImagesCount: publicReferenceUrls.length,
      referenceImages: publicReferenceUrls
    })

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
    }

    // 6. Executar geração com retry automático (máximo 2 tentativas devido ao limite de 300s do Vercel)
    // Na 2ª tentativa, troca para modelo alternativo se o original for nano-banana-pro
    const MAX_RETRIES = 2 // Reduzido para caber no limite de 300s do Vercel
    const RETRY_DELAY_MS = 10000 // 10 segundos (reduzido de 30s)
    const VERCEL_TIME_BUDGET_MS = 280000 // 280s de orçamento (deixa 20s de buffer para upload/save)
    const MIN_TIME_FOR_RETRY_MS = 60000 // Mínimo de 60s para tentar retry
    const startTime = Date.now()

    let result: { status: string; output?: string | string[]; error?: string; id: string; logs?: string }
    let lastError: Error | null = null
    let currentParams = { ...predictionParams }
    let currentModelConfig = modelConfig
    let usedFallbackModel = false

    // Modelos que suportam fallback para Seedream 4
    const FALLBACK_ELIGIBLE_MODELS: AIImageModel[] = ['nano-banana-pro', 'nano-banana']
    const FALLBACK_MODEL: AIImageModel = 'seedream-4'

    // Função para calcular tempo restante
    const getRemainingTime = () => VERCEL_TIME_BUDGET_MS - (Date.now() - startTime)
    const getElapsedTime = () => Math.round((Date.now() - startTime) / 1000)

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const remainingTime = getRemainingTime()
      const pollingTimeout = Math.min(Math.floor(remainingTime / 1000) - 10, 120) // Max 120s por tentativa, deixa 10s buffer

      // Verificar se há tempo suficiente para tentar
      if (remainingTime < MIN_TIME_FOR_RETRY_MS && attempt > 1) {
        console.log(`[AI Generate] Not enough time for retry (${Math.round(remainingTime / 1000)}s remaining). Stopping.`)
        break
      }

      try {
        // Na 2ª tentativa, trocar para modelo alternativo se elegível
        if (attempt === 2 && FALLBACK_ELIGIBLE_MODELS.includes(currentParams.model as AIImageModel)) {
          console.log(`[AI Generate] Switching to fallback model: ${FALLBACK_MODEL}`)
          currentParams = {
            ...currentParams,
            model: FALLBACK_MODEL,
            // Seedream 4 suporta até 10 imagens de referência, então mantemos todas
          }
          currentModelConfig = AI_IMAGE_MODELS[FALLBACK_MODEL]
          usedFallbackModel = true
        }

        console.log(`[AI Generate] Attempt ${attempt}/${MAX_RETRIES} with model: ${currentParams.model} (${pollingTimeout}s timeout, ${getElapsedTime()}s elapsed)`)

        const prediction = await createReplicatePrediction(currentParams)
        console.log('[AI Generate] Prediction created:', prediction.id)

        // Aguardar conclusão com timeout dinâmico baseado no tempo restante
        result = await waitForPrediction(prediction.id, pollingTimeout)

        // Se sucesso, sair do loop
        if (result.status === 'succeeded') {
          console.log(`[AI Generate] Success on attempt ${attempt}${usedFallbackModel ? ` (using fallback model ${FALLBACK_MODEL})` : ''} after ${getElapsedTime()}s`)
          break
        }

        // Verificar se o erro é retryable
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

          // Não é retryable ou última tentativa ou sem tempo - sair do loop
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

        // Não é retryable ou última tentativa ou sem tempo - propagar erro
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

      // Erro específico do Replicate
      let errorMessage = result.error || 'Falha ao gerar imagem'

      // Erros conhecidos do Replicate
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
          `• Use FLUX 1.1 Pro (1 imagem) ou Seedream 4 (10 imagens)\n` +
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
        // Melhorar mensagem genérica
        errorMessage = `❌ Falha ao gerar imagem: ${errorMessage}\n\nSe o problema persistir, tente:\n• Usar outro modelo\n• Simplificar o prompt\n• Reduzir número de imagens de referência`
      }

      throw new Error(errorMessage)
    }

    // 7. Upload para Vercel Blob
    const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output
    if (!imageUrl) {
      throw new Error('Nenhuma imagem foi retornada pelo modelo de IA. Tente novamente.')
    }

    const fileName = `ai-generated-${Date.now()}.png`
    const blobUrl = await uploadToVercelBlob(imageUrl, fileName)

    // 8. Calcular dimensões baseado no aspect ratio
    const dimensions = calculateDimensions(body.aspectRatio)

    // 9. Salvar no banco de dados (usando o modelo que realmente foi usado, pode ser fallback)
    const actualModel = currentParams.model as string
    const aiImage = await db.aIGeneratedImage.create({
      data: {
        projectId: body.projectId,
        name: `${currentModelConfig.displayName} - ${body.prompt.slice(0, 40)}${body.prompt.length > 40 ? '...' : ''}`,
        prompt: body.prompt,
        mode: 'GENERATE',
        fileUrl: blobUrl,
        thumbnailUrl: blobUrl, // Por enquanto usa a mesma URL
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: body.aspectRatio,
        provider: currentModelConfig.provider.toLowerCase(),
        model: actualModel,
        predictionId: result.id,
        createdBy: userId,
      },
    })

    // 10. Deduzir créditos após sucesso (quantidade calculada baseada no modelo usado)
    // Se usou fallback, calcular créditos do modelo que realmente foi usado
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

    // Modo de edição: usar baseImage como imagem principal
    if (params.mode === 'edit' && params.baseImage) {
      console.log('[AI Generate] Seedream 4 edit mode: using baseImage as primary input')
      inputData.image_input = [params.baseImage]
      // Prompt deve descrever as mudanças (ex: "remove a garrafa verde")
    }
    // Modo geração: usar referenceImages (se houver)
    else if (params.referenceImages && params.referenceImages.length > 0) {
      inputData.image_input = params.referenceImages
    }

  } else if (params.model === 'ideogram-v3-turbo') {
    // Ideogram v3 Turbo

    // Modo inpainting: usar baseImage + maskImage
    if ((params.mode === 'inpaint' || params.mode === 'edit') && params.baseImage) {
      console.log('[AI Generate] Ideogram v3 inpainting mode: using baseImage and mask')

      // IMPORTANTE: Ideogram v3 NÃO suporta edição direta de imagens via API
      // O modelo só suporta: geração normal ou inpainting com máscara
      // Para "editar" uma imagem, precisamos usar o prompt descrevendo o que queremos
      throw new Error(
        'O modelo Ideogram v3 Turbo não suporta edição direta de imagens.\n\n' +
        '💡 Use um destes modelos para edição:\n' +
        '• Seedream 4 - Edição profissional (3-6 créditos)\n' +
        '• Nano Banana Pro - Edição 4K (15-30 créditos)\n\n' +
        'ℹ️ O Ideogram é excelente para gerar imagens com texto perfeito.'
      )
    } else {
      // Modo geração normal
      inputData.aspect_ratio = params.aspectRatio
    }

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

    // Style reference (primeira imagem de referência) - só em modo geração
    if (!params.baseImage && params.referenceImages && params.referenceImages.length > 0) {
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

    // Modo de edição: usar baseImage como imagem principal
    if (params.mode === 'edit' && params.baseImage) {
      console.log('[AI Generate] Nano Banana Pro edit mode: using baseImage as primary input')
      inputData.image_input = [params.baseImage]
      // Prompt deve descrever as mudanças (ex: "remove a garrafa verde, blur background")
    }
    // Modo geração: usar referenceImages (se houver)
    else if (params.referenceImages && params.referenceImages.length > 0) {
      inputData.image_input = params.referenceImages
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
