import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createGeneratedPageVariant } from '@/lib/editor/generation'
import { renderPageToDataUrl } from '@/lib/editor/render-page'
import { useEditorGenerationStore } from '@/stores/editor-generation.store'

export function useEditorGenerationQueue() {
  const jobs = useEditorGenerationStore((state) => state.jobs)
  const updateJob = useEditorGenerationStore((state) => state.updateJob)
  const isRunningRef = useRef(false)

  const processJob = useCallback(async (jobId: string) => {
    const job = useEditorGenerationStore.getState().jobs.find((entry) => entry.id === jobId)
    if (!job) {
      return
    }

    updateJob(jobId, {
      status: 'processing',
      error: undefined,
      results: [],
    })

    try {
      const results = []

      for (let variationIndex = 0; variationIndex < job.variations; variationIndex += 1) {
        const generatedPage = await createGeneratedPageVariant(
          job.pageSnapshot,
          job.photoUrl,
          variationIndex,
        )
        const imageUrl = await renderPageToDataUrl(generatedPage, {
          mimeType: 'image/png',
          quality: 0.94,
          preferBlobDownload: true,
        })

        if (!imageUrl) {
          throw new Error('Falha ao renderizar a variação.')
        }

        results.push({
          id: crypto.randomUUID(),
          imageUrl,
          variationIndex,
          generatedPage,
        })
      }

      updateJob(jobId, {
        status: 'done',
        results,
      })

      toast.success(`${job.pageName}: ${results.length} variação(ões) pronta(s).`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao gerar variações da página.'
      updateJob(jobId, {
        status: 'error',
        error: message,
      })
      toast.error(message)
    }
  }, [updateJob])

  const runQueue = useCallback(async () => {
    if (isRunningRef.current) {
      return
    }

    isRunningRef.current = true

    try {
      while (true) {
        const state = useEditorGenerationStore.getState()
        const hasProcessing = state.jobs.some((job) => job.status === 'processing')
        if (hasProcessing) {
          break
        }

        const nextJob = state.jobs
          .find((job) => job.status === 'pending')

        if (!nextJob) {
          break
        }

        await processJob(nextJob.id)
      }
    } finally {
      isRunningRef.current = false
    }
  }, [processJob])

  useEffect(() => {
    if (jobs.some((job) => job.status === 'pending')) {
      void runQueue()
    }
  }, [jobs, runQueue])
}
