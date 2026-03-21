import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
  QueueItem,
  QueueBatch,
  QueueStats,
  QueuePauseReason,
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
  // Use individual selectors with useShallow to prevent unnecessary re-renders
  const items = useImageQueueStore(useShallow((state) => state.items))
  const batches = useImageQueueStore(useShallow((state) => state.batches))
  const isProcessing = useImageQueueStore((state) => state.isProcessing)
  const isPaused = useImageQueueStore((state) => state.isPaused)
  const pauseReason = useImageQueueStore((state) => state.pauseReason)
  const isDrawerOpen = useImageQueueStore((state) => state.isDrawerOpen)
  const selectedItemId = useImageQueueStore((state) => state.selectedItemId)

  // Actions - stable references from store
  const addItem = useImageQueueStore((state) => state.addItem)
  const addBatch = useImageQueueStore((state) => state.addBatch)
  const removeItem = useImageQueueStore((state) => state.removeItem)
  const cancelItem = useImageQueueStore((state) => state.cancelItem)
  const retryItem = useImageQueueStore((state) => state.retryItem)
  const cancelBatch = useImageQueueStore((state) => state.cancelBatch)
  const removeBatch = useImageQueueStore((state) => state.removeBatch)
  const startProcessing = useImageQueueStore((state) => state.startProcessing)
  const stopProcessing = useImageQueueStore((state) => state.stopProcessing)
  const pauseQueue = useImageQueueStore((state) => state.pauseQueue)
  const resumeQueue = useImageQueueStore((state) => state.resumeQueue)
  const clearCompleted = useImageQueueStore((state) => state.clearCompleted)
  const clearAll = useImageQueueStore((state) => state.clearAll)
  const toggleDrawer = useImageQueueStore((state) => state.toggleDrawer)
  const setDrawerOpen = useImageQueueStore((state) => state.setDrawerOpen)
  const selectItem = useImageQueueStore((state) => state.selectItem)

  const stats = useQueueStats()
  const recentReferenceImages = useRecentReferenceImages()

  const hasItems = items.length > 0
  const hasPendingItems = useMemo(
    () => items.some((i) => i.status === 'PENDING'),
    [items]
  )

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
        const batchId = addBatch({
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
        const itemId = addItem({
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
    [addItem, addBatch]
  )

  // Return a stable object using useMemo
  return useMemo(
    () => ({
      // State
      items,
      batches,
      stats,
      isProcessing,
      isPaused,
      pauseReason,
      isDrawerOpen,
      selectedItemId,
      recentReferenceImages,

      // Computed
      hasItems,
      hasPendingItems,
      estimatedCredits,

      // Actions
      addToQueue,
      removeItem,
      cancelItem,
      retryItem,
      cancelBatch,
      removeBatch,

      // Queue Control
      startProcessing,
      stopProcessing,
      pauseQueue,
      resumeQueue,
      clearCompleted,
      clearAll,

      // UI
      toggleDrawer,
      setDrawerOpen,
      selectItem,
    }),
    [
      items,
      batches,
      stats,
      isProcessing,
      isPaused,
      pauseReason,
      isDrawerOpen,
      selectedItemId,
      recentReferenceImages,
      hasItems,
      hasPendingItems,
      estimatedCredits,
      addToQueue,
      removeItem,
      cancelItem,
      retryItem,
      cancelBatch,
      removeBatch,
      startProcessing,
      stopProcessing,
      pauseQueue,
      resumeQueue,
      clearCompleted,
      clearAll,
      toggleDrawer,
      setDrawerOpen,
      selectItem,
    ]
  )
}
