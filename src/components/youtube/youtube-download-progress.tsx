'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Download } from 'lucide-react'
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
  // Controle do download feito no navegador.
  // `linkTentadoRef` guarda QUAL link já teve tentativa automática; `tentativasRef`
  // conta quantas foram. As duas coisas juntas são o que impede o laço: o `job` é
  // repolado a cada 5s, então zerar o guard no erro fazia o efeito reentrar para
  // sempre, martelando o CDN e piscando a mensagem de erro na tela.
  const MAX_TENTATIVAS_AUTO = 2
  const linkTentadoRef = useRef<string | null>(null)
  const tentativasRef = useRef(0)
  const [clientDownloading, setClientDownloading] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  useEffect(() => {
    if (!job || job.status !== 'completed' || !job.music) return
    if (hasInvalidated.current) return
    queryClient.invalidateQueries({ queryKey: chavesMusica.listas() })
    hasInvalidated.current = true
  }, [job, queryClient])

  // A transferência: baixa o MP3 do CDN e sobe para o servidor.
  //
  // Isso roda NO NAVEGADOR porque o CDN do RapidAPI responde 404 para IPs de
  // datacenter (Vercel) e só serve IPs residenciais — com CORS aberto. A
  // consequência é que ela só acontece enquanto ESTA página estiver aberta:
  // nenhum cron cobre o estado "downloading com link", e em ~2h o link expira.
  const transferir = useCallback(
    async (link: string, jobIdAlvo: number, titulo: string | null) => {
      setClientDownloading(true)
      setClientError(null)
      try {
        const res = await fetch(link)
        if (!res.ok) throw new Error(`Falha ao baixar o áudio (HTTP ${res.status})`)
        const blob = await res.blob()
        if (blob.size < 10000) throw new Error('Arquivo muito pequeno — download falhou')
        const file = new File([blob], `${titulo ?? jobIdAlvo}.mp3`, { type: 'audio/mpeg' })
        await uploadMp3.mutateAsync({ jobId: jobIdAlvo, file })
        queryClient.invalidateQueries({ queryKey: ['youtube-job-status', jobIdAlvo] })
        queryClient.invalidateQueries({ queryKey: chavesMusica.listas() })
      } catch (error) {
        console.error('[YOUTUBE] Download no navegador falhou:', error)
        setClientError(error instanceof Error ? error.message : 'Falha ao baixar o áudio')
      } finally {
        setClientDownloading(false)
      }
    },
    [uploadMp3, queryClient]
  )

  /** Retomar na mão: zera o orçamento de tentativas e transfere de novo. */
  const baixarAgora = useCallback(() => {
    if (!job?.downloadLink) return
    tentativasRef.current = 0
    linkTentadoRef.current = job.downloadLink
    void transferir(job.downloadLink, job.jobId, job.title)
  }, [job, transferir])

  // Tentativa automática, com teto. Sem teto isto vira laço a cada repolagem.
  useEffect(() => {
    if (!job || job.status !== 'downloading' || !job.downloadLink || job.music) return
    if (clientDownloading || uploadMp3.isPending) return

    if (linkTentadoRef.current !== job.downloadLink) {
      linkTentadoRef.current = job.downloadLink
      tentativasRef.current = 0
    }
    if (tentativasRef.current >= MAX_TENTATIVAS_AUTO) return

    tentativasRef.current += 1
    void transferir(job.downloadLink, job.jobId, job.title)
  }, [job, transferir, clientDownloading, uploadMp3.isPending])

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
                onClick={baixarAgora}
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

  const transferindo = clientDownloading || uploadMp3.isPending

  // O arquivo está pronto no CDN e as tentativas automáticas se esgotaram.
  //
  // A condição exige o orçamento zerado para o aviso não piscar: ao abrir a
  // página sobre um download parado, a tentativa automática dispara sozinha, e
  // sem esse teto o âmbar apareceria por um quadro antes de virar "Baixando".
  //
  // Antes isto caía no spinner genérico com "Preparando download... 50%", que
  // é indistinguível de progresso real: o usuário via a barra girar por 2
  // horas até o job ser descartado. Como só o navegador consegue baixar (o CDN
  // recusa IP de datacenter), o estado precisa ser explícito e ter um botão.
  const tentativasAutoEsgotadas = tentativasRef.current >= MAX_TENTATIVAS_AUTO

  if (
    job.status === 'downloading' &&
    job.downloadLink &&
    !transferindo &&
    !clientError &&
    tentativasAutoEsgotadas
  ) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">Falta baixar o arquivo</p>
            <p className="text-sm text-amber-800">
              O download acontece por esta página e precisa que ela fique aberta até o fim.
            </p>
            {job.title && <p className="mt-1 text-xs text-amber-800">{job.title}</p>}
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={baixarAgora}>
                Baixar agora
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => cancelJob.mutate(job.jobId)}
                disabled={cancelJob.isPending}
                className="text-amber-900 hover:bg-amber-100 hover:text-amber-900"
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
  // downloading (a transferência está rodando nesta aba).
  const statusCopy: Record<string, string> = {
    pending: job.videoApiStatus === 'processing'
      ? 'Convertendo o áudio...'
      : 'Na fila...',
    downloading: 'Baixando e adicionando...',
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
