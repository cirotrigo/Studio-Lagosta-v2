'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import {
  Send,
  Edit,
  MoreHorizontal,
  Trash2,
  Clock,
  RefreshCw,
  Copy,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePostActions } from '@/hooks/use-post-actions'
import { RescheduleDialog } from './reschedule-dialog'
import { toast } from 'sonner'
import { getPostDate } from '../calendar/calendar-utils'
import type { SocialPost } from '../../../../prisma/generated/client'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface PostPreviewModalProps {
  post: SocialPost
  open: boolean
  onClose: () => void
  onEdit?: (post: SocialPost) => void
}

export function PostPreviewModal({ post, open, onClose, onEdit }: PostPreviewModalProps) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const { publishNow, deletePost, duplicatePost } = usePostActions(post.projectId)

  const mediaUrls = post.mediaUrls || []
  const isCarousel = post.postType === 'CAROUSEL' && mediaUrls.length > 1
  const isStory = post.postType === 'STORY'

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
      toast.success('Post publicado com sucesso!')
      onClose()
    } catch (_error) {
      toast.error('Erro ao publicar post')
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

  const handleDuplicate = async () => {
    try {
      await duplicatePost.mutateAsync(post.id)
      toast.success('Post duplicado com sucesso!')
      onClose()
    } catch (_error) {
      toast.error('Erro ao duplicar post')
    }
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

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className={cn(
          "max-h-[90vh] overflow-y-auto",
          isStory ? "max-w-sm" : "max-w-md"
        )}>
          <VisuallyHidden>
            <DialogTitle>Preview do Post</DialogTitle>
          </VisuallyHidden>

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
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                PR
              </div>
              <span className="font-semibold text-sm">Project</span>
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
                <Image
                  key={currentImageIndex}
                  src={mediaUrls[currentImageIndex]}
                  alt={post.caption || 'Prévia do post'}
                  fill
                  sizes={isStory ? "(max-width: 768px) 80vw, 360px" : "(max-width: 768px) 80vw, 400px"}
                  className="object-cover transition-opacity duration-300"
                  unoptimized
                />

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

                {/* Badge de recorrente */}
                {post.isRecurring && (
                  <Badge className="absolute top-2 left-2" variant="secondary">
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
          <div className="flex items-center gap-2">
            <Badge
              variant={
                post.status === 'SCHEDULED' ? 'default' :
                post.status === 'SENT' ? 'secondary' :
                post.status === 'FAILED' ? 'destructive' :
                'outline'
              }
            >
              {post.status === 'SCHEDULED' && 'Agendado'}
              {post.status === 'PROCESSING' && 'Processando'}
              {post.status === 'SENT' && 'Enviado'}
              {post.status === 'FAILED' && 'Falhou'}
              {post.status === 'DRAFT' && 'Rascunho'}
            </Badge>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setRescheduleOpen(true)}
              disabled={post.status === 'SENT'}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-agendar
            </Button>

            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={handlePublishNow}
              disabled={publishNow.isPending || post.status === 'SENT'}
            >
              <Send className="w-4 h-4 mr-2" />
              Publicar Agora
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleEdit}
              disabled={!onEdit || post.status === 'SENT'}
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>

            <DropdownMenu>
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
        </DialogContent>
      </Dialog>

      {/* Dialog de Re-agendamento */}
      <RescheduleDialog
        post={post}
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
      />
    </>
  )
}
