import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useProjectStore } from '@/stores/project.store'
import { useCreatePost } from '@/hooks/use-posts'
import { useImageProcessor } from '@/hooks/use-image-processor'
import { cn } from '@/lib/utils'
import { PostType, POST_TYPE_LABELS, ScheduleType, MAX_CAPTION_LENGTH } from '@/lib/constants'
import PostTypeSelector from '@/components/post/PostTypeSelector'
import UploadTabs from '@/components/post/upload-tabs/UploadTabs'
import ImagePreview from '@/components/post/ImagePreview'
import CaptionEditor from '@/components/post/CaptionEditor'
import SchedulePicker from '@/components/post/SchedulePicker'
import ConfirmModal from '@/components/post/ConfirmModal'
import ProjectBadge from '@/components/layout/ProjectBadge'
import CarouselReorder from '@/components/post/CarouselReorder'
import CropEditor from '@/components/post/CropEditor'

interface NewPostLocationState {
  imageUrl?: string
  postType?: PostType
}

function inferFileExtension(contentType: string | undefined, sourceUrl: string) {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }

  if (contentType && byType[contentType]) {
    return byType[contentType]
  }

  const fromUrl = sourceUrl.split('/').pop()?.split('?')[0]?.split('.').pop()?.toLowerCase()
  if (fromUrl && ['jpg', 'jpeg', 'png', 'webp'].includes(fromUrl)) {
    return fromUrl === 'jpeg' ? 'jpg' : fromUrl
  }

  return 'jpg'
}

export default function NewPostPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentProject } = useProjectStore()
  const createPost = useCreatePost(currentProject?.id)
  const { processedImages, isProcessing, processFiles, removeImage, clearImages, reorderImages, reprocessImage } =
    useImageProcessor()
  const prefilledState = (location.state as NewPostLocationState | null) ?? null
  const consumedPrefillKeyRef = useRef<string | null>(null)

  // Form state
  const [postType, setPostType] = useState<PostType>(prefilledState?.postType ?? 'POST')
  const [caption, setCaption] = useState('')
  const [scheduleType, setScheduleType] = useState<ScheduleType>('SCHEDULED')
  const [scheduledDatetime, setScheduledDatetime] = useState<string>('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cropEditingIndex, setCropEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    const imageUrl = prefilledState?.imageUrl
    const targetPostType = prefilledState?.postType ?? 'POST'
    if (!imageUrl) {
      return
    }

    const prefillKey = `${targetPostType}:${imageUrl}`
    if (consumedPrefillKeyRef.current === prefillKey) {
      return
    }

    consumedPrefillKeyRef.current = prefillKey

    let cancelled = false

    const loadPrefilledImage = async () => {
      try {
        setPostType(targetPostType)
        clearImages()

        const response = await window.electronAPI.downloadBlob(imageUrl)
        if (!response.ok || !response.buffer) {
          throw new Error(response.error || 'Falha ao carregar a arte selecionada.')
        }

        const contentType = response.contentType || 'image/jpeg'
        const extension = inferFileExtension(contentType, imageUrl)
        const file = new File([response.buffer], `criativo-story.${extension}`, {
          type: contentType,
        })

        await processFiles([file], targetPostType)

        if (cancelled) {
          return
        }

        navigate(location.pathname, { replace: true, state: null })
        toast.success('Arte carregada no agendador como story.')
      } catch (error) {
        consumedPrefillKeyRef.current = null
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : 'Erro ao carregar a arte selecionada.',
          )
        }
      }
    }

    void loadPrefilledImage()

    return () => {
      cancelled = true
    }
  }, [clearImages, location.pathname, navigate, prefilledState, processFiles])

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

  const handlePostTypeChange = async (type: PostType) => {
    const prevImages = processedImages
    setPostType(type)

    // If there are images, reprocess them for the new post type dimensions
    if (prevImages.length > 0) {
      // Get the original files to reprocess - use originalArrayBuffer for accurate resizing
      const filesToReprocess = prevImages.map((img) => {
        // Use original data if available, otherwise fall back to processed blob
        const buffer = img.originalArrayBuffer || img.blob
        return new File([buffer], img.fileName, { type: img.blob.type || 'image/jpeg' })
      })

      // Clear old URLs before reprocessing
      // processFiles handles the replacement logic (isReplacement check in hook)
      clearImages()
      await processFiles(filesToReprocess, type)
    }
  }

  const handleFilesSelected = async (files: File[]) => {
    await processFiles(files, postType)
  }

  const handleRemoveImage = (index: number) => {
    removeImage(index)
  }

  const handleReorderImages = (newImages: typeof processedImages) => {
    reorderImages(newImages)
  }

  const handleEditCrop = (index: number) => {
    setCropEditingIndex(index)
  }

  const handleCropConfirm = async (cropRegion: { left: number; top: number; width: number; height: number }) => {
    if (cropEditingIndex === null) return
    
    try {
      await reprocessImage(cropEditingIndex, postType, cropRegion)
      setCropEditingIndex(null)
      toast.success('Crop aplicado com sucesso')
    } catch (error) {
      toast.error('Erro ao aplicar crop')
    }
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
      // Upload images first using Electron IPC to bypass CORS
      const mediaUrls: string[] = []
      for (const image of processedImages) {
        // Convert blob to ArrayBuffer
        const arrayBuffer = await image.blob.arrayBuffer()
        
        const response = await window.electronAPI.uploadFile(
          `https://studio-lagosta-v2.vercel.app/api/upload`,
          {
            name: image.fileName,
            type: image.blob.type || 'image/jpeg',
            buffer: arrayBuffer,
          },
          { type: 'post', postType }
        )

        if (!response.ok) {
          throw new Error(response.data?.error || 'Erro ao fazer upload da imagem')
        }

        const data = response.data as { url: string }
        mediaUrls.push(data.url)
      }

      // Create post
      // Convert datetime-local to ISO string for API
      const scheduledDatetimeISO = scheduleType === 'SCHEDULED' && scheduledDatetime
        ? new Date(scheduledDatetime).toISOString()
        : undefined
      
      await createPost.mutateAsync({
        postType,
        caption: caption.trim(),
        mediaUrls,
        scheduleType,
        scheduledDatetime: scheduledDatetimeISO,
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
              <UploadTabs
                postType={postType}
                processedImages={processedImages}
                isProcessing={isProcessing}
                onFilesSelected={handleFilesSelected}
                onRemoveImage={handleRemoveImage}
                onEditCrop={handleEditCrop}
                projectId={currentProject.id}
              />
            </div>

            {/* Carousel Reorder - only for carousel with multiple images */}
            {postType === 'CAROUSEL' && processedImages.length > 1 && (
              <CarouselReorder
                images={processedImages}
                onReorder={handleReorderImages}
                onRemove={handleRemoveImage}
                onEditCrop={handleEditCrop}
              />
            )}

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
                projectId={currentProject.id}
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

      {/* Crop Editor Modal */}
      <CropEditor
        isOpen={cropEditingIndex !== null}
        imageUrl={cropEditingIndex !== null ? (processedImages[cropEditingIndex]?.originalPreviewUrl || processedImages[cropEditingIndex]?.previewUrl) : ''}
        originalWidth={cropEditingIndex !== null ? processedImages[cropEditingIndex]?.originalWidth : 0}
        originalHeight={cropEditingIndex !== null ? processedImages[cropEditingIndex]?.originalHeight : 0}
        postType={postType}
        onConfirm={handleCropConfirm}
        onCancel={() => setCropEditingIndex(null)}
      />
    </div>
  )
}
