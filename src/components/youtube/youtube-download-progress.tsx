'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  useYoutubeDownloadStatus,
  useCancelarYoutubeJob,
  useUploadYoutubeMp3,
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
  const uploadMp3 = useUploadYoutubeMp3()
  const hasInvalidated = useRef(false)
  // Controle do download automático no navegador (uma vez por link)
  const downloadedLinkRef = useRef<string | null>(null)
  const [clientDownloading, setClientDownloading] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  useEffect(() => {
    if (!job || job.status !== 'completed' || !job.music) return
    if (hasInvalidated.current) return
    queryClient.invalidateQueries({ queryKey: chavesMusica.listas() })
    hasInvalidated.current = true
  }, [job, queryClient])

  // Download automático no NAVEGADOR: o CDN da RapidAPI bloqueia IPs de
  // datacenter (Vercel → 404) mas serve IPs residenciais e tem CORS aberto.
  // Quando o link fica pronto, baixamos via fetch e subimos para o servidor.
  useEffect(() => {
    if (!job || job.status !== 'downloading' || !job.downloadLink || job.music) return
    if (downloadedLinkRef.current === job.downloadLink) return

    downloadedLinkRef.current = job.downloadLink
    const link = job.downloadLink
    const fileName = `${job.title ?? job.jobId}.mp3`

    setClientDownloading(true)
    setClientError(null)
    ;(async () => {
      try {
        const res = await fetch(link)
        if (!res.ok) throw new Error(`Falha ao baixar o áudio (HTTP ${res.status})`)
        const blob = await res.blob()
        if (blob.size < 10000) throw new Error('Arquivo muito pequeno — download falhou')
        const file = new File([blob], fileName, { type: 'audio/mpeg' })
        await uploadMp3.mutateAsync({ jobId: job.jobId, file })
        queryClient.invalidateQueries({ queryKey: ['youtube-job-status', job.jobId] })
        queryClient.invalidateQueries({ queryKey: chavesMusica.listas() })
      } catch (error) {
        console.error('[YOUTUBE] Download no navegador falhou:', error)
        setClientError(error instanceof Error ? error.message : 'Falha ao baixar o áudio')
        // Permite nova tentativa (botão) sem recarregar
        downloadedLinkRef.current = null
      } finally {
        setClientDownloading(false)
      }
    })()
  }, [job, uploadMp3, queryClient])

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

  // Falha no download feito pelo navegador (link expirado, rede, etc.) — com retry.
  if (clientError && !clientDownloading) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">Não foi possível baixar</p>
            <p className="text-sm text-red-700">{clientError}</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setClientError(null)
                  // Reabre o link atual para o efeito de download tentar de novo
                  queryClient.invalidateQueries({ queryKey: ['youtube-job-status', job.jobId] })
                }}
              >
                Tentar novamente
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => cancelJob.mutate(job.jobId)}
                disabled={cancelJob.isPending}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Estados intermediários: pending (RapidAPI convertendo / na fila) e
  // downloading (o navegador baixa e sobe o arquivo automaticamente).
  const statusCopy: Record<string, string> = {
    pending: job.videoApiStatus === 'processing'
      ? 'Convertendo o áudio...'
      : 'Na fila...',
    downloading: clientDownloading || uploadMp3.isPending
      ? 'Baixando e adicionando...'
      : 'Preparando download...',
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
