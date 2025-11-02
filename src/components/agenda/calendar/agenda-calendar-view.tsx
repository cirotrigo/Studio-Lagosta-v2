'use client'

import { useMemo, useState } from 'react'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { useNextScheduledPost } from '@/hooks/use-next-scheduled-post'
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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

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

  // Buscar próximo post agendado
  const { data: nextScheduledData } = useNextScheduledPost(selectedProjectId)
  const nextScheduledDate = nextScheduledData?.nextDate ? new Date(nextScheduledData.nextDate) : null

  // Verificar se o próximo post está fora do range visível
  const isNextScheduledOutOfRange = nextScheduledDate && (
    nextScheduledDate < startDate || nextScheduledDate > endDate
  )

  const handleGoToNextScheduled = () => {
    if (nextScheduledDate) {
      setSelectedDate(nextScheduledDate)
    }
  }

  const handleEditPost = (post: SocialPost) => {
    setEditingPost(post)
    setIsComposerOpen(true)
  }

  const handleCloseComposer = () => {
    setIsComposerOpen(false)
    setEditingPost(null)
  }

  // Convert SocialPost to PostFormData format for editing
  const getInitialData = (): Partial<PostFormData> | undefined => {
    if (!editingPost) return undefined

    const recurringConfig = parseRecurringConfig(editingPost.recurringConfig)
    const scheduledDate =
      editingPost.scheduledDatetime ? new Date(editingPost.scheduledDatetime) : undefined

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
  }

  const postsList = (posts as SocialPost[]) || []

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar de Canais - APENAS DESKTOP */}
      {!isMobile && (
        <ChannelsSidebar
          projects={projectList}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
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
              posts={postsList}
              onPostClick={setSelectedPost}
              onEditPost={handleEditPost}
              isLoading={isLoading}
            />
          ) : (
            /* DESKTOP: Grid/Week/Day existentes */
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
