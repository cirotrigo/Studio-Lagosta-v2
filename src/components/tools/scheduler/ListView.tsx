"use client"

import * as React from 'react'
import { useSocialPosts } from '@/hooks/use-social-posts'
import { PostCard } from '@/components/tools/scheduler/PostCard'
import { cn } from '@/lib/utils'
import { CalendarPlus, Loader2 } from 'lucide-react'
import Link from 'next/link'

const STATUS_FILTERS = [
  { key: 'ALL', label: 'Todos' },
  { key: 'DRAFT', label: 'Rascunho' },
  { key: 'SCHEDULED', label: 'Agendado' },
  { key: 'POSTED', label: 'Publicado' },
  { key: 'FAILED', label: 'Falhou' },
]

interface ListViewProps {
  projectId: number
}

export function ListView({ projectId }: ListViewProps) {
  const { posts, isLoading, deletePost } = useSocialPosts(projectId)
  const [statusFilter, setStatusFilter] = React.useState('ALL')

  const filteredPosts = React.useMemo(() => {
    if (!Array.isArray(posts)) return []
    const sorted = [...posts].sort((a: any, b: any) => {
      const dateA = a.scheduledDatetime || a.createdAt
      const dateB = b.scheduledDatetime || b.createdAt
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })
    if (statusFilter === 'ALL') return sorted
    return sorted.filter((p: any) => p.status === statusFilter)
  }, [posts, statusFilter])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200',
              statusFilter === f.key
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-[#1a1a1a] text-[#71717A] border border-[#27272A] hover:text-[#A1A1AA] hover:border-[#3f3f46]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Posts grid */}
      {filteredPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <CalendarPlus className="h-10 w-10 text-[#27272A]" />
          <p className="text-sm text-[#71717A]">Nenhum post encontrado</p>
          <Link
            href="/tools/scheduler/new"
            className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-400 transition-colors duration-200"
          >
            Criar primeiro post
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPosts.map((post: any) => (
            <PostCard
              key={post.id}
              post={post}
              onDelete={(id) => deletePost.mutate(id)}
              isDeleting={deletePost.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}
