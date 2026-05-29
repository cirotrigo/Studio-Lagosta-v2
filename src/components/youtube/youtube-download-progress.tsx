'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ExternalLink, Upload } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  useYoutubeDownloadStatus,
  useUploadYoutubeMp3,
  useCancelarYoutubeJob,
} from '@/hooks/use-youtube-download'
import { useQueryClient } from '@tanstack/react-query'
import { chavesMusica } from '@/hooks/use-music-library'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface YoutubeDownloadProgressProps {
  jobId: number
}

export function YoutubeDownloadProgress({ jobId }: YoutubeDownloadProgressProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: job, isLoading } = useYoutubeDownloadStatus(jobId)
  const uploadMp3 = useUploadYoutubeMp3()
  const cancelJob = useCancelarYoutubeJob()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasInvalidated = useRef(false)
  const [mp3File, setMp3File] = useState<File | null>(null)

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
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
          <div>
            <p className="text-sm font-semibold text-green-900">Download concluído!</p>
            <p className="text-sm text-green-800">
              &quot;{job.music.name}&quot; foi adicionada à biblioteca automaticamente.
            </p>
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
      </div>
    )
  }

  if (job.status === 'downloading' && job.downloadLink) {
    const handleDownloadClick = () => {
      window.open(job.downloadLink ?? undefined, '_blank')
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (!file.type.includes('audio') && !file.name.endsWith('.mp3')) {
        toast({
          title: 'Arquivo inválido',
          description: 'Selecione um arquivo MP3.',
          variant: 'destructive',
        })
        return
      }
      setMp3File(file)
    }

    const handleUpload = async () => {
      if (!mp3File) return
      try {
        await uploadMp3.mutateAsync({ jobId: job.jobId, file: mp3File })
        toast({
          title: 'Música adicionada à biblioteca!',
          description: job.title ?? 'Upload concluído.',
        })
        setMp3File(null)
      } catch (error) {
        toast({
          title: 'Falha no upload',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        })
      }
    }

    const handleCancel = () => {
      cancelJob.mutate(job.jobId)
    }

    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Link pronto — finalize o download</p>
            {job.title && <p className="text-xs text-amber-800 truncate">{job.title}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md border border-amber-200 bg-white p-3">
            <p className="text-xs font-medium text-amber-900 mb-2">1. Baixe o MP3</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleDownloadClick}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir download
            </Button>
          </div>

          <div className="rounded-md border border-amber-200 bg-white p-3">
            <p className="text-xs font-medium text-amber-900 mb-2">2. Envie o arquivo</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,.mp3"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploadMp3.isPending}
            />
            <div
              onClick={() => !uploadMp3.isPending && fileInputRef.current?.click()}
              className={cn(
                'cursor-pointer rounded border border-dashed p-2 text-center text-xs transition-colors mb-2',
                mp3File
                  ? 'border-green-500/60 bg-green-500/10 text-green-800'
                  : 'border-amber-300 hover:border-amber-500 text-amber-900',
                uploadMp3.isPending && 'opacity-50 cursor-not-allowed'
              )}
            >
              {mp3File ? mp3File.name : 'Clique para selecionar'}
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={handleUpload}
              disabled={!mp3File || uploadMp3.isPending}
            >
              {uploadMp3.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Adicionar à biblioteca
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={uploadMp3.isPending || cancelJob.isPending}
            className="text-amber-900 hover:text-amber-900 hover:bg-amber-100"
          >
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  const statusCopy: Record<string, string> = {
    pending: job.videoApiStatus === 'processing'
      ? 'Convertendo o vídeo...'
      : 'Na fila de downloads...',
    downloading: 'Preparando download...',
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
