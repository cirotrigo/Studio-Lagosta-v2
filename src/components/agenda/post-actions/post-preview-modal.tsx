'use client'

import { useState } from 'react'
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
  Copy
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
import type { SocialPost } from '../../../../prisma/generated/client'

interface PostPreviewModalProps {
  post: SocialPost
  open: boolean
  onClose: () => void
}

export function PostPreviewModal({ post, open, onClose }: PostPreviewModalProps) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const { publishNow, deletePost, duplicatePost } = usePostActions(post.projectId)

  const handlePublishNow = async () => {
    try {
      await publishNow.mutateAsync(post.id)
      toast.success('Post publicado com sucesso!')
      onClose()
    } catch (error) {
      toast.error('Erro ao publicar post')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja deletar este post?')) return

    try {
      await deletePost.mutateAsync(post.id)
      toast.success('Post deletado')
      onClose()
    } catch (error) {
      toast.error('Erro ao deletar post')
    }
  }

  const handleDuplicate = async () => {
    try {
      await duplicatePost.mutateAsync(post.id)
      toast.success('Post duplicado com sucesso!')
      onClose()
    } catch (error) {
      toast.error('Erro ao duplicar post')
    }
  }

  const scheduledTime = post.scheduledDatetime
    ? new Date(post.scheduledDatetime)
    : new Date()

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
        <DialogContent className="max-w-md">
          <VisuallyHidden>
            <DialogTitle>Preview do Post</DialogTitle>
          </VisuallyHidden>

          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {scheduledTime.toLocaleDateString('pt-BR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
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
          {post.mediaUrls && post.mediaUrls.length > 0 && post.mediaUrls[0] && (
            <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              <img
                src={post.mediaUrls[0]}
                alt="Post preview"
                className="w-full h-full object-cover"
              />

              {/* Badge de carrossel */}
              {post.postType === 'CAROUSEL' && post.mediaUrls.length > 1 && (
                <Badge className="absolute top-2 right-2">
                  1/{post.mediaUrls.length}
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
              onClick={onClose}
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
