'use client'

import { useMemo } from 'react'
import { MobileDayGroup } from './mobile-day-group'
import { Skeleton } from '@/components/ui/skeleton'
import { groupPostsByDay } from '../calendar/calendar-utils'
import type { SocialPost } from '../../../../prisma/generated/client'

interface MobileAgendaListViewProps {
  posts: SocialPost[]
  onPostClick: (post: SocialPost) => void
  onEditPost: (post: SocialPost) => void
  isLoading: boolean
}

export function MobileAgendaListView({
  posts,
  onPostClick,
  onEditPost,
  isLoading
}: MobileAgendaListViewProps) {
  // Agrupar posts por dia e ordenar por data
  const groupedPosts = useMemo(() => {
    return groupPostsByDay(posts)
  }, [posts])

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (groupedPosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-6xl mb-4">📅</div>
        <h3 className="text-lg font-semibold mb-2">
          Nenhum post agendado
        </h3>
        <p className="text-sm text-muted-foreground">
          Crie seu primeiro post para começar
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-4 space-y-6">
        {groupedPosts.map((group) => (
          <MobileDayGroup
            key={group.dateKey}
            date={group.date}
            posts={group.posts}
            onPostClick={onPostClick}
            onEditPost={onEditPost}
          />
        ))}
      </div>
    </div>
  )
}
