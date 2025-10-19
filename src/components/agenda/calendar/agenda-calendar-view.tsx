'use client'

import { useMemo, useState } from 'react'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { CalendarHeader } from './calendar-header'
import { CalendarGrid } from './calendar-grid'
import { CalendarWeekView } from './calendar-week-view'
import { CalendarDayView } from './calendar-day-view'
import { PostPreviewModal } from '../post-actions/post-preview-modal'
import { ChannelsSidebar } from '../channels-sidebar/channels-list'
import { PostComposer } from '@/components/posts/post-composer'
import type { SocialPost, Project, PostType } from '../../../../prisma/generated/client'

type ViewMode = 'month' | 'week' | 'day'
type ProjectWithCounts = Project & { scheduledPostCount: number }

export function AgendaCalendarView() {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null)
  const [postTypeFilter, setPostTypeFilter] = useState<PostType | 'ALL'>('ALL')

  // Fetch user projects (channels)
  const { data: projects } = useQuery<ProjectWithCounts[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/api/projects'),
  })

  // Determine date range based on view mode
  const { startDate, endDate } = useMemo(() => {
    switch (viewMode) {
      case 'week':
        return getWeekRange(selectedDate)
      case 'day':
        return getDayRange(selectedDate)
      default:
        return {
          startDate: getMonthStart(selectedDate),
          endDate: getMonthEnd(selectedDate),
        }
    }
  }, [selectedDate, viewMode])

  const projectList = projects ?? []

  const { data: posts, isLoading } = useAgendaPosts({
    projectId: selectedProjectId,
    startDate,
    endDate,
    postType: postTypeFilter,
  })

  const selectedProject = projectList.find(p => p.id === selectedProjectId)

  const handleEditPost = (post: SocialPost) => {
    setEditingPost(post)
    setIsComposerOpen(true)
  }

  const handleCloseComposer = () => {
    setIsComposerOpen(false)
    setEditingPost(null)
  }

  // Convert SocialPost to PostFormData format for editing
  const getInitialData = () => {
    if (!editingPost) return undefined

    return {
      postType: editingPost.postType,
      caption: editingPost.caption || '',
      mediaUrls: editingPost.mediaUrls || [],
      generationIds: editingPost.generationId ? [editingPost.generationId] : [],
      scheduleType: editingPost.scheduleType,
      scheduledDatetime: editingPost.scheduledDatetime ? new Date(editingPost.scheduledDatetime) : undefined,
      recurringConfig: editingPost.recurringConfig ? {
        frequency: (editingPost.recurringConfig as any).frequency,
        daysOfWeek: (editingPost.recurringConfig as any).daysOfWeek,
        time: (editingPost.recurringConfig as any).time,
        endDate: (editingPost.recurringConfig as any).endDate ? new Date((editingPost.recurringConfig as any).endDate) : undefined,
      } : undefined,
      altText: editingPost.altText || [],
      firstComment: editingPost.firstComment || '',
      publishType: editingPost.publishType || 'DIRECT',
    }
  }

  const postsList = (posts as SocialPost[]) || []
  const shouldSelectProject = !selectedProjectId

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar de Canais */}
      <ChannelsSidebar
        projects={projectList}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
      />

      {/* Área Principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <CalendarHeader
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectedProject={selectedProject}
          postTypeFilter={postTypeFilter}
          onPostTypeFilterChange={setPostTypeFilter}
          onCreatePost={() => setIsComposerOpen(true)}
        />

        {/* Calendário */}
        <div className="flex-1 overflow-auto">
          {shouldSelectProject ? (
            <div className="h-full flex items-center justify-center text-center p-8 text-muted-foreground">
              Selecione um canal na barra lateral para visualizar os agendamentos.
            </div>
          ) : (
            <>
              {viewMode === 'month' && (
                <CalendarGrid
                  posts={postsList}
                  selectedDate={selectedDate}
                  onPostClick={setSelectedPost}
                  isLoading={isLoading}
                />
              )}

              {viewMode === 'week' && (
                <CalendarWeekView
                  posts={postsList}
                  selectedDate={selectedDate}
                  onPostClick={setSelectedPost}
                  isLoading={isLoading}
                />
              )}

              {viewMode === 'day' && (
                <CalendarDayView
                  posts={postsList}
                  selectedDate={selectedDate}
                  onPostClick={setSelectedPost}
                  isLoading={isLoading}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de Preview/Ações */}
      {selectedPost && (
        <PostPreviewModal
          post={selectedPost}
          open={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          onEdit={handleEditPost}
        />
      )}

      {/* Post Composer */}
      {selectedProjectId && (
        <PostComposer
          projectId={selectedProjectId}
          open={isComposerOpen}
          onClose={handleCloseComposer}
          initialData={getInitialData()}
          postId={editingPost?.id}
        />
      )}
    </div>
  )
}

// Helper functions
function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function getWeekRange(date: Date) {
  const start = new Date(date)
  const day = start.getDay() // 0 (Sun) - 6 (Sat)
  start.setDate(start.getDate() - day)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return { startDate: start, endDate: end }
}

function getDayRange(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)

  const end = new Date(date)
  end.setHours(23, 59, 59, 999)

  return { startDate: start, endDate: end }
}
