import { useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Image as ImageIcon, Film, LayoutGrid, GripVertical, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Post, useUpdatePost, useCreatePost } from '@/hooks/use-posts'
import { POST_STATUS_COLORS, PostStatus, PostType, POST_TYPE_LABELS, POST_STATUS } from '@/lib/constants'
import { useProjectStore } from '@/stores/project.store'
import { toast } from 'sonner'

interface CalendarViewProps {
  posts: Post[]
}

interface DragItem {
  postId: string
  currentDate: string
}

// Story hover preview component
function StoryPreview({ post, anchorRect }: { post: Post; onClose: () => void; anchorRect: DOMRect | null }) {
  const previewUrl = post.mediaUrls[0] || (post as any).renderedImageUrl
  if (!previewUrl || !anchorRect) return null

  const previewWidth = 200
  const previewHeight = 310

  // Position: centered horizontally on anchor, clamped to viewport
  let left = anchorRect.left + anchorRect.width / 2 - previewWidth / 2
  left = Math.max(8, Math.min(left, window.innerWidth - previewWidth - 8))

  // Position: prefer above, fall below if not enough space
  const spaceAbove = anchorRect.top
  const openAbove = spaceAbove > previewHeight + 16
  const top = openAbove
    ? anchorRect.top - previewHeight - 8
    : anchorRect.bottom + 8

  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{ left, top, width: previewWidth }}
    >
      <div className="rounded-lg border border-white/10 bg-[#0c0c0c] p-1.5 shadow-2xl shadow-black/60">
        <img
          src={previewUrl}
          alt=""
          className="w-full rounded-md object-cover"
          style={{ aspectRatio: '9/16' }}
        />
        <div className="mt-1.5 px-1 pb-0.5">
          <p className="text-[10px] font-medium text-white/60 truncate">
            {post.scheduledDatetime
              ? format(new Date(post.scheduledDatetime), 'HH:mm')
              : 'Sem horario'}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Modal for duplicating posts
function DuplicateModal({ post, targetDate, onConfirm, onCancel }: {
  post: Post | null
  targetDate: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!post || !targetDate) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Copy size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text">Duplicar Publicacao?</h3>
            <p className="text-sm text-text-muted">Este post ja foi publicado</p>
          </div>
        </div>
        <div className="mb-6 rounded-lg bg-input p-4">
          <div className="flex items-center gap-3">
            {post.mediaUrls[0] && (
              <img src={post.mediaUrls[0]} alt="" className="h-12 w-12 rounded object-cover" />
            )}
            <div>
              <p className="text-sm font-medium text-text">{POST_TYPE_LABELS[post.postType as PostType]}</p>
              <p className="text-xs text-text-muted">Novo agendamento: {format(new Date(targetDate), 'dd/MM/yyyy')}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-border bg-input px-4 py-2 text-sm font-medium text-text hover:bg-input/80">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
            Duplicar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CalendarView({ posts }: CalendarViewProps) {
  const navigate = useNavigate()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [duplicateModal, setDuplicateModal] = useState<{ post: Post; targetDate: string } | null>(null)
  const [hoveredPost, setHoveredPost] = useState<{ id: string; rect: DOMRect } | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { currentProject } = useProjectStore()
  const updatePost = useUpdatePost(currentProject?.id, draggedItem?.postId || '')
  const createPost = useCreatePost(currentProject?.id)

  const canMovePost = (post: Post): boolean => post.status !== POST_STATUS.POSTED

  const handleDragStart = useCallback((e: React.DragEvent, postId: string, currentDate: string) => {
    setDraggedItem({ postId, currentDate })
    e.dataTransfer.effectAllowed = 'move'
    const target = e.currentTarget as HTMLElement
    if (target) e.dataTransfer.setDragImage(target, 20, 20)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, dateKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverDate !== dateKey) setDragOverDate(dateKey)
  }, [dragOverDate])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOverDate(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, dateKey: string) => {
    e.preventDefault()
    setDragOverDate(null)
    if (!draggedItem || !currentProject) return
    if (draggedItem.currentDate === dateKey) { setDraggedItem(null); return }

    const post = posts.find(p => p.id === draggedItem.postId)
    if (!post) { setDraggedItem(null); return }

    if (post.status === POST_STATUS.POSTED) {
      setDuplicateModal({ post, targetDate: dateKey })
      setDraggedItem(null)
      return
    }

    const newDate = new Date(dateKey)
    if (post.scheduledDatetime) {
      const orig = new Date(post.scheduledDatetime)
      newDate.setHours(orig.getHours(), orig.getMinutes(), 0, 0)
    } else {
      newDate.setHours(12, 0, 0, 0)
    }

    try {
      await updatePost.mutateAsync({ scheduledDatetime: newDate.toISOString() })
      toast.success('Data do post atualizada')
    } catch {
      toast.error('Erro ao atualizar data')
    }
    setDraggedItem(null)
  }, [draggedItem, currentProject, posts, updatePost])

  const handleDuplicateConfirm = async () => {
    if (!duplicateModal || !currentProject) return
    const { post, targetDate } = duplicateModal
    const newDate = new Date(targetDate)
    if (post.scheduledDatetime) {
      const orig = new Date(post.scheduledDatetime)
      newDate.setHours(orig.getHours(), orig.getMinutes(), 0, 0)
    } else {
      newDate.setHours(12, 0, 0, 0)
    }
    try {
      await createPost.mutateAsync({
        postType: post.postType,
        caption: post.caption,
        mediaUrls: post.mediaUrls,
        scheduleType: 'SCHEDULED',
        scheduledDatetime: newDate.toISOString(),
      })
      toast.success('Post duplicado com sucesso')
    } catch {
      toast.error('Erro ao duplicar post')
    }
    setDuplicateModal(null)
  }

  const handlePostDoubleClick = (post: Post) => {
    if (post.status === POST_STATUS.POSTED) {
      toast.info('Este post ja foi publicado e nao pode ser editado')
      return
    }
    navigate(`/edit-post/${post.id}`)
  }

  // Monthly calendar grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  // Group posts by date
  const postsByDate = posts.reduce((acc, post) => {
    const dateKey = post.scheduledDatetime
      ? format(new Date(post.scheduledDatetime), 'yyyy-MM-dd')
      : format(new Date(post.createdAt), 'yyyy-MM-dd')
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(post)
    return acc
  }, {} as Record<string, Post[]>)

  // Build calendar days
  const calendarDays: Date[] = []
  let day = calendarStart
  while (day <= calendarEnd) {
    calendarDays.push(day)
    day = addDays(day, 1)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-lg font-semibold text-text capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-input hover:text-text"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:bg-input hover:text-text"
          >
            Hoje
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-input hover:text-text"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 border-b border-border">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((dayName) => (
          <div key={dayName} className="border-r border-border p-2 text-center last:border-r-0">
            <div className="text-xs font-medium uppercase tracking-wider text-text-muted">{dayName}</div>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid flex-1 grid-cols-7 auto-rows-fr overflow-auto" style={{ overflow: 'auto clip' }}>
        {calendarDays.map((calDay) => {
          const dateKey = format(calDay, 'yyyy-MM-dd')
          const dayPosts = postsByDate[dateKey] || []
          const isCurrentMonth = isSameMonth(calDay, currentMonth)
          const isToday = isSameDay(calDay, new Date())

          return (
            <div
              key={dateKey}
              onDragOver={(e) => handleDragOver(e, dateKey)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, dateKey)}
              className={cn(
                'min-h-[100px] border-r border-b border-border p-1.5 transition-colors',
                !isCurrentMonth && 'bg-white/[0.01] opacity-40',
                isToday && 'bg-primary/5',
                dragOverDate === dateKey && 'bg-primary/20 ring-2 ring-primary ring-inset',
              )}
            >
              {/* Day number */}
              <div className={cn(
                'mb-1 text-right text-xs font-medium',
                isToday ? 'text-primary' : isCurrentMonth ? 'text-text-muted' : 'text-text-subtle',
              )}>
                {format(calDay, 'd')}
              </div>

              {/* Posts — scrollable when more than 3 */}
              <div className="space-y-1 max-h-[72px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                {dayPosts.map((post) => {
                  const PostTypeIcon = {
                    POST: ImageIcon,
                    STORY: Film,
                    REEL: Film,
                    CAROUSEL: LayoutGrid,
                  }[post.postType] || ImageIcon

                  const scheduledTime = post.scheduledDatetime
                    ? format(new Date(post.scheduledDatetime), 'HH:mm')
                    : ''

                  const isDraggable = canMovePost(post)
                  const isStory = post.postType === 'STORY' || post.postType === 'REEL'
                  const isHovered = hoveredPost?.id === post.id

                  return (
                    <div
                      key={post.id}
                      className="relative"
                      onMouseEnter={(e) => {
                        const previewUrl = post.mediaUrls[0] || (post as any).renderedImageUrl
                        if (isStory && previewUrl) {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
                          hoverTimerRef.current = setTimeout(() => {
                            setHoveredPost({ id: post.id, rect })
                          }, 500) // 500ms delay to avoid blocking drag
                        }
                      }}
                      onMouseLeave={() => {
                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
                        setHoveredPost(null)
                      }}
                    >
                      {/* Story hover preview (rendered via portal) */}
                      {isStory && isHovered && (
                        <StoryPreview
                          post={post}
                          onClose={() => setHoveredPost(null)}
                          anchorRect={hoveredPost?.rect ?? null}
                        />
                      )}

                      <div
                        draggable={isDraggable}
                        onDragStart={(e) => {
                          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
                          setHoveredPost(null)
                          isDraggable && handleDragStart(e, post.id, dateKey)
                        }}
                        onDoubleClick={() => handlePostDoubleClick(post)}
                        className={cn(
                          'group flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-white',
                          'transition-all duration-200 hover:scale-[1.02]',
                          isDraggable ? 'cursor-move' : 'cursor-pointer',
                          POST_STATUS_COLORS[post.status as PostStatus],
                        )}
                        title={`${POST_TYPE_LABELS[post.postType as PostType]} - ${scheduledTime}`}
                      >
                        {/* Mini thumbnail */}
                        <div className="relative h-5 w-5 flex-shrink-0 overflow-hidden rounded-sm bg-black/20">
                          {(post.mediaUrls[0] || (post as any).renderedImageUrl) ? (
                            <img src={post.mediaUrls[0] || (post as any).renderedImageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <PostTypeIcon size={8} />
                            </div>
                          )}
                        </div>

                        <PostTypeIcon size={8} className="flex-shrink-0 opacity-70" />
                        <span className="truncate">{scheduledTime}</span>

                        {isDraggable && (
                          <GripVertical size={10} className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-70" />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Duplicate Modal */}
      <DuplicateModal
        post={duplicateModal?.post || null}
        targetDate={duplicateModal?.targetDate || null}
        onConfirm={handleDuplicateConfirm}
        onCancel={() => setDuplicateModal(null)}
      />
    </div>
  )
}
