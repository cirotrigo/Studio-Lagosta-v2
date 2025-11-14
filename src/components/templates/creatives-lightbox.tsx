"use client"

import * as React from 'react'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'

interface CreativesLightboxProps {
  galleryId: string
  children: React.ReactNode
}

/**
 * Componente wrapper do PhotoSwipe para visualização de criativos em lightbox
 */
export function CreativesLightbox({ galleryId, children }: CreativesLightboxProps) {
  const lightboxRef = React.useRef<PhotoSwipeLightbox | null>(null)
  const itemCount = React.Children.count(children)
  const activeVideosRef = React.useRef(new Set<HTMLVideoElement>())

  React.useEffect(() => {
    if (lightboxRef.current) {
      lightboxRef.current.destroy()
      lightboxRef.current = null
    }

    const stopActiveVideos = () => {
      activeVideosRef.current.forEach((video) => {
        try {
          video.pause()
          video.currentTime = 0
          video.removeAttribute('src')
          video.load()
        } catch {
          // ignore
        }
      })
      activeVideosRef.current.clear()
    }

    const hasItems =
      typeof document !== 'undefined' &&
      document.querySelectorAll(`#${galleryId} a`).length > 0
    if (!hasItems) {
      return
    }

    const lightbox = new PhotoSwipeLightbox({
      gallery: `#${galleryId}`,
      children: 'a',
      pswpModule: () => import('photoswipe'),
      paddingFn: (viewportSize) => ({
        top: 20,
        bottom: 40,
        left: viewportSize.x < 768 ? 16 : 100,
        right: viewportSize.x < 768 ? 16 : 100,
      }),
      bgOpacity: 0.9,
      errorMsg: 'Não foi possível carregar este conteúdo.',
    })

    lightbox.addFilter('domItemData', (itemData, element) => {
      const link = element as HTMLAnchorElement
      const widthAttr = link.getAttribute('data-pswp-width')
      const heightAttr = link.getAttribute('data-pswp-height')
      const typeAttr = link.getAttribute('data-pswp-type')

      if (widthAttr && heightAttr) {
        const width = Number.parseInt(widthAttr, 10)
        const height = Number.parseInt(heightAttr, 10)

        if (Number.isFinite(width) && Number.isFinite(height)) {
          itemData.w = width
          itemData.h = height
        }
      }

      if (typeAttr === 'video') {
        itemData.type = 'video'
      }

      return itemData
    })

    lightbox.on('contentLoad', (event) => {
      const { content } = event
      if (content.data.type !== 'video') {
        return
      }

      event.preventDefault()

      const videoEl = document.createElement('video')
      videoEl.src = String(content.data.src)
      videoEl.controls = true
      videoEl.autoplay = true
      videoEl.loop = true
      videoEl.playsInline = true
      videoEl.style.width = '100%'
      videoEl.style.height = '100%'
      videoEl.style.objectFit = 'contain'
      activeVideosRef.current.add(videoEl)

      const wrapper = document.createElement('div')
      wrapper.style.width = '100%'
      wrapper.style.height = '100%'
      wrapper.appendChild(videoEl)

      content.element = wrapper
    })

    lightbox.on('close', stopActiveVideos)
    lightbox.on('contentDestroy', stopActiveVideos)

    lightbox.init()
    lightboxRef.current = lightbox

    return () => {
      stopActiveVideos()
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
        lightboxRef.current = null
      }
    }
  }, [galleryId, itemCount])

  return (
    <div id={galleryId} className="pswp-gallery">
      {children}
    </div>
  )
}
