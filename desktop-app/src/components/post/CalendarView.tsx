import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  addWeeks,
  subWeeks,
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

interface DuplicateModalProps {
  post: Post | null
  targetDate: string | null
  onConfirm: () => void
  onCancel: () => void
}

// Modal component for duplicating posts
function DuplicateModal({ post, targetDate, onConfirm, onCancel }: DuplicateModalProps) {
  if (!post || !targetDate) return null

  const formattedDate = format(new Date(targetDate), 'dd/MM/yyyy')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Copy size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text">Duplicar Publicação?</h3>
            <p className="text-sm text-text-muted">
              Este post já foi publicado
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-lg bg-input p-4">
          <div className="flex items-center gap-3">
            {post.mediaUrls[0] && (
              <img
                src={post.mediaUrls[0]}
                alt=""
                className="h-12 w-12 rounded object-cover"
              />
            )}
            <div>
              <p className="text-sm font-medium text-text">
                {POST_TYPE_LABELS[post.postType as PostType]}
              </p>
              <p className="text-xs text-text-muted">
                Novo agendamento: {formattedDate}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border bg-input px-4 py-2 text-sm font-medium text-text hover:bg-input/80"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Duplicar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CalendarView({ posts }: CalendarViewProps) {
  const navigate = useNavigate()
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [duplicateModal, setDuplicateModal] = useState<{ post: Post; targetDate: string } | null>(null)
  const { currentProject } = useProjectStore()
  const updatePost = useUpdatePost(currentProject?.id, draggedItem?.postId || '')
  const createPost = useCreatePost(currentProject?.id)

  // Check if post can be moved (not posted)
  const canMovePost = (post: Post): boolean => {
    return post.status !== POST_STATUS.POSTED
  }

  const handleDragStart = useCallback((e: React.DragEvent, postId: string, currentDate: string) => {
    setDraggedItem({ postId, currentDate })
    e.dataTransfer.effectAllowed = 'move'
    // Set ghost image transparency
    const target = e.currentTarget as HTMLElement
    if (target) {
      e.dataTransfer.setDragImage(target, 20, 20)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, dateKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverDate !== dateKey) {
      setDragOverDate(dateKey)
    }
  }, [dragOverDate])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOverDate(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, dateKey: string) => {
    e.preventDefault()
    setDragOverDate(null)

    if (!draggedItem || !currentProject) return
    if (draggedItem.currentDate === dateKey) {
      setDraggedItem(null)
      return
    }

    const post = posts.find(p => p.id === draggedItem.postId)
    if (!post) {
      setDraggedItem(null)
      return
    }

    // Check if post is already published
    if (post.status === POST_STATUS.POSTED) {
      setDuplicateModal({ post, targetDate: dateKey })
      setDraggedItem(null)
      return
    }

    // Parse the new date and keep the original time
    const newDate = new Date(dateKey)
    
    if (post.scheduledDatetime) {
      const originalDate = new Date(post.scheduledDatetime)
      newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0)
    } else {
      // Default to noon if no previous time
      newDate.setHours(12, 0, 0, 0)
    }

    try {
      await updatePost.mutateAsync({
        scheduledDatetime: newDate.toISOString()
      })
      toast.success('Data do post atualizada')
    } catch (error) {
      toast.error('Erro ao atualizar data')
    }
    setDraggedItem(null)
  }, [draggedItem, currentProject, posts, updatePost])

  const handleDuplicateConfirm = async () => {
    if (!duplicateModal || !currentProject) return

    const { post, targetDate } = duplicateModal
    const newDate = new Date(targetDate)
    
    if (post.scheduledDatetime) {
      const originalDate = new Date(post.scheduledDatetime)
      newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0)
    } else {
      newDate.setHours(12, 0, 0, 0)
    }

    try {
      await createPost.mutateAsync({
        postType: post.postType,
        caption: post.caption,
        mediaUrls: post.mediaUrls,
        scheduleType: 'SCHEDULED',
        scheduledDatetime: newDate.toISOString()
      })
      toast.success('Post duplicado com sucesso')
    } catch (error) {
      toast.error('Erro ao duplicar post')
    }
    setDuplicateModal(null)
  }

  const handlePostDoubleClick = (post: Post) => {
    // Don't allow editing posted posts
    if (post.status === POST_STATUS.POSTED) {
      toast.info('Este post já foi publicado e não pode ser editado')
      return
    }
    navigate(`/edit-post/${post.id}`)
  }

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 })

  // Group posts by date
  const postsByDate = posts.reduce(
    (acc, post) => {
      const dateKey = post.scheduledDatetime
        ? format(new Date(post.scheduledDatetime), 'yyyy-MM-dd')
        : format(new Date(post.createdAt), 'yyyy-MM-dd')

      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(post)
      return acc
    },
    {} as Record<string, Post[]>
  )

  const renderDays = () => {
    const days = []
    let day = weekStart

    while (day <= weekEnd) {
      const dateKey = format(day, 'yyyy-MM-dd')
      const dayPosts = postsByDate[dateKey] || []
      const isCurrentWeek = true // Always true in week view

      days.push(
        <div
          key={dateKey}
          onDragOver={(e) => handleDragOver(e, dateKey)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, dateKey)}
          className={cn(
            'min-h-[200px] border-r border-b border-border p-3 transition-colors',
            !isCurrentWeek && 'bg-input/50',
            dragOverDate === dateKey && 'bg-primary/20 ring-2 ring-primary ring-inset'
          )}
        >
          {/* Date header removed - now shown in column header */}

          {/* Posts for this day */}
          <div className="space-y-2">
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

              return (
                <div
                  key={post.id}
                  draggable={isDraggable}
                  onDragStart={(e) => isDraggable && handleDragStart(e, post.id, dateKey)}
                  onDoubleClick={() => handlePostDoubleClick(post)}
                  className={cn(
                    'group flex items-center gap-1.5 rounded p-1 text-xs text-white',
                    'transition-all duration-200 hover:scale-105',
                    isDraggable ? 'cursor-move' : 'cursor-pointer',
                    POST_STATUS_COLORS[post.status as PostStatus]
                  )}
                  title={`${POST_TYPE_LABELS[post.postType as PostType]} - ${scheduledTime}${isDraggable ? ' (Duplo clique para editar)' : ''}`}
                >
                  {/* Thumbnail */}
                  <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-black/20">
                    {post.mediaUrls[0] ? (
                      <img
                        src={post.mediaUrls[0]}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <PostTypeIcon size={12} />
                      </div>
                    )}
                    {/* Carousel indicator */}
                    {post.postType === 'CAROUSEL' && post.mediaUrls.length > 1 && (
                      <div className="absolute bottom-0 right-0 bg-black/60 px-0.5 text-[8px]">
                        {post.mediaUrls.length}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 items-center gap-1 overflow-hidden">
                    <PostTypeIcon size={10} className="flex-shrink-0" />
                    <span className="truncate">{scheduledTime}</span>
                  </div>

                  {/* Drag handle - only show for draggable posts */}
                  {isDraggable && (
                    <GripVertical size={12} className="flex-shrink-0 opacity-50 group-hover:opacity-100" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )

      day = addDays(day, 1)
    }

    return days
  }

  // Get week range label for header
  const getWeekLabel = () => {
    const start = weekStart
    const end = weekEnd
    const sameMonth = start.getMonth() === end.getMonth()
    
    if (sameMonth) {
      return `${format(start, 'dd')} - ${format(end, 'dd')} de ${format(start, 'MMMM yyyy', { locale: ptBR })}`
    }
    return `${format(start, 'dd/MM')} - ${format(end, 'dd/MM/yyyy')}`
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-lg font-semibold text-text capitalize">
          {getWeekLabel()}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-input hover:text-text"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setCurrentWeek(new Date())}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:bg-input hover:text-text"
          >
            Hoje
          </button>
          <button
            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-input hover:text-text"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 border-b border-border">
        {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day, index) => {
          const date = addDays(weekStart, index)
          const isToday = isSameDay(date, new Date())
          return (
            <div
              key={day}
              className={cn(
                'border-r border-border p-3 text-center last:border-r-0',
                isToday && 'bg-primary/5'
              )}
            >
              <div className="text-sm font-medium text-text-muted">{day}</div>
              <div className={cn(
                'mt-1 text-lg font-semibold',
                isToday ? 'text-primary' : 'text-text'
              )}>
                {format(date, 'dd')}
              </div>
            </div>
          )
        })}
      </div>

      {/* Calendar grid */}
      <div className="grid flex-1 grid-cols-7 overflow-auto">{renderDays()}</div>

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
