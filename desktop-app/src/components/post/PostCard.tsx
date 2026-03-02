import { Image as ImageIcon, Film, LayoutGrid, MoreVertical, Trash2, Edit } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { cn, formatDateTime } from '@/lib/utils'
import {
  PostType,
  POST_TYPE_LABELS,
  PostStatus,
  POST_STATUS_LABELS,
  POST_STATUS_COLORS,
  POST_TYPE_DIMENSIONS,
} from '@/lib/constants'
import { useProjectStore } from '@/stores/project.store'
import { useDeletePost } from '@/hooks/use-posts'

interface PostCardProps {
  post: {
    id: string
    postType: string
    caption: string
    mediaUrls: string[]
    status: string
    scheduledDatetime: string | null
    createdAt: string
  }
}

export default function PostCard({ post }: PostCardProps) {
  const { currentProject } = useProjectStore()
  const deletePost = useDeletePost(currentProject?.id)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir este post?')) return

    try {
      await deletePost.mutateAsync(post.id)
      toast.success('Post excluído com sucesso')
    } catch (error) {
      toast.error('Erro ao excluir post')
    }
    setShowMenu(false)
  }

  const PostTypeIcon = {
    POST: ImageIcon,
    STORY: Film,
    REEL: Film,
    CAROUSEL: LayoutGrid,
  }[post.postType] || ImageIcon

  // Calculate aspect ratio based on post type
  const getAspectRatio = (postType: string) => {
    const dims = POST_TYPE_DIMENSIONS[postType as PostType]
    if (!dims) return 'aspect-[4/5]'
    // Return Tailwind aspect ratio class
    if (dims.width === 1080 && dims.height === 1920) return 'aspect-[9/16]'
    return 'aspect-[4/5]'
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card">
      {/* Image */}
      <div className={cn('relative overflow-hidden bg-input', getAspectRatio(post.postType))}>
        {post.mediaUrls[0] ? (
          <img
            src={post.mediaUrls[0]}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon size={32} className="text-text-subtle" />
          </div>
        )}

        {/* Image count badge for carousel */}
        {post.postType === 'CAROUSEL' && post.mediaUrls.length > 1 && (
          <div className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
            1/{post.mediaUrls.length}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <Link
            to={`/edit-post/${post.id}`}
            className="rounded-lg bg-white/20 p-2 text-white backdrop-blur hover:bg-white/30"
          >
            <Edit size={20} />
          </Link>
          <button
            onClick={handleDelete}
            className="rounded-lg bg-error/20 p-2 text-white backdrop-blur hover:bg-error/30"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Type and Status badges */}
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-card px-1.5 py-0.5 text-xs text-text-muted">
            <PostTypeIcon size={12} />
            {POST_TYPE_LABELS[post.postType as PostType]}
          </span>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs text-white',
              POST_STATUS_COLORS[post.status as PostStatus]
            )}
          >
            {POST_STATUS_LABELS[post.status as PostStatus]}
          </span>
        </div>

        {/* Date */}
        <p className="text-xs text-text-subtle mt-1">
          {post.scheduledDatetime
            ? `Agendado: ${formatDateTime(post.scheduledDatetime)}`
            : `Criado: ${formatDateTime(post.createdAt)}`}
        </p>
      </div>

      {/* Menu button */}
      <div ref={menuRef} className="absolute right-2 top-2">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="rounded bg-black/50 p-1 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          <MoreVertical size={16} />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-border bg-card py-1 shadow-xl">
            <Link
              to={`/edit-post/${post.id}`}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-input"
            >
              <Edit size={14} />
              Editar
            </Link>
            <button
              onClick={handleDelete}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-error hover:bg-input"
            >
              <Trash2 size={14} />
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
