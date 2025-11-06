'use client'

import { useMemo, useState, memo, useCallback } from 'react'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { useNextScheduledPost } from '@/hooks/use-next-scheduled-post'
import { useScheduledPostCounts } from '@/hooks/use-scheduled-counts'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useIsMobile } from '@/hooks/use-media-query'
import { CalendarHeader } from './calendar-header'
import { CalendarGrid } from './calendar-grid'
import { CalendarWeekView } from './calendar-week-view'
import { CalendarDayView } from './calendar-day-view'
import { PostPreviewModal } from '../post-actions/post-preview-modal'
import { ChannelsSidebar } from '../channels-sidebar/channels-list'
import { MobileAgendaListView } from '../mobile/mobile-agenda-list-view'
import { MobileChannelsDrawer } from '../mobile/mobile-channels-drawer'
import { PostComposer, type PostFormData } from '@/components/posts/post-composer'
import type { SocialPost, PostType } from '../../../../prisma/generated/client'
import type { ProjectResponse } from '@/hooks/use-project'

type ViewMode = 'month' | 'week' | 'day'
type ProjectWithCounts = ProjectResponse & { scheduledPostCount: number }
type RecurringFormValue = NonNullable<PostFormData['recurringConfig']>

const RECURRENCE_FREQUENCIES: ReadonlyArray<RecurringFormValue['frequency']> = ['DAILY', 'WEEKLY', 'MONTHLY']

function isRecurrenceFrequency(value: unknown): value is RecurringFormValue['frequency'] {
  return typeof value === 'string' && RECURRENCE_FREQUENCIES.includes(value as RecurringFormValue['frequency'])
}

function parseRecurringConfig(config: unknown): RecurringFormValue | undefined {
  if (!config || typeof config !== 'object') return undefined

  const raw = config as Record<string, unknown>
  const frequency = raw.frequency
  const time = raw.time

  if (!isRecurrenceFrequency(frequency) || typeof time !== 'string') {
    return undefined
  }

  const days = Array.isArray(raw.daysOfWeek)
    ? raw.daysOfWeek.filter((day): day is number => typeof day === 'number')
    : undefined
  const endDateValue = raw.endDate
  const endDate =
    typeof endDateValue === 'string' && endDateValue
      ? new Date(endDateValue)
      : undefined

  return {
    frequency,
    time,
    ...(days && days.length > 0 ? { daysOfWeek: days } : {}),
    ...(endDate ? { endDate } : {}),
  }
}

export function AgendaCalendarView() {
  const isMobile = useIsMobile()
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null)
  const [postTypeFilter, setPostTypeFilter] = useState<PostType | 'ALL'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FAILED' | 'POSTING'>('ALL')
  const [timingFilter, setTimingFilter] = useState<'ALL' | 'UPCOMING' | 'OVERDUE'>('ALL')
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true) // Sidebar colapsada por padrão

  // Fetch user projects (channels)
  const { data: projectsData } = useQuery<ProjectResponse[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/api/projects'),
  })

  // Fetch scheduled post counts separately for performance
  const { data: scheduledCounts } = useScheduledPostCounts()

  // Merge projects with scheduled counts
  const projects = useMemo<ProjectWithCounts[]>(() => {
    if (!projectsData) return []
    return projectsData.map(project => ({
      ...project,
      scheduledPostCount: scheduledCounts?.[project.id] ?? 0,
    }))
  }, [projectsData, scheduledCounts])

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

  // Apply status and timing filters client-side
  const filteredPosts = useMemo(() => {
    if (!posts) return []

    let filtered = posts as SocialPost[]
    const now = new Date()

    // Apply status filter
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(post => post.status === statusFilter)
    }

    // Apply timing filter
    if (timingFilter !== 'ALL') {
      filtered = filtered.filter(post => {
        if (!post.scheduledDatetime) return false
        const scheduledDate = new Date(post.scheduledDatetime)

        if (timingFilter === 'UPCOMING') {
          return scheduledDate > now && post.status === 'SCHEDULED'
        } else if (timingFilter === 'OVERDUE') {
          return scheduledDate < now && post.status === 'SCHEDULED'
        }
        return true
      })
    }

    return filtered
  }, [posts, statusFilter, timingFilter])

  const selectedProject = projectList.find(p => p.id === selectedProjectId)

  // Buscar próximo post agendado
  const { data: nextScheduledData } = useNextScheduledPost(selectedProjectId)
  const nextScheduledDate = nextScheduledData?.nextDate ? new Date(nextScheduledData.nextDate) : null

  // Verificar se o próximo post está fora do range visível
  const isNextScheduledOutOfRange = nextScheduledDate && (
    nextScheduledDate < startDate || nextScheduledDate > endDate
  )

  // OPTIMIZED: Memoize callbacks to prevent re-renders
  const handleGoToNextScheduled = useCallback(() => {
    if (nextScheduledDate) {
      setSelectedDate(nextScheduledDate)
    }
  }, [nextScheduledDate])

  const handleEditPost = useCallback((post: SocialPost) => {
    setEditingPost(post)
    setIsComposerOpen(true)
  }, [])

  const handleCloseComposer = useCallback(() => {
    setIsComposerOpen(false)
    setEditingPost(null)
  }, [])

  // Convert SocialPost to PostFormData format for editing
  // OPTIMIZED: Memoize to prevent recalculation on every render
  const getInitialData = useMemo((): Partial<PostFormData> | undefined => {
    if (!editingPost) return undefined

    const recurringConfig = parseRecurringConfig(editingPost.recurringConfig)

    // Ensure scheduledDatetime is a valid Date object or undefined
    let scheduledDate: Date | undefined = undefined
    if (editingPost.scheduledDatetime) {
      const tempDate = new Date(editingPost.scheduledDatetime)
      // Validate the date
      if (!isNaN(tempDate.getTime())) {
        scheduledDate = tempDate
      }
    }

    return {
      postType: editingPost.postType,
      caption: editingPost.caption || '',
      mediaUrls: editingPost.mediaUrls ?? [],
      generationIds: editingPost.generationId ? [editingPost.generationId] : [],
      scheduleType: editingPost.scheduleType,
      scheduledDatetime: scheduledDate,
      recurringConfig,
      altText: editingPost.altText ?? [],
      firstComment: editingPost.firstComment ?? '',
      publishType: (editingPost.publishType ?? 'DIRECT') as PostFormData['publishType'],
    }
  }, [editingPost])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar de Canais - APENAS DESKTOP */}
      {!isMobile && (
        <ChannelsSidebar
          projects={projectList}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
      )}

      {/* Drawer de Canais - APENAS MOBILE */}
      {isMobile && (
        <MobileChannelsDrawer
          open={mobileDrawerOpen}
          onOpenChange={setMobileDrawerOpen}
          projects={projectList}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
        />
      )}

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
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          timingFilter={timingFilter}
          onTimingFilterChange={setTimingFilter}
          onCreatePost={() => setIsComposerOpen(true)}
          onOpenChannels={isMobile ? () => setMobileDrawerOpen(true) : undefined}
          isMobile={isMobile}
          nextScheduledDate={isNextScheduledOutOfRange ? nextScheduledDate : null}
          onGoToNextScheduled={handleGoToNextScheduled}
        />

        {/* Calendário/Lista */}
        <div className="flex-1 overflow-auto">
          {/* MOBILE: Lista por dia */}
          {isMobile ? (
            <MobileAgendaListView
              posts={filteredPosts}
              onPostClick={setSelectedPost}
              onEditPost={handleEditPost}
              isLoading={isLoading}
            />
          ) : (
            /* DESKTOP: Grid/Week/Day existentes */
            <>
              {viewMode === 'month' && (
                <CalendarGrid
                  posts={filteredPosts}
                  selectedDate={selectedDate}
                  onPostClick={setSelectedPost}
                  isLoading={isLoading}
                />
              )}

              {viewMode === 'week' && (
                <CalendarWeekView
                  posts={filteredPosts}
                  selectedDate={selectedDate}
                  onPostClick={setSelectedPost}
                  isLoading={isLoading}
                />
              )}

              {viewMode === 'day' && (
                <CalendarDayView
                  posts={filteredPosts}
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
          initialData={getInitialData}
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
