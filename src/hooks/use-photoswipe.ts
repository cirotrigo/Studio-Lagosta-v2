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

      // PhotoSwipe setup with fast-navigation tuning
      lightboxRef.current = new PhotoSwipeLightbox({
        gallery: gallerySelector,
        children: childSelector,
        pswpModule: () => import('photoswipe'),
        // Pré-carrega 1 anterior + 3 próximas para troca instantânea
        preload: [1, 3],
        // Loop infinito entre primeira/última
        loop: true,
        // Setas de navegação maiores e sempre visíveis no desktop
        showHideAnimationType: 'fade',
        // Zoom com scroll do mouse (sem precisar segurar Ctrl)
        wheelToZoom: true,
        // Fundo opaco — melhor leitura visual
        bgOpacity: 0.92,
        // Não fechar ao arrastar pra baixo (pinch-to-close ativo no mobile só)
        pinchToClose: true,
        closeOnVerticalDrag: true,
        // Transições mais snappy
        showAnimationDuration: 200,
        hideAnimationDuration: 150,
        // Zoom rápido e direto
        zoom: true,
        clickToCloseNonZoomable: true,
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
