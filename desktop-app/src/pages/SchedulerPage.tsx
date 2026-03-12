import { useState } from 'react'
import { Plus, Calendar, List, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useProjectStore } from '@/stores/project.store'
import { usePosts } from '@/hooks/use-posts'
import { cn, getProjectLogo } from '@/lib/utils'
import PostCard from '@/components/post/PostCard'
import CalendarView from '@/components/post/CalendarView'

type ViewMode = 'list' | 'calendar'

export default function SchedulerPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const { currentProject } = useProjectStore()
  const { data: posts, isLoading, refetch, isRefetching } = usePosts(currentProject?.id)

  // No project selected
  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Calendar size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-text">Selecione um projeto</h2>
          <p className="mt-2 text-text-muted">
            Escolha um projeto na barra lateral para ver seus posts agendados
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-3">
          {/* Project Logo */}
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
            {getProjectLogo(currentProject) ? (
              <img
                src={getProjectLogo(currentProject)!}
                alt={currentProject.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary font-semibold text-lg">
                {currentProject.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text">Agendador</h1>
            <p className="text-sm text-text-muted">
              Gerencie os posts de {currentProject.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border bg-input p-1">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm',
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-muted hover:text-text'
              )}
            >
              <List size={16} />
              Lista
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm',
                viewMode === 'calendar'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-muted hover:text-text'
              )}
            >
              <Calendar size={16} />
              Calendário
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className={cn(
              'flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2 text-sm',
              'text-text-muted hover:text-text',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <RefreshCw size={16} className={isRefetching ? 'animate-spin' : ''} />
          </button>

          {/* New post button */}
          <Link
            to="/new-post"
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary-hover',
              'transition-all duration-200'
            )}
          >
            <Plus size={20} />
            Novo Post
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-text-muted">Carregando posts...</p>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          <ListView posts={posts || []} />
        ) : (
          <CalendarView posts={posts || []} />
        )}
      </div>
    </div>
  )
}

interface ListViewProps {
  posts: Array<{
    id: string
    postType: string
    caption: string
    mediaUrls: string[]
    status: string
    scheduledDatetime: string | null
    createdAt: string
  }>
}

function ListView({ posts }: ListViewProps) {
  if (posts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-card">
            <Calendar size={32} className="text-text-muted" />
          </div>
          <h3 className="text-lg font-medium text-text">Nenhum post encontrado</h3>
          <p className="mt-2 text-text-muted">
            Crie seu primeiro post clicando no botão "Novo Post"
          </p>
          <Link
            to="/new-post"
            className={cn(
              'mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary-hover',
              'transition-all duration-200'
            )}
          >
            <Plus size={20} />
            Criar Post
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
