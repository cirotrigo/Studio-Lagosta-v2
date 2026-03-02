"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useToolsProject } from '@/contexts/ProjectContext'
import { useSocialPosts } from '@/hooks/use-social-posts'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import { ImageUploader, type ProcessedImage } from '@/components/tools/scheduler/ImageUploader'
import { ImagePreview } from '@/components/tools/scheduler/ImagePreview'
import { CaptionEditor } from '@/components/tools/scheduler/CaptionEditor'
import { ScheduleConfirmModal } from '@/components/tools/scheduler/ScheduleConfirmModal'
import { ProjectBadge } from '@/components/tools/ProjectBadge'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Image as ImageIcon,
  Smartphone,
  Film,
  Layers,
  CalendarClock,
  Zap,
  Loader2,
  FolderOpen,
} from 'lucide-react'
import Link from 'next/link'

const POST_TYPES = [
  { key: 'POST', label: 'Feed', icon: ImageIcon, desc: '1080×1350' },
  { key: 'STORY', label: 'Story', icon: Smartphone, desc: '1080×1920' },
  { key: 'CAROUSEL', label: 'Carrossel', icon: Layers, desc: 'Múltiplas' },
  { key: 'REEL', label: 'Reel', icon: Film, desc: '1080×1920' },
]

const SCHEDULE_TYPES = [
  { key: 'IMMEDIATE', label: 'Publicar agora', icon: Zap },
  { key: 'SCHEDULED', label: 'Agendar', icon: CalendarClock },
]

interface PostFormProps {
  mode: 'create' | 'edit'
  post?: any
  defaultDate?: string | null
}

export function PostForm({ mode, post, defaultDate }: PostFormProps) {
  const router = useRouter()
  const { currentProject } = useToolsProject()
  const { upload: uploadBlob } = useBlobUpload()

  const projectId = currentProject?.id ?? 0
  const socialPosts = useSocialPosts(projectId)
  const createPost = currentProject ? socialPosts.createPost : null
  const updatePost = currentProject ? socialPosts.updatePost : null

  // Form state
  const [postType, setPostType] = React.useState(post?.postType || 'POST')
  const [images, setImages] = React.useState<ProcessedImage[]>([])
  const [caption, setCaption] = React.useState(post?.caption || '')
  const [scheduleType, setScheduleType] = React.useState(post?.scheduleType || 'SCHEDULED')
  const [scheduledDate, setScheduledDate] = React.useState(() => {
    if (post?.scheduledDatetime) return format(new Date(post.scheduledDatetime), "yyyy-MM-dd'T'HH:mm")
    if (defaultDate) return `${defaultDate}T12:00`
    return ''
  })

  // UI state
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // No project guard
  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
          <FolderOpen className="h-8 w-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-semibold text-[#FAFAFA]">Selecione um projeto</h2>
        <p className="text-sm text-[#71717A] text-center max-w-md">
          Escolha um projeto na barra lateral antes de criar um post.
        </p>
      </div>
    )
  }

  const handleSaveDraft = async () => {
    if (!createPost && !updatePost) return
    setIsSubmitting(true)
    setError(null)

    try {
      const mediaUrls = await uploadImages()

      if (mode === 'edit' && post?.id && updatePost) {
        await updatePost.mutateAsync({
          postId: post.id,
          data: {
            postType,
            caption,
            mediaUrls,
            scheduleType: 'IMMEDIATE',
          },
        })
      } else if (createPost) {
        await createPost.mutateAsync({
          postType,
          caption,
          mediaUrls,
          generationIds: [],
          scheduleType: 'IMMEDIATE',
        })
      }

      router.push('/tools/scheduler')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar rascunho')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSchedule = () => {
    setConfirmOpen(true)
  }

  const handleConfirmSchedule = async () => {
    if (!createPost && !updatePost) return
    setIsSubmitting(true)
    setError(null)

    try {
      const mediaUrls = await uploadImages()

      const scheduledDatetime = scheduleType === 'SCHEDULED' && scheduledDate
        ? new Date(scheduledDate).toISOString()
        : undefined

      if (mode === 'edit' && post?.id && updatePost) {
        await updatePost.mutateAsync({
          postId: post.id,
          data: {
            postType,
            caption,
            mediaUrls,
            scheduleType: scheduleType as any,
            scheduledDatetime,
          },
        })
      } else if (createPost) {
        await createPost.mutateAsync({
          postType,
          caption,
          mediaUrls,
          generationIds: [],
          scheduleType: scheduleType as any,
          scheduledDatetime,
        })
      }

      setConfirmOpen(false)
      router.push('/tools/scheduler')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao agendar post')
    } finally {
      setIsSubmitting(false)
    }
  }

  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) {
      // If editing, keep existing media URLs
      return post?.mediaUrls || []
    }

    const urls: string[] = []
    for (const img of images) {
      const file = new File([img.processedBlob], img.fileName, { type: 'image/jpeg' })
      const url = await uploadBlob(file)
      urls.push(url)
    }
    return urls
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/tools/scheduler"
            className="flex items-center justify-center h-8 w-8 rounded-md text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/5 transition-colors duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h2 className="text-lg font-semibold text-[#FAFAFA]">
            {mode === 'create' ? 'Novo Post' : 'Editar Post'}
          </h2>
        </div>
        <ProjectBadge project={currentProject} />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left: Form */}
        <div className="space-y-6">
          {/* Post type selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[#A1A1AA]">Tipo de Post</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {POST_TYPES.map((t) => {
                const isActive = postType === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      setPostType(t.key)
                      // Clear images when changing type (different dimensions)
                      if (t.key !== postType) {
                        images.forEach((img) => {
                          try { URL.revokeObjectURL(img.localPreviewUrl) } catch {}
                        })
                        setImages([])
                      }
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all duration-200',
                      isActive
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-[#27272A] bg-[#1a1a1a] text-[#71717A] hover:border-[#3f3f46] hover:text-[#A1A1AA]'
                    )}
                  >
                    <t.icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{t.label}</span>
                    <span className="text-[9px] opacity-60">{t.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Image uploader */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[#A1A1AA]">Imagens</label>
            <ImageUploader
              postType={postType}
              images={images}
              onChange={setImages}
              maxImages={postType === 'CAROUSEL' ? 10 : 1}
            />
          </div>

          {/* Caption editor */}
          <CaptionEditor
            value={caption}
            onChange={setCaption}
            projectName={currentProject.name}
          />

          {/* Schedule type */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[#A1A1AA]">Agendamento</label>
            <div className="flex gap-2">
              {SCHEDULE_TYPES.map((s) => {
                const isActive = scheduleType === s.key
                return (
                  <button
                    key={s.key}
                    onClick={() => setScheduleType(s.key)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium transition-all duration-200',
                      isActive
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-[#27272A] bg-[#1a1a1a] text-[#71717A] hover:border-[#3f3f46] hover:text-[#A1A1AA]'
                    )}
                  >
                    <s.icon className="h-4 w-4" />
                    {s.label}
                  </button>
                )
              })}
            </div>

            {/* Date/time picker */}
            {scheduleType === 'SCHEDULED' && (
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="rounded-lg bg-[#1a1a1a] border border-[#27272A] px-3 py-2 text-sm text-[#FAFAFA] focus:border-amber-500/50 focus:outline-none w-full sm:w-auto"
              />
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-[#27272A]">
            <button
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg border border-[#27272A] bg-[#1a1a1a] px-4 py-2.5 text-xs font-medium text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3f3f46] disabled:opacity-50 transition-colors duration-200"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar rascunho
            </button>
            <button
              onClick={handleSchedule}
              disabled={isSubmitting || images.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-6 py-2.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {scheduleType === 'IMMEDIATE' ? 'Publicar agora' : 'Agendar post'}
            </button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="hidden lg:block">
          <div className="sticky top-6">
            <p className="text-xs font-medium text-[#71717A] mb-3 text-center">Preview</p>
            <ImagePreview
              images={images}
              caption={caption}
              postType={postType}
              instagramUsername={currentProject.instagramUsername || undefined}
            />
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      <ScheduleConfirmModal
        open={confirmOpen}
        onConfirm={handleConfirmSchedule}
        onCancel={() => setConfirmOpen(false)}
        project={currentProject}
        postSummary={{
          postType,
          scheduledDatetime: scheduledDate ? new Date(scheduledDate) : null,
          imageCount: images.length,
          caption,
        }}
        isLoading={isSubmitting}
      />
    </div>
  )
}
