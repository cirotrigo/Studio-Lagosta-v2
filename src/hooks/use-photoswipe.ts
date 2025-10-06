'use client'

import { useEffect, useRef } from 'react'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'

interface PhotoSwipeItem {
  src: string
  width: number
  height: number
  alt?: string
}

interface UsePhotoSwipeOptions {
  gallerySelector: string
  childSelector: string
  items?: PhotoSwipeItem[]
  dependencies?: unknown[]
}

export function usePhotoSwipe({ gallerySelector, childSelector, items = [], dependencies = [] }: UsePhotoSwipeOptions) {
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null)

  useEffect(() => {
    // Destruir instância anterior se existir
    if (lightboxRef.current) {
      lightboxRef.current.destroy()
      lightboxRef.current = null
    }

    // Aguardar o DOM estar pronto e as animações terminarem
    const checkAndInit = () => {
      const galleryElement = document.querySelector(gallerySelector)

      if (!galleryElement) {
        console.warn('PhotoSwipe: Gallery element not found:', gallerySelector)
        return false
      }

      // Verificar se há elementos filhos
      const children = galleryElement.querySelectorAll(childSelector)
      if (children.length === 0) {
        console.warn('PhotoSwipe: No children found with selector:', childSelector)
        return false
      }

      console.log(`PhotoSwipe: Initializing with ${children.length} items`)

      lightboxRef.current = new PhotoSwipeLightbox({
        gallery: gallerySelector,
        children: childSelector,
        pswpModule: () => import('photoswipe'),
        paddingFn: (viewportSize) => {
          return {
            top: 30,
            bottom: 30,
            left: viewportSize.x < 768 ? 0 : 20,
            right: viewportSize.x < 768 ? 0 : 20,
          }
        },
        bgOpacity: 0.9,
        showHideAnimationType: 'zoom',
        initialZoomLevel: 'fit',
        secondaryZoomLevel: 1.5,
        maxZoomLevel: 3,
      })

      // Caption removido para não interferir com extensões do Chrome

      // Adicionar event listener para prevenir navegação padrão
      lightboxRef.current.on('beforeOpen', () => {
        console.log('PhotoSwipe: Opening lightbox')
      })

      lightboxRef.current.init()

      console.log('PhotoSwipe: Initialized successfully')
      return true
    }

    // Tentar inicializar com delays incrementais
    let attempts = 0
    const maxAttempts = 5
    const timer = setInterval(() => {
      attempts++
      const success = checkAndInit()

      if (success || attempts >= maxAttempts) {
        clearInterval(timer)
      }
    }, 200)

    return () => {
      clearInterval(timer)
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
        lightboxRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallerySelector, childSelector, ...dependencies])

  const openPhotoSwipe = (index: number) => {
    if (lightboxRef.current && items.length > 0) {
      lightboxRef.current.loadAndOpen(index)
    }
  }

  return { openPhotoSwipe }
}
