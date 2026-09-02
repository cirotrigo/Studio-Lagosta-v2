'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ImproveJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ImproveJob {
  id: string
  generationId: string
  projectId: number
  generationThumbnailUrl: string | null
  generationLabel: string
  userRequest: string
  /**
   * Ajuste autorizado NA FOTO — o campo avançado do modal (01/09/2026).
   * Preenchido, o servidor sobe o tier do gpt-image para `high`.
   */
  instrucaoImagem?: string | null
  backgroundImageUrl?: string | null
  selectedLogoIds?: number[]
  selectedElementIds?: number[]
  /** Post aprovado (SCHEDULED) que recebe a arte melhorada — aplicado pelo servidor. */
  applyToPostId?: string | null
  /** Arte atual do post, quando difere do resultUrl da Generation. */
  sourceImageUrl?: string | null
  /** Slide do carrossel que recebe a arte melhorada (0 = primeiro). */
  applyToPostMediaIndex?: number | null
  /** A porta da bancada: item da fila (e slide) que recebe a arte. */
  applyToItemDePlanoId?: string | null
  applyToPlanoId?: string | null
  applyToSlideOrdem?: number | null
  status: ImproveJobStatus
  createdAt: number
  startedAt?: number
  completedAt?: number
  // ID da Generation criada no servidor (status PROCESSING/COMPLETED/FAILED)
  // Usado pra polling.
  serverGenerationId?: string
  resultGenerationId?: string
  resultUrl?: string | null
  errorMessage?: string
}

interface AddJobInput {
  generationId: string
  projectId: number
  generationThumbnailUrl: string | null
  generationLabel: string
  userRequest: string
  /**
   * Ajuste autorizado NA FOTO — o campo avançado do modal (01/09/2026).
   * Preenchido, o servidor sobe o tier do gpt-image para `high`.
   */
  instrucaoImagem?: string | null
  backgroundImageUrl?: string | null
  selectedLogoIds?: number[]
  selectedElementIds?: number[]
  applyToPostId?: string | null
  sourceImageUrl?: string | null
  applyToPostMediaIndex?: number | null
  applyToItemDePlanoId?: string | null
  applyToPlanoId?: string | null
  applyToSlideOrdem?: number | null
}

interface ImproveQueueState {
  jobs: ImproveJob[]
  isProcessing: boolean
  hasHydrated: boolean

  addJob: (input: AddJobInput) => string
  markProcessing: (id: string, serverGenerationId?: string) => void
  attachServerJob: (id: string, serverGenerationId: string) => void
  markCompleted: (id: string, result: { resultGenerationId: string; resultUrl: string | null }) => void
  markFailed: (id: string, errorMessage: string) => void
  removeJob: (id: string) => void
  clearFinished: () => void
  retryJob: (id: string) => void
  setProcessing: (processing: boolean) => void
  setHasHydrated: (hydrated: boolean) => void
}

const STORAGE_KEY = 'lagosta.improve-queue'

export const useImproveQueueStore = create(
  persist<ImproveQueueState>(
    (set) => ({
      jobs: [],
      isProcessing: false,
      hasHydrated: false,

      addJob: (input) => {
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2)

        set((state) => ({
          jobs: [
            ...state.jobs,
            {
              id,
              ...input,
              status: 'pending',
              createdAt: Date.now(),
            },
          ],
        }))
        return id
      },

      markProcessing: (id, serverGenerationId) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'processing',
                  startedAt: Date.now(),
                  errorMessage: undefined,
                  serverGenerationId: serverGenerationId ?? job.serverGenerationId,
                }
              : job
          ),
        })),

      attachServerJob: (id, serverGenerationId) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id ? { ...job, serverGenerationId } : job
          ),
        })),

      markCompleted: (id, result) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'completed',
                  completedAt: Date.now(),
                  resultGenerationId: result.resultGenerationId,
                  resultUrl: result.resultUrl,
                }
              : job
          ),
        })),

      markFailed: (id, errorMessage) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? { ...job, status: 'failed', completedAt: Date.now(), errorMessage }
              : job
          ),
        })),

      removeJob: (id) => set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) })),

      clearFinished: () =>
        set((state) => ({
          jobs: state.jobs.filter((j) => j.status === 'pending' || j.status === 'processing'),
        })),

      retryJob: (id) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'pending',
                  startedAt: undefined,
                  completedAt: undefined,
                  errorMessage: undefined,
                  resultGenerationId: undefined,
                  resultUrl: undefined,
                  serverGenerationId: undefined,
                }
              : job
          ),
        })),

      setProcessing: (processing) => set({ isProcessing: processing }),
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
    }),
    {
      name: STORAGE_KEY,
      // Não persiste isProcessing — sempre começa false ao recarregar.
      // Items 'processing' que ficaram presos ao recarregar são tratados pelo processor (re-queue).
      partialize: (state) =>
        ({
          jobs: state.jobs,
        } as ImproveQueueState),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[improve-queue] Erro ao reidratar fila', error)
        }
        // Items que ficaram em 'processing' ao recarregar voltam pra 'pending' pra retomar.
        if (state) {
          state.jobs = state.jobs.map((job) =>
            job.status === 'processing' ? { ...job, status: 'pending' } : job
          )
          state.setHasHydrated(true)
        }
      },
    }
  )
)

export const selectPendingJobs = (state: ImproveQueueState) =>
  state.jobs.filter((j) => j.status === 'pending')

export const selectActiveJobs = (state: ImproveQueueState) =>
  state.jobs.filter((j) => j.status === 'pending' || j.status === 'processing')

/**
 * A melhoria em andamento (na fila ou já rodando) de um post — é o que permite
 * a agenda e a tela do post mostrarem "Melhorando com IA…" em cima da arte.
 *
 * Sem isso o modal fechava e a tela seguia idêntica: a arte só mudava um minuto
 * depois, sem nada indicando que havia algo acontecendo.
 *
 * Devolve o próprio item do array, então a referência só muda quando o job
 * muda — não provoca re-render a cada tick.
 */
/**
 * A última melhoria CONCLUÍDA para um post, recente — é o gatilho do "como
 * ficou?" na agenda: a arte acabou de chegar e o feedback de um clique vale
 * mais agora do que depois (3 sinais em 141 melhorias, medido em 01/09/2026).
 */
export function useMelhoriaRecemConcluida(
  postId?: string | null,
  janelaMs = 30 * 60_000,
): ImproveJob | undefined {
  return useImproveQueueStore((state) =>
    postId
      ? state.jobs.find(
          (job) =>
            job.applyToPostId === postId &&
            job.status === 'completed' &&
            typeof job.completedAt === 'number' &&
            Date.now() - job.completedAt < janelaMs,
        )
      : undefined,
  )
}

/** O mesmo, para um item da fila da bancada. */
export function useMelhoriaDoItemDaBancada(
  itemDePlanoId?: string | null,
): ImproveJob | undefined {
  return useImproveQueueStore((state) =>
    itemDePlanoId
      ? state.jobs.find(
          (job) =>
            job.applyToItemDePlanoId === itemDePlanoId &&
            (job.status === 'pending' || job.status === 'processing'),
        )
      : undefined,
  )
}

export function useImproveJobForPost(postId?: string | null): ImproveJob | undefined {
  return useImproveQueueStore((state) =>
    postId
      ? state.jobs.find(
        (job) =>
          job.applyToPostId === postId &&
          (job.status === 'pending' || job.status === 'processing'),
      )
      : undefined,
  )
}
