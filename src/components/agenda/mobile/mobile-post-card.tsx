'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, Edit, RefreshCw, Video, Layers, MoreHorizontal, Trash2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { formatPostTime } from '../calendar/calendar-utils'
import { usePostActions } from '@/hooks/use-post-actions'
import { toast } from 'sonner'
import type { SocialPost } from '../../../../prisma/generated/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface MobilePostCardProps {
  post: SocialPost
  onPreview: () => void
  onEdit: () => void
}

export function MobilePostCard({ post, onPreview, onEdit }: MobilePostCardProps) {
  const time = formatPostTime(post)
  const { deletePost, duplicatePost } = usePostActions(post.projectId)

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir este post?')) return

    try {
      await deletePost.mutateAsync(post.id)
      toast.success('Post excluído com sucesso!')
    } catch (_error) {
      toast.error('Erro ao excluir post')
    }
  }

  const handleDuplicate = async () => {
    try {
      await duplicatePost.mutateAsync(post.id)
      toast.success('Post duplicado com sucesso!')
    } catch (_error) {
      toast.error('Erro ao duplicar post')
    }
  }

  const getStatusColor = () => {
    switch (post.status) {
      case 'SCHEDULED':
        return 'border-primary/40 bg-primary/5'
      case 'PROCESSING':
        return 'border-yellow-500/40 bg-yellow-500/5'
      case 'SENT':
        return 'border-green-500/40 bg-green-500/5'
      case 'FAILED':
        return 'border-red-500/40 bg-red-500/5'
      default:
        return 'border-border bg-card'
    }
  }

  const getTypeIcon = () => {
    switch (post.postType) {
      case 'REEL':
        return <Video className="w-4 h-4" />
      case 'CAROUSEL':
        return <Layers className="w-4 h-4" />
      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'border rounded-lg p-3 transition-all',
        getStatusColor()
      )}
    >
      {/* Header do card */}
      <div className="flex items-start gap-3 mb-2">
        {/* Thumbnail */}
        {post.mediaUrls && post.mediaUrls.length > 0 && post.mediaUrls[0] && (
          <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-muted">
            <Image
              src={post.mediaUrls[0]}
              alt={post.caption || 'Prévia do post'}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />

            {/* Badge de carrossel */}
            {post.postType === 'CAROUSEL' && post.mediaUrls.length > 1 && (
              <Badge className="absolute bottom-1 right-1 text-[10px] px-1 py-0 h-auto">
                {post.mediaUrls.length}
              </Badge>
            )}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              <span className="mr-1">🌸</span> {time}
            </Badge>

            {post.postType === 'STORY' && (
              <Badge className="text-xs">Story</Badge>
            )}

            {getTypeIcon()}

            {post.isRecurring && (
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            )}
          </div>

          {/* Caption preview */}
          {post.caption && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {post.caption}
            </p>
          )}
        </div>

        {/* Menu dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onPreview}>
              <Eye className="w-4 h-4 mr-2" />
              Ver detalhes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} disabled={post.status === 'SENT'}>
              <Edit className="w-4 h-4 mr-2" />
              Editar post
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDuplicate}>
              <Copy className="w-4 h-4 mr-2" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-red-600 focus:text-red-600"
              disabled={deletePost.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Ações rápidas */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onPreview}
        >
          <Eye className="w-4 h-4 mr-2" />
          Preview
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onEdit}
        >
          <Edit className="w-4 h-4 mr-2" />
          Editar
        </Button>
      </div>
    </div>
  )
}
