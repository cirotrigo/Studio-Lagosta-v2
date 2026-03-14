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
          <h2 className="text-xl font-semibold text-white">Selecione um projeto</h2>
          <p className="mt-2 text-white/50">
            Escolha um projeto na barra lateral para ver seus posts agendados
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col font-sans text-white/90">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] p-6 bg-[#050505]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-4">
          {/* Project Logo */}
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-lg group-hover:shadow-orange-500/20 transition-all duration-300">
            {getProjectLogo(currentProject) ? (
              <img
                src={getProjectLogo(currentProject)!}
                alt={currentProject.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold text-xl">
                {currentProject.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
              Agendador
              <span className="flex h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_10px_#f97316]"></span>
            </h1>
            <p className="text-sm font-medium text-white/50 tracking-wide">
              Gerencie os posts de {currentProject.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* View toggle */}
          <div className="flex rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-sm">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold tracking-wider uppercase transition-all duration-300',
                viewMode === 'list'
                  ? 'bg-gradient-to-b from-white/20 to-white/5 text-white shadow-lg'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5'
              )}
            >
              <List size={14} />
              Lista
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold tracking-wider uppercase transition-all duration-300',
                viewMode === 'calendar'
                  ? 'bg-gradient-to-b from-white/20 to-white/5 text-white shadow-lg'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5'
              )}
            >
              <Calendar size={14} />
              Mes
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className={cn(
              'flex items-center justify-center h-9 w-9 rounded-full border border-white/10 bg-white/5',
              'text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 hover:scale-105 transition-all duration-300',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <RefreshCw size={16} className={isRefetching ? 'animate-spin' : ''} />
          </button>

          {/* New post button */}
          <Link
            to="/new-post"
            className="btn-primary group"
          >
            <Plus size={18} className="mr-1 group-hover:rotate-90 transition-transform duration-300" />
            Novo Post
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-32 bg-gradient-to-b from-transparent via-orange-500/20 to-transparent animate-beam-1 pointer-events-none"></div>
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center animate-fade-slide-in">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent mb-4 shadow-[0_0_15px_rgba(234,88,12,0.3)]" />
            <p className="text-white/50 text-sm font-medium tracking-wide uppercase">Carregando posts...</p>
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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
            <Calendar size={32} className="text-white/50" />
          </div>
          <h3 className="text-lg font-medium text-white">Nenhum post encontrado</h3>
          <p className="mt-2 text-white/50">
            Crie seu primeiro post clicando no botão "Novo Post"
          </p>
          <Link
            to="/new-post"
            className="btn-primary mt-4 inline-flex items-center gap-2"
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
