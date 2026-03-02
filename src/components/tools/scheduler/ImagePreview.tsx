"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Heart, MessageCircle, Send, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react'

interface ProcessedImage {
  localPreviewUrl: string
  processedBlob: Blob
  format: string
}

interface ImagePreviewProps {
  images: ProcessedImage[]
  caption: string
  postType: string
  instagramUsername?: string
}

export function ImagePreview({ images, caption, postType, instagramUsername }: ImagePreviewProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0)

  const isStory = postType === 'STORY' || postType === 'REEL'
  const aspectClass = isStory ? 'aspect-[9/16]' : 'aspect-[4/5]'

  const hasImages = images.length > 0
  const isCarousel = images.length > 1

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Phone frame */}
      <div className="w-full max-w-[320px] rounded-[2rem] border-2 border-[#27272A] bg-[#0a0a0a] p-2 shadow-2xl">
        <div className="rounded-[1.5rem] overflow-hidden bg-[#161616]">
          {/* IG Header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0a]">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-500 to-pink-500 p-[2px]">
              <div className="h-full w-full rounded-full bg-[#0a0a0a] flex items-center justify-center">
                <span className="text-[8px] font-bold text-[#FAFAFA]">
                  {instagramUsername?.charAt(0)?.toUpperCase() || 'S'}
                </span>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-[#FAFAFA]">
              {instagramUsername ? `@${instagramUsername}` : '@seu_restaurante'}
            </span>
            <div className="ml-auto text-[#71717A]">•••</div>
          </div>

          {/* Image area */}
          <div className={cn('relative bg-[#1a1a1a]', aspectClass)}>
            {hasImages ? (
              <>
                <img
                  src={images[currentIndex]?.localPreviewUrl}
                  alt="Preview"
                  className="h-full w-full object-cover"
                />
                {/* Carousel nav */}
                {isCarousel && (
                  <>
                    {currentIndex > 0 && (
                      <button
                        onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                        className="absolute left-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 text-white" />
                      </button>
                    )}
                    {currentIndex < images.length - 1 && (
                      <button
                        onClick={() => setCurrentIndex((i) => Math.min(images.length - 1, i + 1))}
                        className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50"
                      >
                        <ChevronRight className="h-3.5 w-3.5 text-white" />
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-[#27272A]">
                <span className="text-xs">Adicione uma imagem</span>
              </div>
            )}
          </div>

          {/* IG Action icons */}
          {!isStory && (
            <div className="flex items-center px-3 py-2 bg-[#0a0a0a]">
              <div className="flex items-center gap-3">
                <Heart className="h-5 w-5 text-[#FAFAFA]" />
                <MessageCircle className="h-5 w-5 text-[#FAFAFA]" />
                <Send className="h-5 w-5 text-[#FAFAFA]" />
              </div>
              {/* Carousel dots */}
              {isCarousel && (
                <div className="flex items-center gap-1 mx-auto">
                  {images.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full transition-colors duration-200',
                        i === currentIndex ? 'bg-blue-500' : 'bg-[#3f3f46]'
                      )}
                    />
                  ))}
                </div>
              )}
              <Bookmark className="h-5 w-5 text-[#FAFAFA] ml-auto" />
            </div>
          )}

          {/* Caption preview */}
          {!isStory && caption && (
            <div className="px-3 pb-3 bg-[#0a0a0a]">
              <p className="text-[11px] text-[#FAFAFA] leading-relaxed">
                <span className="font-semibold">
                  {instagramUsername || 'seu_restaurante'}
                </span>{' '}
                <span className="text-[#A1A1AA]">
                  {caption.length > 120 ? caption.slice(0, 120) + '...' : caption}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
