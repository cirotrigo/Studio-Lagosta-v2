/**
 * Client para geração de imagens diretamente via API do Google Gemini
 *
 * Usa o SDK @google/genai para comunicação direta, eliminando o Replicate como intermediário
 * para os modelos Gemini (nano-banana-pro e nano-banana).
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

// Mapeamento dos nomes internos para model IDs da API Gemini
const GEMINI_MODEL_MAP: Record<string, string> = {
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  'nano-banana': 'gemini-2.5-flash-image',
}

export interface GeminiImageParams {
  model: 'nano-banana-pro' | 'nano-banana'
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
 * Gera uma imagem usando a API direta do Gemini
 */
export async function generateImageWithGemini(
  params: GeminiImageParams
): Promise<GeminiImageResult> {
  const client = getGeminiClient()
  const geminiModelId = GEMINI_MODEL_MAP[params.model]

  if (!geminiModelId) {
    throw new Error(`Modelo Gemini não suportado: ${params.model}`)
  }

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

  // Adicionar imagens de referência
  if (params.referenceImages && params.referenceImages.length > 0) {
    for (let i = 0; i < params.referenceImages.length; i++) {
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

  // Montar config de imagem
  const imageConfig: Record<string, string> = {}

  // Aspect ratio (não enviar para match_input_image - API infere do input)
  if (params.aspectRatio && params.aspectRatio !== 'match_input_image' && params.aspectRatio !== 'custom') {
    imageConfig.aspectRatio = params.aspectRatio
  }

  // Resolução (apenas nano-banana-pro suporta 2K e 4K)
  if (params.model === 'nano-banana-pro' && params.resolution) {
    imageConfig.imageSize = params.resolution
  }

  console.log('[Gemini Image] Generating image:', {
    model: geminiModelId,
    promptLength: params.prompt.length,
    hasBaseImage: !!params.baseImage,
    referenceCount: params.referenceImages?.length || 0,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
    mode: params.mode,
  })

  try {
    const response = await client.models.generateContent({
      model: geminiModelId,
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
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

        console.log('[Gemini Image] Image generated successfully:', {
          model: geminiModelId,
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
    // Traduzir erros conhecidos da API Gemini
    const errorMessage = error instanceof Error ? error.message : String(error)
    const lowerError = errorMessage.toLowerCase()

    console.error('[Gemini Image] Error:', {
      model: geminiModelId,
      error: errorMessage,
    })

    // Safety filter
    if (lowerError.includes('safety') || lowerError.includes('blocked') || lowerError.includes('harm')) {
      throw new Error(
        '🚫 Conteúdo bloqueado pelo filtro de segurança do Google.\n\n' +
        'Por favor, ajuste o prompt e tente novamente com conteúdo apropriado.'
      )
    }

    // Rate limiting
    if (lowerError.includes('rate') || lowerError.includes('429') || lowerError.includes('quota') || lowerError.includes('resource_exhausted')) {
      throw new Error(
        '⚠️ Limite de uso da API Gemini atingido.\n\n' +
        'Aguarde alguns minutos e tente novamente.'
      )
    }

    // Token/auth errors
    if (lowerError.includes('api key') || lowerError.includes('unauthorized') || lowerError.includes('authentication') || lowerError.includes('permission')) {
      throw new Error(
        '🔑 Erro de autenticação com a API Gemini.\n\n' +
        'Contate o suporte técnico.'
      )
    }

    // Invalid request
    if (lowerError.includes('invalid') && !lowerError.includes('image')) {
      throw new Error(
        '❌ Parâmetros inválidos para a API Gemini.\n\n' +
        'Verifique o prompt e as configurações e tente novamente.'
      )
    }

    // Re-throw with original message if not matched
    throw error
  }
}

/**
 * Verifica se o erro do Gemini é retryable
 */
export function isGeminiRetryableError(errorMessage: string): boolean {
  const lowerError = errorMessage.toLowerCase()

  const retryablePatterns = [
    'rate',
    '429',
    '503',
    '500',
    'resource_exhausted',
    'unavailable',
    'deadline',
    'timeout',
    'internal',
    'temporarily',
    'overloaded',
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
    'quota exceeded',
    'billing',
  ]

  if (nonRetryablePatterns.some(p => lowerError.includes(p))) {
    return false
  }

  return retryablePatterns.some(p => lowerError.includes(p))
}
