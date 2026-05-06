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

      // Sobrescreve as dimensões do item com o RATIO real do <img> renderizado
      // no card. O thumbnail Next.js Image preserva proporção mas vem em escala
      // reduzida (ex: 345x614 pra um asset 1080x1920) — usar essas dims pequenas
      // direto faz o PhotoSwipe renderizar a slide minúscula, então normalizamos
      // pra 1080 de largura mantendo o ratio. Necessário porque data-pswp-* vêm
      // de Template.dimensions, que pode estar errado (criativos recuperados
      // com Template default 1080x1350 mas asset real 1080x1920). Sem isso,
      // navegação por seta abre slides achatados.
      lightboxRef.current.addFilter('itemData', (itemData, index) => {
        const galleryEl = document.querySelector(gallerySelector)
        if (!galleryEl) return itemData
        const links = galleryEl.querySelectorAll(childSelector)
        const link = links[index] as HTMLAnchorElement | undefined
        if (!link) return itemData
        const img = link.querySelector('img') as HTMLImageElement | null
        if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          const baseWidth = 1080
          const ratio = img.naturalHeight / img.naturalWidth
          const w = baseWidth
          const h = Math.round(baseWidth * ratio)
          return { ...itemData, w, h, width: w, height: h }
        }
        return itemData
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
