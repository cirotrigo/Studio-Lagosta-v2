import { useMemo } from 'react'
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
}: InstagramHtmlIframePreviewProps) {
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

  return (
    <iframe
      title={`Preview template ${snapshot.templateId}`}
      srcDoc={snapshot.html}
      className={cn('h-full w-full border-0 bg-zinc-950', className)}
      sandbox="allow-same-origin"
      loading="lazy"
    />
  )
}
