'use client'

import { useMemo, useState } from 'react'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { useNextScheduledPost } from '@/hooks/use-next-scheduled-post'
import { CalendarHeader } from '@/components/agenda/calendar/calendar-header'
import { CalendarGrid } from '@/components/agenda/calendar/calendar-grid'
import { CalendarWeekView } from '@/components/agenda/calendar/calendar-week-view'
import { CalendarDayView } from '@/components/agenda/calendar/calendar-day-view'
import { PostPreviewModal } from '@/components/agenda/post-actions/post-preview-modal'
import { PostComposer, type PostFormData } from '@/components/posts/post-composer'
import type { SocialPost, Project, PostType } from '../../../prisma/generated/client'

type ViewMode = 'month' | 'week' | 'day'
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

function getMonthStart(date: Date) {
  const start = new Date(date)
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  const day = start.getDay()
  const diff = day === 0 ? 6 : day - 1
  start.setDate(start.getDate() - diff)
  return start
}

function getMonthEnd(date: Date) {
  const end = new Date(date)
  end.setMonth(end.getMonth() + 1, 0)
  end.setHours(23, 59, 59, 999)
  const day = end.getDay()
  const diff = day === 0 ? 0 : 7 - day
  end.setDate(end.getDate() + diff)
  return end
}

function getWeekRange(date: Date) {
  const start = new Date(date)
  const day = start.getDay()
  const diff = day === 0 ? 6 : day - 1
  start.setDate(start.getDate() - diff)
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

interface ProjectAgendaViewProps {
  project: Project
  projectId: number
}

export function ProjectAgendaView({ project, projectId }: ProjectAgendaViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null)
  const [postTypeFilter, setPostTypeFilter] = useState<PostType | 'ALL'>('ALL')

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

  const { data: posts, isLoading } = useAgendaPosts({
    projectId,
    startDate,
    endDate,
    postType: postTypeFilter,
  })

  const { data: nextScheduledData } = useNextScheduledPost(projectId)
  const nextScheduledDate = nextScheduledData?.nextDate ? new Date(nextScheduledData.nextDate) : null

  const handleGoToNextScheduled = () => {
    if (nextScheduledDate) {
      setSelectedDate(nextScheduledDate)
      if (viewMode === 'month') {
        setViewMode('day')
      }
    }
  }

  const handlePostClick = (post: SocialPost) => {
    setSelectedPost(post)
  }

  const handleEditPost = (post: SocialPost) => {
    setEditingPost(post)
    setSelectedPost(null)
    setIsComposerOpen(true)
  }

  const handleCreatePost = () => {
    setEditingPost(null)
    setIsComposerOpen(true)
  }

  const handleComposerClose = () => {
    setIsComposerOpen(false)
    setEditingPost(null)
  }

  const initialFormData: Partial<PostFormData> | undefined = editingPost
    ? {
        caption: editingPost.caption || '',
        mediaUrls: editingPost.mediaUrls as string[],
        postType: editingPost.postType,
        scheduleType: editingPost.scheduleType,
        scheduledDatetime: editingPost.scheduledDatetime || undefined,
        recurringConfig: parseRecurringConfig(editingPost.recurringConfig),
      }
    : undefined

  const postsArray = posts || []

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <CalendarHeader
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedProject={project}
        onCreatePost={handleCreatePost}
        postTypeFilter={postTypeFilter}
        onPostTypeFilterChange={setPostTypeFilter}
        nextScheduledDate={nextScheduledDate}
        onGoToNextScheduled={handleGoToNextScheduled}
      />

      <div className="flex-1 overflow-auto">
        {viewMode === 'month' && (
          <CalendarGrid
            selectedDate={selectedDate}
            posts={postsArray}
            isLoading={isLoading}
            onPostClick={handlePostClick}
          />
        )}
        {viewMode === 'week' && (
          <CalendarWeekView
            selectedDate={selectedDate}
            posts={postsArray}
            isLoading={isLoading}
            onPostClick={handlePostClick}
          />
        )}
        {viewMode === 'day' && (
          <CalendarDayView
            selectedDate={selectedDate}
            posts={postsArray}
            isLoading={isLoading}
            onPostClick={handlePostClick}
          />
        )}
      </div>

      {selectedPost && (
        <PostPreviewModal
          post={selectedPost}
          open={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          onEdit={handleEditPost}
        />
      )}

      {isComposerOpen && (
        <PostComposer
          projectId={projectId}
          postId={editingPost?.id}
          open={isComposerOpen}
          onClose={handleComposerClose}
          initialData={initialFormData}
        />
      )}
    </div>
  )
}
