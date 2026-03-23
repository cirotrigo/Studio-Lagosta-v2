import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ImageContextAnalysis } from '@/lib/automation/image-context-analyzer'
import type { KonvaTemplateDocument, SlotFieldKey } from '@/types/template'

export type ArtFormat = 'FEED_PORTRAIT' | 'STORY' | 'SQUARE'
export type TextProcessingMode = 'faithful' | 'grammar_correct' | 'headline_detection' | 'generate_copy'
export type ObjectivePreset = 'promocao' | 'institucional' | 'agenda' | 'oferta' | null
export type TonePreset = 'casual' | 'profissional' | 'urgente' | 'inspirador' | null

export interface ReviewField {
  key: string
  label: string
  value: string
}

export type GenerationVariationStatus = 'queued' | 'processing' | 'ready' | 'error'
export type GenerationJobStatus = GenerationVariationStatus
export type GenerationApprovalStatus = 'idle' | 'syncing' | 'approved' | 'error'

export interface GenerationKnowledgeHit {
  entryId: string
  title: string
  category: string
  content: string
  score: number
  source: 'rag' | 'fallback-db'
}

export interface BackgroundGenerationInfo {
  mode: 'photo' | 'ai'
  provider?: string
  model?: string
  modelLabel?: string
  fallbackModel?: string
  fallbackLabel?: string
  fallbackUsed?: boolean
  persisted?: boolean
  persistedImageUrl?: string
  referenceCount?: number
}

export interface GenerationVariationJob {
  id: string
  index: number
  status: GenerationVariationStatus
  approvalStatus: GenerationApprovalStatus
  imageUrl?: string
  document?: KonvaTemplateDocument
  fields: ReviewField[]
  warnings: string[]
  templateId?: string
  templateName?: string
  background?: BackgroundGenerationInfo
  approvedAt?: number
  approvedGenerationId?: string
  approvedResultUrl?: string | null
  approvalError?: string
  error?: string
}

export interface GenerationParams {
  projectId: number
  format: ArtFormat
  text: string
  variations: 1 | 2 | 4
  backgroundMode: 'photo' | 'ai'
  photoUrl?: string
  backgroundPrompt?: string // Prompt for AI background generation (separate from text prompt)
  referenceUrls?: string[]
  manualTemplateId?: string
  selectedPageId?: string // Specific page from carousel selection
  analyzeImageForContext?: boolean
  objective?: ObjectivePreset
  tone?: TonePreset
  includedFields?: SlotFieldKey[]
}

export interface GenerationJob {
  id: string
  status: GenerationJobStatus
  params: GenerationParams
  images: string[]
  variations: GenerationVariationJob[]
  templateSelection?: {
    mode: 'auto' | 'manual'
    templateId: string
    templateName: string
  }
  knowledge?: {
    applied: boolean
    context: string
    categoriesUsed: string[]
    hits: GenerationKnowledgeHit[]
  }
  imageAnalysis?: ImageContextAnalysis
  warnings: string[]
  conflicts: string[]
  error?: string
  createdAt: number
}

interface GenerationStore {
  jobs: GenerationJob[]
  analyzeImageForContext: boolean
  addJob: (params: GenerationParams) => string
  updateJob: (id: string, data: Partial<GenerationJob>) => void
  updateVariation: (
    jobId: string,
    variationId: string,
    data: Partial<GenerationVariationJob>,
  ) => void
  removeJob: (id: string) => void
  removeVariation: (jobId: string, variationId: string) => void
  clearFinished: () => void
  setAnalyzeImageForContext: (value: boolean) => void
}

function deriveStatusFromVariations(variations: GenerationVariationJob[]): GenerationJobStatus {
  if (variations.some((variation) => variation.status === 'processing')) return 'processing'
  if (variations.some((variation) => variation.status === 'queued')) return 'queued'
  if (variations.some((variation) => variation.status === 'ready')) return 'ready'
  return 'error'
}

function buildEmptyVariation(index: number): GenerationVariationJob {
  return {
    id: crypto.randomUUID(),
    index,
    status: 'queued',
    approvalStatus: 'idle',
    fields: [],
    warnings: [],
  }
}

export const useGenerationStore = create<GenerationStore>((set) => ({
  jobs: [],
  analyzeImageForContext: false,

  addJob: (params) => {
    const id = crypto.randomUUID()
    const variations = Array.from({ length: params.variations }, (_value, index) =>
      buildEmptyVariation(index),
    )

    set((state) => ({
      jobs: [
        ...state.jobs,
        {
          id,
          status: 'queued',
          params,
          images: [],
          variations,
          warnings: [],
          conflicts: [],
          createdAt: Date.now(),
        },
      ],
    }))

    return id
  },

  updateJob: (id, data) => {
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...data } : job)),
    }))
  },

  updateVariation: (jobId, variationId, data) => {
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job

        const variations = job.variations.map((variation) =>
          variation.id === variationId ? { ...variation, ...data } : variation,
        )
        const images = variations
          .filter((variation) => variation.status === 'ready' && variation.imageUrl)
          .map((variation) => variation.imageUrl as string)

        return {
          ...job,
          status: deriveStatusFromVariations(variations),
          variations,
          images,
        }
      }),
    }))
  },

  removeJob: (id) => {
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
    }))
  },

  removeVariation: (jobId, variationId) => {
    set((state) => ({
      jobs: state.jobs.flatMap((job) => {
        if (job.id !== jobId) return [job]

        const variations = job.variations.filter((variation) => variation.id !== variationId)
        if (variations.length === 0) {
          return []
        }

        return [
          {
            ...job,
            status: deriveStatusFromVariations(variations),
            variations,
            images: variations
              .filter((variation) => variation.status === 'ready' && variation.imageUrl)
              .map((variation) => variation.imageUrl as string),
          },
        ]
      }),
    }))
  },

  clearFinished: () => {
    set((state) => ({
      jobs: state.jobs.filter((job) => job.status === 'queued' || job.status === 'processing'),
    }))
  },

  setAnalyzeImageForContext: (value) => {
    set({ analyzeImageForContext: value })
  },
}))

export const useQueuedJobs = () =>
  useGenerationStore(
    useShallow((state) =>
      state.jobs.filter((job) => job.status === 'queued' || job.status === 'processing'),
    ),
  )

export const useReadyJobs = () =>
  useGenerationStore(
    useShallow((state) => state.jobs.filter((job) => job.status === 'ready')),
  )

export const useErroredJobs = () =>
  useGenerationStore(
    useShallow((state) => state.jobs.filter((job) => job.status === 'error')),
  )
