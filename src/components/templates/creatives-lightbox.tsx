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

  React.useEffect(() => {
    if (!lightboxRef.current) {
      const lightbox = new PhotoSwipeLightbox({
        gallery: `#${galleryId}`,
        children: 'a',
        pswpModule: () => import('photoswipe'),
        padding: { top: 20, bottom: 40, left: 100, right: 100 },
        bgOpacity: 0.9,
        closeTitle: 'Fechar (Esc)',
        zoomTitle: 'Zoom',
        arrowPrevTitle: 'Anterior',
        arrowNextTitle: 'Próximo',
        errorMsg: 'A imagem não pôde ser carregada.',
      })
      lightbox.init()
      lightboxRef.current = lightbox
    }

    return () => {
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
        lightboxRef.current = null
      }
    }
  }, [galleryId])

  return (
    <div id={galleryId} className="pswp-gallery">
      {children}
    </div>
  )
}
