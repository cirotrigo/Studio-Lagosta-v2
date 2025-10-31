"use client"

import * as React from 'react'
import Image from 'next/image'
import { Trash2, Download, Loader2, ImageIcon, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useTemplateCreatives, useDeleteCreative, type Creative } from '@/hooks/use-template-creatives'
import { CreativesLightbox } from '../creatives-lightbox'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PostComposer, type PostFormData } from '@/components/posts/post-composer'

interface CreativesPanelProps {
  templateId: number
  projectId: number
}

export function CreativesPanel({ templateId, projectId }: CreativesPanelProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: creatives = [], isLoading, error, refetch } = useTemplateCreatives(templateId)
  const deleteCreative = useDeleteCreative(templateId)
  const [creativeToDelete, setCreativeToDelete] = React.useState<string | null>(null)
  const [isComposerOpen, setIsComposerOpen] = React.useState(false)
  const [schedulingCreative, setSchedulingCreative] = React.useState<Creative | null>(null)

  // Debug logging
  React.useEffect(() => {
    console.log('[CreativesPanel] templateId:', templateId)
    console.log('[CreativesPanel] isLoading:', isLoading)
    console.log('[CreativesPanel] error:', error)
    console.log('[CreativesPanel] creatives:', creatives)
  }, [templateId, isLoading, error, creatives])

  // State para rastrear progresso em tempo real
  const [progressOverrides, setProgressOverrides] = React.useState<Record<string, {
    progress: number
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    errorMessage?: string | null
  }>>({})

  // Refetch ao montar o componente para garantir dados atualizados
  React.useEffect(() => {
    refetch()
  }, [refetch])

  // Escutar eventos de exportação de vídeo
  React.useEffect(() => {
    const handleVideoQueued = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail || !detail.generationId) return

      setProgressOverrides((prev) => ({
        ...prev,
        [detail.generationId]: {
          progress: detail.progress || 0,
          status: detail.status || 'PENDING',
        },
      }))

      // Invalidar query para buscar o novo criativo
      queryClient.invalidateQueries({ queryKey: ['template-creatives', templateId] })
    }

    const handleVideoProgress = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail || !detail.generationId) return

      setProgressOverrides((prev) => ({
        ...prev,
        [detail.generationId]: {
          progress: detail.progress || prev[detail.generationId]?.progress || 0,
          status: detail.status || 'PROCESSING',
        },
      }))
    }

    const handleVideoCompleted = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail || !detail.generationId) return

      setProgressOverrides((prev) => ({
        ...prev,
        [detail.generationId]: {
          progress: 100,
          status: 'COMPLETED',
        },
      }))

      // Invalidar query para pegar o vídeo MP4 final
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['template-creatives', templateId] })
      }, 1000)
    }

    const handleVideoFailed = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail || !detail.generationId) return

      setProgressOverrides((prev) => ({
        ...prev,
        [detail.generationId]: {
          progress: prev[detail.generationId]?.progress || 0,
          status: 'FAILED',
          errorMessage: detail.errorMessage,
        },
      }))
    }

    window.addEventListener('video-export-queued', handleVideoQueued)
    window.addEventListener('video-export-progress', handleVideoProgress)
    window.addEventListener('video-export-completed', handleVideoCompleted)
    window.addEventListener('video-export-failed', handleVideoFailed)

    return () => {
      window.removeEventListener('video-export-queued', handleVideoQueued)
      window.removeEventListener('video-export-progress', handleVideoProgress)
      window.removeEventListener('video-export-completed', handleVideoCompleted)
      window.removeEventListener('video-export-failed', handleVideoFailed)
    }
  }, [queryClient, templateId])

  const handleDelete = React.useCallback(async () => {
    if (!creativeToDelete) return

    try {
      await deleteCreative.mutateAsync(creativeToDelete)
      toast({
        title: 'Criativo removido',
        description: 'O criativo foi removido com sucesso.',
      })
      setCreativeToDelete(null)
    } catch (_error) {
      console.error('Failed to delete creative:', _error)
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover o criativo.',
        variant: 'destructive',
      })
    }
  }, [creativeToDelete, deleteCreative, toast])

  const handleDownload = React.useCallback(async (url: string, fileName: string) => {
    try {
      // Buscar o arquivo e fazer download via blob
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Download falhou com status ${response.status}`)
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)

      // Criar link de download
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Limpar blob URL
      URL.revokeObjectURL(blobUrl)

      toast({
        title: 'Download concluído',
        description: 'O criativo foi baixado com sucesso.',
      })
    } catch (error) {
      console.error('[CreativesPanel] Falha ao baixar arquivo:', error)
      toast({
        title: 'Erro ao baixar',
        description: 'Não foi possível baixar o criativo.',
        variant: 'destructive',
      })
    }
  }, [toast])

  const handleSchedule = React.useCallback((creative: Creative) => {
    setSchedulingCreative(creative)
    setIsComposerOpen(true)
  }, [])

  const handleCloseComposer = React.useCallback(() => {
    setIsComposerOpen(false)
    setSchedulingCreative(null)
  }, [])

  const composerInitialData = React.useMemo(() => {
    if (!schedulingCreative) return undefined

    const width = Number.isFinite(schedulingCreative.width) && schedulingCreative.width > 0 ? schedulingCreative.width : 1080
    const height = Number.isFinite(schedulingCreative.height) && schedulingCreative.height > 0 ? schedulingCreative.height : 1920
    const aspectRatio = width / height

    // Detect post type based on dimensions
    let postType: 'POST' | 'STORY' | 'REEL' | 'CAROUSEL' = 'POST'
    if (aspectRatio < 0.7) {
      // Vertical - Story (9:16)
      postType = 'STORY'
    } else {
      // Feed or Square
      postType = 'POST'
    }

    const mediaUrl = schedulingCreative.resultUrl

    if (!mediaUrl) return undefined

    return {
      postType,
      mediaUrls: [mediaUrl],
      generationIds: [schedulingCreative.id],
      caption: '',
      scheduleType: 'SCHEDULED' as const,
    } as Partial<PostFormData>
  }, [schedulingCreative])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Carregando criativos...</p>
        </div>
      </div>
    )
  }

  if (creatives.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <ImageIcon className="h-12 w-12 opacity-20" />
          <p className="text-center text-sm">
            Nenhum criativo gerado ainda.
            <br />
            <span className="text-xs">Use o botão "Salvar Criativo" para gerar.</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold">Criativos Gerados</h3>
        <p className="text-xs text-muted-foreground">
          {creatives.length} {creatives.length === 1 ? 'criativo' : 'criativos'}
        </p>
      </div>

      <CreativesLightbox galleryId={`creatives-gallery-${templateId}`}>
        <div className="grid grid-cols-2 gap-3">
          {creatives.map((creative) => {
            // Usar dimensões reais do criativo
            const width = Number.isFinite(creative.width) && creative.width > 0 ? creative.width : 1080
            const height = Number.isFinite(creative.height) && creative.height > 0 ? creative.height : 1920
            const aspectRatio = width / height

            // Verificar se é um vídeo
            const isVideo =
              creative.isVideo === true ||
              creative.fieldValues?.isVideo === true ||
              creative.fieldValues?.isVideo === 'true'
            const mimeType =
              creative.mimeType ||
              (typeof creative.fieldValues?.mimeType === 'string'
                ? creative.fieldValues.mimeType
                : 'image/jpeg')
            const thumbnailUrl = creative.thumbnailUrl || creative.fieldValues?.thumbnailUrl
            const extension = mimeType?.includes('mp4')
              ? '.mp4'
              : mimeType?.includes('png')
                ? '.png'
                : '.jpg'

            // Verificar progresso em tempo real (prioriza override, fallback para status do banco)
            const progressData = progressOverrides[creative.id]
            const effectiveStatus = progressData?.status || creative.status
            const isProcessing = effectiveStatus === 'PENDING' || effectiveStatus === 'PROCESSING'
            const currentProgress = progressData?.progress || (creative.status === 'PROCESSING' ? 50 : 0)
            const hasFailed = effectiveStatus === 'FAILED'

            return (
              <div
                key={creative.id}
                className="group relative overflow-hidden rounded-lg border border-border/40 bg-card transition-all hover:border-primary hover:shadow-md"
              >
                {/* Thumbnail com link para lightbox */}
                <a
                  href={creative.resultUrl}
                  data-pswp-width={width}
                  data-pswp-height={height}
                  data-pswp-type={isVideo ? 'video' : 'image'}
                  style={{ aspectRatio }}
                  className="block overflow-hidden bg-muted"
                >
                  {isVideo ? (
                    <video
                      src={creative.resultUrl}
                      poster={thumbnailUrl}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      muted
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause()
                        e.currentTarget.currentTime = 0
                      }}
                    />
                  ) : (
                    <Image
                      src={thumbnailUrl || creative.resultUrl}
                      alt={`Criativo ${creative.id}`}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  )}
                </a>

                {/* Barra de progresso (se está processando) */}
                {isProcessing && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                    <Loader2 className="mb-2 h-8 w-8 animate-spin text-white" />
                    <div className="w-3/4 space-y-1">
                      <Progress value={currentProgress} className="h-2" />
                      <p className="text-center text-xs text-white">
                        {currentProgress < 20 ? 'Preparando...' :
                         currentProgress < 50 ? 'Processando...' :
                         currentProgress < 80 ? 'Convertendo...' :
                         'Finalizando...'}
                        {' '}({currentProgress}%)
                      </p>
                    </div>
                  </div>
                )}

                {/* Erro (se falhou) */}
                {hasFailed && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-destructive/90 backdrop-blur-sm">
                    <p className="text-center text-xs text-white px-2">
                      ❌ Falha no processamento
                    </p>
                  </div>
                )}

                {/* Info e ações */}
                <div className="space-y-2 p-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium leading-tight line-clamp-1">
                      {creative.templateName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(creative.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => handleSchedule(creative)}
                      title="Agendar publicação"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        handleDownload(
                          creative.resultUrl,
                          `criativo-${creative.id}${extension}`
                        )
                      }
                      title="Baixar criativo"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => setCreativeToDelete(creative.id)}
                      title="Remover criativo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CreativesLightbox>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog
        open={creativeToDelete !== null}
        onOpenChange={(open) => !open && setCreativeToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover criativo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O criativo será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCreative.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post Composer Modal for Scheduling */}
      {composerInitialData && (
        <PostComposer
          projectId={projectId}
          open={isComposerOpen}
          onClose={handleCloseComposer}
          initialData={composerInitialData}
        />
      )}
    </div>
  )
}
