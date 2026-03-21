import { useState, useCallback, useRef } from 'react'
import { X, Clock, FolderOpen, Upload } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ReferenceImage, AIImageModel } from '@/lib/queue/types'
import { AI_IMAGE_MODEL_CONFIGS } from '@/lib/queue/types'
import { useRecentReferenceImages } from '@/stores/image-queue.store'
import DriveImagePicker from './DriveImagePicker'

type TabId = 'recent' | 'drive' | 'local'

interface ReferenceImagesSectionProps {
  images: ReferenceImage[]
  onChange: (images: ReferenceImage[]) => void
  model: AIImageModel
  projectId: number
}

export default function ReferenceImagesSection({
  images,
  onChange,
  model,
  projectId,
}: ReferenceImagesSectionProps) {
  const [activeTab, setActiveTab] = useState<TabId>('recent')
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recentImages = useRecentReferenceImages()

  const modelConfig = AI_IMAGE_MODEL_CONFIGS[model]
  const maxImages = modelConfig.maxReferenceImages
  const canAddMore = images.length < maxImages

  const handleAddImage = useCallback(
    (image: ReferenceImage) => {
      if (images.length >= maxImages) return
      if (images.some((i) => i.id === image.id)) return
      onChange([...images, image])
    },
    [images, maxImages, onChange]
  )

  const handleAddImages = useCallback(
    (newImages: ReferenceImage[]) => {
      const remaining = maxImages - images.length
      const toAdd = newImages
        .filter((img) => !images.some((i) => i.id === img.id))
        .slice(0, remaining)
      if (toAdd.length > 0) {
        onChange([...images, ...toAdd])
      }
    },
    [images, maxImages, onChange]
  )

  const handleRemoveImage = useCallback(
    (id: string) => {
      onChange(images.filter((i) => i.id !== id))
    },
    [images, onChange]
  )

  const handleLocalUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return

      const newImages: ReferenceImage[] = await Promise.all(
        files.slice(0, maxImages - images.length).map(async (file) => {
          const url = URL.createObjectURL(file)
          return {
            id: crypto.randomUUID(),
            url,
            thumbnailUrl: url,
            source: 'local' as const,
            name: file.name,
            addedAt: new Date().toISOString(),
          }
        })
      )

      handleAddImages(newImages)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [images.length, maxImages, handleAddImages]
  )

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'recent', label: 'Recentes', icon: <Clock size={14} /> },
    { id: 'drive', label: 'Drive', icon: <FolderOpen size={14} /> },
    { id: 'local', label: 'Local', icon: <Upload size={14} /> },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">
          Imagens de Referencia ({images.length} de {maxImages})
        </h3>
      </div>

      {/* Selected Images */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence mode="popLayout">
            {images.map((image) => (
              <motion.div
                key={image.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative group"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/[0.08]">
                  <img
                    src={image.thumbnailUrl}
                    alt={image.name || 'Reference'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveImage(image.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} className="text-white" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all',
              activeTab === tab.id
                ? 'bg-white/[0.08] text-white'
                : 'text-white/50 hover:text-white/70'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[120px]">
        {/* Recent Tab */}
        {activeTab === 'recent' && (
          <div className="grid grid-cols-6 gap-2">
            {recentImages.length > 0 ? (
              recentImages.map((image) => {
                const isSelected = images.some((i) => i.id === image.id)
                return (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        handleRemoveImage(image.id)
                      } else if (canAddMore) {
                        handleAddImage(image)
                      }
                    }}
                    disabled={!canAddMore && !isSelected}
                    className={cn(
                      'aspect-square rounded-xl overflow-hidden border-2 transition-all',
                      isSelected
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-transparent hover:border-white/20',
                      !canAddMore && !isSelected && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <img
                      src={image.thumbnailUrl}
                      alt={image.name || 'Recent'}
                      className="w-full h-full object-cover"
                    />
                  </button>
                )
              })
            ) : (
              <div className="col-span-6 flex flex-col items-center justify-center h-24 text-white/40">
                <Clock size={24} />
                <p className="text-xs mt-2">Nenhuma imagem recente</p>
              </div>
            )}
          </div>
        )}

        {/* Drive Tab */}
        {activeTab === 'drive' && (
          <div className="flex flex-col items-center justify-center h-24 gap-3">
            <button
              type="button"
              onClick={() => setIsDrivePickerOpen(true)}
              disabled={!canAddMore}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl',
                'bg-white/[0.06] hover:bg-white/[0.1] transition-colors',
                'text-white/70 hover:text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <FolderOpen size={18} />
              <span>Abrir Google Drive</span>
            </button>
            {!canAddMore && (
              <p className="text-xs text-white/40">
                Limite de {maxImages} imagens atingido
              </p>
            )}
          </div>
        )}

        {/* Local Tab */}
        {activeTab === 'local' && (
          <div className="flex flex-col items-center justify-center h-24 gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleLocalUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canAddMore}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl',
                'bg-white/[0.06] hover:bg-white/[0.1] transition-colors',
                'text-white/70 hover:text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Upload size={18} />
              <span>Selecionar arquivos</span>
            </button>
            {!canAddMore && (
              <p className="text-xs text-white/40">
                Limite de {maxImages} imagens atingido
              </p>
            )}
          </div>
        )}
      </div>

      {/* Drive Picker Modal */}
      <DriveImagePicker
        isOpen={isDrivePickerOpen}
        onClose={() => setIsDrivePickerOpen(false)}
        onSelect={handleAddImages}
        projectId={projectId}
        maxImages={maxImages}
        selectedCount={images.length}
      />
    </div>
  )
}
