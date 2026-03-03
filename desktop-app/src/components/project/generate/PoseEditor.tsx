import { useState, useCallback, useEffect } from 'react'
import { Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/constants'

interface PoseEditorProps {
  description: string
  onDescriptionChange: (description: string) => void
  referenceImages: File[]
  onReferenceImagesChange: (images: File[]) => void
}

export default function PoseEditor({
  description,
  onDescriptionChange,
  referenceImages,
  onReferenceImagesChange,
}: PoseEditorProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Generate preview URLs
  useEffect(() => {
    const urls = referenceImages.map((file) => URL.createObjectURL(file))
    setPreviewUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [referenceImages])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE
    )

    if (referenceImages.length + files.length > 3) {
      return
    }

    onReferenceImagesChange([...referenceImages, ...files].slice(0, 3))
  }, [referenceImages, onReferenceImagesChange])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (file) => ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE
    )

    if (referenceImages.length + files.length > 3) {
      return
    }

    onReferenceImagesChange([...referenceImages, ...files].slice(0, 3))
    e.target.value = ''
  }, [referenceImages, onReferenceImagesChange])

  const handleRemoveImage = useCallback((index: number) => {
    onReferenceImagesChange(referenceImages.filter((_, i) => i !== index))
  }, [referenceImages, onReferenceImagesChange])

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <h4 className="text-sm font-medium text-text">Mudar Pose</h4>

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Descreva a pose desejada..."
        rows={2}
        className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {/* Reference Images */}
      <div className="space-y-2">
        <label className="text-xs text-text-muted">
          Imagens de referencia (opcional, max 3)
        </label>

        <div className="flex gap-2">
          {/* Preview Grid */}
          {previewUrls.map((url, idx) => (
            <div
              key={idx}
              className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-card"
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => handleRemoveImage(idx)}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* Add Button */}
          {referenceImages.length < 3 && (
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200',
                isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-input hover:border-primary/50'
              )}
            >
              <input
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                onChange={handleFileInput}
                className="hidden"
              />
              <Upload size={16} className="text-text-muted" />
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
