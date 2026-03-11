import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { renderPageToDataUrl } from '@/lib/editor/render-page'
import { ApiError } from '@/lib/api-client'
import { useKonvaProjectCreativeExport } from '@/hooks/use-project-generations'
import { useEditorGenerationStore } from '@/stores/editor-generation.store'

function slugifySegment(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildFileName(documentId: string, pageId: string, pageName: string) {
  const safePageName = slugifySegment(pageName) || 'pagina'
  return `konva-${safePageName}-${documentId.slice(0, 8)}-${pageId.slice(0, 6)}.jpg`
}

export function useEditorGenerationQueue(projectId: number | undefined) {
  const jobs = useEditorGenerationStore((state) => state.jobs)
  const updateJob = useEditorGenerationStore((state) => state.updateJob)
  const exportCreative = useKonvaProjectCreativeExport(projectId)
  const isRunningRef = useRef(false)

  const processJob = useCallback(async (jobId: string) => {
    const job = useEditorGenerationStore.getState().jobs.find((entry) => entry.id === jobId)
    if (!job) {
      return
    }

    updateJob(jobId, {
      status: 'processing',
      error: undefined,
      result: undefined,
    })

    try {
      const dataUrl = await renderPageToDataUrl(job.pageSnapshot, {
        mimeType: 'image/jpeg',
        quality: 0.94,
        preferBlobDownload: true,
      })

      if (!dataUrl) {
        throw new Error('Falha ao renderizar a página selecionada.')
      }

      const response = await exportCreative.mutateAsync({
        format: job.format,
        dataUrl,
        fileName: buildFileName(job.documentId, job.pageId, job.pageName),
        pageId: job.pageId,
        pageName: job.pageName,
        documentId: job.documentId,
        width: job.width,
        height: job.height,
      })

      updateJob(jobId, {
        status: 'done',
        result: {
          generationId: response.generation.id,
          resultUrl: response.generation.resultUrl,
          fileName: response.generation.fileName,
        },
      })

      toast.success(`${job.pageName} salvo nos criativos do projeto.`)
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Falha ao exportar criativo para o projeto.'

      updateJob(jobId, {
        status: 'error',
        error: message,
      })

      toast.error(message)
    }
  }, [exportCreative, updateJob])

  const runQueue = useCallback(async () => {
    if (isRunningRef.current || !projectId) {
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

        const nextJob = state.jobs.find((job) => job.status === 'pending')
        if (!nextJob) {
          break
        }

        await processJob(nextJob.id)
      }
    } finally {
      isRunningRef.current = false
    }
  }, [processJob, projectId])

  useEffect(() => {
    if (!projectId) {
      return
    }

    if (jobs.some((job) => job.status === 'pending')) {
      void runQueue()
    }
  }, [jobs, projectId, runQueue])
}
