/**
 * Configuração de Modelos de IA para Geração de Imagens
 *
 * Define os modelos disponíveis (Nano Banana 2 e Nano Banana Pro)
 */

export type AIImageModel = 'nano-banana-2' | 'nano-banana-pro'

export type AIImageMode = 'generate' | 'edit' | 'inpaint'

export type AIImageApiProvider = 'gemini' | 'replicate'

export interface AIImageModelConfig {
  id: AIImageModel
  name: string
  provider: string
  displayName: string
  description: string
  /**
   * ID do modelo na API do GOOGLE (o que `gemini-image-client.ts` manda no
   * `generateContent`). É a fonte única: o client lê daqui, com override por
   * env. NÃO é identificador do Replicate — ver `replicateModel`.
   */
  version: string
  /**
   * Modelo oficial no Replicate (`owner/name`), usado só pela alternativa de
   * `generate-image/route.ts`. Até 21/11/2026 a alternativa mandava o `version`
   * acima para o Replicate, que é um ID do Google: a chamada não tinha como dar
   * certo, e ficou assim de 16/03 a 21/11/2026.
   */
  replicateModel?: string
  apiProvider: AIImageApiProvider

  // Capacidades
  capabilities: {
    maxResolution: string
    minResolution: string
    maxReferenceImages: number
    supportsCustomDimensions: boolean
    supports4K: boolean
    averageSpeed: string // em segundos
    supportsImageEditing?: boolean
    supportsInpainting?: boolean
    supportedModes?: AIImageMode[]
  }

  // Custos
  pricing: {
    baseCredits: number
    resolution1K?: number
    resolution2K?: number
    resolution4K?: number
  }

  // Aspect Ratios suportados
  aspectRatios: string[]

  // Resoluções disponíveis
  resolutions?: Array<'1K' | '2K' | '4K'>

  // Features especiais
  features: string[]

  // Status
  isRecommended?: boolean
  isNew?: boolean
  isDeprecated?: boolean
}

export const AI_IMAGE_MODELS: Record<AIImageModel, AIImageModelConfig> = {
  'nano-banana-2': {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    provider: 'Google',
    displayName: 'Nano Banana 2',
    description: 'Modelo mais recente e rápido para geração de imagens com referências',
    // O apelido segue `nano-banana-2` (está no banco, no MCP e na tabela de
    // créditos), mas o modelo é o Nano Banana 2.1 desde 21/11/2026: o preview
    // `gemini-3.1-flash-image-preview` foi desligado pelo Google em 25/06/2026.
    version: 'gemini-nano-banana-2.1',
    apiProvider: 'gemini',

    capabilities: {
      maxResolution: '2048x2048',
      minResolution: '512x512',
      maxReferenceImages: 14,
      supportsCustomDimensions: false,
      supports4K: false,
      averageSpeed: '5-15',
    },

    pricing: {
      baseCredits: 10,
    },

    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'],

    features: [
      'Modelo mais atual e estável',
      'Até 14 imagens de referência',
      'Excelente qualidade de imagem',
      'Múltiplos aspect ratios',
      'Ideal para fundos de artes',
    ],

    isRecommended: true,
    isNew: true,
  },

  'nano-banana-pro': {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    provider: 'Google',
    displayName: 'Nano Banana Pro',
    description: 'Modelo profissional com qualidade 4K e texto preciso',
    // Versão estável (GA). O preview `gemini-3-pro-image-preview` foi
    // desligado pelo Google em 25/06/2026.
    version: 'gemini-3-pro-image',
    replicateModel: 'google/nano-banana-pro',
    apiProvider: 'gemini',

    capabilities: {
      maxResolution: '4096x4096',
      minResolution: '1024x1024',
      maxReferenceImages: 14,
      supportsCustomDimensions: false,
      supports4K: true,
      averageSpeed: '15-30',
      supportsImageEditing: true,
      supportsInpainting: true,
      supportedModes: ['generate', 'edit'],
    },

    pricing: {
      baseCredits: 15,
      resolution1K: 15,
      resolution2K: 15,
      resolution4K: 30,
    },

    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'],
    resolutions: ['1K', '2K', '4K'],

    features: [
      'Resolução até 4K',
      'Até 14 imagens de referência',
      'Edição de imagens (generative fill)',
      'Inpainting profissional',
      'Fallback confiável',
    ],
  },
}

// Helper para obter modelo recomendado (Nano Banana 2)
export function getRecommendedModel(): AIImageModelConfig {
  return AI_IMAGE_MODELS['nano-banana-2']
}

// Helper para obter modelo por ID
export function getModelById(modelId: AIImageModel): AIImageModelConfig {
  return AI_IMAGE_MODELS[modelId]
}

// Helper para calcular créditos baseado no modelo e resolução
export function calculateCreditsForModel(
  modelId: AIImageModel,
  resolution?: '1K' | '2K' | '4K'
): number {
  const model = AI_IMAGE_MODELS[modelId]

  // Se o modelo tem pricing por resolução
  if (resolution && model.pricing[`resolution${resolution}`]) {
    return Math.ceil(model.pricing[`resolution${resolution}`]!)
  }

  // Caso contrário, retorna custo base
  return Math.ceil(model.pricing.baseCredits)
}

// Helper para listar modelos disponíveis
export function getAvailableModels(): AIImageModelConfig[] {
  return Object.values(AI_IMAGE_MODELS).filter(model => !model.isDeprecated)
}
