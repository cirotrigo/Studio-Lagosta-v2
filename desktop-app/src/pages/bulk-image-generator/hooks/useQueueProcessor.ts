import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { API_BASE_URL } from '@/lib/constants'
import { useImageQueueStore } from '@/stores/image-queue.store'
import { useProjectStore } from '@/stores/project.store'
import type { QueueItem } from '@/lib/queue/types'

interface GenerateImageResponse {
  id: number
  fileUrl: string
  thumbnailUrl: string
  prompt: string
  model: string
}

interface UseQueueProcessorOptions {
  enabled?: boolean
  onComplete?: (item: QueueItem) => void
  onError?: (item: QueueItem, error: Error) => void
  onBatchComplete?: (batchId: string) => void
}

export function useQueueProcessor(options: UseQueueProcessorOptions = {}) {
  const { enabled = true, onComplete, onError, onBatchComplete } = options

  const store = useImageQueueStore()
  const currentProject = useProjectStore((s) => s.currentProject)
  const processingRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Check if batch is complete
  const checkBatchComplete = useCallback(
    (batchId: string) => {
      const batch = store.batches.find((b) => b.id === batchId)
      if (!batch) return

      const batchItems = store.items.filter((i) => i.batchId === batchId)
      const allDone = batchItems.every(
        (i) =>
          i.status === 'COMPLETED' ||
          i.status === 'FAILED' ||
          i.status === 'CANCELLED'
      )

      if (allDone) {
        const completedCount = batchItems.filter(
          (i) => i.status === 'COMPLETED'
        ).length
        const failedCount = batchItems.filter((i) => i.status === 'FAILED').length

        if (store.settings.notifyOnBatchComplete) {
          if (failedCount === 0) {
            toast.success(`Lote "${batch.name}" concluido! ${completedCount} imagens geradas.`)
          } else {
            toast.warning(
              `Lote "${batch.name}" concluido com erros. ${completedCount} sucesso, ${failedCount} falhas.`
            )
          }
        }

        onBatchComplete?.(batchId)
      }
    },
    [store.batches, store.items, store.settings.notifyOnBatchComplete, onBatchComplete]
  )

  // Process single item
  const processItem = useCallback(
    async (item: QueueItem) => {
      if (!currentProject?.id) {
        store.markAsFailed(item.id, {
          code: 'NO_PROJECT',
          message: 'Nenhum projeto selecionado',
          retryable: false,
        })
        return
      }

      store.markAsProcessing(item.id)

      try {
        const response = await api.post<GenerateImageResponse>(
          '/api/ai/generate-image',
          {
            projectId: currentProject.id,
            prompt: item.request.improvedPrompt || item.request.prompt,
            model: item.request.model,
            aspectRatio: item.request.aspectRatio,
            resolution: item.request.resolution,
            referenceImages: item.request.referenceImages.map((r) => {
              // Convert relative URLs to absolute
              if (r.url.startsWith('/')) {
                return `${API_BASE_URL}${r.url}`
              }
              return r.url
            }),
          }
        )

        store.markAsCompleted(item.id, {
          imageId: String(response.id),
          fileUrl: response.fileUrl,
          thumbnailUrl: response.thumbnailUrl,
          creditsUsed: 3, // TODO: Get from response
        })

        if (store.settings.notifyOnComplete && !item.batchId) {
          toast.success('Imagem gerada com sucesso!')
        }

        onComplete?.(item)

        // Check if batch is complete
        if (item.batchId) {
          checkBatchComplete(item.batchId)
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro desconhecido'
        const isRetryable = !errorMessage.includes('creditos insuficientes')

        store.markAsFailed(item.id, {
          code: 'GENERATION_ERROR',
          message: errorMessage,
          retryable: isRetryable,
        })

        // Pause queue if no credits
        if (errorMessage.includes('creditos insuficientes')) {
          store.pauseQueue('no_credits')
          toast.error('Creditos insuficientes. Fila pausada.')
        }

        onError?.(item, error instanceof Error ? error : new Error(errorMessage))
      }
    },
    [
      currentProject?.id,
      store,
      onComplete,
      onError,
      checkBatchComplete,
    ]
  )

  // Main processing loop
  useEffect(() => {
    if (!enabled || !store.isProcessing || store.isPaused) {
      return
    }

    const processLoop = async () => {
      if (processingRef.current) return
      processingRef.current = true

      try {
        while (store.isProcessing && !store.isPaused) {
          const nextItem = store.getNextPending()

          if (!nextItem) {
            // No more items to process
            const hasProcessing = store.items.some(
              (i) => i.status === 'PROCESSING'
            )
            if (!hasProcessing) {
              store.stopProcessing()
            }
            break
          }

          await processItem(nextItem)

          // Small delay between items
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      } finally {
        processingRef.current = false
      }
    }

    processLoop()
  }, [
    enabled,
    store.isProcessing,
    store.isPaused,
    store,
    processItem,
  ])

  // Auto-start processing when items are added
  useEffect(() => {
    const hasPending = store.items.some((i) => i.status === 'PENDING')
    if (hasPending && !store.isProcessing && !store.isPaused && enabled) {
      store.startProcessing()
    }
  }, [store.items, store.isProcessing, store.isPaused, enabled, store])

  // Cleanup
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  return {
    isProcessing: store.isProcessing,
    isPaused: store.isPaused,
    pauseReason: store.pauseReason,
  }
}
