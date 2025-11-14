'use client'

import Link from 'next/link'
import { Loader2, CheckCircle2, XCircle, Music } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useYoutubeDownloadStatus } from '@/hooks/use-youtube-download'

interface YoutubeDownloadProgressProps {
  jobId: number
}

export function YoutubeDownloadProgress({ jobId }: YoutubeDownloadProgressProps) {
  const { data: job, isLoading } = useYoutubeDownloadStatus(jobId)

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
            <p className="text-sm font-medium text-red-900">Download falhou</p>
            <p className="text-sm text-red-700">{job.error || 'Tente novamente com outro link.'}</p>
          </div>
        </div>
      </div>
    )
  }

  if (job.status === 'completed' && job.music) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-900">Download concluído!</p>
              <p className="text-sm text-green-800">{job.music.name}</p>
              {job.music.stemJob && job.music.stemJob.status === 'processing' && (
                <div className="mt-2">
                  <p className="text-xs text-green-800">Processando separação de percussão...</p>
                  <Progress className="mt-1 h-1.5" value={job.music.stemJob.progress} />
                </div>
              )}
              {job.music.hasPercussionStem && (
                <p className="mt-1 text-xs text-green-700">✓ Percussão disponível</p>
              )}
            </div>
          </div>
          <Link href={`/biblioteca-musicas/${job.music.id}`}>
            <Button size="sm" variant="outline">
              <Music className="mr-2 h-4 w-4" />
              Ver música
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const statusCopy: Record<string, string> = {
    pending: 'Na fila de downloads...',
    downloading: 'Baixando do YouTube...',
    uploading: 'Salvando arquivo...',
  }

  const displayStatus = statusCopy[job.status] || 'Processando...'

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
        </div>
      </div>
    </div>
  )
}
