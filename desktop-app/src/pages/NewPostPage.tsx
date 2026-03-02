import { useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useProjectStore } from '@/stores/project.store'
import { useCreatePost } from '@/hooks/use-posts'
import { useImageProcessor } from '@/hooks/use-image-processor'
import { cn } from '@/lib/utils'
import { PostType, POST_TYPE_LABELS, ScheduleType, MAX_CAPTION_LENGTH } from '@/lib/constants'
import PostTypeSelector from '@/components/post/PostTypeSelector'
import ImageDropzone from '@/components/post/ImageDropzone'
import ImagePreview from '@/components/post/ImagePreview'
import CaptionEditor from '@/components/post/CaptionEditor'
import SchedulePicker from '@/components/post/SchedulePicker'
import ConfirmModal from '@/components/post/ConfirmModal'
import ProjectBadge from '@/components/layout/ProjectBadge'

export default function NewPostPage() {
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const createPost = useCreatePost(currentProject?.id)
  const { processedImages, isProcessing, processFiles, removeImage, clearImages } =
    useImageProcessor()

  // Form state
  const [postType, setPostType] = useState<PostType>('POST')
  const [caption, setCaption] = useState('')
  const [scheduleType, setScheduleType] = useState<ScheduleType>('SCHEDULED')
  const [scheduledDatetime, setScheduledDatetime] = useState<string>('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // No project selected
  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-text">Selecione um projeto</h2>
          <p className="mt-2 text-text-muted">
            Escolha um projeto na barra lateral antes de criar um post
          </p>
          <Link
            to="/scheduler"
            className="mt-4 inline-flex items-center gap-2 text-primary hover:underline"
          >
            <ArrowLeft size={16} />
            Voltar para o agendador
          </Link>
        </div>
      </div>
    )
  }

  const handlePostTypeChange = (type: PostType) => {
    setPostType(type)
    // Clear images when changing post type (different dimensions)
    if (processedImages.length > 0) {
      clearImages()
    }
  }

  const handleFilesSelected = async (files: File[]) => {
    await processFiles(files, postType)
  }

  const handleRemoveImage = (index: number) => {
    removeImage(index)
  }

  const canSubmit = () => {
    // Must have at least one image
    if (processedImages.length === 0) return false

    // Caption required for non-story posts
    if (postType !== 'STORY' && !caption.trim()) return false

    // Scheduled datetime required for scheduled posts
    if (scheduleType === 'SCHEDULED' && !scheduledDatetime) return false

    // Check if scheduled datetime is in the future
    if (scheduleType === 'SCHEDULED') {
      const scheduled = new Date(scheduledDatetime)
      if (scheduled <= new Date()) return false
    }

    return true
  }

  const handleSubmit = () => {
    if (!canSubmit()) return
    setShowConfirmModal(true)
  }

  const handleConfirm = async () => {
    if (!currentProject) return

    setIsSubmitting(true)
    setShowConfirmModal(false)

    try {
      // Upload images first
      const mediaUrls: string[] = []
      for (const image of processedImages) {
        const formData = new FormData()
        formData.append('file', image.blob, image.fileName)
        formData.append('type', 'post')

        const response = await fetch(
          `https://studio-lagosta-v2.vercel.app/api/upload`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
            },
            body: formData,
          }
        )

        if (!response.ok) {
          throw new Error('Erro ao fazer upload da imagem')
        }

        const data = await response.json()
        mediaUrls.push(data.url)
      }

      // Create post
      await createPost.mutateAsync({
        postType,
        caption: caption.trim(),
        mediaUrls,
        scheduleType,
        scheduledDatetime: scheduleType === 'SCHEDULED' ? scheduledDatetime : undefined,
      })

      toast.success('Post agendado com sucesso!')
      navigate('/scheduler')
    } catch (error) {
      console.error('Error creating post:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao criar post')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-4">
          <Link
            to="/scheduler"
            className="flex items-center gap-2 text-text-muted hover:text-text"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-text">Novo Post</h1>
            <p className="text-sm text-text-muted">
              Criar {POST_TYPE_LABELS[postType].toLowerCase()} para{' '}
              <span className="text-primary">{currentProject.name}</span>
            </p>
          </div>
        </div>

        <ProjectBadge project={currentProject} />
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Form */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            {/* Post Type */}
            <PostTypeSelector value={postType} onChange={handlePostTypeChange} />

            {/* Image Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text">
                {postType === 'CAROUSEL' ? 'Imagens (até 10)' : 'Imagem'}
              </label>
              <ImageDropzone
                postType={postType}
                onFilesSelected={handleFilesSelected}
                isProcessing={isProcessing}
                processedImages={processedImages}
                onRemoveImage={handleRemoveImage}
              />
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text">
                Legenda
                {postType !== 'STORY' && (
                  <span className="text-error">*</span>
                )}
              </label>
              <CaptionEditor
                value={caption}
                onChange={setCaption}
                maxLength={MAX_CAPTION_LENGTH}
                projectName={currentProject.name}
                postType={postType}
              />
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text">
                Agendamento
              </label>
              <SchedulePicker
                scheduleType={scheduleType}
                onScheduleTypeChange={setScheduleType}
                scheduledDatetime={scheduledDatetime}
                onScheduledDatetimeChange={setScheduledDatetime}
              />
            </div>

            {/* Submit */}
            <div className="pt-4">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit() || isSubmitting}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary-hover',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'transition-all duration-200'
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Criando post...
                  </>
                ) : (
                  'Agendar Post'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="hidden w-[400px] flex-shrink-0 border-l border-border bg-sidebar lg:block">
          <div className="p-6">
            <h3 className="mb-4 text-sm font-medium text-text">Preview</h3>
            <ImagePreview
              images={processedImages}
              postType={postType}
              caption={caption}
              username={currentProject.instagramUsername || currentProject.name}
            />
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirm}
        project={currentProject}
        postType={postType}
        imageCount={processedImages.length}
        caption={caption}
        scheduleType={scheduleType}
        scheduledDatetime={scheduledDatetime}
      />
    </div>
  )
}
