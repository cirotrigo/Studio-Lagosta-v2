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
      console.log('PhotoSwipe: Destroying previous instance')
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

      // Verificar se os atributos data-pswp estão presentes
      let missingAttributes = 0
      children.forEach((child, index) => {
        const width = child.getAttribute('data-pswp-width')
        const height = child.getAttribute('data-pswp-height')
        if (!width || !height) {
          missingAttributes++
          console.warn(`PhotoSwipe: Missing dimensions for item ${index}:`, { width, height, element: child })
        }
      })

      if (missingAttributes > 0) {
        console.warn(`PhotoSwipe: ${missingAttributes} items missing dimensions. Delaying initialization...`)
        return false
      }

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

      // Filtro essencial para processar atributos data-pswp-width, data-pswp-height e data-pswp-type
      lightboxRef.current.addFilter('domItemData', (itemData, element) => {
        const linkEl = element as HTMLAnchorElement

        // Obter dimensões dos atributos data-pswp-*
        const widthAttr = linkEl.getAttribute('data-pswp-width')
        const heightAttr = linkEl.getAttribute('data-pswp-height')
        const typeAttr = linkEl.getAttribute('data-pswp-type')

        if (widthAttr && heightAttr) {
          const width = parseInt(widthAttr, 10)
          const height = parseInt(heightAttr, 10)

          // PhotoSwipe v5 usa 'w' e 'h' internamente
          itemData.w = width
          itemData.h = height

          // Se for vídeo, adicionar tipo customizado
          if (typeAttr === 'video') {
            itemData.type = 'video'
          }

          console.log('PhotoSwipe: Item dimensions set:', { width, height, type: typeAttr, src: itemData.src })
        } else {
          console.warn('PhotoSwipe: Missing dimensions for item:', linkEl.href)
        }

        return itemData
      })

      // Handler para renderizar vídeos customizados
      lightboxRef.current.on('contentLoad', (e) => {
        const { content } = e

        // Verificar se é um vídeo
        if (content.data.type === 'video') {
          // Prevenir carregamento padrão
          e.preventDefault()

          // Criar elemento de vídeo HTML5
          const videoElement = document.createElement('video')
          videoElement.src = content.data.src as string
          videoElement.controls = true
          videoElement.autoplay = true
          videoElement.loop = true
          videoElement.playsInline = true
          videoElement.style.width = '100%'
          videoElement.style.height = '100%'
          videoElement.style.objectFit = 'contain'

          // Definir elemento como conteúdo do slide
          content.element = videoElement

          console.log('PhotoSwipe: Video content loaded:', content.data.src)
        }
      })

      // Event listeners para debug
      lightboxRef.current.on('beforeOpen', () => {
        console.log('PhotoSwipe: Opening lightbox')
      })

      lightboxRef.current.on('uiRegister', () => {
        console.log('PhotoSwipe: UI registered')
      })

      lightboxRef.current.on('change', () => {
        console.log('PhotoSwipe: Slide changed')
      })

      lightboxRef.current.init()

      console.log('PhotoSwipe: Initialized successfully')
      return true
    }

    // Tentar inicializar com delays incrementais
    let attempts = 0
    const maxAttempts = 10 // Aumentado de 5 para 10
    const timer = setInterval(() => {
      attempts++
      const success = checkAndInit()

      if (success || attempts >= maxAttempts) {
        clearInterval(timer)
        if (!success && attempts >= maxAttempts) {
          console.error('PhotoSwipe: Failed to initialize after', maxAttempts, 'attempts')
        }
      }
    }, 300) // Aumentado de 200ms para 300ms

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
