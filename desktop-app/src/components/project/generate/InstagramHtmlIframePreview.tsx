import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ArtFormat, ReviewField } from '@/stores/generation.store'
import type { InstagramPreviewTokens } from '@/lib/instagram-ds/token-parser'
import { buildInstagramHtmlSnapshot } from '@/lib/instagram-ds/html-snapshot'

interface InstagramHtmlIframePreviewProps {
  format: ArtFormat
  fields: ReviewField[]
  sourceImageUrl?: string
  logoUrl?: string
  includeLogo?: boolean
  templateName?: string
  className?: string
  tokens?: Partial<InstagramPreviewTokens>
  customCss?: string
  showTemplateBadge?: boolean
  fallback?: ReactNode
}

export default function InstagramHtmlIframePreview({
  format,
  fields,
  sourceImageUrl,
  logoUrl,
  includeLogo = true,
  templateName,
  className,
  tokens,
  customCss,
  showTemplateBadge = false,
  fallback,
}: InstagramHtmlIframePreviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [useFallback, setUseFallback] = useState(false)
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 })

  const targetSize = useMemo(() => {
    if (format === 'STORY') return { width: 1080, height: 1920 }
    if (format === 'SQUARE') return { width: 1080, height: 1080 }
    return { width: 1080, height: 1350 }
  }, [format])

  const snapshot = useMemo(
    () =>
      buildInstagramHtmlSnapshot({
        format,
        fields,
        sourceImageUrl,
        logoUrl,
        includeLogo,
        templateName,
        tokens,
        customCss,
        showTemplateBadge,
      }),
    [format, fields, sourceImageUrl, logoUrl, includeLogo, templateName, tokens, customCss, showTemplateBadge],
  )

  useEffect(() => {
    setUseFallback(false)
  }, [snapshot.html])

  useEffect(() => {
    const element = hostRef.current
    if (!element) return

    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setHostSize({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      })
    }

    updateSize()
    const raf = window.requestAnimationFrame(updateSize)
    const timeout = window.setTimeout(updateSize, 60)
    const onWindowResize = () => updateSize()
    window.addEventListener('resize', onWindowResize)

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize)
      observer.observe(element)
      return () => {
        window.removeEventListener('resize', onWindowResize)
        window.cancelAnimationFrame(raf)
        window.clearTimeout(timeout)
        observer.disconnect()
      }
    }

    return () => {
      window.removeEventListener('resize', onWindowResize)
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timeout)
    }
  }, [format])

  const evaluateFrame = () => {
    if (!sourceImageUrl) return
    if (!frameRef.current) return

    try {
      const doc = frameRef.current.contentDocument
      if (!doc) return

      const bgPhoto = doc.querySelector('img.ig-bg-photo') as HTMLImageElement | null
      if (!bgPhoto) {
        setUseFallback(true)
        return
      }

      // Do not fallback while the background image is still loading.
      // Falling back too early causes a visual mismatch vs approval snapshot.
      if (!bgPhoto.complete) {
        return
      }

      if (bgPhoto.naturalWidth <= 0 || bgPhoto.naturalHeight <= 0) {
        setUseFallback(true)
        return
      }

      setUseFallback(false)
    } catch {
      setUseFallback(true)
    }
  }

  if (useFallback && fallback) {
    return <>{fallback}</>
  }

  const scale = hostSize.width > 0 && hostSize.height > 0
    ? Math.min(hostSize.width / targetSize.width, hostSize.height / targetSize.height)
    : 1
  const safeScale = Math.max(0.0001, scale)
  const isMeasured = hostSize.width > 0 && hostSize.height > 0
  const scaledWidth = targetSize.width * safeScale
  const scaledHeight = targetSize.height * safeScale
  const offsetX = Math.max(0, (hostSize.width - scaledWidth) / 2)
  const offsetY = Math.max(0, (hostSize.height - scaledHeight) / 2)

  return (
    <div ref={hostRef} className={cn('relative h-full w-full overflow-hidden bg-zinc-950', className)}>
      <iframe
        ref={frameRef}
        title={`Preview template ${snapshot.templateId}`}
        srcDoc={snapshot.html}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${targetSize.width}px`,
          height: `${targetSize.height}px`,
          border: '0',
          background: '#09090b',
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${safeScale})`,
          transformOrigin: 'top left',
          opacity: isMeasured ? 1 : 0,
        }}
        sandbox="allow-same-origin"
        loading="lazy"
        onLoad={() => {
          // Remote background may resolve later than iframe load.
          // Evaluate after a longer delay to avoid premature fallback.
          window.setTimeout(evaluateFrame, 2200)
          window.setTimeout(evaluateFrame, 4200)
        }}
      />
    </div>
  )
}
