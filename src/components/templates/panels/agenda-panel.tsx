'use client'

import * as React from 'react'
import Image from 'next/image'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Image as ImageIcon, Plus, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PostPreviewModal } from '@/components/agenda/post-actions/post-preview-modal'
import { PostComposer } from '@/components/posts/post-composer'
import type { SocialPost } from '../../../../prisma/generated/client'

interface AgendaPanelProps {
  projectId: number
}

function getMonthStart(date: Date) {
  const start = new Date(date)
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  return start
}

function getMonthEnd(date: Date) {
  const end = new Date(date)
  end.setMonth(end.getMonth() + 1, 0)
  end.setHours(23, 59, 59, 999)
  return end
}

function getCalendarDays(date: Date) {
  const start = new Date(date)
  start.setDate(1)

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const firstDayOfWeek = start.getDay()

  // Adjust to make Monday the first day (0 = Monday, 6 = Sunday)
  const mondayAdjusted = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

  // Calculate calendar start (include previous month days)
  const calendarStart = new Date(start)
  calendarStart.setDate(start.getDate() - mondayAdjusted)

  // Generate 42 days (6 weeks)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const day = new Date(calendarStart)
    day.setDate(calendarStart.getDate() + i)
    days.push(day)
  }

  return days
}

export function AgendaPanel({ projectId }: AgendaPanelProps) {
  const [selectedDate, setSelectedDate] = React.useState(new Date())
  const [currentMonth, setCurrentMonth] = React.useState(new Date())
  const [selectedPost, setSelectedPost] = React.useState<SocialPost | null>(null)
  const [isComposerOpen, setIsComposerOpen] = React.useState(false)

  const startDate = React.useMemo(() => getMonthStart(currentMonth), [currentMonth])
  const endDate = React.useMemo(() => getMonthEnd(currentMonth), [currentMonth])

  const { data: posts, isLoading } = useAgendaPosts({
    projectId,
    startDate,
    endDate,
  })

  const postsArray = (posts as SocialPost[] | undefined) || []

  // Group posts by day
  const postsByDay = React.useMemo(() => {
    const grouped = new Map<string, SocialPost[]>()

    postsArray.forEach(post => {
      if (post.scheduledDatetime) {
        const date = new Date(post.scheduledDatetime)
        const key = date.toDateString()

        if (!grouped.has(key)) {
          grouped.set(key, [])
        }
        grouped.get(key)?.push(post)
      }
    })

    return grouped
  }, [postsArray])

  const calendarDays = React.useMemo(() => getCalendarDays(currentMonth), [currentMonth])

  const handlePreviousMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(prev.getMonth() - 1)
      return newDate
    })
  }

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(prev.getMonth() + 1)
      return newDate
    })
  }

  const handleToday = () => {
    setCurrentMonth(new Date())
    setSelectedDate(new Date())
  }

  const monthName = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col h-full">
      {/* Compact Header */}
      <div className="flex-shrink-0 p-3 border-b border-border/40">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold capitalize">{monthName}</h3>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handlePreviousMonth}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px]"
              onClick={handleToday}
            >
              Hoje
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleNextMonth}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Week days header */}
        <div className="grid grid-cols-7 gap-0.5">
          {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, i) => (
            <div
              key={i}
              className="text-center text-[9px] font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Compact Calendar Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="text-[10px] text-muted-foreground">Carregando...</div>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-0.5 mt-1">
            {calendarDays.map((day, index) => {
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
              const isToday = day.toDateString() === new Date().toDateString()
              const dayPosts = postsByDay.get(day.toDateString()) || []
              const hasPost = dayPosts.length > 0
              const isSelected = day.toDateString() === selectedDate.toDateString()

              return (
                <button
                  key={index}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'h-7 rounded flex flex-col items-center justify-center text-[10px] transition-all',
                    'hover:bg-accent/50',
                    isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/30',
                    isToday && 'font-bold text-primary',
                    isSelected && 'bg-accent ring-1 ring-primary/20',
                    hasPost && 'relative'
                  )}
                >
                  <span>{day.getDate()}</span>
                  {hasPost && (
                    <div className="absolute bottom-0.5 flex gap-0.5">
                      {dayPosts.slice(0, 3).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            'h-0.5 w-0.5 rounded-full',
                            isSelected ? 'bg-primary' : 'bg-primary/60'
                          )}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected Day Posts - Expanded Area */}
      <div className="flex-1 border-t border-border/40 overflow-y-auto">
        {selectedDate && (
          <div className="p-3">
            <div className="text-xs font-semibold mb-3 text-muted-foreground">
              {selectedDate.toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'long'
              })}
            </div>
            {(() => {
              const dayPosts = postsByDay.get(selectedDate.toDateString()) || []

              if (dayPosts.length === 0) {
                return (
                  <div className="text-xs text-muted-foreground py-8 text-center">
                    Nenhum post agendado
                  </div>
                )
              }

              return (
                <div className="space-y-2">
                  {dayPosts.map(post => {
                    const mediaUrls = post.mediaUrls as string[] | null
                    const firstMedia = mediaUrls?.[0]
                    const isCarousel = mediaUrls && mediaUrls.length > 1

                    // Determinar tipo de post
                    let postTypeLabel = 'POST'
                    if (post.postType === 'STORY') {
                      postTypeLabel = 'STORY'
                    } else if (post.postType === 'REEL') {
                      postTypeLabel = 'REELS'
                    } else if (post.postType === 'CAROUSEL') {
                      postTypeLabel = 'CARROSSEL'
                    }

                    return (
                      <button
                        key={post.id}
                        onClick={() => setSelectedPost(post)}
                        className="w-full p-2 rounded-lg bg-accent/30 hover:bg-accent/60 border border-border/40 transition-all text-left group"
                      >
                        <div className="flex items-center gap-2">
                          {/* Thumbnail */}
                          <div className="flex-shrink-0 w-14 h-14 rounded-md overflow-hidden bg-muted relative">
                            {firstMedia ? (
                              <Image
                                src={firstMedia}
                                alt="Post preview"
                                fill
                                className="object-cover"
                                sizes="56px"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                              </div>
                            )}
                            {/* Carousel indicator */}
                            {isCarousel && (
                              <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-medium text-white">
                                {mediaUrls.length}
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            {/* Dia da semana e horário em destaque */}
                            <div className="text-sm font-bold group-hover:text-primary transition-colors">
                              {post.scheduledDatetime && (() => {
                                const date = new Date(post.scheduledDatetime)
                                const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'long' })
                                const time = date.toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                                // Capitalizar primeira letra do dia
                                const capitalizedDay = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)
                                return `${capitalizedDay} às ${time}`
                              })()}
                            </div>

                            {/* Tipo de post e Status */}
                            <div className="mt-1 flex items-center gap-1.5">
                              {/* Badge de tipo */}
                              <span className={cn(
                                'inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide',
                                post.postType === 'STORY' && 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
                                post.postType === 'REEL' && 'bg-pink-500/20 text-pink-600 dark:text-pink-400',
                                post.postType === 'CAROUSEL' && 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
                                post.postType === 'POST' && 'bg-green-500/20 text-green-600 dark:text-green-400'
                              )}>
                                {postTypeLabel}
                              </span>

                              {/* Status indicator */}
                              {post.status === 'SCHEDULED' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-600 dark:text-orange-400">
                                  <Clock className="h-2.5 w-2.5" />
                                  <span className="text-[9px] font-semibold uppercase">Programado</span>
                                </span>
                              )}
                              {post.status === 'SENT' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  <span className="text-[9px] font-semibold uppercase">Postado</span>
                                </span>
                              )}
                              {post.status === 'FAILED' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 dark:text-red-400">
                                  <XCircle className="h-2.5 w-2.5" />
                                  <span className="text-[9px] font-semibold uppercase">Falhou</span>
                                </span>
                              )}
                              {post.status === 'PROCESSING' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">
                                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  <span className="text-[9px] font-semibold uppercase">Processando</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* Fixed Footer - New Post Button */}
      <div className="flex-shrink-0 border-t border-border/40 p-3 bg-card">
        <Button
          onClick={() => setIsComposerOpen(true)}
          className="w-full h-9 text-xs font-medium"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Agendamento
        </Button>
      </div>

      {/* Post Preview Modal */}
      {selectedPost && (
        <PostPreviewModal
          post={selectedPost}
          open={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          onEdit={() => {
            // Edit functionality can be added here if needed
            setSelectedPost(null)
          }}
        />
      )}

      {/* Post Composer Modal */}
      {isComposerOpen && (
        <PostComposer
          projectId={projectId}
          open={isComposerOpen}
          onClose={() => setIsComposerOpen(false)}
        />
      )}
    </div>
  )
}
