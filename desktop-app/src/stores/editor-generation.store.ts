import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ArtFormat, KonvaPage } from '@/types/template'

export interface EditorGenerationResult {
  id: string
  imageUrl: string
  variationIndex: number
  generatedPage: KonvaPage
}

export interface EditorGenerationJob {
  id: string
  pageId: string
  pageName: string
  format: ArtFormat
  photoUrl: string
  photoSource: string
  variations: 1 | 2 | 4
  pageSnapshot: KonvaPage
  status: 'pending' | 'processing' | 'done' | 'error'
  results: EditorGenerationResult[]
  error?: string
  createdAt: number
}

interface AddEditorGenerationJobInput {
  pageId: string
  pageName: string
  format: ArtFormat
  photoUrl: string
  photoSource: string
  variations: 1 | 2 | 4
  pageSnapshot: KonvaPage
}

interface EditorGenerationState {
  jobs: EditorGenerationJob[]
  addJobs: (jobs: AddEditorGenerationJobInput[]) => string[]
  updateJob: (jobId: string, data: Partial<EditorGenerationJob>) => void
  removeJob: (jobId: string) => void
  clearFinished: () => void
}

export const useEditorGenerationStore = create<EditorGenerationState>((set) => ({
  jobs: [],

  addJobs: (jobs) => {
    const createdJobs = jobs.map<EditorGenerationJob>((job) => ({
      id: crypto.randomUUID(),
      ...job,
      status: 'pending',
      results: [],
      createdAt: Date.now(),
    }))

    set((state) => ({
      jobs: [...state.jobs, ...createdJobs],
    }))

    return createdJobs.map((job) => job.id)
  },

  updateJob: (jobId, data) =>
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === jobId ? { ...job, ...data } : job)),
    })),

  removeJob: (jobId) =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== jobId),
    })),

  clearFinished: () =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.status === 'pending' || job.status === 'processing'),
    })),
}))

export const usePendingEditorGenerationJobs = () =>
  useEditorGenerationStore(
    useShallow((state) =>
      state.jobs.filter((job) => job.status === 'pending' || job.status === 'processing'),
    ),
  )

export const useCompletedEditorGenerationJobs = () =>
  useEditorGenerationStore(
    useShallow((state) => state.jobs.filter((job) => job.status === 'done')),
  )
