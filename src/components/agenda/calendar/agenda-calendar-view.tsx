'use client'

import { useState } from 'react'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { CalendarHeader } from './calendar-header'
import { CalendarGrid } from './calendar-grid'
import { PostPreviewModal } from '../post-actions/post-preview-modal'
import { ChannelsSidebar } from '../channels-sidebar/channels-list'
import { PostComposer } from '@/components/posts/post-composer'
import type { SocialPost, Project } from '../../../../prisma/generated/client'

type ViewMode = 'month' | 'week' | 'day'

export function AgendaCalendarView() {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)

  // Fetch user projects (channels)
  const { data: projects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/api/projects'),
  })

  // Fetch posts for calendar
  const startDate = getMonthStart(selectedDate)
  const endDate = getMonthEnd(selectedDate)

  const { data: posts, isLoading } = useAgendaPosts({
    projectId: selectedProjectId,
    startDate,
    endDate,
  })

  const selectedProject = projects?.find(p => p.id === selectedProjectId)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar de Canais */}
      <ChannelsSidebar
        projects={projects || []}
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
          onCreatePost={() => setIsComposerOpen(true)}
        />

        {/* Calendário */}
        <div className="flex-1 overflow-auto">
          {viewMode === 'month' && (
            <CalendarGrid
              posts={(posts as SocialPost[]) || []}
              selectedDate={selectedDate}
              onPostClick={setSelectedPost}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>

      {/* Modal de Preview/Ações */}
      {selectedPost && (
        <PostPreviewModal
          post={selectedPost}
          open={!!selectedPost}
          onClose={() => setSelectedPost(null)}
        />
      )}

      {/* Post Composer */}
      {selectedProjectId && (
        <PostComposer
          projectId={selectedProjectId}
          open={isComposerOpen}
          onClose={() => setIsComposerOpen(false)}
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
