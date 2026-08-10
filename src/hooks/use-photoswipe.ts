'use client'

import { useEffect, useRef } from 'react'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'
import './use-photoswipe.css'

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

    // Vídeos criados pelos slides desta instância, para pausar e soltar os
    // bytes ao fechar (senão a trilha continua tocando por trás da galeria).
    const activeVideos = new Set<HTMLVideoElement>()

    const videoOf = (element?: HTMLElement | null) =>
      element?.querySelector('video') ?? null

    const stopActiveVideos = () => {
      activeVideos.forEach((video) => {
        try {
          video.pause()
          video.currentTime = 0
          video.removeAttribute('src')
          video.load()
        } catch {
          // ignore
        }
      })
      activeVideos.clear()
    }

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
        // Mantém as setas de navegação visíveis em tela de toque — o CSS do
        // pacote as esconde por padrão ali. Ver `use-photoswipe.css`.
        mainClass: 'pswp--nav-sempre-visivel',
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

      // Slide de vídeo. O PhotoSwipe só sabe desenhar imagem: item marcado com
      // `data-pswp-type="video"` (galeria de criativos, Drive, seletores de
      // post) virava um slide EM BRANCO no meio da navegação. Mesmo desenho já
      // usado em `components/templates/creatives-lightbox.tsx`.
      lightboxRef.current.on('contentLoad', (event) => {
        const { content } = event
        if (content.data.type !== 'video') return

        event.preventDefault()

        const videoEl = document.createElement('video')
        videoEl.src = String(content.data.src)
        videoEl.controls = true
        // NÃO usar autoplay: o PhotoSwipe pré-carrega os vizinhos, então
        // `contentLoad` roda para vídeo que ainda não está na tela — abrir uma
        // imagem faria tocar a trilha do vídeo ao lado. Quem dá play é o
        // `contentActivate`, que só dispara no slide realmente ativo.
        videoEl.autoplay = false
        videoEl.preload = 'metadata'
        videoEl.loop = true
        videoEl.playsInline = true
        videoEl.style.width = '100%'
        videoEl.style.height = '100%'
        videoEl.style.objectFit = 'contain'
        activeVideos.add(videoEl)

        const wrapper = document.createElement('div')
        wrapper.style.width = '100%'
        wrapper.style.height = '100%'
        wrapper.appendChild(videoEl)

        content.element = wrapper
      })

      lightboxRef.current.on('contentActivate', ({ content }) => {
        const video = videoOf(content.element)
        if (!video) return
        void video.play().catch(() => {
          // Autoplay bloqueado pelo navegador: os controles ficam ali para a
          // pessoa dar play na mão. Não é erro.
        })
      })

      lightboxRef.current.on('contentDeactivate', ({ content }) => {
        const video = videoOf(content.element)
        if (!video) return
        video.pause()
        video.currentTime = 0
      })

      lightboxRef.current.on('close', stopActiveVideos)
      lightboxRef.current.on('contentDestroy', stopActiveVideos)

      lightboxRef.current.init()
      return true
    }

    // Try to init immediately, retry if needed
    const timer = initPhotoSwipe() ? null : setTimeout(initPhotoSwipe, 500)

    // Uma limpeza só para os dois caminhos: quando o init caía no retry, a
    // limpeza antiga só cancelava o timer e deixava a instância criada por ele
    // viva — o próximo efeito a destruía pelo ref, mas um desmonte no meio do
    // caminho vazava listener e vídeo tocando.
    return () => {
      if (timer) clearTimeout(timer)
      stopActiveVideos()
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
        lightboxRef.current = null
      }
    }
  }, [gallerySelector, childSelector, enabled, ...dependencies])
}
