import { OperationType } from '../../../prisma/generated/client'

// Single source of truth for feature costs (examples below)
export const FEATURE_CREDIT_COSTS = {
  ai_text_chat: 1,
  ai_image_generation: 5,
} as const

// Feature keys are derived from the config above to ensure type-safety across the codebase
export type FeatureKey = keyof typeof FEATURE_CREDIT_COSTS

// Complete mapping enforced by TypeScript: if you add a feature above, you must map it here
const FEATURE_TO_OPERATION: Record<FeatureKey, OperationType> = {
  ai_text_chat: OperationType.AI_TEXT_CHAT,
  ai_image_generation: OperationType.AI_IMAGE_GENERATION,
}

export function toPrismaOperationType(feature: FeatureKey): OperationType {
  return FEATURE_TO_OPERATION[feature]
}
