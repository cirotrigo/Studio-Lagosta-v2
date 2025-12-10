'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { isPhotoSwipeOpen, wasPhotoSwipeJustClosed } from '@/hooks/use-photoswipe'
import {
  Send,
  Edit,
  MoreHorizontal,
  Trash2,
  Clock,
  RefreshCw,
  Copy,
  ChevronLeft,
  ChevronRight,
  Video as VideoIcon,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Bell
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePostActions } from '@/hooks/use-post-actions'
import { usePostStatusPolling } from '@/hooks/use-post-status-polling'
import { useProject } from '@/hooks/use-project'
import { RescheduleDialog } from './reschedule-dialog'
import { DuplicateDialog } from './duplicate-dialog'
import { toast } from 'sonner'
import { getPostDate } from '../calendar/calendar-utils'
import type { SocialPost } from '../../../../prisma/generated/client'
import Image from 'next/image'
import { cn, isExternalImage } from '@/lib/utils'

interface PostPreviewModalProps {
  post: SocialPost
  open: boolean
  onClose: () => void
  onEdit?: (post: SocialPost) => void
}

export function PostPreviewModal({ post, open, onClose, onEdit }: PostPreviewModalProps) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isPolling, setIsPolling] = useState(false)
  const { publishNow, deletePost } = usePostActions(post.projectId)
  const { data: project } = useProject(post.projectId)

  // Poll for post status updates after publishing
  usePostStatusPolling({
    postId: post.id,
    enabled: isPolling && post.status === 'POSTING',
    onSuccess: (publishedUrl, _postType) => {
      setIsPolling(false)
      toast.success('Post confirmado como publicado!', {
        description: publishedUrl ? 'Visualize no Instagram' : undefined,
        action: publishedUrl ? {
          label: 'Ver Post',
          onClick: () => window.open(publishedUrl, '_blank')
        } : undefined
      })
    },
    onFailure: (errorMessage) => {
      setIsPolling(false)
      toast.error('Falha ao publicar', {
        description: errorMessage
      })
    }
  })

  const mediaUrls = post.mediaUrls || []
  const isCarousel = post.postType === 'CAROUSEL' && mediaUrls.length > 1
  const isStory = post.postType === 'STORY'

  // OPTIMIZED: Preload next and previous images for carousel
  useEffect(() => {
    if (!isCarousel || mediaUrls.length <= 1) return

    const nextIndex = (currentImageIndex + 1) % mediaUrls.length
    const prevIndex = currentImageIndex === 0 ? mediaUrls.length - 1 : currentImageIndex - 1

    // Preload next image
    if (mediaUrls[nextIndex] && !isVideoUrl(mediaUrls[nextIndex])) {
      const img = new window.Image()
      img.src = mediaUrls[nextIndex]
    }

    // Preload previous image
    if (mediaUrls[prevIndex] && !isVideoUrl(mediaUrls[prevIndex])) {
      const img = new window.Image()
      img.src = mediaUrls[prevIndex]
    }
  }, [currentImageIndex, mediaUrls, isCarousel])

  // Helper para detectar se é vídeo pela extensão da URL
  const isVideoUrl = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']
    return videoExtensions.some(ext => url.toLowerCase().includes(ext))
  }

  const currentMediaUrl = mediaUrls[currentImageIndex]
  const isCurrentMediaVideo = currentMediaUrl ? isVideoUrl(currentMediaUrl) : false

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? mediaUrls.length - 1 : prev - 1))
  }

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === mediaUrls.length - 1 ? 0 : prev + 1))
  }

  // Reset index quando modal abrir
  useEffect(() => {
    if (open) {
      setCurrentImageIndex(0)
    }
  }, [open])

  // Navegação por teclado para carrossel
  useEffect(() => {
    if (!open || !isCarousel) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevImage()
      } else if (e.key === 'ArrowRight') {
        handleNextImage()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, isCarousel, mediaUrls.length])

  // Touch swipe para carrossel em mobile
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.touches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (!isCarousel) return

    const minSwipeDistance = 50
    const distance = touchStart - touchEnd

    if (distance > minSwipeDistance) {
      // Swipe left - próxima imagem
      handleNextImage()
    } else if (distance < -minSwipeDistance) {
      // Swipe right - imagem anterior
      handlePrevImage()
    }
  }

  const handlePublishNow = async () => {
    try {
      await publishNow.mutateAsync(post.id)
      const message = post.status === 'FAILED'
        ? 'Tentando novamente! Aguardando confirmação...'
        : 'Post enviado! Aguardando confirmação...'
      toast.success(message, {
        description: 'O status será atualizado automaticamente'
      })
      setIsPolling(true) // Start polling for status updates
      onClose()
    } catch (_error) {
      const errorMessage = post.status === 'FAILED'
        ? 'Erro ao tentar novamente'
        : 'Erro ao publicar post'
      toast.error(errorMessage)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja deletar este post?')) return

    try {
      await deletePost.mutateAsync(post.id)
      toast.success('Post deletado')
      onClose()
    } catch (_error) {
      toast.error('Erro ao deletar post')
    }
  }

  const handleDuplicate = () => {
    setDuplicateOpen(true)
  }

  const handleEdit = () => {
    if (onEdit) {
      onEdit(post)
      onClose()
    }
  }

  const referenceDate = getPostDate(post)
  const scheduledTimeLabel = referenceDate
    ? referenceDate.toLocaleDateString('pt-BR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : post.scheduleType === 'IMMEDIATE'
      ? 'Enviando agora'
      : 'Horário não definido'

  const getPostTypeBadge = () => {
    switch (post.postType) {
      case 'STORY':
        return <Badge>Story</Badge>
      case 'REEL':
        return <Badge variant="secondary">Reel</Badge>
      case 'CAROUSEL':
        return <Badge variant="outline">Carrossel</Badge>
      default:
        return <Badge variant="outline">Post</Badge>
    }
  }

  // Handler para onOpenChange do Dialog que verifica PhotoSwipe
  const handleDialogOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      // Se está tentando fechar, verificar PhotoSwipe
      if (isPhotoSwipeOpen() || wasPhotoSwipeJustClosed()) {
        console.log('🛡️ PostPreviewModal: Dialog close prevented because PhotoSwipe is open or just closed')
        return
      }
      onClose()
    }
  }, [onClose])

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className={cn(
          "max-h-[90vh] overflow-hidden flex flex-col",
          isStory ? "max-w-sm" : "max-w-md"
        )}>
          <VisuallyHidden>
            <DialogTitle>Preview do Post</DialogTitle>
          </VisuallyHidden>

          <div className="overflow-y-auto flex-1 space-y-4">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {scheduledTimeLabel}
                </span>
                <Badge variant="outline" className="text-xs">
                  {post.scheduleType === 'IMMEDIATE' && 'Imediato'}
                  {post.scheduleType === 'SCHEDULED' && 'Agendado'}
                  {post.scheduleType === 'RECURRING' && 'Recorrente'}
                </Badge>
              </div>

              {getPostTypeBadge()}
            </div>

            <div className="flex items-center gap-2">
              {project ? (
                <>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs overflow-hidden",
                    (project.logoUrl || (project as any).Logo?.[0]?.fileUrl)
                      ? "bg-white border-2 border-border"
                      : "bg-gradient-to-br from-pink-500 to-purple-500"
                  )}>
                    {(project.logoUrl || (project as any).Logo?.[0]?.fileUrl) ? (
                      <Image
                        src={project.logoUrl || (project as any).Logo![0].fileUrl}
                        alt={project.name}
                        width={32}
                        height={32}
                        className="object-contain p-0.5"
                        priority // OPTIMIZED: Logo loads with priority
                        quality={70} // OPTIMIZED: Reduced from 75
                        placeholder="blur"
                        blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4="
                        unoptimized={isExternalImage(project.logoUrl || (project as any).Logo![0].fileUrl)}
                      />
                    ) : (
                      project.name.substring(0, 2).toUpperCase()
                    )}
                  </div>
                  <span className="font-semibold text-sm">{project.instagramUsername || project.name}</span>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                    ...
                  </div>
                  <span className="font-semibold text-sm">Carregando...</span>
                </>
              )}
            </div>
          </div>

          {/* Preview da mídia */}
          {mediaUrls.length > 0 && mediaUrls[0] && (
            <div className="relative group">
              {/* Container com proporção baseada no tipo de post */}
              <div
                className={cn(
                  "relative overflow-hidden rounded-lg bg-muted",
                  isStory ? "aspect-[9/16]" : "aspect-square",
                  isCarousel && "cursor-pointer select-none"
                )}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {isCurrentMediaVideo ? (
                  <>
                    <video
                      key={currentImageIndex}
                      src={currentMediaUrl}
                      className="absolute inset-0 w-full h-full object-cover"
                      controls
                      loop
                      playsInline
                      preload="metadata"
                    >
                      Seu navegador não suporta vídeos.
                    </video>
                    {/* Badge de vídeo */}
                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-1">
                      <VideoIcon className="w-3 h-3 text-white" />
                      <span className="text-xs text-white font-medium">Vídeo</span>
                    </div>
                  </>
                ) : (
                  <Image
                    key={currentImageIndex}
                    src={currentMediaUrl || ''}
                    alt={post.caption || 'Prévia do post'}
                    fill
                    sizes={isStory ? "(max-width: 768px) 80vw, 360px" : "(max-width: 768px) 80vw, 400px"}
                    className="object-cover transition-opacity duration-300"
                    priority={currentImageIndex === 0} // OPTIMIZED: Priority for first image
                    loading={currentImageIndex === 0 ? undefined : "lazy"}
                    quality={80} // OPTIMIZED: Increased to 80 for preview (was 75)
                    placeholder="blur"
                    blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4="
                    unoptimized={isExternalImage(currentMediaUrl || '')}
                  />
                )}

                {/* Botões de navegação do carrossel */}
                {isCarousel && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={handlePrevImage}
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={handleNextImage}
                    >
                      <ChevronRight className="w-6 h-6" />
                    </Button>
                  </>
                )}

                {/* Indicadores de carrossel (dots) */}
                {isCarousel && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {mediaUrls.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all",
                          index === currentImageIndex
                            ? "bg-white w-6"
                            : "bg-white/50 hover:bg-white/75"
                        )}
                        aria-label={`Ir para imagem ${index + 1}`}
                      />
                    ))}
                  </div>
                )}

                {/* Badge contador de carrossel */}
                {isCarousel && (
                  <Badge className="absolute top-2 right-2">
                    {currentImageIndex + 1}/{mediaUrls.length}
                  </Badge>
                )}

                {/* Badge de recorrente - ajustado para não sobrepor badge de vídeo */}
                {post.isRecurring && !isCurrentMediaVideo && (
                  <Badge className="absolute top-2 left-2" variant="secondary">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Recorrente
                  </Badge>
                )}
                {post.isRecurring && isCurrentMediaVideo && (
                  <Badge className="absolute bottom-2 left-2" variant="secondary">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Recorrente
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Caption (se houver) */}
          {post.caption && (
            <div className="max-h-32 overflow-y-auto text-sm text-muted-foreground border rounded-lg p-3 bg-muted/20">
              {post.caption}
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={
                post.status === 'SCHEDULED' ? 'default' :
                post.status === 'POSTING' ? 'default' :
                post.status === 'POSTED' ? 'secondary' :
                post.status === 'FAILED' ? 'destructive' :
                'outline'
              }
            >
              {post.status === 'SCHEDULED' && 'Agendado'}
              {post.status === 'POSTING' && 'Postando...'}
              {post.status === 'POSTED' && 'Postado'}
              {post.status === 'FAILED' && 'Falhou'}
              {post.status === 'DRAFT' && 'Rascunho'}
            </Badge>

            {/* Badge de Lembrete - quando é apenas um reminder no Buffer */}
            {post.publishType === 'REMINDER' && (
              <Badge
                className="bg-amber-500 text-white hover:bg-amber-600 flex items-center gap-1 font-semibold text-xs"
                title="Lembrete no Buffer - não publicado no Instagram"
              >
                <Bell className="w-3 h-3" />
                <span>Lembrete</span>
              </Badge>
            )}

            {/* Badges de Verificação - apenas para Stories já enviados e NÃO lembretes */}
            {isStory && post.publishType !== 'REMINDER' && (post.status === 'POSTED' || post.status === 'FAILED') && (
              <>
                {post.verificationStatus === 'VERIFIED' && (
                  <Badge
                    className="bg-emerald-500 text-white hover:bg-emerald-600 flex items-center gap-1 font-semibold text-xs"
                    title={post.verifiedByFallback ? 'Verificado no Instagram (por timestamp)' : 'Verificado no Instagram (por TAG)'}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>{post.verifiedByFallback ? 'Instagram ✓*' : 'Instagram ✓'}</span>
                  </Badge>
                )}
                {post.verificationStatus === 'VERIFICATION_FAILED' && (
                  <Badge
                    className="bg-red-600 text-white hover:bg-red-700 flex items-center gap-1 font-semibold text-xs"
                    title="Não encontrado no Instagram após 3 tentativas"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    <span>Instagram ✗</span>
                  </Badge>
                )}
                {post.verificationStatus === 'PENDING' && (
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 border-blue-400 text-blue-600 text-xs"
                    title="Aguardando verificação no Instagram"
                  >
                    <Clock className="w-3 h-3 animate-pulse" />
                    <span>Verificando...</span>
                  </Badge>
                )}
              </>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 pt-4 border-t">
            {/* Botão para abrir story verificado no Instagram */}
            {isStory && post.verificationStatus === 'VERIFIED' && post.verifiedPermalink && (
              <Button
                variant="default"
                size="sm"
                onClick={() => window.open(post.verifiedPermalink!, '_blank', 'noopener,noreferrer')}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Ver Story no Instagram</span>
              </Button>
            )}

            {/* Mensagem quando post foi publicado */}
            {post.status === 'POSTED' && !(isStory && post.verificationStatus === 'VERIFIED' && post.verifiedPermalink) && (
              <div className="flex-1 text-sm text-green-600 dark:text-green-400 italic text-center py-2 bg-green-50 dark:bg-green-950/20 rounded-md">
                ✓ Post publicado com sucesso!
              </div>
            )}

            {/* Botões padrão para posts não enviados */}
            {post.status !== 'POSTED' && post.status !== 'POSTING' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setRescheduleOpen(true)}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Re-agendar
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  onClick={handlePublishNow}
                  disabled={publishNow.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {post.status === 'FAILED' ? 'Tentar novamente' : 'Publicar Agora'}
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleEdit}
              disabled={!onEdit || post.status === 'POSTED' || post.status === 'POSTING'}
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}}>
                  Ver detalhes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-red-600 focus:text-red-600"
                  disabled={deletePost.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Deletar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Re-agendamento */}
      <RescheduleDialog
        post={post}
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
      />

      {/* Dialog de Duplicação */}
      <DuplicateDialog
        post={post}
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
      />
    </>
  )
}
