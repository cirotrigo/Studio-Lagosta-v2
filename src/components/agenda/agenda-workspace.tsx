'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { useNextScheduledPost } from '@/hooks/use-next-scheduled-post'
import { useIsMobile } from '@/hooks/use-media-query'
import { useAgendaViewState } from '@/hooks/use-agenda-view-state'
import { CalendarHeader } from './calendar/calendar-header'
import { getRangeForView, type ViewMode } from './calendar/calendar-utils'
import { CalendarGrid } from './calendar/calendar-grid'
import { CalendarWeekView } from './calendar/calendar-week-view'
import { CalendarDayView } from './calendar/calendar-day-view'
import { PostMiniCard } from './calendar/post-mini-card'
import { AgendaGridView } from './grade/agenda-grid-view'
import type { PostComProjeto } from './grade/post-art-card'
import { DraftsBanner } from './drafts-banner'
import { postHref } from '@/lib/agenda-routes'
import type { SocialPost } from '../../../prisma/generated/client'
import type { ProjectResponse } from '@/hooks/use-project'

interface AgendaWorkspaceProps {
  /** `null` = todos os clientes (é assim que a agenda global chama). */
  projectId: number | null
  /** O cliente, quando há um. Alimenta o cabeçalho e o aviso de rascunhos. */
  project?: ProjectResponse
  /** Criar post. Quem monta decide de QUEM é o post — a global não sabe. */
  onCreatePost: (date?: Date) => void
  /** Abre a gaveta de canais. Só a agenda global tem. */
  onOpenChannels?: () => void
  /** Mostra o logo do cliente em cada card. Ligado na global. */
  showProjectOnCards?: boolean
}

/**
 * A agenda — uma só, usada pelas duas telas.
 *
 * Até 08/08/2026 existiam DUAS implementações com ~80% do mesmo código:
 * `AgendaCalendarView` (global, `/agenda`) e `ProjectAgendaView` (do cliente).
 * Elas já tinham divergido em silêncio — a semana começava na segunda numa e no
 * domingo na outra, e o mês da global não preenchia até a borda da semana, o
 * que deixava células visíveis SEMPRE vazias. Agora a diferença entre as duas
 * é só o que está nas props: a barra de canais e de quem é o post.
 *
 * O que sobra em cada casca: a global tem a lista de clientes, a contagem de
 * agendados e a gaveta do celular; a do cliente tem o redirecionamento do
 * `?postId` antigo.
 */
export function AgendaWorkspace({
  projectId,
  project,
  onCreatePost,
  onOpenChannels,
  showProjectOnCards = false,
}: AgendaWorkspaceProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [activePost, setActivePost] = useState<SocialPost | null>(null)

  const {
    viewMode,
    setViewMode,
    selectedDate,
    setSelectedDate,
    postTypeFilter,
    setPostTypeFilter,
    statusFilter,
    setStatusFilter,
    timingFilter,
    setTimingFilter,
    // GRADE é a visão padrão desde 08/08/2026: quem abre a agenda quer ver as
    // ARTES, não chips num calendário. Mês, semana e dia continuam a um clique.
  } = useAgendaViewState('grade')

  /*
    Mês e semana são ilegíveis em 375px — sete colunas não cabem. No celular
    esses dois caem na GRADE, que é a mesma tela numa largura diferente. O
    seletor do cabeçalho já esconde os botões correspondentes ali.
  */
  const viewModeEfetivo: ViewMode =
    isMobile && (viewMode === 'month' || viewMode === 'week') ? 'grade' : viewMode

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const updatePostMutation = useMutation({
    mutationFn: async ({ post, date }: { post: SocialPost; date: Date }) => {
      const newDate = new Date(date)
      if (post.scheduledDatetime) {
        const oldDate = new Date(post.scheduledDatetime)
        newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0)
      } else {
        newDate.setHours(10, 0, 0, 0)
      }

      return api.put(`/api/projects/${post.projectId}/posts/${post.id}`, {
        scheduledDatetime: newDate.toISOString(),
        scheduleType: 'SCHEDULED',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-posts'] })
      queryClient.invalidateQueries({ queryKey: ['social-posts'] })
      queryClient.invalidateQueries({ queryKey: ['scheduled-counts'] })
      toast.success('Post reagendado com sucesso')
    },
    onError: (err) => {
      console.error(err)
      toast.error('Erro ao reagendar post')
    },
  })

  const handleDragStart = (event: DragStartEvent) => {
    const post = event.active.data.current?.post as SocialPost
    if (post) setActivePost(post)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActivePost(null)

    if (!over) return

    const post = active.data.current?.post as SocialPost
    const date = over.data.current?.date as Date

    if (post && date) {
      const postDate = post.scheduledDatetime ? new Date(post.scheduledDatetime) : null
      if (postDate && postDate.toDateString() === date.toDateString()) return
      updatePostMutation.mutate({ post, date })
    }
  }

  const { startDate, endDate } = useMemo(
    () => getRangeForView(viewModeEfetivo, selectedDate),
    [viewModeEfetivo, selectedDate],
  )

  const { data: posts, isLoading } = useAgendaPosts({
    projectId,
    startDate,
    endDate,
    postType: postTypeFilter,
  })

  // Situação e prazo são filtrados aqui, não na rota
  const filteredPosts = useMemo(() => {
    if (!posts) return []

    let filtered = posts as SocialPost[]
    const now = new Date()

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(post => post.status === statusFilter)
    }

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

  const { data: nextScheduledData } = useNextScheduledPost(projectId)
  const nextScheduledDate = nextScheduledData?.nextDate
    ? new Date(nextScheduledData.nextDate)
    : null

  // Só vale oferecer o atalho quando o próximo post está FORA do que se vê.
  const proximoForaDaVista =
    nextScheduledDate && (nextScheduledDate < startDate || nextScheduledDate > endDate)

  const handleGoToNextScheduled = useCallback(() => {
    if (!nextScheduledDate) return
    setSelectedDate(nextScheduledDate)
  }, [nextScheduledDate, setSelectedDate])

  /** O post tem tela própria desde 08/08/2026 — clicar navega, não abre modal. */
  const handlePostClick = useCallback(
    (post: SocialPost) => {
      // Na global cada post pode ser de um cliente diferente: o endereço sai
      // do POST, nunca do canal selecionado.
      router.push(postHref(post.projectId, post.id))
    },
    [router],
  )

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Sem altura própria: quem monta decide, como na tela do post. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <CalendarHeader
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectedProject={project}
          onCreatePost={() => onCreatePost()}
          postTypeFilter={postTypeFilter}
          onPostTypeFilterChange={setPostTypeFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          timingFilter={timingFilter}
          onTimingFilterChange={setTimingFilter}
          onOpenChannels={onOpenChannels}
          isMobile={isMobile}
          nextScheduledDate={proximoForaDaVista ? nextScheduledDate : null}
          onGoToNextScheduled={handleGoToNextScheduled}
        />

        <DraftsBanner
          posts={(posts ?? []) as SocialPost[]}
          projectId={projectId}
          contaLabel={project?.instagramUsername || project?.name || 'do cliente'}
          filtroAtivo={statusFilter === 'DRAFT'}
          onVerRascunhos={() => setStatusFilter('DRAFT')}
        />

        <div className="min-h-0 flex-1 overflow-auto">
          {viewModeEfetivo === 'grade' && (
            <AgendaGridView
              posts={filteredPosts as PostComProjeto[]}
              isLoading={isLoading}
              onPostClick={handlePostClick}
              showProject={showProjectOnCards}
            />
          )}
          {viewModeEfetivo === 'month' && (
            <CalendarGrid
              posts={filteredPosts}
              selectedDate={selectedDate}
              onPostClick={handlePostClick}
              onAddPost={onCreatePost}
              isLoading={isLoading}
            />
          )}
          {viewModeEfetivo === 'week' && (
            <CalendarWeekView
              posts={filteredPosts}
              selectedDate={selectedDate}
              onPostClick={handlePostClick}
              isLoading={isLoading}
            />
          )}
          {viewModeEfetivo === 'day' && (
            <CalendarDayView
              posts={filteredPosts}
              selectedDate={selectedDate}
              onPostClick={handlePostClick}
              isLoading={isLoading}
            />
          )}
        </div>

        <DragOverlay>
          {activePost ? (
            <div className="w-[180px] rotate-2 cursor-grabbing opacity-80">
              <PostMiniCard post={activePost} onClick={() => { }} />
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  )
}
