'use client'

import { Badge } from '@/components/ui/badge'
import { Video, Layers, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { formatPostTime } from './calendar-utils'
import type { SocialPost } from '../../../../prisma/generated/client'

interface PostMiniCardProps {
  post: SocialPost
  onClick: () => void
}

export function PostMiniCard({ post, onClick }: PostMiniCardProps) {
  const time = formatPostTime(post)

  const getIcon = () => {
    switch (post.postType) {
      case 'STORY':
        return null // Story tem badge
      case 'REEL':
        return <Video className="w-3 h-3" />
      case 'CAROUSEL':
        return <Layers className="w-3 h-3" />
      default:
        return null
    }
  }

  const getStatusColor = () => {
    switch (post.status) {
      case 'SCHEDULED':
        return 'bg-primary/10 border-primary/40 hover:bg-primary/20'
      case 'PROCESSING':
        return 'bg-yellow-500/10 border-yellow-500/40 hover:bg-yellow-500/20'
      case 'SENT':
        return 'bg-green-500/10 border-green-500/40 hover:bg-green-500/20'
      case 'FAILED':
        return 'bg-red-500/10 border-red-500/40 hover:bg-red-500/20'
      default:
        return 'bg-muted/10 border-border hover:bg-muted/20'
    }
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 p-1.5 rounded border transition-all hover:scale-105 hover:shadow-md',
        getStatusColor()
      )}
    >
      {/* Thumbnail */}
      {post.mediaUrls && post.mediaUrls.length > 0 && post.mediaUrls[0] && (
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
          <Image
            src={post.mediaUrls[0]}
            alt={post.caption || 'Prévia do post'}
            fill
            sizes="40px"
            className="object-cover"
            unoptimized
          />

          {/* Badge de Story */}
          {post.postType === 'STORY' && (
            <Badge className="absolute top-0.5 left-0.5 text-[8px] px-1 py-0 h-auto leading-tight">
              Story
            </Badge>
          )}

          {/* Badge de carrossel */}
          {post.postType === 'CAROUSEL' && post.mediaUrls.length > 1 && (
            <Badge className="absolute top-0.5 right-0.5 text-[8px] px-1 py-0 h-auto leading-tight">
              {post.mediaUrls.length}
            </Badge>
          )}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            <span className="mr-0.5">🌸</span> {time}
          </Badge>
          {getIcon()}
          {post.isRecurring && <RefreshCw className="w-3 h-3 text-muted-foreground" />}
        </div>
      </div>
    </button>
  )
}
