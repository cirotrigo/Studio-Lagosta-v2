'use client'

import { useEffect, useRef } from 'react'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'

// Global flag to track if PhotoSwipe is open (accessible to all components)
let isPhotoSwipeOpenGlobal = false
// Flag to track if PhotoSwipe just processed ESC key (prevents modal from closing)
let photoSwipeJustClosedWithEsc = false

export function isPhotoSwipeOpen(): boolean {
  return isPhotoSwipeOpenGlobal
}

export function wasPhotoSwipeJustClosed(): boolean {
  return photoSwipeJustClosedWithEsc
}

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
  enabled?: boolean
}

// Fullscreen API helper with webkit prefix support
function getFullscreenAPI() {
  const api = {
    request: null as ((el: Element) => Promise<void>) | null,
    exit: null as (() => Promise<void>) | null,
    element: null as (() => Element | null) | null,
    supported: false,
  }

  if (typeof document === 'undefined') return api

  // Check for standard and webkit-prefixed versions
  const el = document.documentElement as Element & {
    webkitRequestFullscreen?: () => Promise<void>
  }
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void>
    webkitFullscreenElement?: Element
  }

  if (el.requestFullscreen) {
    api.request = (element: Element) => element.requestFullscreen()
    api.exit = () => document.exitFullscreen()
    api.element = () => document.fullscreenElement
    api.supported = true
  } else if (el.webkitRequestFullscreen) {
    api.request = (element: Element) => (element as typeof el).webkitRequestFullscreen!()
    api.exit = () => doc.webkitExitFullscreen!()
    api.element = () => doc.webkitFullscreenElement || null
    api.supported = true
  }

  return api
}

// Check if device is mobile
function isMobileDevice() {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

// Check if Safari (doesn't support fullscreen API on iOS)
function isSafari() {
  if (typeof navigator === 'undefined') return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

export function usePhotoSwipe({
  gallerySelector,
  childSelector,
  items = [],
  dependencies = [],
  enabled = true,
}: UsePhotoSwipeOptions) {
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null)
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
        lightboxRef.current = null
      }
      return
    }

    // Destroy previous instance if exists
    if (lightboxRef.current) {
      lightboxRef.current.destroy()
      lightboxRef.current = null
    }

    // Clean up old fullscreen container
    if (fullscreenContainerRef.current) {
      fullscreenContainerRef.current.remove()
      fullscreenContainerRef.current = null
    }

    const checkAndInit = (): 'success' | 'retry' | 'empty' => {
      if (typeof document === 'undefined' || typeof window === 'undefined') {
        return 'retry'
      }

      const galleryElement = document.querySelector(gallerySelector)

      if (!galleryElement) {
        return 'retry'
      }

      if (!document.body.contains(galleryElement)) {
        return 'retry'
      }

      const children = galleryElement.querySelectorAll(childSelector)
      if (children.length === 0) {
        return 'empty'
      }

      // Check for missing attributes
      let missingAttributes = 0
      children.forEach((child) => {
        const width = child.getAttribute('data-pswp-width')
        const height = child.getAttribute('data-pswp-height')
        if (!width || !height) {
          missingAttributes++
        }
      })

      if (missingAttributes > 0) {
        return 'retry'
      }

      const isMobile = isMobileDevice()
      const isIOSSafari = isSafari() && /iPhone|iPad|iPod/.test(navigator.userAgent)
      const fullscreenAPI = getFullscreenAPI()
      const useNativeFullscreen = isMobile && fullscreenAPI.supported && !isIOSSafari

      // Create fullscreen container for mobile (except iOS Safari)
      if (useNativeFullscreen) {
        const container = document.createElement('div')
        container.id = 'pswp-fullscreen-container'
        container.style.cssText = `
          display: none;
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #000;
        `
        document.body.appendChild(container)
        fullscreenContainerRef.current = container
      }

      // PhotoSwipe options optimized for mobile
      const options: ConstructorParameters<typeof PhotoSwipeLightbox>[0] = {
        gallery: gallerySelector,
        children: childSelector,
        pswpModule: () => import('photoswipe'),

        // Focus handling for Radix Dialog compatibility
        trapFocus: false,
        returnFocus: false,

        // Padding for viewport
        paddingFn: (viewportSize) => ({
          top: isMobile ? 0 : 30,
          bottom: isMobile ? 0 : 30,
          left: isMobile ? 0 : 20,
          right: isMobile ? 0 : 20,
        }),

        // Visual settings
        bgOpacity: 1,
        showHideAnimationType: isMobile ? 'fade' : 'zoom',

        // Zoom levels - fit image to screen
        initialZoomLevel: 'fit',
        secondaryZoomLevel: 2,
        maxZoomLevel: 4,

        // Preload nearby slides
        preload: [1, 2],

        // Mobile gestures
        allowPanToNext: true,
        closeOnVerticalDrag: true,
        pinchToClose: true,

        // Click/tap actions for mobile
        // On mobile: tap toggles controls, double-tap zooms
        tapAction: isMobile ? 'toggle-controls' : 'close',
        doubleTapAction: 'zoom',
        clickToCloseNonZoomable: !isMobile, // Don't auto-close on mobile

        // For native fullscreen
        ...(useNativeFullscreen && {
          appendToEl: fullscreenContainerRef.current!,
          showAnimationDuration: 0,
          hideAnimationDuration: 0,
        }),
      }

      lightboxRef.current = new PhotoSwipeLightbox(options)

      // Native fullscreen handling for mobile
      if (useNativeFullscreen && fullscreenContainerRef.current) {
        const container = fullscreenContainerRef.current

        lightboxRef.current.on('beforeOpen', () => {
          container.style.display = 'block'

          // Request fullscreen
          if (fullscreenAPI.request) {
            fullscreenAPI.request(container).catch(() => {
              // Fullscreen request failed, continue without it
            })
          }
        })

        lightboxRef.current.on('close', () => {
          container.style.display = 'none'

          // Exit fullscreen if active
          if (fullscreenAPI.exit && fullscreenAPI.element?.()) {
            fullscreenAPI.exit().catch(() => {})
          }
        })
      }

      // Filter to process data-pswp-* attributes
      lightboxRef.current.addFilter('domItemData', (itemData, element) => {
        const linkEl = element as HTMLAnchorElement

        const widthAttr = linkEl.getAttribute('data-pswp-width')
        const heightAttr = linkEl.getAttribute('data-pswp-height')
        const typeAttr = linkEl.getAttribute('data-pswp-type')
        const mediaTypeAttr = linkEl.getAttribute('data-pswp-media-type')
        const href = linkEl.getAttribute('href') || linkEl.getAttribute('data-pswp-src') || ''
        const inferredVideo = /(\.mp4|\.mov|\.webm)(\?|$)/i.test(href)

        if (widthAttr && heightAttr) {
          itemData.w = parseInt(widthAttr, 10)
          itemData.h = parseInt(heightAttr, 10)

          if (typeAttr === 'video' || (!typeAttr && inferredVideo)) {
            itemData.type = 'video'
          }

          if (mediaTypeAttr) {
            ;(itemData as Record<string, unknown>).mediaType = mediaTypeAttr
          }
        }

        return itemData
      })

      // Video content handler
      lightboxRef.current.on('contentLoad', (e) => {
        const { content } = e

        if (content.data.type === 'video') {
          e.preventDefault()

          const videoElement = document.createElement('video')
          videoElement.controls = true
          videoElement.autoplay = true
          videoElement.loop = false
          videoElement.playsInline = true
          videoElement.muted = true
          videoElement.preload = 'auto'
          videoElement.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #000;
          `

          const source = document.createElement('source')
          source.src = content.data.src as string

          const mediaType = (content.data as { mediaType?: string }).mediaType
          if (mediaType) {
            source.type = /quicktime|x-m4v/i.test(mediaType) ? 'video/mp4' : mediaType
          } else if (/\.mp4(\?|$)/i.test(source.src)) {
            source.type = 'video/mp4'
          }

          videoElement.appendChild(source)

          // Unmute on tap
          videoElement.addEventListener('click', () => {
            videoElement.muted = false
            videoElement.play().catch(() => {})
          })

          videoElement.load()

          const wrapper = document.createElement('div')
          wrapper.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
          `
          wrapper.appendChild(videoElement)

          content.element = wrapper
        }
      })

      // Track open/close state
      lightboxRef.current.on('beforeOpen', () => {
        isPhotoSwipeOpenGlobal = true
        photoSwipeJustClosedWithEsc = false
      })

      lightboxRef.current.on('close', () => {
        if (isPhotoSwipeOpenGlobal) {
          photoSwipeJustClosedWithEsc = true
        }
        isPhotoSwipeOpenGlobal = false

        setTimeout(() => {
          photoSwipeJustClosedWithEsc = false
        }, 100)
      })

      lightboxRef.current.init()

      return 'success'
    }

    // Retry initialization with delays
    let attempts = 0
    const maxAttempts = 10
    const timer = setInterval(() => {
      attempts++
      const result = checkAndInit()

      if (result === 'success' || result === 'empty' || attempts >= maxAttempts) {
        clearInterval(timer)
      }
    }, 300)

    return () => {
      clearInterval(timer)
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
        lightboxRef.current = null
      }
      if (fullscreenContainerRef.current) {
        fullscreenContainerRef.current.remove()
        fullscreenContainerRef.current = null
      }
    }
  }, [gallerySelector, childSelector, enabled, ...dependencies])

  const openPhotoSwipe = (index: number) => {
    if (lightboxRef.current && items.length > 0) {
      lightboxRef.current.loadAndOpen(index)
    }
  }

  return { openPhotoSwipe }
}
