'use client'

import Image, { ImageProps } from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface OptimizedImageProps extends Omit<ImageProps, 'onLoadingComplete' | 'placeholder'> {
  fallbackSrc?: string
  showLoader?: boolean
}

/**
 * Optimized Image component with lazy loading, blur placeholder, and error handling
 * Uses Next.js Image optimization by default
 */
export function OptimizedImage({
  src,
  alt,
  className,
  fallbackSrc = '/placeholder.png',
  showLoader = true,
  priority = false,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [imgSrc, setImgSrc] = useState(src)

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setHasError(true)
    setIsLoading(false)
    if (fallbackSrc) {
      setImgSrc(fallbackSrc)
    }
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && showLoader && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <Image
        src={imgSrc}
        alt={alt}
        className={cn(
          'transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100',
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? undefined : 'lazy'}
        priority={priority}
        {...props}
      />
    </div>
  )
}
