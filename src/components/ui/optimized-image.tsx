'use client'

import Image, { ImageProps } from 'next/image'
import { useState, useEffect, memo } from 'react'
import { cn } from '@/lib/utils'

interface OptimizedImageProps extends Omit<ImageProps, 'onLoad' | 'onError' | 'placeholder'> {
  fallbackSrc?: string
  showLoader?: boolean
  blurDataURL?: string
}

// Simple blur placeholder (1x1 pixel base64 - light gray)
const BLUR_DATA_URL = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4='

/**
 * OPTIMIZED Image component with:
 * - Lazy loading by default
 * - Blur placeholder for better UX
 * - Error handling with fallback
 * - Loading states
 * - Automatic format selection (AVIF/WebP)
 * - Memoization to prevent re-renders
 */
export const OptimizedImage = memo(function OptimizedImage({
  src,
  alt,
  className,
  fallbackSrc = '/placeholder.png',
  showLoader = true,
  priority = false,
  blurDataURL = BLUR_DATA_URL,
  quality = 75,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [imgSrc, setImgSrc] = useState(src)

  // Update src if it changes
  useEffect(() => {
    setImgSrc(src)
    setHasError(false)
    setIsLoading(true)
  }, [src])

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setHasError(true)
    setIsLoading(false)
    if (fallbackSrc && imgSrc !== fallbackSrc) {
      setImgSrc(fallbackSrc)
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {isLoading && showLoader && !priority && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 backdrop-blur-sm z-10">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <Image
        src={imgSrc}
        alt={alt}
        className={cn(
          'transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100',
          hasError && 'opacity-50',
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? undefined : 'lazy'}
        priority={priority}
        placeholder="blur"
        blurDataURL={blurDataURL}
        quality={quality}
        {...props}
      />
    </div>
  )
})
