'use client'

import { MobilePostCard } from './mobile-post-card'
import { ChevronDown } from 'lucide-react'
import type { SocialPost } from '../../../../prisma/generated/client'

interface MobileDayGroupProps {
  date: Date
  posts: SocialPost[]
  onPostClick: (post: SocialPost) => void
  onEditPost: (post: SocialPost) => void
}

export function MobileDayGroup({
  date,
  posts,
  onPostClick,
  onEditPost
}: MobileDayGroupProps) {
  const dayLabel = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  })

  const isToday =
    date.toDateString() === new Date().toDateString()

  return (
    <div className="space-y-3">
      {/* Header do dia */}
      <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-10">
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold capitalize">
          {dayLabel}
          {isToday && (
            <span className="ml-2 text-xs text-primary font-normal">
              • Hoje
            </span>
          )}
        </h3>
        <span className="text-sm text-muted-foreground">
          • {posts.length} {posts.length === 1 ? 'post' : 'posts'}
        </span>
      </div>

      {/* Posts do dia */}
      <div className="space-y-2">
        {posts.map((post) => (
          <MobilePostCard
            key={post.id}
            post={post}
            onPreview={() => onPostClick(post)}
            onEdit={() => onEditPost(post)}
          />
        ))}
      </div>
    </div>
  )
}
