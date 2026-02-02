'use client'

import { useEffect, useRef } from 'react'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'

// Track PhotoSwipe open state globally
let photoSwipeOpenState = false
let lastClosedAt = 0

export function isPhotoSwipeOpen(): boolean {
  return photoSwipeOpenState
}

export function wasPhotoSwipeJustClosed(withinMs = 300): boolean {
  return Date.now() - lastClosedAt < withinMs
}

interface UsePhotoSwipeOptions {
  gallerySelector: string
  childSelector?: string
  dependencies?: unknown[]
  enabled?: boolean
}

export function usePhotoSwipe({
  gallerySelector,
  childSelector = 'a',
  dependencies = [],
  enabled = true,
}: UsePhotoSwipeOptions) {
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null)

  useEffect(() => {
    // Clean up previous instance
    if (lightboxRef.current) {
      lightboxRef.current.destroy()
      lightboxRef.current = null
    }

    if (!enabled) return

    // Wait for DOM to be ready
    const initPhotoSwipe = () => {
      const gallery = document.querySelector(gallerySelector)
      if (!gallery) return false

      const items = gallery.querySelectorAll(childSelector)
      if (items.length === 0) return false

      // Simple PhotoSwipe setup per documentation
      lightboxRef.current = new PhotoSwipeLightbox({
        gallery: gallerySelector,
        children: childSelector,
        pswpModule: () => import('photoswipe'),
      })

      // Track open/close state for other components
      lightboxRef.current.on('openingAnimationStart', () => {
        photoSwipeOpenState = true
      })
      lightboxRef.current.on('closingAnimationEnd', () => {
        photoSwipeOpenState = false
        lastClosedAt = Date.now()
      })

      lightboxRef.current.init()
      return true
    }

    // Try to init immediately, retry if needed
    if (!initPhotoSwipe()) {
      const timer = setTimeout(() => {
        initPhotoSwipe()
      }, 500)
      return () => clearTimeout(timer)
    }

    return () => {
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
        lightboxRef.current = null
      }
    }
  }, [gallerySelector, childSelector, enabled, ...dependencies])
}
