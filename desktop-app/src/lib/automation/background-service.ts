import type { ArtFormat } from '@/stores/generation.store'

const MODEL_LABELS: Record<string, string> = {
  'gemini-3.1-flash-image-preview': 'Nano Banana 2',
  'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
}

export interface GenerateBackgroundInput {
  projectId: number
  prompt: string
  format: ArtFormat
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

export async function generateBackgroundAsset(
  input: GenerateBackgroundInput,
): Promise<GeneratedBackgroundResult> {
  const prompt = clampBackgroundPrompt(
    `${input.prompt}\n\nPreserve clean space for the applied copy.`,
  )

  const response = await window.electronAPI.generateAIBackground({
    projectId: input.projectId,
    prompt,
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
