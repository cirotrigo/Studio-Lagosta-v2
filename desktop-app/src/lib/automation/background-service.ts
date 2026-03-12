import type { ArtFormat, ReviewField } from '@/stores/generation.store'

const MODEL_LABELS: Record<string, string> = {
  'gemini-3.1-flash-image-preview': 'Nano Banana 2',
  'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
}

export interface GenerateBackgroundInput {
  projectId: number
  prompt: string
  format: ArtFormat
  variationIndex: number
  fields?: ReviewField[]
  referenceUrls?: string[]
}

export interface GeneratedBackgroundResult {
  imageUrl: string
  prompt: string
  provider: string
  modelUsed: string
  modelLabel: string
  fallbackModel: string
  fallbackLabel: string
  fallbackUsed: boolean
  persisted: boolean
  persistedImageUrl?: string
  referenceCount: number
  warnings: string[]
}

function toModelLabel(modelId: string): string {
  return MODEL_LABELS[modelId] || modelId || 'Modelo desconhecido'
}

function clampBackgroundPrompt(value: string): string {
  return value.trim().slice(0, 500)
}

export function buildBackgroundPrompt(
  prompt: string,
  fields: ReviewField[] = [],
  variationIndex: number,
): string {
  const contextualFields = fields
    .filter((field) => field.value.trim().length > 0)
    .slice(0, 5)
    .map((field) => `${field.label}: ${field.value}`)

  if (contextualFields.length === 0) {
    return clampBackgroundPrompt(
      `${prompt}\n\nVariation ${variationIndex + 1}: preserve clean space for the applied copy.`,
    )
  }

  return clampBackgroundPrompt(
    [
      prompt,
      `Variation ${variationIndex + 1}: preserve clean space for the applied copy.`,
      'Copy context to respect in the background composition:',
      ...contextualFields,
    ].join('\n'),
  )
}

export async function generateBackgroundAsset(
  input: GenerateBackgroundInput,
): Promise<GeneratedBackgroundResult> {
  const response = await window.electronAPI.generateAIBackground({
    projectId: input.projectId,
    prompt: buildBackgroundPrompt(input.prompt, input.fields, input.variationIndex),
    format: input.format,
    referenceUrls: input.referenceUrls,
  })

  const modelLabel = toModelLabel(response.modelUsed)
  const fallbackLabel = toModelLabel(response.fallbackModel)
  const warnings = [...response.warnings]

  if (response.fallbackUsed) {
    warnings.unshift(
      `Nano Banana 2 falhou nesta variacao. Fallback automatico aplicado com ${fallbackLabel}.`,
    )
  }

  return {
    imageUrl: response.imageUrl,
    prompt: response.prompt,
    provider: response.provider,
    modelUsed: response.modelUsed,
    modelLabel,
    fallbackModel: response.fallbackModel,
    fallbackLabel,
    fallbackUsed: response.fallbackUsed,
    persisted: response.persisted,
    persistedImageUrl: response.persistedImageUrl,
    referenceCount: response.referenceCount,
    warnings: Array.from(new Set(warnings)),
  }
}
