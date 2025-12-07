/**
 * Configuração de Modelos de IA para Geração de Imagens
 *
 * Define todos os modelos disponíveis, suas capacidades, custos e parâmetros
 */

export type AIImageModel =
  | 'flux-1.1-pro'
  | 'flux-schnell'
  | 'nano-banana-pro'
  | 'nano-banana'
  | 'seedream-4'
  | 'ideogram-v3-turbo'
  | 'recraft-v3'
  | 'stable-diffusion-3'

export type AIImageMode = 'generate' | 'edit' | 'inpaint'

export interface AIImageModelConfig {
  id: AIImageModel
  name: string
  provider: string
  displayName: string
  description: string
  version: string

  // Capacidades
  capabilities: {
    maxResolution: string
    minResolution: string
    maxReferenceImages: number
    supportsCustomDimensions: boolean
    supports4K: boolean
    averageSpeed: string // em segundos
    supportsImageEditing?: boolean // Suporta edição de imagens
    supportsInpainting?: boolean // Suporta inpainting (edição com máscara)
    supportedModes?: AIImageMode[] // Modos suportados
  }

  // Custos
  pricing: {
    baseCredits: number // Custo base em créditos
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
  'flux-1.1-pro': {
    id: 'flux-1.1-pro',
    name: 'FLUX 1.1 Pro',
    provider: 'Black Forest Labs',
    displayName: 'FLUX 1.1 Pro',
    description: 'Modelo estado da arte com melhor custo-benefício, excelente qualidade e velocidade',
    version: '609793a667ed94b210242837d3c3c9fc9a64ae93685f15d75002ba0ed9a97f2b',

    capabilities: {
      maxResolution: '1440x1440',
      minResolution: '256x256',
      maxReferenceImages: 1, // Via image_prompt
      supportsCustomDimensions: true,
      supports4K: false,
      averageSpeed: '3-5',
    },

    pricing: {
      baseCredits: 4, // $0.04 = 4 créditos (assumindo $0.01 = 1 crédito)
    },

    aspectRatios: ['1:1', '16:9', '3:2', '2:3', '4:5', '5:4', '9:16', '3:4', '4:3', 'custom'],

    features: [
      'Geração ultra-rápida (~4 segundos)',
      'Excelente seguimento de prompt',
      'Controle de seed para reprodução',
      'Prompt upsampling para criatividade',
      'Melhor custo-benefício',
      'Output até 1440px',
    ],

    isRecommended: true,
  },

  'flux-schnell': {
    id: 'flux-schnell',
    name: 'FLUX Schnell',
    provider: 'Black Forest Labs',
    displayName: 'FLUX Schnell',
    description: 'Modelo ultra-rápido e econômico, ideal para testes e iterações rápidas',
    version: 'c846a69991daf4c0e5d016514849d14ee5b2e6846ce6b9d6f21369e564cfe51e',

    capabilities: {
      maxResolution: '1024x1024',
      minResolution: '256x256',
      maxReferenceImages: 0,
      supportsCustomDimensions: false,
      supports4K: false,
      averageSpeed: '<1',
    },

    pricing: {
      baseCredits: 1, // $0.003 = 1 crédito (super econômico)
    },

    aspectRatios: ['1:1', '16:9', '3:2', '2:3', '4:5', '5:4', '9:16', '3:4', '4:3', '21:9'],

    features: [
      'Geração ultra-rápida (<1 segundo)',
      'Menor custo (13x mais barato que FLUX Pro)',
      'Ideal para testes e iterações',
      'Mesma arquitetura do FLUX Pro',
      'Apenas 4 steps de inferência',
      'Ótimo custo-benefício',
    ],
  },

  'seedream-4': {
    id: 'seedream-4',
    name: 'Seedream 4',
    provider: 'ByteDance',
    displayName: 'Seedream 4',
    description: 'Especialista em imagens ultra-realistas com texturas e iluminação superiores, suporte 4K e edição de imagens',
    version: 'cf7d431991436f19d1c8dad83fe463c729c816d7a21056c5105e75c84a0aa7e9',

    capabilities: {
      maxResolution: '4096x4096',
      minResolution: '1024x1024',
      maxReferenceImages: 10,
      supportsCustomDimensions: true,
      supports4K: true,
      averageSpeed: '8-12',
      supportsImageEditing: true,
      supportsInpainting: true,
      supportedModes: ['generate', 'edit'],
    },

    pricing: {
      baseCredits: 3, // $0.03 = 3 créditos
      resolution1K: 3,
      resolution2K: 3,
      resolution4K: 6, // Estimativa para 4K
    },

    aspectRatios: ['1:1', '16:9', '4:3', '3:2', '2:3', '5:4', '4:5', '9:16', '3:4'],
    resolutions: ['1K', '2K', '4K'],

    features: [
      'Realismo excepcional',
      'Texturas e iluminação superiores',
      'Resolução até 4K (4096px)',
      'Até 10 imagens de referência',
      'Enhance prompt automático',
      'Geração sequencial de imagens',
      'Edição de imagens (remoção/adição de objetos)',
      'Inpainting profissional',
    ],
  },

  'ideogram-v3-turbo': {
    id: 'ideogram-v3-turbo',
    name: 'Ideogram v3 Turbo',
    provider: 'Ideogram',
    displayName: 'Ideogram v3 Turbo',
    description: 'Especialista em renderização perfeita de texto em imagens, com 50+ estilos artísticos e Magic Fill',
    version: 'd9b3748f95c0fe3e71f010f8cc5d80e8f5252acd0e74b1c294ee889eea52a47b',

    capabilities: {
      maxResolution: '1536x1536',
      minResolution: '512x512',
      maxReferenceImages: 3, // Style reference + inpainting
      supportsCustomDimensions: true,
      supports4K: false,
      averageSpeed: '4-6',
      supportsImageEditing: false, // Ideogram NÃO suporta edição direta via API
      supportsInpainting: true, // Suporta apenas com máscara (não usado atualmente)
      supportedModes: ['generate'], // Apenas geração normal
    },

    pricing: {
      baseCredits: 3, // $0.03 = 3 créditos
    },

    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:3', '3:1', '4:5', '5:4', '9:21', '21:9', '2:1', '1:2'],

    features: [
      'Melhor renderização de texto',
      '50+ estilos (Oil, Watercolor, Pop Art, etc.)',
      'Magic Prompt (otimização automática)',
      'Suporte multi-idioma',
      'Realismo excepcional',
      'Inpainting e style reference',
    ],

    isNew: true,
  },

  'recraft-v3': {
    id: 'recraft-v3',
    name: 'Recraft V3',
    provider: 'Recraft AI',
    displayName: 'Recraft V3',
    description: 'Estado da arte em design e ilustração, com textos longos e diversos estilos artísticos',
    version: '9507e61ddace8b3a238371b17a61be203747c5081ea6070fecd3c40d27318922',

    capabilities: {
      maxResolution: '2048x2048',
      minResolution: '1024x1024',
      maxReferenceImages: 0,
      supportsCustomDimensions: false,
      supports4K: false,
      averageSpeed: '5-7',
    },

    pricing: {
      baseCredits: 4, // $0.04 = 4 créditos
    },

    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],

    features: [
      'Textos longos em imagens',
      'Biblioteca de estilos (realistic, pixel art, hand-drawn)',
      'Alta resolução (2048x2048)',
      'Estado da arte em design',
      'Ilustrações profissionais',
      'Perfeito para infográficos',
    ],

    isNew: true,
  },

  'stable-diffusion-3': {
    id: 'stable-diffusion-3',
    name: 'Stable Diffusion 3',
    provider: 'Stability AI',
    displayName: 'Stable Diffusion 3',
    description: 'Modelo clássico e confiável com 2B parâmetros, excelente tipografia e versatilidade',
    version: '527d2a6296facb8e47ba1eaf17f142c240c19a30894f437feee9b91cc29d8e4f',

    capabilities: {
      maxResolution: '1536x1536',
      minResolution: '512x512',
      maxReferenceImages: 0,
      supportsCustomDimensions: false,
      supports4K: false,
      averageSpeed: '6-10',
    },

    pricing: {
      baseCredits: 3.5, // $0.035 = 3.5 créditos (arredondar para 4)
    },

    aspectRatios: ['1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '9:16', '9:21'],

    features: [
      'Modelo clássico confiável (2B parâmetros)',
      'Tipografia excelente',
      'Photorealistic de alta qualidade',
      'Compreensão complexa de prompts',
      'Versátil para realismo e arte',
      'Uso comercial permitido',
    ],
  },

  'nano-banana-pro': {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    provider: 'Google DeepMind',
    displayName: 'Gemini 3 Pro Image',
    description: 'Modelo avançado da Google com suporte 4K, edição profissional e controles avançados',
    version: '81a5073adeced23b51ae9f85cd86c88954e7f25d7894eea0c7ebbc0c24d6831a',

    capabilities: {
      maxResolution: '4K',
      minResolution: '1K',
      maxReferenceImages: 3, // Teoricamente 14, mas na prática limitado a 3 para evitar timeout E6716
      supportsCustomDimensions: false,
      supports4K: true,
      averageSpeed: '15-30',
      supportsImageEditing: true,
      supportsInpainting: true,
      supportedModes: ['generate', 'edit'],
    },

    pricing: {
      baseCredits: 15, // 2K padrão
      resolution1K: 15,
      resolution2K: 15,
      resolution4K: 30,
    },

    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'match_input_image'],
    resolutions: ['1K', '2K', '4K'],

    features: [
      'Resolução 4K ultra HD',
      'Até 3 imagens de referência (limite prático)',
      'Renderização avançada de texto',
      'Controles profissionais (luz, câmera, foco)',
      'Conhecimento de mundo aprimorado',
      'Safety filter configurável',
      'Edição profissional (generative fill)',
      'Remoção/alteração de objetos',
    ],

    isNew: true,
  },

  'nano-banana': {
    id: 'nano-banana',
    name: 'Nano Banana',
    provider: 'Google',
    displayName: 'Gemini 2.5 Flash Image',
    description: 'Modelo clássico e estável para geração básica de imagens',
    version: 'd05a591283da31be3eea28d5634ef9e26989b351718b6489bd308426ebd0a3e8',

    capabilities: {
      maxResolution: '1024x1024',
      minResolution: '256x256',
      maxReferenceImages: 8,
      supportsCustomDimensions: false,
      supports4K: false,
      averageSpeed: '10-20',
    },

    pricing: {
      baseCredits: 10, // Custo médio
    },

    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'match_input_image'],

    features: [
      'Modelo estável e testado',
      'Boa qualidade geral',
      'Até 8 imagens de referência',
      'Múltiplos aspect ratios',
    ],

    isDeprecated: false, // Ainda válido, mas não recomendado
  },
}

// Helper para obter modelo recomendado
export function getRecommendedModel(): AIImageModelConfig {
  return AI_IMAGE_MODELS['flux-1.1-pro']
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

  // Caso contrário, retorna custo base (arredondado para cima)
  return Math.ceil(model.pricing.baseCredits)
}

// Helper para listar modelos disponíveis (não deprecated)
export function getAvailableModels(): AIImageModelConfig[] {
  return Object.values(AI_IMAGE_MODELS).filter(model => !model.isDeprecated)
}
