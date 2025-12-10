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

export function usePhotoSwipe({
  gallerySelector,
  childSelector,
  items = [],
  dependencies = [],
  enabled = true,
}: UsePhotoSwipeOptions) {
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
        lightboxRef.current = null
      }
      return
    }

    // Destruir instância anterior se existir
    if (lightboxRef.current) {
      console.log('PhotoSwipe: Destroying previous instance')
      lightboxRef.current.destroy()
      lightboxRef.current = null
    }

    // Aguardar o DOM estar pronto e as animações terminarem
    const checkAndInit = (): 'success' | 'retry' | 'empty' => {
      // Verificar se document e window estão disponíveis (SSR safety)
      if (typeof document === 'undefined' || typeof window === 'undefined') {
        console.warn('PhotoSwipe: Document/Window not available (SSR)')
        return 'retry'
      }

      const galleryElement = document.querySelector(gallerySelector)

      if (!galleryElement) {
        console.warn('PhotoSwipe: Gallery element not found:', gallerySelector)
        return 'retry'
      }

      // Verificar se o elemento está realmente no DOM e visível
      if (!document.body.contains(galleryElement)) {
        console.warn('PhotoSwipe: Gallery element not in document body')
        return 'retry'
      }

      // Verificar se há elementos filhos
      const children = galleryElement.querySelectorAll(childSelector)
      if (children.length === 0) {
        console.info('PhotoSwipe: No children found with selector:', childSelector)
        return 'empty'
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
        return 'retry'
      }

      lightboxRef.current = new PhotoSwipeLightbox({
        gallery: gallerySelector,
        children: childSelector,
        pswpModule: () => import('photoswipe'),
        // Allow Radix Dialog to keep focus without fighting PhotoSwipe focus trap
        trapFocus: false,
        returnFocus: false,
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
        // Garantir que PhotoSwipe intercepta cliques
        preload: [1, 1],
        // Adicionar suporte para Safari
        allowPanToNext: true,
        closeOnVerticalDrag: true,
        pinchToClose: true,
        // Melhorar interação em mobile
        tapAction: 'close',
        doubleTapAction: 'zoom',
      })

      // Filtro essencial para processar atributos data-pswp-width, data-pswp-height e data-pswp-type
      lightboxRef.current.addFilter('domItemData', (itemData, element) => {
        const linkEl = element as HTMLAnchorElement

        // Obter dimensões dos atributos data-pswp-*
        const widthAttr = linkEl.getAttribute('data-pswp-width')
        const heightAttr = linkEl.getAttribute('data-pswp-height')
        const typeAttr = linkEl.getAttribute('data-pswp-type')
        const mediaTypeAttr = linkEl.getAttribute('data-pswp-media-type')
        const href = linkEl.getAttribute('href') || linkEl.getAttribute('data-pswp-src') || ''
        const inferredVideo = /(\.mp4|\.mov|\.webm)(\?|$)/i.test(href)

        if (widthAttr && heightAttr) {
          const width = parseInt(widthAttr, 10)
          const height = parseInt(heightAttr, 10)

          // PhotoSwipe v5 usa 'w' e 'h' internamente
          itemData.w = width
          itemData.h = height

          // Se for vídeo, adicionar tipo customizado
          if (typeAttr === 'video' || (!typeAttr && inferredVideo)) {
            itemData.type = 'video'
          }

          if (mediaTypeAttr) {
            // Custom metadata to forward mime type (normalized below when rendering)
            ;(itemData as Record<string, unknown>).mediaType = mediaTypeAttr
          }

          console.log('PhotoSwipe: Item dimensions set:', {
            width,
            height,
            type: itemData.type ?? typeAttr,
            mediaType: mediaTypeAttr,
            src: itemData.src
          })
        } else {
          console.warn('PhotoSwipe: Missing dimensions for item:', linkEl.href)
        }

        return itemData
      })

      // Handler para renderizar vídeos customizados
      lightboxRef.current.on('contentLoad', (e) => {
        const { content } = e

        console.log('PhotoSwipe: contentLoad event:', {
          type: content.data.type,
          src: content.data.src
        })

        // Verificar se é um vídeo
        if (content.data.type === 'video') {
          console.log('🎬 PhotoSwipe: Loading video content:', content.data.src)

          // Prevenir carregamento padrão
          e.preventDefault()

          // Criar elemento de vídeo HTML5
          const videoElement = document.createElement('video')
          videoElement.controls = true
          videoElement.autoplay = true
          videoElement.loop = false
          videoElement.playsInline = true
          videoElement.muted = true
          videoElement.preload = 'auto'
          videoElement.style.width = '100%'
          videoElement.style.height = '100%'
          videoElement.style.objectFit = 'contain'
          videoElement.style.backgroundColor = '#000'

          // Adicionar event listeners para debug
          videoElement.addEventListener('loadstart', () => {
            console.log('🎬 PhotoSwipe: Video loadstart')
          })
          const tryAutoplay = () => {
            const playPromise = videoElement.play()
            if (playPromise && typeof playPromise.then === 'function') {
              playPromise.catch((err) => {
                console.warn('🎬 PhotoSwipe: Autoplay blocked, awaiting user interaction', err)
              })
            }
          }

          videoElement.addEventListener('loadedmetadata', () => {
            console.log('🎬 PhotoSwipe: Video metadata loaded')
            tryAutoplay()
          })
          videoElement.addEventListener('canplay', () => {
            console.log('🎬 PhotoSwipe: Video can play')
            tryAutoplay()
          })
          videoElement.addEventListener('error', () => {
            const mediaError = videoElement.error
            console.error('🎬 PhotoSwipe: Video error:', {
              code: mediaError?.code,
              message: mediaError?.message,
              networkState: videoElement.networkState,
              readyState: videoElement.readyState
            })
          })

          const source = document.createElement('source')
          source.src = content.data.src as string
          const mediaType = (content.data as { mediaType?: string }).mediaType
          const normalizedType =
            typeof mediaType === 'string'
              ? (/quicktime|x-m4v/i.test(mediaType) ? 'video/mp4' : mediaType)
              : undefined
          if (normalizedType && normalizedType.length > 0) {
            source.type = normalizedType
          } else if (/\.mp4(\?|$)/i.test(source.src)) {
            source.type = 'video/mp4'
          }
          videoElement.appendChild(source)
          videoElement.addEventListener('click', () => {
            videoElement.muted = false
            videoElement.play().catch((err) => {
              console.warn('🎬 PhotoSwipe: Play on click failed', err)
            })
          })
          videoElement.load()

          // Envolver em um container div para compatibilidade com typings
          const wrapper = document.createElement('div')
          wrapper.style.width = '100%'
          wrapper.style.height = '100%'
          wrapper.style.display = 'flex'
          wrapper.style.alignItems = 'center'
          wrapper.style.justifyContent = 'center'
          wrapper.style.backgroundColor = '#000'
          wrapper.appendChild(videoElement)

          // Definir elemento como conteúdo do slide
          content.element = wrapper

          console.log('✅ PhotoSwipe: Video element created and set')
        }
      })

      // Event listeners para debug e funcionalidade
      lightboxRef.current.on('beforeOpen', () => {
        console.log('✅ PhotoSwipe: Opening lightbox')
        isPhotoSwipeOpenGlobal = true
        photoSwipeJustClosedWithEsc = false
      })

      lightboxRef.current.on('close', () => {
        console.log('✅ PhotoSwipe: Closed')

        // Marcar que PhotoSwipe acabou de fechar (pode ter sido ESC)
        // Isso previne que o Dialog feche logo em seguida
        if (isPhotoSwipeOpenGlobal) {
          photoSwipeJustClosedWithEsc = true
          console.log('🛡️ PhotoSwipe: Marked as just closed to prevent modal from closing')
        }

        isPhotoSwipeOpenGlobal = false

        // Após um delay, limpar a flag de "acabou de fechar"
        // Isso permite que ESC funcione normalmente no Dialog depois
        setTimeout(() => {
          photoSwipeJustClosedWithEsc = false
          console.log('🛡️ PhotoSwipe: Just-closed flag cleared')
        }, 100)
      })

      lightboxRef.current.on('uiRegister', () => {
        console.log('✅ PhotoSwipe: UI registered')
      })

      lightboxRef.current.on('change', () => {
        console.log('✅ PhotoSwipe: Slide changed')
      })

      // Debug: verificar se está capturando cliques
      lightboxRef.current.on('initialZoomInEnd', () => {
        console.log('✅ PhotoSwipe: Zoom in animation completed')
      })

      // Adicionar listener para cliques nos links
      const links = galleryElement.querySelectorAll(childSelector)
      console.log(`✅ PhotoSwipe: Found ${links.length} clickable items`)
      links.forEach((link, index) => {
        link.addEventListener('click', (_e) => {
          console.log(`🖱️ PhotoSwipe: Link ${index} clicked`, {
            href: (link as HTMLAnchorElement).href,
            width: link.getAttribute('data-pswp-width'),
            height: link.getAttribute('data-pswp-height'),
          })
        }, { capture: true }) // Usar capture para interceptar antes
      })

      lightboxRef.current.init()

      console.log('✅ PhotoSwipe: Initialized successfully')
      return 'success'
    }

    // Tentar inicializar com delays incrementais
    let attempts = 0
    const maxAttempts = 10 // Aumentado de 5 para 10
    const timer = setInterval(() => {
      attempts++
      const result = checkAndInit()

      if (result === 'success') {
        clearInterval(timer)
      } else if (result === 'empty') {
        clearInterval(timer)
      } else if (attempts >= maxAttempts) {
        clearInterval(timer)
        if (result === 'retry') {
          console.warn('PhotoSwipe: Inicialização ignorada após', maxAttempts, 'tentativas (dados indisponíveis).')
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
  }, [gallerySelector, childSelector, enabled, ...dependencies])

  const openPhotoSwipe = (index: number) => {
    if (lightboxRef.current && items.length > 0) {
      lightboxRef.current.loadAndOpen(index)
    }
  }

  return { openPhotoSwipe }
}
