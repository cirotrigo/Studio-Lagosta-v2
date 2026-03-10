import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

export type ArtFormat = 'FEED_PORTRAIT' | 'STORY' | 'SQUARE'
export type TextProcessingMode = 'faithful' | 'grammar_correct' | 'headline_detection' | 'generate_copy'

export interface ReviewField {
  key: string
  label: string
  value: string
}

export interface ReviewLegacyContext {
  kind: 'legacy'
  sourceImageUrl: string
  textLayout: any
  fonts?: { title: string; body: string }
  fontUrls?: { title?: string; body?: string }
  logo?: { url: string; position: string; sizePct: number }
  includeLogo: boolean
}

export interface ReviewTemplateContext {
  kind: 'template'
  sourceImageUrl: string
  templateId?: string
  templateData: any
  fontSources: { title: { family: string; url: string | null }; body: { family: string; url: string | null } }
  strictTemplateMode: boolean
  logo?: { url: string; position: string; sizePct: number }
  includeLogo: boolean
}

export type ReviewRenderContext = ReviewLegacyContext | ReviewTemplateContext

export interface ReviewVariation {
  id: string
  imageUrl: string
  status: 'review' | 'approved' | 'rejected'
  approvedUrl?: string
  fields: ReviewField[]
  renderContext?: ReviewRenderContext
  isUpdatingPreview?: boolean
}

export interface GenerationParams {
  projectId: number
  format: ArtFormat
  text: string
  variations: 1 | 2 | 4
  includeLogo: boolean
  usePhoto: boolean
  photoUrl?: string
  compositionEnabled?: boolean
  compositionPrompt?: string
  compositionReferenceUrls?: string[]
  templateId?: string
  templateIds?: string[]
  textProcessingMode?: TextProcessingMode
  textProcessingCustomPrompt?: string
  strictTemplateMode?: boolean
}

export interface GenerationJob {
  id: string
  status: 'pending' | 'generating' | 'review' | 'saving' | 'done' | 'error'
  params: GenerationParams
  images: string[]
  reviewItems: ReviewVariation[]
  error?: string
  createdAt: number
}

interface GenerationStore {
  jobs: GenerationJob[]
  addJob: (params: GenerationParams) => string
  updateJob: (id: string, data: Partial<GenerationJob>) => void
  removeJob: (id: string) => void
  clearCompletedJobs: () => void
}

export const useGenerationStore = create<GenerationStore>((set) => ({
  jobs: [],

  addJob: (params) => {
    const id = crypto.randomUUID()
    set((state) => ({
      jobs: [
        ...state.jobs,
        {
          id,
          status: 'pending',
          params,
          images: [],
          reviewItems: [],
          createdAt: Date.now(),
        },
      ],
    }))
    return id
  },

  updateJob: (id, data) => {
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id ? { ...job, ...data } : job
      ),
    }))
  },

  removeJob: (id) => {
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
    }))
  },

  clearCompletedJobs: () => {
    set((state) => ({
      jobs: state.jobs.filter((job) => job.status !== 'done'),
    }))
  },
}))

// Selectors — useShallow prevents infinite re-renders from .filter() creating new array refs
export const usePendingJobs = () =>
  useGenerationStore(
    useShallow((state) =>
      state.jobs.filter((job) => job.status === 'pending' || job.status === 'generating')
    )
  )

export const useReviewJobs = () =>
  useGenerationStore(
    useShallow((state) =>
      state.jobs.filter((job) => job.status === 'review' || job.status === 'saving')
    )
  )

export const useCompletedJobs = () =>
  useGenerationStore(
    useShallow((state) =>
      state.jobs.filter((job) => job.status === 'done')
    )
  )
