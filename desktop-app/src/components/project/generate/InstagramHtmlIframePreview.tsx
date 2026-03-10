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
  const [useFallback, setUseFallback] = useState(false)

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

      if (!bgPhoto.complete || bgPhoto.naturalWidth <= 0 || bgPhoto.naturalHeight <= 0) {
        setUseFallback(true)
      }
    } catch {
      setUseFallback(true)
    }
  }

  if (useFallback && fallback) {
    return <>{fallback}</>
  }

  return (
    <iframe
      ref={frameRef}
      title={`Preview template ${snapshot.templateId}`}
      srcDoc={snapshot.html}
      className={cn('h-full w-full border-0 bg-zinc-950', className)}
      sandbox="allow-same-origin"
      loading="lazy"
      onLoad={() => {
        evaluateFrame()
        // Remote background may resolve a bit later than iframe load.
        window.setTimeout(evaluateFrame, 280)
        window.setTimeout(evaluateFrame, 900)
      }}
    />
  )
}
