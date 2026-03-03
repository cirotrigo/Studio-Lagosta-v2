import { useState, useCallback, useEffect } from 'react'
import { FolderOpen, Sparkles, Upload, X, Loader2, Image as ImageIcon, LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useDrivePhotos, useAIImages, DrivePhoto, AIImage } from '@/hooks/use-art-generation'
import { cn } from '@/lib/utils'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/constants'

interface PhotoSelectorProps {
  projectId: number
  selectedPhoto: { url: string; source: string } | null
  onPhotoChange: (photo: { url: string; source: string } | null) => void
}

type PhotoTab = 'drive' | 'ai' | 'upload'

const TABS: { id: PhotoTab; label: string; icon: LucideIcon }[] = [
  { id: 'drive', label: 'Drive', icon: FolderOpen },
  { id: 'ai', label: 'Geradas com IA', icon: Sparkles },
  { id: 'upload', label: 'Upload', icon: Upload },
]

export default function PhotoSelector({ projectId, selectedPhoto, onPhotoChange }: PhotoSelectorProps) {
  const [activeTab, setActiveTab] = useState<PhotoTab>('drive')
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data: driveData, isLoading: isLoadingDrive } = useDrivePhotos(projectId)
  const { data: aiImages, isLoading: isLoadingAI } = useAIImages(projectId)

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (uploadPreview) {
        URL.revokeObjectURL(uploadPreview)
      }
    }
  }, [uploadPreview])

  const handleDriveSelect = useCallback(async (photo: DrivePhoto) => {
    setDownloadingId(photo.id)
    try {
      // Get download URL
      const response = await window.electronAPI.apiRequest(
        'https://studio-lagosta-v2.vercel.app/api/google-drive-download',
        {
          method: 'POST',
          body: JSON.stringify({ projectId, fileIds: [photo.id] }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!response.ok) {
        throw new Error('Erro ao obter URL da foto')
      }

      const data = response.data as { files: Array<{ url: string }> }
      if (data.files?.[0]?.url) {
        onPhotoChange({ url: data.files[0].url, source: 'drive' })
        toast.success('Foto selecionada!')
      }
    } catch (error) {
      toast.error('Erro ao selecionar foto')
    } finally {
      setDownloadingId(null)
    }
  }, [projectId, onPhotoChange])

  const handleAISelect = useCallback((image: AIImage) => {
    onPhotoChange({ url: image.fileUrl, source: 'ai' })
    toast.success('Foto selecionada!')
  }, [onPhotoChange])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Formato invalido. Use JPEG, PNG ou WebP')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Arquivo muito grande. Maximo 20MB')
      return
    }

    // Create preview
    const previewUrl = URL.createObjectURL(file)
    setUploadPreview(previewUrl)

    // Upload file
    try {
      const arrayBuffer = await file.arrayBuffer()
      const response = await window.electronAPI.uploadFile(
        'https://studio-lagosta-v2.vercel.app/api/upload',
        {
          name: file.name,
          type: file.type,
          buffer: arrayBuffer,
        },
        { type: 'photo' }
      )

      if (!response.ok) {
        throw new Error('Erro ao fazer upload')
      }

      const data = response.data as { url: string }
      onPhotoChange({ url: data.url, source: 'upload' })
      toast.success('Foto enviada!')
    } catch (error) {
      toast.error('Erro ao enviar foto')
      setUploadPreview(null)
    }

    e.target.value = ''
  }, [onPhotoChange])

  const handleRemove = useCallback(() => {
    onPhotoChange(null)
    if (uploadPreview) {
      URL.revokeObjectURL(uploadPreview)
      setUploadPreview(null)
    }
  }, [onPhotoChange, uploadPreview])

  // Show selected photo preview
  if (selectedPhoto) {
    return (
      <div className="relative aspect-[4/5] w-full max-w-[200px] overflow-hidden rounded-xl border border-border bg-card">
        <img
          src={selectedPhoto.url}
          alt="Foto selecionada"
          className="h-full w-full object-cover"
        />
        <button
          onClick={handleRemove}
          className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
        >
          <X size={16} />
        </button>
        <div className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
          {selectedPhoto.source === 'drive' ? 'Drive' : selectedPhoto.source === 'ai' ? 'IA' : 'Upload'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Tab Bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-input p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-card text-text shadow-sm'
                : 'text-text-muted hover:text-text'
            )}
          >
            <tab.icon size={14} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {activeTab === 'drive' && (
          <DriveTab
            photos={driveData?.items || []}
            isLoading={isLoadingDrive}
            downloadingId={downloadingId}
            onSelect={handleDriveSelect}
          />
        )}
        {activeTab === 'ai' && (
          <AITab
            images={aiImages || []}
            isLoading={isLoadingAI}
            onSelect={handleAISelect}
          />
        )}
        {activeTab === 'upload' && (
          <UploadTab
            onFileSelect={handleFileUpload}
          />
        )}
      </div>
    </div>
  )
}

// Drive Tab Component
function DriveTab({
  photos,
  isLoading,
  downloadingId,
  onSelect,
}: {
  photos: DrivePhoto[]
  isLoading: boolean
  downloadingId: string | null
  onSelect: (photo: DrivePhoto) => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FolderOpen size={32} className="mb-2 text-text-subtle" />
        <p className="text-sm text-text-muted">Nenhuma foto no Drive</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.filter(p => p.mimeType?.startsWith('image/')).slice(0, 12).map((photo) => (
        <button
          key={photo.id}
          onClick={() => onSelect(photo)}
          disabled={downloadingId === photo.id}
          className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card transition-all hover:ring-2 hover:ring-primary/50"
        >
          {photo.thumbnailUrl ? (
            <img
              src={photo.thumbnailUrl}
              alt={photo.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon size={24} className="text-text-subtle" />
            </div>
          )}
          {downloadingId === photo.id && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 size={20} className="animate-spin text-white" />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

// AI Tab Component
function AITab({
  images,
  isLoading,
  onSelect,
}: {
  images: AIImage[]
  isLoading: boolean
  onSelect: (image: AIImage) => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Sparkles size={32} className="mb-2 text-text-subtle" />
        <p className="text-sm text-text-muted">Nenhuma imagem gerada</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {images.slice(0, 12).map((image) => (
        <button
          key={image.id}
          onClick={() => onSelect(image)}
          className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card transition-all hover:ring-2 hover:ring-primary/50"
        >
          <img
            src={image.fileUrl}
            alt={image.name}
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  )
}

// Upload Tab Component
function UploadTab({
  onFileSelect,
}: {
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-input transition-all duration-200 hover:border-primary/50">
      <input
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={onFileSelect}
        className="hidden"
      />
      <Upload size={32} className="mb-2 text-text-muted" />
      <p className="text-sm font-medium text-text">Clique para selecionar</p>
      <p className="mt-1 text-xs text-text-muted">JPEG, PNG ou WebP (max 20MB)</p>
    </label>
  )
}
