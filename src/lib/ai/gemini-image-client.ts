/**
 * Client para geração de imagens via API do Google Gemini
 *
 * Usa o SDK @google/genai com Gemini 2.0 Flash para geração de imagens
 * com suporte a referências visuais
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

// Modelos para geração de imagens
const GEMINI_IMAGE_MODELS = {
  'nano-banana-2': 'gemini-3.1-flash-image-preview',  // Mais rápido
  'nano-banana-pro': 'gemini-3-pro-image-preview',    // Maior qualidade, 4K
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
 * Gera uma imagem usando Gemini 2.0 Flash
 */
export async function generateImageWithGemini(
  params: GeminiImageParams
): Promise<GeminiImageResult> {
  const client = getGeminiClient()
  const modelId = GEMINI_IMAGE_MODELS[params.model]

  if (!modelId) {
    throw new Error(`Modelo não suportado: ${params.model}`)
  }

  console.log('[Gemini Image] Generating image:', {
    model: modelId,
    internalModel: params.model,
    promptLength: params.prompt.length,
    hasBaseImage: !!params.baseImage,
    referenceCount: params.referenceImages?.length || 0,
    aspectRatio: params.aspectRatio,
    mode: params.mode,
  })

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

  // Construir prompt com instruções de aspect ratio se necessário
  let finalPrompt = params.prompt
  if (params.aspectRatio && params.aspectRatio !== '1:1') {
    finalPrompt = `Generate an image with aspect ratio ${params.aspectRatio}. ${params.prompt}`
  }

  // Adicionar o prompt de texto
  contents.push({ text: finalPrompt })

  try {
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

        console.log('[Gemini Image] Success:', {
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
  } catch (error) {
    // Traduzir erros conhecidos da API
    const errorMessage = error instanceof Error ? error.message : String(error)
    const lowerError = errorMessage.toLowerCase()

    console.error('[Gemini Image] Error:', {
      model: modelId,
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

    // Model not found / version error
    if (lowerError.includes('not found') || lowerError.includes('does not exist') || lowerError.includes('version')) {
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
    'version',
  ]

  if (nonRetryablePatterns.some(p => lowerError.includes(p))) {
    return false
  }

  return retryablePatterns.some(p => lowerError.includes(p))
}
