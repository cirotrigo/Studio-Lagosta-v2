import ImageDropzone from '@/components/post/ImageDropzone'
import { PostType } from '@/lib/constants'
import { ProcessedImage } from '@/hooks/use-image-processor'

interface LocalUploadTabProps {
  postType: PostType
  processedImages: ProcessedImage[]
  isProcessing: boolean
  onFilesSelected: (files: File[]) => void
  onRemoveImage: (index: number) => void
  onEditCrop?: (index: number) => void
}

export default function LocalUploadTab({
  postType,
  processedImages,
  isProcessing,
  onFilesSelected,
  onRemoveImage,
  onEditCrop,
}: LocalUploadTabProps) {
  return (
    <ImageDropzone
      postType={postType}
      onFilesSelected={onFilesSelected}
      isProcessing={isProcessing}
      processedImages={processedImages}
      onRemoveImage={onRemoveImage}
      onEditCrop={onEditCrop}
    />
  )
}
