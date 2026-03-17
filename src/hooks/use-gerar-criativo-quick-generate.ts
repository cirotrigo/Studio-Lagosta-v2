import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

type Tone = 'casual' | 'profissional' | 'urgente' | 'inspirador'
type Objective = 'promocao' | 'institucional' | 'agenda' | 'oferta'

export interface QuickGenerateParams {
  modelPageId: string
  prompt: string
  useKnowledgeBase?: boolean
  analyzeImageForContext?: boolean
  photoUrl?: string
  tone?: Tone | null
  objective?: Objective | null
}

export interface QuickGenerateResponse {
  templateContext: {
    slotToLayerMap: Record<string, string>
    slots: Array<{
      fieldKey: string
      layerId: string
      layerName: string
      currentText: string
      fontSize: number
      maxLines: number
      maxWords?: number
      maxCharactersPerLine?: number
      priority: 'primary' | 'secondary' | 'tertiary'
      textLength: number
      wordCount: number
    }>
  }
  textValues: Record<string, string>
  imageValues: Record<string, {
    type: 'ai-gallery'
    url: string
    aiImageId: string
    prompt: string
    model: 'nano-banana-pro'
  }>
  generatedImage: {
    id: string
    fileUrl: string
    prompt: string
    layerId: string
    model: 'nano-banana-pro'
  } | null
  warnings: string[]
  copyPreview: {
    pre_title: string
    title: string
    description: string
    cta: string
    badge: string
    footer_info_1: string
    footer_info_2: string
  } | null
  copyResult: {
    variacoes: Array<{
      pre_title: string
      title: string
      description: string
      cta: string
      badge: string
      footer_info_1: string
      footer_info_2: string
    }>
    knowledge: {
      applied: boolean
      context: string
      categoriesUsed: string[]
      hits: Array<{
        entryId: string
        title: string
        category: string
        content: string
        score: number
        source: 'rag' | 'fallback-db'
      }>
    }
    imageAnalysis: {
      requested: boolean
      applied: boolean
      sourceImageUrl?: string
      warnings: string[]
      confidence: number
      summary: string
      sceneType: string
      beverageFamily: string
      dishNameCandidates: string[]
      labelTextHints: string[]
      productClues: string[]
      ingredientsHints: string[]
      matchedKnowledge?: {
        entryId: string
        title: string
        category: string
        score: number
        reason: string
      }
    }
    warnings: string[]
    conflicts: string[]
  } | {
    ok: true
    dryRun: true
    warnings: string[]
    conflicts: string[]
  }
}

export function useGerarCriativoQuickGenerate() {
  return useMutation({
    mutationFn: async (params: QuickGenerateParams): Promise<QuickGenerateResponse> =>
      api.post<QuickGenerateResponse>('/api/gerar-criativo/quick-generate', params),
  })
}
