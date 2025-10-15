"use client"

import * as React from 'react'
import Image from 'next/image'
import { Trash2, Download, Loader2, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useTemplateCreatives, useDeleteCreative } from '@/hooks/use-template-creatives'
import { CreativesLightbox } from '../creatives-lightbox'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface CreativesPanelProps {
  templateId: number
}

export function CreativesPanel({ templateId }: CreativesPanelProps) {
  const { toast } = useToast()
  const { data: creatives = [], isLoading, error, refetch } = useTemplateCreatives(templateId)
  const deleteCreative = useDeleteCreative(templateId)
  const [creativeToDelete, setCreativeToDelete] = React.useState<string | null>(null)

  // Debug logging
  React.useEffect(() => {
    console.log('[CreativesPanel] templateId:', templateId)
    console.log('[CreativesPanel] isLoading:', isLoading)
    console.log('[CreativesPanel] error:', _error)
    console.log('[CreativesPanel] creatives:', creatives)
  }, [templateId, isLoading, error, creatives])

  // Refetch ao montar o componente para garantir dados atualizados
  React.useEffect(() => {
    refetch()
  }, [refetch])

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

  const handleDownload = React.useCallback((url: string, fileName: string) => {
    // Criar link de download
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Download iniciado',
      description: 'O criativo está sendo baixado.',
    })
  }, [toast])

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
    </div>
  )
}
