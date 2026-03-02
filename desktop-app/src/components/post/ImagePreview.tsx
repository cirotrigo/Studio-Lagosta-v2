import { useState } from 'react'
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Bookmark } from 'lucide-react'
import { cn, truncate, getInitials } from '@/lib/utils'
import { PostType } from '@/lib/constants'
import { ProcessedImage } from '@/hooks/use-image-processor'

interface ImagePreviewProps {
  images: ProcessedImage[]
  postType: PostType
  caption: string
  username: string
}

export default function ImagePreview({
  images,
  postType,
  caption,
  username,
}: ImagePreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const isStoryFormat = postType === 'STORY' || postType === 'REEL'

  if (images.length === 0) {
    return (
      <div className="flex aspect-[9/16] items-center justify-center rounded-2xl border border-border bg-input">
        <p className="text-sm text-text-muted">Preview aparecerá aqui</p>
      </div>
    )
  }

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-black',
        isStoryFormat ? 'aspect-[9/16]' : 'aspect-[4/5]'
      )}
    >
      {/* Image */}
      <img
        src={images[currentIndex]?.previewUrl}
        alt=""
        className="h-full w-full object-cover"
      />

      {/* Carousel navigation */}
      {images.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white"
          >
            <ChevronRight size={20} />
          </button>

          {/* Dots indicator */}
          <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-all duration-200',
                  index === currentIndex ? 'bg-white' : 'bg-white/50'
                )}
              />
            ))}
          </div>
        </>
      )}

      {/* Story/Reel header */}
      {isStoryFormat && (
        <div className="absolute left-0 right-0 top-0 bg-gradient-to-b from-black/50 to-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-primary-hover">
              <span className="text-xs font-medium text-white">
                {getInitials(username)}
              </span>
            </div>
            <span className="text-sm font-medium text-white">{username}</span>
          </div>
        </div>
      )}

      {/* Feed footer */}
      {!isStoryFormat && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Actions */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Heart size={24} className="text-white" />
              <MessageCircle size={24} className="text-white" />
              <Send size={24} className="text-white" />
            </div>
            <Bookmark size={24} className="text-white" />
          </div>

          {/* Username and caption */}
          <div className="text-sm text-white">
            <span className="font-semibold">{username}</span>{' '}
            <span className="opacity-90">
              {caption ? truncate(caption, 100) : 'Sem legenda'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
