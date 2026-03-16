/**
 * Client para geração de imagens diretamente via API do Google Gemini/Imagen
 *
 * Usa o SDK @google/genai para comunicação direta com:
 * - Imagen 3 para geração de imagens (via generateImages)
 * - Gemini Flash para edição com referências (via generateContent)
 */

import { GoogleGenAI } from '@google/genai'

// Singleton do client Gemini
let _geminiClient: GoogleGenAI | null = null

function getGeminiClient(): GoogleGenAI {
  if (!_geminiClient) {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY não está configurada')
    }
    _geminiClient = new GoogleGenAI({ apiKey })
  }
  return _geminiClient
}

// Configuração dos modelos
const MODEL_CONFIG = {
  'nano-banana-2': {
    // Imagen 3 Fast - mais rápido, ótima qualidade
    imagenModel: 'imagen-3.0-fast-generate-001',
    geminiModel: 'gemini-2.0-flash-exp',
  },
  'nano-banana-pro': {
    // Imagen 3 - máxima qualidade
    imagenModel: 'imagen-3.0-generate-001',
    geminiModel: 'gemini-2.0-flash-exp',
  },
} as const

export interface GeminiImageParams {
  model: 'nano-banana-2' | 'nano-banana-pro'
  prompt: string
  aspectRatio?: string
  resolution?: '1K' | '2K' | '4K'
  referenceImages?: Buffer[]
  referenceImageTypes?: string[]
  mode?: 'generate' | 'edit'
  baseImage?: Buffer
  baseImageType?: string
}

export interface GeminiImageResult {
  imageBuffer: Buffer
  mimeType: string
}

/**
 * Gera uma imagem usando a API Imagen 3 do Google
 */
async function generateWithImagen3(
  client: GoogleGenAI,
  modelId: string,
  prompt: string,
  aspectRatio?: string
): Promise<GeminiImageResult> {
  console.log('[Gemini Image] Using Imagen 3 API:', { modelId, prompt: prompt.substring(0, 100) })

  // Mapear aspect ratio para formato Imagen 3
  const aspectRatioMap: Record<string, string> = {
    '1:1': '1:1',
    '4:3': '4:3',
    '3:4': '3:4',
    '16:9': '16:9',
    '9:16': '9:16',
  }

  const mappedAspectRatio = aspectRatio ? aspectRatioMap[aspectRatio] || '1:1' : '1:1'

  const response = await client.models.generateImages({
    model: modelId,
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: mappedAspectRatio,
    },
  })

  // Extrair imagem da resposta
  if (!response.generatedImages || response.generatedImages.length === 0) {
    throw new Error('Nenhuma imagem gerada pela API Imagen 3')
  }

  const generatedImage = response.generatedImages[0]

  if (!generatedImage.image?.imageBytes) {
    throw new Error('Imagem gerada não contém dados')
  }

  const imageBuffer = Buffer.from(generatedImage.image.imageBytes, 'base64')

  console.log('[Gemini Image] Imagen 3 success:', {
    model: modelId,
    mimeType: generatedImage.image.mimeType || 'image/png',
    sizeBytes: imageBuffer.length,
    sizeMB: (imageBuffer.length / (1024 * 1024)).toFixed(2),
  })

  return {
    imageBuffer,
    mimeType: generatedImage.image.mimeType || 'image/png',
  }
}

/**
 * Gera/edita imagem usando Gemini multimodal (para referências e edição)
 */
async function generateWithGeminiMultimodal(
  client: GoogleGenAI,
  modelId: string,
  params: GeminiImageParams
): Promise<GeminiImageResult> {
  console.log('[Gemini Image] Using Gemini multimodal:', { modelId })

  // Montar o contents array
  const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

  // Adicionar imagem base para edição
  if (params.mode === 'edit' && params.baseImage) {
    contents.push({
      inlineData: {
        mimeType: params.baseImageType || 'image/jpeg',
        data: params.baseImage.toString('base64'),
      },
    })
  }

  // Adicionar imagens de referência (até 5)
  if (params.referenceImages && params.referenceImages.length > 0) {
    const maxRefs = Math.min(params.referenceImages.length, 5)
    for (let i = 0; i < maxRefs; i++) {
      contents.push({
        inlineData: {
          mimeType: params.referenceImageTypes?.[i] || 'image/jpeg',
          data: params.referenceImages[i].toString('base64'),
        },
      })
    }
  }

  // Adicionar o prompt de texto
  contents.push({ text: params.prompt })

  const response = await client.models.generateContent({
    model: modelId,
    contents,
    config: {
      responseModalities: ['IMAGE'],
    },
  })

  // Extrair imagem da resposta
  if (!response.candidates || response.candidates.length === 0) {
    throw new Error('Nenhum candidato retornado pela API Gemini')
  }

  const parts = response.candidates[0].content?.parts
  if (!parts || parts.length === 0) {
    throw new Error('Resposta vazia da API Gemini')
  }

  // Procurar a parte com imagem
  for (const part of parts) {
    if (part.inlineData?.data) {
      const imageBuffer = Buffer.from(part.inlineData.data, 'base64')

      console.log('[Gemini Image] Gemini multimodal success:', {
        model: modelId,
        mimeType: part.inlineData.mimeType || 'image/png',
        sizeBytes: imageBuffer.length,
        sizeMB: (imageBuffer.length / (1024 * 1024)).toFixed(2),
      })

      return {
        imageBuffer,
        mimeType: part.inlineData.mimeType || 'image/png',
      }
    }
  }

  // Se chegou aqui, não encontrou imagem - pode ter texto de erro
  const textParts = parts.filter(p => p.text).map(p => p.text).join(' ')
  throw new Error(
    textParts
      ? `API Gemini retornou texto ao invés de imagem: ${textParts.substring(0, 200)}`
      : 'API Gemini não retornou nenhuma imagem'
  )
}

/**
 * Gera uma imagem usando a API do Google (Imagen 3 ou Gemini)
 *
 * - Sem referências: usa Imagen 3 (melhor qualidade)
 * - Com referências ou edição: usa Gemini multimodal
 */
export async function generateImageWithGemini(
  params: GeminiImageParams
): Promise<GeminiImageResult> {
  const client = getGeminiClient()
  const config = MODEL_CONFIG[params.model]

  if (!config) {
    throw new Error(`Modelo não suportado: ${params.model}`)
  }

  const hasReferences = params.referenceImages && params.referenceImages.length > 0
  const isEditing = params.mode === 'edit' && params.baseImage

  console.log('[Gemini Image] Generating image:', {
    model: params.model,
    promptLength: params.prompt.length,
    hasBaseImage: !!params.baseImage,
    referenceCount: params.referenceImages?.length || 0,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
    mode: params.mode,
    useImagen: !hasReferences && !isEditing,
  })

  try {
    // Se tem referências ou está editando, usar Gemini multimodal
    if (hasReferences || isEditing) {
      return await generateWithGeminiMultimodal(client, config.geminiModel, params)
    }

    // Caso contrário, usar Imagen 3 (melhor qualidade para geração pura)
    return await generateWithImagen3(client, config.imagenModel, params.prompt, params.aspectRatio)
  } catch (error) {
    // Traduzir erros conhecidos da API
    const errorMessage = error instanceof Error ? error.message : String(error)
    const lowerError = errorMessage.toLowerCase()

    console.error('[Gemini Image] Error:', {
      model: params.model,
      error: errorMessage,
    })

    // Safety filter
    if (lowerError.includes('safety') || lowerError.includes('blocked') || lowerError.includes('harm') || lowerError.includes('responsible')) {
      throw new Error(
        '🚫 Conteúdo bloqueado pelo filtro de segurança do Google.\n\n' +
        'Por favor, ajuste o prompt e tente novamente com conteúdo apropriado.'
      )
    }

    // Rate limiting
    if (lowerError.includes('rate') || lowerError.includes('429') || lowerError.includes('quota') || lowerError.includes('resource_exhausted')) {
      throw new Error(
        '⚠️ Limite de uso da API atingido.\n\n' +
        'Aguarde alguns minutos e tente novamente.'
      )
    }

    // Token/auth errors
    if (lowerError.includes('api key') || lowerError.includes('unauthorized') || lowerError.includes('authentication') || lowerError.includes('permission')) {
      throw new Error(
        '🔑 Erro de autenticação com a API Google.\n\n' +
        'Contate o suporte técnico.'
      )
    }

    // Model not found
    if (lowerError.includes('not found') || lowerError.includes('does not exist')) {
      throw new Error(
        '❌ Modelo de IA não disponível.\n\n' +
        'O modelo solicitado pode não estar disponível na sua região ou conta.'
      )
    }

    // Invalid request
    if (lowerError.includes('invalid') && !lowerError.includes('image')) {
      throw new Error(
        '❌ Parâmetros inválidos.\n\n' +
        'Verifique o prompt e as configurações e tente novamente.'
      )
    }

    // Re-throw with original message if not matched
    throw error
  }
}

/**
 * Verifica se o erro é retryable
 */
export function isGeminiRetryableError(errorMessage: string): boolean {
  const lowerError = errorMessage.toLowerCase()

  const retryablePatterns = [
    'rate',
    '429',
    '503',
    '500',
    'resource_exhausted',
    'quota',
    'unavailable',
    'deadline',
    'timeout',
    'internal',
    'temporarily',
    'overloaded',
    'limite de uso',
    'temporariamente indisponível',
  ]

  const nonRetryablePatterns = [
    'safety',
    'blocked',
    'harm',
    'api key',
    'unauthorized',
    'authentication',
    'permission',
    'invalid',
    'billing',
    'not found',
    'does not exist',
    'responsible',
  ]

  if (nonRetryablePatterns.some(p => lowerError.includes(p))) {
    return false
  }

  return retryablePatterns.some(p => lowerError.includes(p))
}
