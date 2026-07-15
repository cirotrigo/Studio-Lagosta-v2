'use client'

import { useEffect, useRef } from 'react'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  useYoutubeDownloadStatus,
  useCancelarYoutubeJob,
} from '@/hooks/use-youtube-download'
import { useQueryClient } from '@tanstack/react-query'
import { chavesMusica } from '@/hooks/use-music-library'

interface YoutubeDownloadProgressProps {
  jobId: number
}

export function YoutubeDownloadProgress({ jobId }: YoutubeDownloadProgressProps) {
  const queryClient = useQueryClient()
  const { data: job, isLoading } = useYoutubeDownloadStatus(jobId)
  const cancelJob = useCancelarYoutubeJob()
  const hasInvalidated = useRef(false)

  useEffect(() => {
    if (!job || job.status !== 'completed' || !job.music) return
    if (hasInvalidated.current) return
    queryClient.invalidateQueries({ queryKey: chavesMusica.listas() })
    hasInvalidated.current = true
  }, [job, queryClient])

  if (isLoading || !job) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Carregando download...</span>
        </div>
      </div>
    )
  }

  if (job.status === 'failed') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-900">Não foi possível adicionar</p>
            <p className="text-sm text-red-700">{job.error || 'Tente novamente com outro link.'}</p>
          </div>
        </div>
      </div>
    )
  }

  if (job.status === 'completed' && job.music) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
          <div>
            <p className="text-sm font-semibold text-green-900">Música adicionada!</p>
            <p className="text-sm text-green-800">
              &quot;{job.music.name}&quot; foi adicionada à biblioteca.
            </p>
            {job.music.stemJob &&
              ['pending', 'processing'].includes(job.music.stemJob.status) && (
                <div className="mt-2">
                  <p className="text-xs text-green-800">Gerando versão instrumental...</p>
                  <Progress className="mt-1 h-1.5" value={job.music.stemJob.progress} />
                </div>
              )}
            {job.music.hasInstrumentalStem && (
              <p className="mt-1 text-xs text-green-700">✓ Versão instrumental disponível</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Estados intermediários: pending (RapidAPI convertendo / na fila),
  // downloading e uploading (o servidor baixa e cadastra automaticamente).
  const statusCopy: Record<string, string> = {
    pending: job.videoApiStatus === 'processing'
      ? 'Convertendo o áudio...'
      : 'Na fila...',
    downloading: 'Baixando o áudio...',
    uploading: 'Adicionando à biblioteca...',
  }

  const displayStatus = statusCopy[job.status] || 'Processando...'
  const canCancel = job.status === 'pending'

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-blue-600" />
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-blue-900">{displayStatus}</p>
            <span className="text-sm font-semibold text-blue-900">{job.progress}%</span>
          </div>
          <Progress className="h-2" value={job.progress} />
          {job.title && <p className="mt-1 text-xs text-blue-800">{job.title}</p>}
          {canCancel && (
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => cancelJob.mutate(job.jobId)}
                disabled={cancelJob.isPending}
                className="h-7 text-blue-900 hover:bg-blue-100 hover:text-blue-900"
              >
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
