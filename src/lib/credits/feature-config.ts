import { OperationType } from '../../../prisma/generated/client'

// Single source of truth for feature costs (examples below)
export const FEATURE_CREDIT_COSTS = {
  ai_text_chat: 1,
  ai_image_generation: 5,
  creative_download: 2,
  video_export: 10,
  social_media_post: 3,
  background_removal: 3,
  ai_creative_improvement: 25,
  // Geração de arte do zero (foto + copy → peça pronta, gpt-image-2 high).
  // Mesmo custo da melhoria: é a mesma chamada, com mais referências.
  ai_art_generation: 25,
} as const

// Feature keys are derived from the config above to ensure type-safety across the codebase
export type FeatureKey = keyof typeof FEATURE_CREDIT_COSTS

// Complete mapping enforced by TypeScript: if you add a feature above, you must map it here
const FEATURE_TO_OPERATION: Record<FeatureKey, OperationType> = {
  ai_text_chat: OperationType.AI_TEXT_CHAT,
  ai_image_generation: OperationType.AI_IMAGE_GENERATION,
  creative_download: OperationType.CREATIVE_DOWNLOAD,
  video_export: OperationType.VIDEO_EXPORT,
  social_media_post: OperationType.SOCIAL_MEDIA_POST,
  background_removal: OperationType.BACKGROUND_REMOVAL,
  ai_creative_improvement: OperationType.AI_CREATIVE_IMPROVEMENT,
  // Sem OperationType novo de propósito: enum é coluna do banco (migration).
  // Para o extrato, geração de arte é uma geração de imagem por IA.
  ai_art_generation: OperationType.AI_IMAGE_GENERATION,
}

export function toPrismaOperationType(feature: FeatureKey): OperationType {
  return FEATURE_TO_OPERATION[feature]
}
