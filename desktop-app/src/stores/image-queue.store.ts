import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import type {
  QueueItem,
  QueueBatch,
  QueueStats,
  QueueSettings,
  QueuePauseReason,
  ReferenceImage,
  AIImageModel,
  AspectRatio,
  ImageResolution,
} from '@/lib/queue/types'
import {
  DEFAULT_QUEUE_SETTINGS,
  QUEUE_CONSTANTS,
} from '@/lib/queue/types'

// Store interface
interface ImageQueueStore {
  // State
  items: QueueItem[]
  batches: QueueBatch[]
  isProcessing: boolean
  isPaused: boolean
  pauseReason?: QueuePauseReason
  concurrency: number
  isDrawerOpen: boolean
  selectedItemId?: string
  settings: QueueSettings
  recentReferenceImages: ReferenceImage[]

  // Computed
  stats: QueueStats

  // Item Actions
  addItem: (params: AddItemParams) => string
  addBatch: (params: AddBatchParams) => string
  updateItem: (id: string, data: Partial<QueueItem>) => void
  removeItem: (id: string) => void
  cancelItem: (id: string) => void
  retryItem: (id: string) => void

  // Batch Actions
  cancelBatch: (batchId: string) => void
  removeBatch: (batchId: string) => void

  // Queue Actions
  startProcessing: () => void
  stopProcessing: () => void
  pauseQueue: (reason: QueuePauseReason) => void
  resumeQueue: () => void
  clearCompleted: () => void
  clearAll: () => void

  // Processing Actions
  getNextPending: () => QueueItem | null
  markAsProcessing: (id: string) => void
  markAsCompleted: (id: string, result: QueueItem['result']) => void
  markAsFailed: (id: string, error: QueueItem['error']) => void
  scheduleRetry: (id: string) => void

  // UI Actions
  toggleDrawer: () => void
  setDrawerOpen: (open: boolean) => void
  selectItem: (id: string | undefined) => void

  // Settings Actions
  updateSettings: (settings: Partial<QueueSettings>) => void

  // Reference Images
  addToRecent: (image: ReferenceImage) => void
  clearRecentImages: () => void
}

interface AddItemParams {
  prompt: string
  originalPrompt?: string
  model: AIImageModel
  aspectRatio: AspectRatio
  resolution: ImageResolution
  referenceImages: ReferenceImage[]
  batchId?: string
  batchIndex?: number
  priority?: number
}

interface AddBatchParams {
  name: string
  originalPrompt: string
  prompts: string[]
  model: AIImageModel
  aspectRatio: AspectRatio
  resolution: ImageResolution
  referenceImages: ReferenceImage[]
}

// Helper to compute stats
function computeStats(items: QueueItem[]): QueueStats {
  return {
    pending: items.filter((i) => i.status === 'PENDING').length,
    processing: items.filter((i) => i.status === 'PROCESSING').length,
    completed: items.filter((i) => i.status === 'COMPLETED').length,
    failed: items.filter((i) => i.status === 'FAILED').length,
    totalCreditsUsed: items
      .filter((i) => i.status === 'COMPLETED' && i.result?.creditsUsed)
      .reduce((acc, i) => acc + (i.result?.creditsUsed ?? 0), 0),
  }
}

// Helper to update batch progress
function updateBatchProgress(
  batches: QueueBatch[],
  items: QueueItem[]
): QueueBatch[] {
  return batches.map((batch) => {
    const batchItems = items.filter((i) => i.batchId === batch.id)
    return {
      ...batch,
      progress: {
        total: batchItems.length,
        completed: batchItems.filter((i) => i.status === 'COMPLETED').length,
        failed: batchItems.filter((i) => i.status === 'FAILED').length,
        processing: batchItems.filter((i) => i.status === 'PROCESSING').length,
      },
    }
  })
}

export const useImageQueueStore = create<ImageQueueStore>()(
  persist(
    (set, get) => ({
      // Initial State
      items: [],
      batches: [],
      isProcessing: false,
      isPaused: false,
      pauseReason: undefined,
      concurrency: DEFAULT_QUEUE_SETTINGS.maxConcurrency,
      isDrawerOpen: false,
      selectedItemId: undefined,
      settings: DEFAULT_QUEUE_SETTINGS,
      recentReferenceImages: [],

      // Computed stats
      get stats() {
        return computeStats(get().items)
      },

      // Add single item
      addItem: (params) => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()

        const item: QueueItem = {
          id,
          batchId: params.batchId,
          batchIndex: params.batchIndex,
          status: 'PENDING',
          priority: params.priority ?? 0,
          createdAt: now,
          request: {
            prompt: params.prompt,
            originalPrompt: params.originalPrompt,
            model: params.model,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            referenceImages: params.referenceImages,
          },
          attempts: 0,
          maxAttempts: QUEUE_CONSTANTS.MAX_RETRY_ATTEMPTS,
        }

        set((state) => {
          const newItems = [...state.items, item]
          return {
            items: newItems,
            stats: computeStats(newItems),
            batches: updateBatchProgress(state.batches, newItems),
          }
        })

        // Add reference images to recent
        params.referenceImages.forEach((img) => get().addToRecent(img))

        return id
      },

      // Add batch
      addBatch: (params) => {
        const batchId = crypto.randomUUID()
        const now = new Date().toISOString()

        const batch: QueueBatch = {
          id: batchId,
          name: params.name,
          originalPrompt: params.originalPrompt,
          itemIds: [],
          createdAt: now,
          progress: {
            total: params.prompts.length,
            completed: 0,
            failed: 0,
            processing: 0,
          },
        }

        // Create items for each prompt
        const itemIds: string[] = []
        params.prompts.forEach((prompt, index) => {
          const itemId = get().addItem({
            prompt,
            originalPrompt: params.originalPrompt,
            model: params.model,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            referenceImages: params.referenceImages,
            batchId,
            batchIndex: index + 1,
          })
          itemIds.push(itemId)
        })

        set((state) => ({
          batches: [...state.batches, { ...batch, itemIds }],
        }))

        return batchId
      },

      // Update item
      updateItem: (id, data) => {
        set((state) => {
          const newItems = state.items.map((item) =>
            item.id === id ? { ...item, ...data } : item
          )
          return {
            items: newItems,
            stats: computeStats(newItems),
            batches: updateBatchProgress(state.batches, newItems),
          }
        })
      },

      // Remove item
      removeItem: (id) => {
        set((state) => {
          const newItems = state.items.filter((item) => item.id !== id)
          // Clean up empty batches
          const newBatches = state.batches
            .map((batch) => ({
              ...batch,
              itemIds: batch.itemIds.filter((itemId) => itemId !== id),
            }))
            .filter((batch) => batch.itemIds.length > 0)
          return {
            items: newItems,
            batches: updateBatchProgress(newBatches, newItems),
            stats: computeStats(newItems),
            selectedItemId:
              state.selectedItemId === id ? undefined : state.selectedItemId,
          }
        })
      },

      // Cancel item
      cancelItem: (id) => {
        get().updateItem(id, { status: 'CANCELLED' })
      },

      // Retry item
      retryItem: (id) => {
        const item = get().items.find((i) => i.id === id)
        if (item && (item.status === 'FAILED' || item.status === 'CANCELLED')) {
          get().updateItem(id, {
            status: 'PENDING',
            error: undefined,
            attempts: 0,
            nextRetryAt: undefined,
          })
        }
      },

      // Cancel batch
      cancelBatch: (batchId) => {
        const batch = get().batches.find((b) => b.id === batchId)
        if (batch) {
          batch.itemIds.forEach((itemId) => {
            const item = get().items.find((i) => i.id === itemId)
            if (item && item.status === 'PENDING') {
              get().cancelItem(itemId)
            }
          })
        }
      },

      // Remove batch
      removeBatch: (batchId) => {
        const batch = get().batches.find((b) => b.id === batchId)
        if (batch) {
          batch.itemIds.forEach((itemId) => get().removeItem(itemId))
          set((state) => ({
            batches: state.batches.filter((b) => b.id !== batchId),
          }))
        }
      },

      // Start processing
      startProcessing: () => {
        set({ isProcessing: true, isPaused: false, pauseReason: undefined })
      },

      // Stop processing
      stopProcessing: () => {
        set({ isProcessing: false })
      },

      // Pause queue
      pauseQueue: (reason) => {
        set({ isPaused: true, pauseReason: reason })
      },

      // Resume queue
      resumeQueue: () => {
        set({ isPaused: false, pauseReason: undefined })
      },

      // Clear completed
      clearCompleted: () => {
        set((state) => {
          const newItems = state.items.filter(
            (item) =>
              item.status !== 'COMPLETED' && item.status !== 'CANCELLED'
          )
          const newBatches = state.batches
            .map((batch) => ({
              ...batch,
              itemIds: batch.itemIds.filter((id) =>
                newItems.some((item) => item.id === id)
              ),
            }))
            .filter((batch) => batch.itemIds.length > 0)
          return {
            items: newItems,
            batches: updateBatchProgress(newBatches, newItems),
            stats: computeStats(newItems),
          }
        })
      },

      // Clear all
      clearAll: () => {
        set({
          items: [],
          batches: [],
          isProcessing: false,
          stats: computeStats([]),
        })
      },

      // Get next pending item
      getNextPending: () => {
        const { items, isPaused, concurrency } = get()

        if (isPaused) return null

        // Count currently processing
        const processingCount = items.filter(
          (i) => i.status === 'PROCESSING'
        ).length
        if (processingCount >= concurrency) return null

        // Find next pending item (prioritize higher priority, then older)
        const now = Date.now()
        const pending = items
          .filter((item) => {
            if (item.status !== 'PENDING') return false
            // Check retry schedule
            if (item.nextRetryAt) {
              return new Date(item.nextRetryAt).getTime() <= now
            }
            return true
          })
          .sort((a, b) => {
            // Higher priority first
            if (a.priority !== b.priority) return b.priority - a.priority
            // Older first (FIFO)
            return (
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            )
          })

        return pending[0] ?? null
      },

      // Mark as processing
      markAsProcessing: (id) => {
        get().updateItem(id, {
          status: 'PROCESSING',
          startedAt: new Date().toISOString(),
        })
      },

      // Mark as completed
      markAsCompleted: (id, result) => {
        get().updateItem(id, {
          status: 'COMPLETED',
          completedAt: new Date().toISOString(),
          result,
        })
      },

      // Mark as failed
      markAsFailed: (id, error) => {
        const item = get().items.find((i) => i.id === id)
        if (!item) return

        const newAttempts = item.attempts + 1
        const shouldRetry =
          get().settings.autoRetry &&
          error?.retryable &&
          newAttempts < item.maxAttempts

        if (shouldRetry) {
          get().scheduleRetry(id)
        } else {
          get().updateItem(id, {
            status: 'FAILED',
            error,
            attempts: newAttempts,
          })
        }
      },

      // Schedule retry
      scheduleRetry: (id) => {
        const item = get().items.find((i) => i.id === id)
        if (!item) return

        const delayIndex = Math.min(
          item.attempts,
          QUEUE_CONSTANTS.RETRY_DELAYS_MS.length - 1
        )
        const delay = QUEUE_CONSTANTS.RETRY_DELAYS_MS[delayIndex]
        const nextRetryAt = new Date(Date.now() + delay).toISOString()

        get().updateItem(id, {
          status: 'PENDING',
          attempts: item.attempts + 1,
          nextRetryAt,
        })
      },

      // Toggle drawer
      toggleDrawer: () => {
        set((state) => ({ isDrawerOpen: !state.isDrawerOpen }))
      },

      // Set drawer open
      setDrawerOpen: (open) => {
        set({ isDrawerOpen: open })
      },

      // Select item
      selectItem: (id) => {
        set({ selectedItemId: id })
      },

      // Update settings
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
          concurrency: newSettings.maxConcurrency ?? state.concurrency,
        }))
      },

      // Add to recent reference images
      addToRecent: (image) => {
        set((state) => {
          const filtered = state.recentReferenceImages.filter(
            (img) => img.id !== image.id
          )
          const updated = [
            { ...image, addedAt: new Date().toISOString() },
            ...filtered,
          ].slice(0, 20)
          return { recentReferenceImages: updated }
        })
      },

      // Clear recent images
      clearRecentImages: () => {
        set({ recentReferenceImages: [] })
      },
    }),
    {
      name: 'image-queue-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items.filter(
          (i) => i.status === 'PENDING' || i.status === 'PROCESSING'
        ),
        batches: state.batches,
        settings: state.settings,
        recentReferenceImages: state.recentReferenceImages,
      }),
    }
  )
)

// Selectors
export const useQueueItems = () =>
  useImageQueueStore(useShallow((state) => state.items))

export const useQueueBatches = () =>
  useImageQueueStore(useShallow((state) => state.batches))

export const useQueueStats = () =>
  useImageQueueStore((state) => computeStats(state.items))

export const usePendingItems = () =>
  useImageQueueStore(
    useShallow((state) => state.items.filter((i) => i.status === 'PENDING'))
  )

export const useProcessingItems = () =>
  useImageQueueStore(
    useShallow((state) => state.items.filter((i) => i.status === 'PROCESSING'))
  )

export const useCompletedItems = () =>
  useImageQueueStore(
    useShallow((state) => state.items.filter((i) => i.status === 'COMPLETED'))
  )

export const useFailedItems = () =>
  useImageQueueStore(
    useShallow((state) => state.items.filter((i) => i.status === 'FAILED'))
  )

export const useQueueSettings = () =>
  useImageQueueStore(useShallow((state) => state.settings))

export const useRecentReferenceImages = () =>
  useImageQueueStore(useShallow((state) => state.recentReferenceImages))
