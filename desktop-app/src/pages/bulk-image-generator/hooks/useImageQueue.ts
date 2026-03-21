import { useCallback } from 'react'
import {
  useImageQueueStore,
  useQueueStats,
  useRecentReferenceImages,
} from '@/stores/image-queue.store'
import type {
  AIImageModel,
  AspectRatio,
  ImageResolution,
  ReferenceImage,
} from '@/lib/queue/types'
import { calculateCredits } from '@/lib/queue/types'
import { parsePromptVariables, generateBatchName } from '../utils/prompt-parser'

interface AddToQueueParams {
  prompt: string
  model: AIImageModel
  aspectRatio: AspectRatio
  resolution: ImageResolution
  referenceImages: ReferenceImage[]
}

import type { QueueItem, QueueBatch, QueueStats, QueuePauseReason } from '@/lib/queue/types'

interface UseImageQueueReturn {
  // State
  items: QueueItem[]
  batches: QueueBatch[]
  stats: QueueStats
  isProcessing: boolean
  isPaused: boolean
  pauseReason: QueuePauseReason | undefined
  isDrawerOpen: boolean
  selectedItemId: string | undefined
  recentReferenceImages: ReferenceImage[]

  // Computed
  hasItems: boolean
  hasPendingItems: boolean
  estimatedCredits: (params: AddToQueueParams) => number

  // Actions
  addToQueue: (params: AddToQueueParams) => string | string[]
  removeItem: (id: string) => void
  cancelItem: (id: string) => void
  retryItem: (id: string) => void
  cancelBatch: (batchId: string) => void
  removeBatch: (batchId: string) => void

  // Queue Control
  startProcessing: () => void
  stopProcessing: () => void
  pauseQueue: (reason: 'manual' | 'offline' | 'no_credits' | 'rate_limit') => void
  resumeQueue: () => void
  clearCompleted: () => void
  clearAll: () => void

  // UI
  toggleDrawer: () => void
  setDrawerOpen: (open: boolean) => void
  selectItem: (id: string | undefined) => void
}

export function useImageQueue(): UseImageQueueReturn {
  const store = useImageQueueStore()
  const stats = useQueueStats()
  const recentReferenceImages = useRecentReferenceImages()

  const hasItems = store.items.length > 0
  const hasPendingItems = store.items.some((i) => i.status === 'PENDING')

  const estimatedCredits = useCallback(
    (params: AddToQueueParams): number => {
      const parsed = parsePromptVariables(params.prompt)
      const creditsPerImage = calculateCredits(params.model, params.resolution)
      return creditsPerImage * parsed.combinations
    },
    []
  )

  const addToQueue = useCallback(
    (params: AddToQueueParams): string | string[] => {
      const parsed = parsePromptVariables(params.prompt)

      if (parsed.hasVariables && parsed.expandedPrompts.length > 1) {
        // Add as batch
        const batchId = store.addBatch({
          name: generateBatchName(params.prompt),
          originalPrompt: params.prompt,
          prompts: parsed.expandedPrompts,
          model: params.model,
          aspectRatio: params.aspectRatio,
          resolution: params.resolution,
          referenceImages: params.referenceImages,
        })
        return batchId
      } else {
        // Add single item
        const itemId = store.addItem({
          prompt: parsed.expandedPrompts[0],
          originalPrompt: params.prompt,
          model: params.model,
          aspectRatio: params.aspectRatio,
          resolution: params.resolution,
          referenceImages: params.referenceImages,
        })
        return itemId
      }
    },
    [store]
  )

  return {
    // State
    items: store.items,
    batches: store.batches,
    stats,
    isProcessing: store.isProcessing,
    isPaused: store.isPaused,
    pauseReason: store.pauseReason,
    isDrawerOpen: store.isDrawerOpen,
    selectedItemId: store.selectedItemId,
    recentReferenceImages,

    // Computed
    hasItems,
    hasPendingItems,
    estimatedCredits,

    // Actions
    addToQueue,
    removeItem: store.removeItem,
    cancelItem: store.cancelItem,
    retryItem: store.retryItem,
    cancelBatch: store.cancelBatch,
    removeBatch: store.removeBatch,

    // Queue Control
    startProcessing: store.startProcessing,
    stopProcessing: store.stopProcessing,
    pauseQueue: store.pauseQueue,
    resumeQueue: store.resumeQueue,
    clearCompleted: store.clearCompleted,
    clearAll: store.clearAll,

    // UI
    toggleDrawer: store.toggleDrawer,
    setDrawerOpen: store.setDrawerOpen,
    selectItem: store.selectItem,
  }
}
