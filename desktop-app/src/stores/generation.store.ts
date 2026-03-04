import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

export type ArtFormat = 'FEED_PORTRAIT' | 'STORY' | 'SQUARE'

export interface GenerationParams {
  format: ArtFormat
  text: string
  variations: 1 | 2 | 4
  includeLogo: boolean
  usePhoto: boolean
  photoUrl?: string
  compositionEnabled?: boolean
  compositionPrompt?: string
  compositionReferenceUrls?: string[]
}

export interface GenerationJob {
  id: string
  status: 'pending' | 'generating' | 'done' | 'error'
  params: GenerationParams
  images: string[]
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

export const useCompletedJobs = () =>
  useGenerationStore(
    useShallow((state) =>
      state.jobs.filter((job) => job.status === 'done')
    )
  )
